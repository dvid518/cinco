import { sesion } from "../core/sesion.js"
import { cacheCapa } from "../core/cache.js"
import { activarSpinLogo, desactivarSpinLogo, navigateTo } from "../core/router.js"
import { obtenerCuentas } from "../../firebase/firestore.js"
import { DIVISAS_SYMBOLS } from "../../constants/divisas.js"
import {
    registrarSnapshot,
    obtenerPatrimonioParaGrafico
} from "../services/SnapshotServicio.js"
import {
    crearGraficoPatrimonio,
    destruirGraficoPatrimonio
} from "../ui/graficos.js"
import {
    getDivisaPrincipal,
    convertirMonto,
    formatearMonto
} from "../services/DivisaServicio.js"
import { obtenerPosicionesConValor } from "../services/PosicionServicio.js"
import { obtenerPendientes } from "../repositories/PendienteRepositorio.js"
import { abrirModal } from "../ui/modal.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"

// ============================================
// ESTADO
// ============================================

let uid = null
let cuentas = []
let divisaActual = getDivisaPrincipal()
let datosGrafico = null
let inversionesData = null
let vencimientosData = null
let cargado = false

const DIAS_VENCIMIENTO = 7

// ============================================
// RENDER
// ============================================

export function render() {
    return `
        <div class="dashboard">
            <div class="card primary patrimonio-card">
                <div class="card-header">
                    <span class="card-title">Patrimonio Total</span>
                    <select class="divisa-select" id="divisa-select" aria-label="Divisa">
                        <option value="pen">PEN</option>
                        <option value="usd">USD</option>
                        <option value="usdt">USDT</option>
                    </select>
                </div>
                <div class="card-value" id="patrimonio-valor">—</div>
                <div class="card-sub" id="patrimonio-detalle">—</div>
            </div>

            <div class="card card-navegable positive" id="card-cuentas" role="button" tabindex="0" title="Ver cuentas">
                <div class="card-title">Cuentas</div>
                <div class="card-value" id="total-cuentas">0</div>
                <div class="card-sub">Activas y tarjetas</div>
            </div>

            <div class="card card-navegable" id="card-inversiones" role="button" tabindex="0" title="Ver inversiones">
                <div class="card-title">Inversiones</div>
                <div class="card-value" id="inversiones-valor">—</div>
                <div class="card-sub" id="inversiones-detalle">—</div>
            </div>

            <div class="card card-navegable" id="card-vencimientos" role="button" tabindex="0" title="Ver pendientes">
                <div class="card-title">Próximos vencimientos</div>
                <div class="card-value" id="vencimientos-cantidad">—</div>
                <div class="card-sub" id="vencimientos-detalle">—</div>
            </div>

            <div class="card grafico-patrimonio-card">
                <div class="card-header">
                    <span class="card-title">Evolución patrimonial</span>
                    <span class="card-sub" id="grafico-periodo">Últimos 30 días</span>
                </div>
                <div class="grafico-container-dashboard">
                    <canvas id="grafico-patrimonio"></canvas>
                </div>
            </div>
        </div>
    `
}

// ============================================
// INIT
// ============================================

export async function init() {
    uid = sesion.uid
    // Divisiva reactiva: se relee al entrar, no solo al importar el módulo.
    divisaActual = getDivisaPrincipal()
    console.log("[INFO] Dashboard iniciado para UID:", uid)

    configurarDivisa()
    configurarCardsNavegacion()

    await cargarTodo()

    // Snapshot del día
    try {
        await registrarSnapshot(uid)
    } catch (error) {
        console.warn("No se pudo registrar snapshot:", error)
    }

    await cargarGraficoPatrimonio()
    cargado = true
}

// ============================================
// RECARGAR (invocado por "Actualizar" del lastbar)
// ============================================

export async function recargarDatos() {
    activarSpinLogo()
    try {
        // Forzar lectura fresca: limpiar la caché en memoria
        cacheCapa.limpiar(uid)

        await cargarTodo()

        try {
            await registrarSnapshot(uid)
        } catch (error) {
            console.warn("No se pudo registrar snapshot:", error)
        }

        await cargarGraficoPatrimonio()
    } catch (error) {
        console.error("Error recargando dashboard:", error)
    } finally {
        desactivarSpinLogo()
    }
}

// ============================================
// CARGA GLOBAL
// ============================================

async function cargarTodo() {
    try {
        // Las tarjetas para vencimientos dependen de `cuentas`; se cargan
        // primero para evitar la carrera con el estado del módulo.
        const cuentasResp = await obtenerCuentas(uid)

        const [inversionesResp, vencimientosResp] = await Promise.all([
            cargarInversiones(),
            cargarVencimientos(cuentasResp)
        ])

        cuentas = cuentasResp
        inversionesData = inversionesResp
        vencimientosData = vencimientosResp

        actualizarUI()
    } catch (error) {
        console.error("Error cargando dashboard:", error)
        mostrarErrorCarga()
    }
}

async function cargarInversiones() {
    try {
        const data = await obtenerPosicionesConValor(uid)
        return {
            valorTotal: data.valorTotal || 0,
            gananciaTotal: data.gananciaTotal || 0,
            cantidad: data.cantidad || 0,
            // La divisa a la que ya fueron convertidos los totales
            divisa: data.divisa || "pen"
        }
    } catch (error) {
        console.error("Error cargando inversiones:", error)
        return { valorTotal: 0, gananciaTotal: 0, cantidad: 0, divisa: "pen" }
    }
}

async function cargarVencimientos(cuentasDeUsuario) {
    try {
        const [pendientes, tarjetas] = await Promise.all([
            obtenerPendientesConVencimiento(),
            obtenerTarjetasConPagoProximo(cuentasDeUsuario)
        ])

        // Combinar y ordenar por días restantes ascendente
        const todos = [...pendientes, ...tarjetas]
        todos.sort((a, b) => a.diasRestantes - b.diasRestantes)

        return {
            items: todos,
            total: todos.length,
            vencidos: todos.filter(v => v.vencido).length
        }
    } catch (error) {
        console.error("Error cargando vencimientos:", error)
        return { items: [], total: 0, vencidos: 0 }
    }
}

async function obtenerPendientesConVencimiento() {
    const pendientes = await obtenerPendientes(uid, true)

    return pendientes
        .filter(p => p.fechaVencimiento)
        .map(p => {
            const dias = diasHasta(p.fechaVencimiento)
            return {
                tipo: "pendiente",
                id: p.id,
                titulo: p.concepto,
                subtitulo: p.tipo ? "Cobrar" : "Pagar",
                esCobrar: p.tipo,
                monto: p.monto,
                divisa: p.divisa,
                diasRestantes: dias,
                vencido: dias < 0,
                icono: ""
            }
        })
        .filter(v => v.diasRestantes <= DIAS_VENCIMIENTO)
}

function obtenerTarjetasConPagoProximo(listaCuentas) {
    const tarjetas = (listaCuentas || []).filter(
        c => c.tipo === "credito" && c.estado !== "archivada" && c.diaPago
    )

    return tarjetas
        .map(t => {
            const dias = diasHastaDiaDelMes(t.diaPago)
            return {
                tipo: "tarjeta",
                id: t.id,
                titulo: t.nombre,
                subtitulo: "Pago tarjeta",
                monto: t.deuda || 0,
                divisa: t.moneda || "pen",
                diasRestantes: dias,
                vencido: false,
                icono: ""
            }
        })
        .filter(v => v.diasRestantes <= DIAS_VENCIMIENTO)
}

// ============================================
// UTILIDADES DE FECHAS
// ============================================

function diasHasta(fecha) {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const objetivo = new Date(fecha)
    objetivo.setHours(0, 0, 0, 0)
    const diff = objetivo - hoy
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function diasHastaDiaDelMes(diaMes) {
    if (!diaMes || diaMes < 1 || diaMes > 31) return null

    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    const ano = hoy.getFullYear()
    const mes = hoy.getMonth()

    let objetivo = new Date(ano, mes, diaMes)
    if (objetivo < hoy) {
        objetivo = new Date(ano, mes + 1, diaMes)
    }

    const diff = objetivo - hoy
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// ============================================
// PATRIMONIO (todo se normaliza a PEN)
// ============================================

function calcularPatrimonio() {
    let totalActivos = 0
    let totalDeuda = 0
    let totalCuentas = 0

    cuentas.forEach(c => {
        if (c.estado === "archivada") return

        // El contador incluye tarjetas de crédito activas
        totalCuentas++

        if (c.tipo === "credito") {
            totalDeuda += convertirMonto(c.deuda || 0, c.moneda || "pen", "pen")
            return
        }

        if (c.esPatrimonio !== false) {
            totalActivos += convertirMonto(c.saldoInicial || 0, c.moneda || "pen", "pen")
        }
    })

    const patrimonio = totalActivos - totalDeuda

    return {
        totalActivos,
        totalDeuda,
        totalCuentas,
        patrimonio,
        tieneDeuda: totalDeuda > 0
    }
}

// ============================================
// ACTUALIZAR UI
// ============================================

function actualizarUI() {
    actualizarCuentas()
    actualizarPatrimonio()
    actualizarInversiones()
    actualizarVencimientos()
}

function actualizarCuentas() {
    const stats = calcularPatrimonio()

    const totalEl = document.getElementById("total-cuentas")
    if (totalEl) totalEl.textContent = stats.totalCuentas

    const detalleEl = document.getElementById("patrimonio-detalle")
    if (detalleEl) {
        const simbolo = simbologDe(divisaActual)
        let detalle = `Activos: ${simbolo} ${convertirMonto(stats.totalActivos, "pen", divisaActual).toFixed(2)}`
        if (stats.tieneDeuda) {
            detalle += ` | Deuda: -${simbolo} ${convertirMonto(stats.totalDeuda, "pen", divisaActual).toFixed(2)}`
        }
        detalleEl.textContent = detalle
    }
}

function simbologDe(divisa) {
    return DIVISAS_SYMBOLS[divisa] || "S/"
}

function actualizarPatrimonio() {
    const stats = calcularPatrimonio()
    const simbolo = simbologDe(divisaActual)
    const valorEl = document.getElementById("patrimonio-valor")

    if (!valorEl) return

    const valor = convertirMonto(stats.patrimonio, "pen", divisaActual)
    valorEl.textContent = `${simbolo} ${valor.toFixed(2)}`

    valorEl.classList.remove("positive", "negative")
    if (valor > 0) valorEl.classList.add("positive")
    else if (valor < 0) valorEl.classList.add("negative")
}

function actualizarInversiones() {
    const valorEl = document.getElementById("inversiones-valor")
    const detalleEl = document.getElementById("inversiones-detalle")
    const cardEl = document.getElementById("card-inversiones")

    if (!valorEl || !inversionesData) return

    if (inversionesData.cantidad === 0) {
        valorEl.textContent = formatearMonto(0, divisaActual)
        if (detalleEl) detalleEl.textContent = "Sin posiciones"
        cardEl?.classList.remove("positive", "negative")
        return
    }

    // `valorTotal` ya viene convertido a `inversionesData.divisa`; una sola
    // conversión hasta la divisa elegida en el selector (nada de doble).
    const valorConvertido = convertirMonto(
        inversionesData.valorTotal,
        inversionesData.divisa,
        divisaActual
    )

    const simbolo = simbologDe(divisaActual)
    valorEl.textContent = `${simbolo} ${valorConvertido.toFixed(2)}`

    if (detalleEl) {
        const signo = inversionesData.gananciaTotal >= 0 ? "+" : ""
        const divisaU = (inversionesData.divisa || "pen").toUpperCase()
        detalleEl.textContent =
            `${signo}${inversionesData.gananciaTotal.toFixed(2)} ${divisaU}` +
            ` · ${inversionesData.cantidad} posici${inversionesData.cantidad === 1 ? "ón" : "ones"}`
    }

    cardEl?.classList.remove("positive", "negative")
    if (inversionesData.gananciaTotal > 0) cardEl?.classList.add("positive")
    else if (inversionesData.gananciaTotal < 0) cardEl?.classList.add("negative")
}

function actualizarVencimientos() {
    const cantidadEl = document.getElementById("vencimientos-cantidad")
    const detalleEl = document.getElementById("vencimientos-detalle")
    const cardEl = document.getElementById("card-vencimientos")

    if (!cantidadEl || !vencimientosData) return

    cantidadEl.textContent = vencimientosData.total

    if (detalleEl) {
        if (vencimientosData.total === 0) {
            detalleEl.textContent = `Sin vencimientos en los próximos ${DIAS_VENCIMIENTO} días`
        } else {
            const vencidos = vencimientosData.vencidos
            let resumen = `${vencimientosData.total} en los próximos ${DIAS_VENCIMIENTO} días`
            if (vencidos > 0) {
                resumen += ` · ${vencidos} vencido${vencidos === 1 ? "" : "s"}`
            }
            detalleEl.textContent = resumen
        }
    }

    cardEl?.classList.remove("positive", "negative")
    if (vencimientosData.vencidos > 0) cardEl?.classList.add("negative")
}

function mostrarErrorCarga() {
    const detalleEl = document.getElementById("patrimonio-detalle")
    if (detalleEl) detalleEl.textContent = "Error al cargar datos"
}

// ============================================
// CARDS NAVEGABLES
// ============================================

function configurarCardsNavegacion() {
    const bindNavegacion = (id, ruta) => {
        const el = document.getElementById(id)
        if (!el) return
        const ir = () => navigateTo(ruta)
        el.addEventListener("click", ir)
        el.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                ir()
            }
        })
    }

    bindNavegacion("card-cuentas", "/cuentas")
    bindNavegacion("card-inversiones", "/inversiones")

    const vencimientos = document.getElementById("card-vencimientos")
    vencimientos?.addEventListener("click", abrirModalVencimientos)
    vencimientos?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            abrirModalVencimientos()
        }
    })
}

async function abrirModalVencimientos() {
    const items = vencimientosData?.items || []

    let contenido
    if (items.length === 0) {
        contenido = `
            <div class="modal-message">
                <p class="modal-message-desc">
                    Sin vencimientos en los próximos ${DIAS_VENCIMIENTO} días.
                </p>
            </div>
        `
    } else {
        contenido = `<div class="lista-cards vencimientos-lista">
            ${items.map(v => `
                <div class="card-item ${v.vencido ? "vencido" : ""}">
                    <div class="card-item-info">
                        <span class="card-item-titulo">${v.titulo} ${v.vencido ? "· VENCIDO" : ""}</span>
                        <span class="card-item-detalle">
                            ${v.subtitulo} · ${textoDias(v.diasRestantes)}
                        </span>
                    </div>
                    <span class="card-item-valor ${v.vencido ? "negative" : ""}">
                        ${v.monto.toFixed(2)} ${(v.divisa || "PEN").toUpperCase()}
                    </span>
                    ${v.tipo === "pendiente" ? `
                        <button class="btn-sm btn-consolidar-vencimiento" data-id="${v.id}" type="button">
                            ${v.esCobrar ? "Cobrar" : "Pagar"}
                        </button>
                    ` : ""}
                </div>
            `).join("")}
        </div>`
    }

    abrirModal({
        titulo: "Próximos vencimientos",
        contenido,
        variante: "info",
        confirmText: "Cerrar",
        onConfirm: () => true
    })

    document.querySelectorAll(".btn-consolidar-vencimiento").forEach(btn => {
        btn.addEventListener("click", async () => {
            const opcion = vencimientosData.items.find(v => v.id === btn.dataset.id)
            if (!opcion) return

            const pendiente = {
                id: opcion.id,
                concepto: opcion.titulo,
                tipo: opcion.esCobrar,
                monto: opcion.monto,
                divisa: opcion.divisa
            }

            const { abrirConsolidacionPendiente } = await import("../ui/pendientes.js")
            abrirConsolidacionPendiente(pendiente, uid)
        })
    })
}

function textoDias(dias) {
    if (dias < 0) return "vencido"
    if (dias === 0) return "hoy"
    if (dias === 1) return "mañana"
    return `en ${dias} días`
}

// ============================================
// SELECTOR DE DIVISA
// ============================================

function configurarDivisa() {
    const select = document.getElementById("divisa-select")
    if (!select) return

    select.value = divisaActual

    select.addEventListener("change", async () => {
        divisaActual = select.value

        actualizarPatrimonio()
        actualizarInversiones()

        if (datosGrafico) {
            await crearGraficoPatrimonio("grafico-patrimonio", datosGrafico, {
                divisa: divisaActual.toUpperCase()
            })
        }
    })
}

// ============================================
// GRÁFICO DE PATRIMONIO
// ============================================

async function cargarGraficoPatrimonio() {
    try {
        datosGrafico = await obtenerPatrimonioParaGrafico(uid, 30)

        if (datosGrafico.labels.length > 0) {
            setTimeout(async () => {
                await crearGraficoPatrimonio("grafico-patrimonio", datosGrafico, {
                    divisa: divisaActual.toUpperCase()
                })
            }, 200)
        } else {
            mostrarGraficoVacio()
        }
    } catch (error) {
        console.error("Error cargando gráfico de patrimonio:", error)
        mostrarGraficoVacio()
    }
}

function mostrarGraficoVacio() {
    const canvas = document.getElementById("grafico-patrimonio")
    if (!canvas) return

    const parent = canvas.parentElement
    if (!parent) return

    parent.innerHTML = `
        <div class="grafico-vacio">
            <p class="grafico-vacio-texto">Aún no hay datos históricos</p>
            <p class="grafico-vacio-hint">Los datos se registran automáticamente cada día</p>
        </div>
    `
}

// ============================================
// LIMPIEZA
// ============================================

export function destroy() {
    destruirGraficoPatrimonio()
}