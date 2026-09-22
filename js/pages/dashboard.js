import { sesion } from "../core/sesion.js"
import { cacheCapa } from "../core/cache.js"
import { activarSpinLogo, desactivarSpinLogo, navigateTo } from "../core/router.js"
import { obtenerCuentas, obtenerMovimientos } from "../../firebase/firestore.js"
import { DIVISAS_SYMBOLS } from "../../constants/divisas.js"
import { CONFIG_MOVIMIENTOS, TIPOS_MOVIMIENTO } from "../../constants/tiposMovimiento.js"
import {
    registrarSnapshot,
    obtenerPatrimonioParaGrafico,
    calcularPatrimonio
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
import { icono } from "../core/iconos.js"

import { obtenerMetas } from "../repositories/MetaRepositorio.js"
import { abrirModalMeta, abrirModalAporteMeta } from "../ui/metas.js"

// ============================================
// ESTADO
// ============================================

let uid = null
let cuentas = []
let divisaActual = getDivisaPrincipal()
let datosGrafico = null
let inversionesData = null
let vencimientosData = null
let favoritosData = []
let metasData = []
let movimientosData = []
let cargado = false

const DIAS_VENCIMIENTO = 7

// Periodos del gráfico de patrimonio. "todo" usa un tope alto de días.
const PERIODOS_GRAFICO = [
    { id: "7d", etiqueta: "7D", dias: 7, sub: "Últimos 7 días" },
    { id: "30d", etiqueta: "30D", dias: 30, sub: "Últimos 30 días" },
    { id: "90d", etiqueta: "90D", dias: 90, sub: "Últimos 90 días" },
    { id: "1a", etiqueta: "1A", dias: 365, sub: "Último año" },
    { id: "todo", etiqueta: "Todo", dias: 3650, sub: "Histórico completo" }
]
const PERIODO_POR_DEFECTO = "30d"

let periodoGrafico = PERIODO_POR_DEFECTO

function obtenerPeriodo(id) {
    return PERIODOS_GRAFICO.find(p => p.id === id) || PERIODOS_GRAFICO[1]
}

// ============================================
// RENDER
// ============================================

export function render() {
    return `
        <div class="dashboard">
            <div class="glass card primary patrimonio-card">
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

            <div class="glass card card-navegable positive" id="card-cuentas" role="button" tabindex="0" title="Ver cuentas">
                <div class="card-title">Cuentas</div>
                <div class="card-value" id="total-cuentas">0</div>
                <div class="card-sub">Activas y tarjetas</div>
            </div>

            <div class="glass card card-navegable" id="card-inversiones" role="button" tabindex="0" title="Ver inversiones">
                <div class="card-title">Inversiones</div>
                <div class="card-value" id="inversiones-valor">—</div>
                <div class="card-sub" id="inversiones-detalle">—</div>
            </div>

            <div class="glass card card-navegable" id="card-vencimientos" role="button" tabindex="0" title="Ver pendientes">
                <div class="card-title">Próximos vencimientos</div>
                <div class="card-value" id="vencimientos-cantidad">—</div>
                <div class="card-sub" id="vencimientos-detalle">—</div>
            </div>

            <div class="glass card card-navegable movimientos-card" id="card-movimientos" role="button" tabindex="0" title="Ver movimientos">
                <div class="card-title">Últimos movimientos</div>
                <div class="movimientos-lista" id="movimientos-lista">
                    <p class="card-vacio">Cargando...</p>
                </div>
            </div>

            <div class="glass card card-navegable favoritos-card" id="card-favoritos" role="button" tabindex="0" title="Ver inversiones">
                <div class="card-header">
                    <span class="card-title">Favoritos</span>
                    <span class="card-badge" id="favoritos-cantidad">0</span>
                </div>
                <div class="favoritos-lista" id="favoritos-lista">
                    <p class="card-vacio">Cargando...</p>
                </div>
            </div>

            <div class="glass card metas-card" id="card-metas">
                <div class="card-header">
                    <span class="card-title">Metas de ahorro</span>
                    <button type="button" class="glass-btn btn-meta-nueva" id="btn-nueva-meta">
                        ${icono("plus-circle", 14)} Nueva
                    </button>
                </div>
                <div class="metas-lista" id="metas-lista">
                    <p class="card-vacio">Cargando...</p>
                </div>
            </div>

            <div class="glass card grafico-patrimonio-card">
                <div class="card-header">
                    <span class="card-title">Evolución patrimonial</span>
                    <div class="toggle-group grafico-periodos" id="grafico-periodos">
                        ${PERIODOS_GRAFICO.map(p => `
                            <span class="toggle-option" data-periodo="${p.id}">${p.etiqueta}</span>
                        `).join('')}
                    </div>
                </div>
                <span class="card-sub" id="grafico-periodo">Últimos 30 días</span>
                <div class="grafico-container-dashboard">
                    <canvas id="grafico-patrimonio"></canvas>
                    <div class="grafico-estado" id="grafico-estado" hidden></div>
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
    periodoGrafico = PERIODO_POR_DEFECTO
    console.log("[INFO] Dashboard iniciado para UID:", uid)

    configurarDivisa()
    configurarPeriodos()
    configurarCardsNavegacion()
    configurarMetas()

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

        const [inversionesResp, vencimientosResp, metasResp, movimientosResp] = await Promise.all([
            cargarInversiones(),
            cargarVencimientos(cuentasResp),
            cargarMetas(),
            cargarMovimientos()
        ])

        cuentas = cuentasResp
        inversionesData = inversionesResp
        vencimientosData = vencimientosResp
        favoritosData = inversionesResp.favoritos || []
        metasData = metasResp
        movimientosData = movimientosResp

        await actualizarUI()
    } catch (error) {
        console.error("Error cargando dashboard:", error)
        mostrarErrorCarga()
    }
}

async function cargarInversiones() {
    try {
        const data = await obtenerPosicionesConValor(uid)
        const posiciones = data.posiciones || []
        return {
            valorTotal: data.valorTotal || 0,
            gananciaTotal: data.gananciaTotal || 0,
            cantidad: data.cantidad || 0,
            // La divisa a la que ya fueron convertidos los totales
            divisa: data.divisa || "pen",
            // Posiciones cuyo activo está marcado como favorito
            favoritos: posiciones.filter(p => p.activo?.favorito === true)
        }
    } catch (error) {
        console.error("Error cargando inversiones:", error)
        return { valorTotal: 0, gananciaTotal: 0, cantidad: 0, divisa: "pen", favoritos: [] }
    }
}

async function cargarMetas() {
    try {
        return await obtenerMetas(uid)
    } catch (error) {
        console.error("Error cargando metas:", error)
        return []
    }
}

async function cargarMovimientos() {
    try {
        const lista = await obtenerMovimientos(uid)
        return lista
            .slice()
            .sort((a, b) => {
                const fa = (fechaDeMovimiento(a)?.getTime?.()) || 0
                const fb = (fechaDeMovimiento(b)?.getTime?.()) || 0
                return fb - fa
            })
            .slice(0, cantidadMovimientosRecientes())
    } catch (error) {
        console.error("Error cargando movimientos:", error)
        return []
    }
}

// Cantidad de "últimos movimientos" a mostrar, desde Configuración (1-10).
function cantidadMovimientosRecientes() {
    const prefs = sesion.getPreferencias()
    const n = Number.parseInt(prefs?.movimientosRecientes, 10)
    if (!Number.isFinite(n)) return 5
    return Math.min(10, Math.max(1, n))
}

async function cargarVencimientos(cuentasDeUsuario) {
    try {
        const [pendientes, tarjetas, metas] = await Promise.all([
            obtenerPendientesConVencimiento(),
            obtenerTarjetasConPagoProximo(cuentasDeUsuario),
            obtenerMetasConVencimiento()
        ])

        // Combinar y ordenar por días restantes ascendente
        const todos = [...pendientes, ...tarjetas, ...metas]
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

async function obtenerMetasConVencimiento() {
    const metas = await obtenerMetas(uid)

    return metas
        .filter(m => m.fechaLimite && m.activa !== false && !m.completada)
        .map(m => {
            const dias = diasHasta(m.fechaLimite)
            return {
                tipo: "meta",
                id: m.id,
                titulo: m.nombre,
                subtitulo: "Meta de ahorro",
                monto: m.montoRestante,
                divisa: m.divisa,
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
// PATRIMONIO (fuente única: SnapshotServicio.calcularPatrimonio)
// ============================================

// ============================================
// ACTUALIZAR UI
// ============================================

async function actualizarUI() {
    await actualizarCuentas()
    await actualizarPatrimonio()
    actualizarInversiones()
    actualizarVencimientos()
    actualizarFavoritos()
    actualizarMetas()
    actualizarMovimientos()
}

async function actualizarCuentas() {
    const stats = await calcularPatrimonio(uid)

    const totalEl = document.getElementById("total-cuentas")
    if (totalEl) totalEl.textContent = stats.totalCuentas

    const detalleEl = document.getElementById("patrimonio-detalle")
    if (detalleEl) {
        const simbolo = DIVISAS_SYMBOLS[divisaActual] || "S/"
        let detalle = `Activos: ${simbolo} ${convertirMonto(stats.totalActivos, "pen", divisaActual).toFixed(2)}`
        if (stats.tieneDeuda) {
            detalle += ` | Deuda: -${simbolo} ${convertirMonto(stats.totalDeuda, "pen", divisaActual).toFixed(2)}`
        }
        detalleEl.textContent = detalle
    }
}

async function actualizarPatrimonio() {
    const stats = await calcularPatrimonio(uid)
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

    // `valorTotal` ya viene convertido a `inversionesData.divisa`; una sola
    // conversión hasta la divisa elegida en el selector (nada de doble).
    const valorConvertido = convertirMonto(
        inversionesData.valorTotal,
        inversionesData.divisa,
        divisaActual
    )

    const simbolo = DIVISAS_SYMBOLS[divisaActual] || "S/"
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
// ÚLTIMOS MOVIMIENTOS
// ============================================

function actualizarMovimientos() {
    const lista = document.getElementById("movimientos-lista")
    if (!lista) return

    if (movimientosData.length === 0) {
        lista.innerHTML = `<p class="card-vacio">Sin movimientos por ahora.</p>`
        return
    }

    lista.innerHTML = movimientosData.map(plantillaMovimiento).join("")
    enlazarMovimientos(lista)
}

function enlazarMovimientos(lista) {
    lista.querySelectorAll(".movimiento-item").forEach(item => {
        const abrir = async (evento) => {
            evento?.preventDefault?.()
            evento?.stopPropagation?.()
            const m = movimientosData.find(x => x.id === item.dataset.movimientoId)
            if (!m) return
            const { abrirFormularioDetalle } = await import("./movimientos.js")
            abrirFormularioDetalle(m)
        }
        item.addEventListener("click", abrir)
        item.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") abrir(e)
        })
    })
}

function plantillaMovimiento(m) {
    const monto = montoDeMovimiento(m)
    const esPositivo = esMovimientoPositivo(m)
    const signo = esPositivo ? "+" : "-"
    const clase = esPositivo ? "positive" : "negative"
    const tipoNombre = CONFIG_MOVIMIENTOS[m.tipo]?.nombre || m.tipo || "Movimiento"

    return `
        <div class="movimiento-item" data-movimiento-id="${m.id}" role="button" tabindex="0" title="Ver movimiento">
            <div class="movimiento-info">
                <span class="movimiento-titulo">${m.concepto || m.activo || tipoNombre}</span>
                <span class="movimiento-detalle">${formatearFecha(fechaDeMovimiento(m))}</span>
            </div>
            <span class="movimiento-monto ${clase}">${signo} ${Math.abs(monto).toFixed(2)} ${(m.divisa || "PEN").toUpperCase()}</span>
        </div>
    `
}

function esMovimientoPositivo(m) {
    if (m?.tipo === TIPOS_MOVIMIENTO.ERROR) {
        return m.operacion === "sumar"
    }
    if (!m?.tipo) return false
    return (
        m.tipo === "ingreso" ||
        m.tipo === "ventaActivo" ||
        m.tipo === "p2pVenta"
    )
}

function montoDeMovimiento(m) {
    if (m.monto !== undefined && m.monto !== null && m.monto !== "") {
        return Number(m.monto) || 0
    }
    if (m.cantidad && m.precio) {
        const total = Number(m.cantidad) * Number(m.precio)
        const comision = Number(m.comision) || 0
        return esMovimientoPositivo(m) ? (total - comision) : (total + comision)
    }
    if (m.montoOrigen) return Number(m.montoOrigen) || 0
    if (m.montoDestino) return Number(m.montoDestino) || 0
    return 0
}

function fechaDeMovimiento(m) {
    const valor = m.fechaRealizacion || m.fechaRegistro
    if (!valor) return null
    if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
        const [anio, mes, dia] = valor.split("-").map(Number)
        return new Date(anio, mes - 1, dia)
    }
    if (valor?.toDate) return valor.toDate()
    if (valor?.seconds) return new Date(valor.seconds * 1000)
    return new Date(valor)
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
    bindNavegacion("card-favoritos", "/inversiones")
    bindNavegacion("card-movimientos", "/movimientos")

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
// FAVORITOS
// ============================================

function actualizarFavoritos() {
    const lista = document.getElementById("favoritos-lista")
    const cantidadEl = document.getElementById("favoritos-cantidad")
    if (!lista) return

    if (cantidadEl) cantidadEl.textContent = favoritosData.length

    if (favoritosData.length === 0) {
        lista.innerHTML = `<p class="card-vacio">Marca activos con la estrella en Inversiones.</p>`
        return
    }

    lista.innerHTML = favoritosData.map(plantillaFavorito).join("")
    enlazarFavoritos(lista)
}

function enlazarFavoritos(lista) {
    lista.querySelectorAll(".favorito-item").forEach(item => {
        const abrir = async (evento) => {
            evento?.preventDefault?.()
            evento?.stopPropagation?.()
            const posicion = favoritosData.find(p => p.activoId === item.dataset.activoId)
            const activo = posicion?.activo
            if (!posicion || !activo) return
            const { mostrarGraficoActivo } = await import("./inversiones.js")
            await mostrarGraficoActivo(activo.id, activo, posicion)
        }
        item.addEventListener("click", abrir)
        item.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") abrir(e)
        })
    })
}

function plantillaFavorito(posicion) {
    const activo = posicion.activo || {}
    const precio = (activo.ultimoPrecio || 0).toFixed(2)

    return `
        <div class="favorito-item" data-activo-id="${posicion.activoId}" role="button" tabindex="0" title="Ver historial de precios">
            <div class="favorito-info">
                <span class="favorito-nombre">${activo.nombre || posicion.activoId}</span>
                <span class="favorito-simbolo">${activo.simbolo || ""}</span>
            </div>
            <span class="favorito-precio">${DIVISAS_SYMBOLS[posicion.divisa] || "S/"} ${precio}</span>
        </div>
    `
}

// ============================================
// METAS DE AHORRO
// ============================================

function configurarMetas() {
    document.getElementById("btn-nueva-meta")
        ?.addEventListener("click", () => abrirModalMeta())

    instalarSincronizacionMetas()
}

// Cuando las metas cambian desde el modal del lastbar (metas.js), refresca
// la sección del dashboard sin recargar. Se instala una sola vez.
let sincronizacionMetasInstalada = false
function instalarSincronizacionMetas() {
    if (sincronizacionMetasInstalada) return
    sincronizacionMetasInstalada = true
    window.addEventListener("metas-actualizadas", async () => {
        metasData = await cargarMetas()
        actualizarMetas()
    })
}

function actualizarMetas() {
    const lista = document.getElementById("metas-lista")
    if (!lista) return

    if (metasData.length === 0) {
        lista.innerHTML = `<p class="card-vacio">Crea tu primera meta de ahorro.</p>`
        return
    }

    lista.innerHTML = metasData.map(plantillaMeta).join("")
    enlazarListaMetas(lista)
}

// Tarjeta al estilo de "Últimos movimientos"/"Favoritos": el nombre con el
// monto acumulado como información secundaria y el porcentaje a la derecha.
function plantillaMeta(meta) {
    const simbolo = DIVISAS_SYMBOLS[meta.divisa] || "S/"
    const clases = [
        "meta-item",
        meta.completada ? "completada" : "",
        meta.activa ? "" : "pausada"
    ].filter(Boolean).join(" ")

    return `
        <div class="${clases}" data-meta-id="${meta.id}" role="button" tabindex="0" title="Aportar a la meta">
            <div class="meta-info">
                <span class="meta-nombre">${meta.nombre}</span>
                <span class="meta-cantidad">${simbolo} ${meta.montoActual.toFixed(2)}</span>
            </div>
            <span class="meta-porcentaje">${meta.porcentaje.toFixed(0)}%</span>
        </div>
    `
}

function enlazarListaMetas(lista) {
    lista.querySelectorAll(".meta-item").forEach(item => {
        const abrir = (evento) => {
            evento?.preventDefault?.()
            evento?.stopPropagation?.()
            const meta = metasData.find(m => m.id === item.dataset.metaId)
            if (meta) abrirModalAporteMeta(meta)
        }
        item.addEventListener("click", abrir)
        item.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") abrir(e)
        })
    })
}

function formatearFecha(fecha) {
    if (!fecha) return "—"
    const d = new Date(fecha)
    if (isNaN(d.getTime())) return "—"
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })
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

        await actualizarPatrimonio()
        actualizarInversiones()

        // Redibujar el gráfico manteniendo el periodo actual
        if (datosGrafico?.labels?.length) {
            await crearGraficoPatrimonio("grafico-patrimonio", datosGrafico, {
                divisa: divisaActual.toUpperCase()
            })
        }
    })
}

// ============================================
// SELECTOR DE PERIODO
// ============================================

function configurarPeriodos() {
    const contenedor = document.getElementById("grafico-periodos")
    if (!contenedor) return

    const opciones = contenedor.querySelectorAll(".toggle-option")

    const marcarActivo = () => {
        opciones.forEach(opt => {
            opt.classList.toggle("active", opt.dataset.periodo === periodoGrafico)
        })
    }

    opciones.forEach(opt => {
        opt.addEventListener("click", async () => {
            if (opt.dataset.periodo === periodoGrafico) return
            periodoGrafico = opt.dataset.periodo
            marcarActivo()
            await cargarGraficoPatrimonio()
        })
    })

    marcarActivo()
    actualizarEtiquetaPeriodo(obtenerPeriodo(periodoGrafico))
}

function actualizarEtiquetaPeriodo(periodo) {
    const etiqueta = document.getElementById("grafico-periodo")
    if (etiqueta) etiqueta.textContent = periodo.sub
}

// ============================================
// GRÁFICO DE PATRIMONIO
// ============================================

async function cargarGraficoPatrimonio() {
    const periodo = obtenerPeriodo(periodoGrafico)
    actualizarEtiquetaPeriodo(periodo)
    mostrarEstadoGrafico("cargando", "Cargando datos...")

    try {
        datosGrafico = await obtenerPatrimonioParaGrafico(uid, periodo.dias)

        if (!datosGrafico || datosGrafico.labels.length === 0) {
            mostrarEstadoGrafico("vacio", "Sin datos para este periodo", "Los datos se registran automáticamente cada día")
            ocultarCanvas()
            return
        }

        mostrarCanvas()
        ocultarEstadoGrafico()
        dibujarGrafico()
    } catch (error) {
        console.error("Error cargando gráfico de patrimonio:", error)
        mostrarEstadoGrafico("vacio", "No se pudo cargar el gráfico", error.message)
        ocultarCanvas()
    }
}

function dibujarGrafico() {
    setTimeout(async () => {
        await crearGraficoPatrimonio("grafico-patrimonio", datosGrafico, {
            divisa: divisaActual.toUpperCase()
        })
    }, 200)
}

function mostrarEstadoGrafico(tipo, texto, hint = "") {
    const estado = document.getElementById("grafico-estado")
    if (!estado) return

    const spinner = tipo === "cargando" ? '<div class="loading-spinner"></div>' : ""

    estado.innerHTML = `
        <div class="grafico-vacio">
            ${spinner}
            <p class="grafico-vacio-texto">${texto}</p>
            ${hint ? `<p class="grafico-vacio-hint">${hint}</p>` : ""}
        </div>
    `
    estado.hidden = false
}

function ocultarEstadoGrafico() {
    const estado = document.getElementById("grafico-estado")
    if (!estado) return
    estado.hidden = true
    estado.innerHTML = ""
}

function mostrarCanvas() {
    const canvas = document.getElementById("grafico-patrimonio")
    if (canvas) canvas.hidden = false
}

function ocultarCanvas() {
    const canvas = document.getElementById("grafico-patrimonio")
    if (canvas) canvas.hidden = true
}

// ============================================
// LIMPIEZA
// ============================================

export function destroy() {
    destruirGraficoPatrimonio()
}