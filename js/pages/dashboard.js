import { sesion } from "../core/sesion.js"
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
                <div class="card-sub" id="patrimonio-detalle">Cargando...</div>
            </div>

            <div class="card positive">
                <div class="card-title">Cuentas</div>
                <div class="card-value" id="total-cuentas">0</div>
                <div class="card-sub">Activas</div>
            </div>

            <div class="card" id="card-inversiones">
                <div class="card-title">Inversiones</div>
                <div class="card-value" id="inversiones-valor">—</div>
                <div class="card-sub" id="inversiones-detalle">Cargando...</div>
            </div>

            <div class="card" id="card-vencimientos">
                <div class="card-title">Próximos vencimientos</div>
                <div class="card-value" id="vencimientos-cantidad">—</div>
                <div class="card-sub" id="vencimientos-detalle">Cargando...</div>
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
    console.log("[INFO] Dashboard iniciado para UID:", uid)

    configurarDivisa()

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
    try {
        await cargarTodo()

        try {
            await registrarSnapshot(uid)
        } catch (error) {
            console.warn("No se pudo registrar snapshot:", error)
        }

        await cargarGraficoPatrimonio()
    } catch (error) {
        console.error("Error recargando dashboard:", error)
    }
}

// ============================================
// CARGA GLOBAL
// ============================================

async function cargarTodo() {
    try {
        // Cargar en paralelo todo lo que no depende entre sí
        const [cuentasResp, inversionesResp, vencimientosResp] = await Promise.all([
            obtenerCuentas(uid),
            cargarInversiones(),
            cargarVencimientos()
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
            divisa: data.posiciones?.[0]?.divisa || "usd"
        }
    } catch (error) {
        console.error("Error cargando inversiones:", error)
        return { valorTotal: 0, gananciaTotal: 0, cantidad: 0, divisa: "usd" }
    }
}

async function cargarVencimientos() {
    try {
        const [pendientes, tarjetas] = await Promise.all([
            obtenerPendientesConVencimiento(),
            obtenerTarjetasConPagoProximo()
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
                monto: p.monto,
                divisa: p.divisa,
                diasRestantes: dias,
                vencido: dias < 0,
                icono: p.tipo ? "📥" : "📤"
            }
        })
        .filter(v => v.diasRestantes <= DIAS_VENCIMIENTO)
}

async function obtenerTarjetasConPagoProximo() {
    const tarjetas = cuentas.filter(
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
                icono: "💳"
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

    const anio = hoy.getFullYear()
    const mes = hoy.getMonth()

    let objetivo = new Date(anio, mes, diaMes)
    if (objetivo < hoy) {
        objetivo = new Date(anio, mes + 1, diaMes)
    }

    const diff = objetivo - hoy
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// ============================================
// PATRIMONIO
// ============================================

function calcularPatrimonio() {
    let totalActivos = 0
    let totalDeuda = 0
    let totalCuentas = 0

    cuentas.forEach(c => {
        if (c.estado === "archivada") return

        if (c.tipo === "credito") {
            totalDeuda += c.deuda || 0
            return
        }

        if (c.esPatrimonio !== false) {
            totalActivos += c.saldoInicial || 0
            totalCuentas++
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
        let detalle = `Activos: ${stats.totalActivos.toFixed(2)}`
        if (stats.tieneDeuda) {
            detalle += ` | Deuda: -${stats.totalDeuda.toFixed(2)}`
        }
        detalleEl.textContent = detalle
    }
}

function actualizarPatrimonio() {
    const stats = calcularPatrimonio()
    const simbolo = DIVISAS_SYMBOLS[divisaActual] || "S/"
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

    // Convertir el valor total (viene en la divisa base de las posiciones)
    const valorConvertido = convertirMonto(
        inversionesData.valorTotal,
        inversionesData.divisa,
        divisaActual
    )

    const simbolo = DIVISAS_SYMBOLS[divisaActual] || "S/"
    valorEl.textContent = `${simbolo} ${valorConvertido.toFixed(2)}`

    // Detalle: rendimiento + nº de posiciones
    if (detalleEl) {
        const signo = inversionesData.gananciaTotal >= 0 ? "+" : ""
        const divisaU = (inversionesData.divisa || "usd").toUpperCase()
        detalleEl.textContent =
            `${signo}${inversionesData.gananciaTotal.toFixed(2)} ${divisaU}` +
            ` · ${inversionesData.cantidad} posici${inversionesData.cantidad === 1 ? "ón" : "ones"}`
    }

    // Color de la card según ganancia
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

    // Detalle: texto resumen + lista de los 3 primeros
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

    // Card destacada si hay vencidos
    cardEl?.classList.remove("positive", "negative")
    if (vencimientosData.vencidos > 0) cardEl?.classList.add("negative")
}

function mostrarErrorCarga() {
    const detalleEl = document.getElementById("patrimonio-detalle")
    if (detalleEl) detalleEl.textContent = "Error al cargar datos"
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