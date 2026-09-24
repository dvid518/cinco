import { sesion } from "../core/sesion.js"
import { cacheCapa } from "../core/cache.js"
import { activarSpinLogo, desactivarSpinLogo, navigateTo } from "../core/router.js"
import { obtenerCuentas, obtenerMovimientos, obtenerPreferencias, actualizarPreferencias } from "../../firebase/firestore.js"
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
import { estadoCicloDe, proximaAnualidad } from "../services/CreditoServicio.js"
import { obtenerPendientes } from "../repositories/PendienteRepositorio.js"
import { abrirModal } from "../ui/modal.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"
import { icono, LOGO_ESCINCO_CARGA } from "../core/iconos.js"

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
let eventosRefreshDashboardListos = false
let timerRefreshDashboard = null

const DIAS_VENCIMIENTO = 7
const DASHBOARD_CARDS = [
    { id: "patrimonio", label: "Patrimonio total" },
    { id: "cuentas", label: "Cuentas" },
    { id: "inversiones", label: "Inversiones" },
    { id: "vencimientos", label: "Próximos vencimientos" },
    { id: "movimientos", label: "Últimos movimientos" },
    { id: "favoritos", label: "Favoritos" },
    { id: "metas", label: "Metas de ahorro" },
    { id: "grafico", label: "Evolución patrimonial" }
]

const DEFAULT_CARDS_VISIBLES = DASHBOARD_CARDS
    .map(card => card.id)
    .filter(id => id !== "patrimonio")
const DEFAULT_CARDS_ORDEN = [...DEFAULT_CARDS_VISIBLES]

let cardsVisiblesDashboard = [...DEFAULT_CARDS_VISIBLES]
let cardsOrdenDashboard = [...DEFAULT_CARDS_ORDEN]
let modoEdicionDashboard = false
let cambiosPendientesDashboard = false
let eventosEdicionDashboardListos = false

function normalizarCardsVisibles(valor) {
    if (!Array.isArray(valor)) return [...DEFAULT_CARDS_VISIBLES]
    const idsConocidos = new Set(DASHBOARD_CARDS.map(card => card.id))
    return [...new Set(valor.filter(id => id !== "patrimonio" && idsConocidos.has(id)))]
}

function normalizarCardsOrden(valor) {
    if (!Array.isArray(valor)) return [...DEFAULT_CARDS_ORDEN]
    const idsConocidos = new Set(DEFAULT_CARDS_ORDEN)
    const validos = [...new Set(valor.filter(id => idsConocidos.has(id)))]
    return [...validos, ...DEFAULT_CARDS_ORDEN.filter(id => !validos.includes(id))]
}

async function cargarCardsVisiblesDashboard() {
    if (!uid) return
    try {
        const preferencias = await obtenerPreferencias(uid)
        cardsVisiblesDashboard = normalizarCardsVisibles(preferencias?.dashboard?.cardsVisibles)
        cardsOrdenDashboard = normalizarCardsOrden(preferencias?.dashboard?.orden)
    } catch (error) {
        console.warn("No se pudieron cargar las cards visibles del dashboard:", error)
        cardsVisiblesDashboard = [...DEFAULT_CARDS_VISIBLES]
        cardsOrdenDashboard = [...DEFAULT_CARDS_ORDEN]
    }
}

function aplicarLayoutDashboard() {
    const grid = document.querySelector(".dashboard")
    if (!grid) return
    const cards = [...grid.querySelectorAll("[data-dashboard-card]")]
    const visibles = new Set(["patrimonio", ...cardsVisiblesDashboard])
    cards.forEach(card => { card.hidden = !visibles.has(card.dataset.dashboardCard) })

    const ordenVisible = ["patrimonio", ...cardsOrdenDashboard.filter(id => visibles.has(id))]
    ordenVisible.forEach(id => {
        const card = cards.find(item => item.dataset.dashboardCard === id)
        if (card) grid.appendChild(card)
    })
    cards.forEach(card => {
        if (!card.hidden) return
        grid.appendChild(card)
    })
}

function reordenarCardDashboard(idOrigen, idDestino) {
    if (!idOrigen || !idDestino || idOrigen === idDestino || idOrigen === "patrimonio" || idDestino === "patrimonio") return
    const origen = cardsOrdenDashboard.indexOf(idOrigen)
    const destino = cardsOrdenDashboard.indexOf(idDestino)
    if (origen < 0 || destino < 0) return
    cardsOrdenDashboard.splice(origen, 1)
    cardsOrdenDashboard.splice(destino, 0, idOrigen)
    cambiosPendientesDashboard = true
    aplicarLayoutDashboard()
}

function moverCardDashboard(id, direccion) {
    const indice = cardsOrdenDashboard.indexOf(id)
    const destino = indice + direccion
    if (indice < 0 || destino < 0 || destino >= cardsOrdenDashboard.length || id === "patrimonio") return
    [cardsOrdenDashboard[indice], cardsOrdenDashboard[destino]] = [cardsOrdenDashboard[destino], cardsOrdenDashboard[indice]]
    cambiosPendientesDashboard = true
    aplicarLayoutDashboard()
}

function prepararEdicionCardsDashboard() {
    document.querySelectorAll(".dashboard [data-dashboard-card]").forEach(card => {
        const id = card.dataset.dashboardCard
        if (id === "patrimonio") {
            card.draggable = false
            return
        }
        card.draggable = false
        const controlesExistentes = card.querySelector(".dashboard-card-edicion")
        if (controlesExistentes) {
            controlesExistentes.querySelector("[data-dashboard-drag-handle]")?.setAttribute("draggable", "true")
            return
        }
        const controles = document.createElement("div")
        controles.className = "dashboard-card-edicion"
        controles.innerHTML = `
            <button type="button" class="dashboard-card-handle" data-dashboard-drag-handle aria-label="Arrastrar card">⋮⋮</button>
            <button type="button" class="dashboard-card-mover" data-dashboard-mover data-id="${id}" data-direccion="-1" aria-label="Mover card hacia arriba">↑</button>
            <button type="button" class="dashboard-card-mover" data-dashboard-mover data-id="${id}" data-direccion="1" aria-label="Mover card hacia abajo">↓</button>
        `
        card.appendChild(controles)
    })
}

function desactivarEdicionCardsDashboard() {
    document.querySelectorAll(".dashboard [data-dashboard-card]").forEach(card => {
        card.draggable = false
    })
}

function configurarEventosReordenamientoDashboard() {
    const grid = document.querySelector(".dashboard")
    if (!grid || grid.dataset.reordenamientoListos === "1") return
    grid.dataset.reordenamientoListos = "1"

    grid.addEventListener("dragstart", (evento) => {
        const card = evento.target.closest("[data-dashboard-card]")
        if (!modoEdicionDashboard || !card || card.dataset.dashboardCard === "patrimonio") {
            evento.preventDefault()
            return
        }
        evento.dataTransfer?.setData("text/plain", card.dataset.dashboardCard)
        if (evento.dataTransfer) evento.dataTransfer.effectAllowed = "move"
        card.classList.add("dashboard-card-arrastrando")
    })

    grid.addEventListener("dragover", (evento) => {
        const card = evento.target.closest("[data-dashboard-card]")
        if (!modoEdicionDashboard || !card || card.dataset.dashboardCard === "patrimonio") return
        evento.preventDefault()
        if (evento.dataTransfer) evento.dataTransfer.dropEffect = "move"
    })

    grid.addEventListener("drop", (evento) => {
        const destino = evento.target.closest("[data-dashboard-card]")
        if (!modoEdicionDashboard || !destino || destino.dataset.dashboardCard === "patrimonio") return
        evento.preventDefault()
        const origen = evento.dataTransfer?.getData("text/plain")
        reordenarCardDashboard(origen, destino.dataset.dashboardCard)
    })

    grid.addEventListener("dragend", (evento) => {
        evento.target.closest("[data-dashboard-card]")?.classList.remove("dashboard-card-arrastrando")
    })

    grid.addEventListener("click", (evento) => {
        const boton = evento.target.closest("[data-dashboard-mover]")
        if (!modoEdicionDashboard || !boton) return
        evento.stopPropagation()
        moverCardDashboard(boton.dataset.id, Number(boton.dataset.direccion))
    })
}


function configurarEdicionDashboard() {
    if (!eventosEdicionDashboardListos) {
        eventosEdicionDashboardListos = true
        document.addEventListener("pagina-cambiando", manejarCambioPaginaDashboard)
    }

    document.getElementById("dashboard-abrir-cards")?.addEventListener("click", abrirSelectorCardsDashboard)
    document.getElementById("dashboard-listo")?.addEventListener("click", guardarYSalirEdicionDashboard)
}

function activarModoEdicionDashboard() {
    modoEdicionDashboard = true
    cambiosPendientesDashboard = false
    document.getElementById("dashboard-edicion-bar")?.removeAttribute("hidden")
    document.querySelector(".dashboard")?.classList.add("dashboard-edicion-activo")
    configurarEventosReordenamientoDashboard()
    prepararEdicionCardsDashboard()
    mostrarNotificacion("info", "Modo edición del dashboard activo")
}

function salirModoEdicionDashboard(forzar = false) {
    if (!modoEdicionDashboard) return
    if (cambiosPendientesDashboard && !forzar) {
        mostrarNotificacion("warning", "Guarda o reinicia los cambios antes de salir")
        return
    }
    modoEdicionDashboard = false
    cambiosPendientesDashboard = false
    document.getElementById("dashboard-edicion-bar")?.setAttribute("hidden", "")
    document.querySelector(".dashboard")?.classList.remove("dashboard-edicion-activo")
    desactivarEdicionCardsDashboard()
}

async function guardarOrdenDashboard() {
    try {
        await actualizarPreferencias(uid, { "dashboard.orden": cardsOrdenDashboard })
        cambiosPendientesDashboard = false
        return true
    } catch (error) {
        console.error("Error guardando orden del dashboard:", error)
        mostrarNotificacion("error", "No se pudo guardar el orden del dashboard")
        return false
    }
}

async function guardarYSalirEdicionDashboard() {
    if (!cambiosPendientesDashboard) {
        salirModoEdicionDashboard()
        return
    }
    if (!await guardarOrdenDashboard()) return
    salirModoEdicionDashboard(true)
    mostrarNotificacion("exito", "Orden del dashboard guardado")
}

function manejarCambioPaginaDashboard(evento) {
    if (evento.detail?.desde !== "dashboard") return
    if (!modoEdicionDashboard || !cambiosPendientesDashboard) {
        salirModoEdicionDashboard(true)
        return
    }

    evento.preventDefault()
    const hacia = evento.detail.hacia
    mostrarNotificacion("warning", "Hay cambios sin guardar en el dashboard", 0, [
        {
            texto: "Guardar y salir",
            primaria: true,
            alClick: async () => {
                if (!await guardarOrdenDashboard()) return
                salirModoEdicionDashboard(true)
                navigateTo(hacia === "dashboard" ? "/" : `/${hacia}`)
            }
        },
        {
            texto: "Cancelar",
            clase: "cancel",
            alClick: () => {}
        }
    ])
}

function abrirSelectorCardsDashboard() {
    if (!modoEdicionDashboard) return
    const cards = DASHBOARD_CARDS.filter(card => card.id !== "patrimonio")
    const activas = new Set(cardsVisiblesDashboard)
    const opciones = cards.map(card => `
        <label class="dashboard-card-opcion">
            <input type="checkbox" value="${card.id}" ${activas.has(card.id) ? "checked" : ""}>
            <span>${card.label}</span>
        </label>
    `).join("")

    const cambiosPendientesAntesModal = cambiosPendientesDashboard
    const modal = abrirModal({
        titulo: "Elegir cards del dashboard",
        variante: "form",
        confirmText: "Guardar",
        cancelText: "Cancelar",
        onCancel: () => { cambiosPendientesDashboard = cambiosPendientesAntesModal },
        footerExtra: '<button type="button" class="modal-btn modal-btn-secondary" data-dashboard-reset>Restablecer</button>',
        contenido: `
            <div class="dashboard-editor">
                <p class="dashboard-editor-hint">Patrimonio siempre permanece visible. Las demás cards pueden mostrarse u ocultarse.</p>
                <div class="dashboard-editor-grid">${opciones}</div>
            </div>
        `,
        onConfirm: async () => {
            const seleccionadas = [...modal.querySelectorAll(".dashboard-editor-grid input:checked")].map(input => input.value)
            try {
                await actualizarPreferencias(uid, {
                    "dashboard.cardsVisibles": seleccionadas,
                    "dashboard.orden": cardsOrdenDashboard
                })
                cardsVisiblesDashboard = normalizarCardsVisibles(seleccionadas)
                cambiosPendientesDashboard = false
                aplicarLayoutDashboard()
                mostrarNotificacion("exito", "Cards del dashboard actualizadas")
                return true
            } catch (error) {
                console.error("Error guardando cards del dashboard:", error)
                mostrarNotificacion("error", "No se pudo guardar la selección de cards")
                return false
            }
        }
    })

    modal.querySelector("[data-dashboard-reset]")?.addEventListener("click", () => {
        cambiosPendientesDashboard = true
        modal.querySelectorAll(".dashboard-editor-grid input").forEach(input => { input.checked = true })
    })
    modal.querySelectorAll(".dashboard-editor-grid input").forEach(input => {
        input.addEventListener("change", () => { cambiosPendientesDashboard = true })
    })
}

export function abrirEditorDashboard() {
    activarModoEdicionDashboard()
}

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
        <div class="dashboard-edicion-bar" id="dashboard-edicion-bar" hidden>
            <span>Modo edición</span>
            <div class="dashboard-edicion-acciones">
                <button type="button" class="glass-btn" id="dashboard-abrir-cards">Añadir/quitar cards</button>
                <button type="button" class="glass-btn" id="dashboard-listo">Listo</button>
            </div>
        </div>
        <div class="dashboard">
            <div class="glass card primary patrimonio-card" data-dashboard-card="patrimonio" role="region" tabindex="0" aria-label="Patrimonio total, valor actual">
                <div class="card-header">
                    <span class="card-title">Patrimonio Total</span>
                    <select class="divisa-select" id="divisa-select" aria-label="Divisa">
                        <option value="pen">PEN</option>
                        <option value="usd">USD</option>
                        <option value="usdt">USDT</option>
                    </select>
                </div>
                <div class="card-value" id="patrimonio-valor" aria-live="polite">—</div>
                <div class="card-sub" id="patrimonio-detalle">—</div>
            </div>

            <div class="glass card card-navegable positive" id="card-cuentas" data-dashboard-card="cuentas" role="button" tabindex="0" title="Ver cuentas">
                <div class="card-title">Cuentas</div>
                <div class="card-value" id="total-cuentas">0</div>
                <div class="card-sub">Activas y tarjetas</div>
            </div>

            <div class="glass card card-navegable" id="card-inversiones" data-dashboard-card="inversiones" role="button" tabindex="0" title="Ver inversiones">
                <div class="card-title">Inversiones</div>
                <div class="card-value" id="inversiones-valor">—</div>
                <div class="card-sub" id="inversiones-detalle">—</div>
            </div>

            <div class="glass card card-navegable" id="card-vencimientos" data-dashboard-card="vencimientos" role="button" tabindex="0" title="Ver pendientes">
                <div class="card-title">Próximos vencimientos</div>
                <div class="card-value" id="vencimientos-cantidad">—</div>
                <div class="card-sub" id="vencimientos-detalle">—</div>
            </div>

            <div class="glass card card-navegable movimientos-card" id="card-movimientos" data-dashboard-card="movimientos" role="button" tabindex="0" title="Ver movimientos">
                <div class="card-title">Últimos movimientos</div>
                <div class="movimientos-lista" id="movimientos-lista">
                    ${LOGO_ESCINCO_CARGA}
                </div>
            </div>

            <div class="glass card card-navegable favoritos-card" id="card-favoritos" data-dashboard-card="favoritos" role="button" tabindex="0" title="Ver inversiones">
                <div class="card-header">
                    <span class="card-title">Favoritos</span>
                    <span class="card-badge" id="favoritos-cantidad">0</span>
                </div>
                <div class="favoritos-lista" id="favoritos-lista">
                    ${LOGO_ESCINCO_CARGA}
                </div>
            </div>

            <div class="glass card metas-card" id="card-metas" data-dashboard-card="metas" role="region" tabindex="0" aria-label="Metas de ahorro">
                <div class="card-header">
                    <span class="card-title">Metas de ahorro</span>
                    <button type="button" class="glass-btn btn-meta-nueva" id="btn-nueva-meta">
                        ${icono("plus-circle", 14)} Nueva
                    </button>
                </div>
                <div class="metas-lista" id="metas-lista">
                    ${LOGO_ESCINCO_CARGA}
                </div>
            </div>

            <div class="glass card grafico-patrimonio-card" data-dashboard-card="grafico" role="region" tabindex="0" aria-label="Evolución patrimonial">
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

    await cargarCardsVisiblesDashboard()
    aplicarLayoutDashboard()
    configurarDivisa()
    configurarPeriodos()
    configurarCardsNavegacion()
    configurarMetas()
    configurarEdicionDashboard()
    configurarRefreshDashboard()

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

function configurarRefreshDashboard() {
    if (eventosRefreshDashboardListos) return
    eventosRefreshDashboardListos = true
    window.addEventListener("movimientos-actualizados", () => {
        if (!document.getElementById("dashboard") && !document.querySelector(".dashboard")) return
        clearTimeout(timerRefreshDashboard)
        timerRefreshDashboard = setTimeout(async () => {
            cacheCapa.limpiar(uid)
            await cargarTodo()
        }, 150)
    })
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

        const movimientosResp = await cargarMovimientos()
        const [inversionesResp, vencimientosResp, metasResp] = await Promise.all([
            cargarInversiones(),
            cargarVencimientos(cuentasResp, movimientosResp),
            cargarMetas()
        ])

        cuentas = cuentasResp
        inversionesData = inversionesResp
        vencimientosData = vencimientosResp
        favoritosData = inversionesResp.favoritos || []
        metasData = metasResp
        movimientosData = movimientosResp.slice(0, cantidadMovimientosRecientes())

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

async function cargarVencimientos(cuentasDeUsuario, movimientos = []) {
    try {
        const [pendientes, tarjetas, metas] = await Promise.all([
            obtenerPendientesConVencimiento(),
            obtenerTarjetasConPagoProximo(cuentasDeUsuario, movimientos),
            obtenerMetasConVencimiento()
        ])

        // Combinar y ordenar por días restantes ascendente
        const anualidades = obtenerAnualidadesConVencimiento(cuentasDeUsuario)
        const todos = [...pendientes, ...tarjetas, ...anualidades, ...metas]
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
                icono: "",
                pendiente: p
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
                icono: "",
                meta: m
            }
        })
        .filter(v => v.diasRestantes <= DIAS_VENCIMIENTO)
}

function obtenerAnualidadesConVencimiento(listaCuentas) {
    return (listaCuentas || [])
        .filter(c => c.tipo === "credito" && c.estado !== "archivada")
        .map(c => ({ cuenta: c, proxima: proximaAnualidad(c) }))
        .filter(item => item.proxima)
        .map(item => ({
            tipo: "anualidad",
            id: `${item.cuenta.id}-anualidad`,
            titulo: item.cuenta.nombre,
            subtitulo: "Anualidad de tarjeta",
            monto: item.proxima.monto,
            divisa: item.cuenta.moneda || "pen",
            diasRestantes: diasHasta(item.proxima.fecha),
            vencido: false,
            icono: "",
            cuenta: item.cuenta
        }))
        .filter(v => v.diasRestantes <= DIAS_VENCIMIENTO)
}

function obtenerTarjetasConPagoProximo(listaCuentas, movimientos = []) {
    return (listaCuentas || [])
        .filter(c => c.tipo === "credito" && c.estado !== "archivada" && c.diaPago)
        .map(t => {
            const ciclo = estadoCicloDe(t, movimientos)
            return {
                tipo: "tarjeta",
                id: t.id,
                titulo: t.nombre,
                subtitulo: "Pago tarjeta",
                monto: Math.max(0, Number(t.deuda) || 0),
                divisa: t.moneda || "pen",
                diasRestantes: diasHastaDiaDelMes(t.diaPago),
                vencido: false,
                icono: "",
                cuenta: t,
                ciclo
            }
        })
        .filter(v => !v.ciclo.pagadoCompleto && v.monto > 0 && v.diasRestantes <= DIAS_VENCIMIENTO)
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
    const crear = (anio, mes) => {
        const ultimo = new Date(anio, mes + 1, 0).getDate()
        return new Date(anio, mes, Math.min(diaMes, ultimo))
    }
    let objetivo = crear(hoy.getFullYear(), hoy.getMonth())
    if (objetivo < hoy) objetivo = crear(hoy.getFullYear(), hoy.getMonth() + 1)
    return Math.round((objetivo - hoy) / 86400000)
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
        const ir = () => {
            if (modoEdicionDashboard) return
            navigateTo(ruta)
        }
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
    vencimientos?.addEventListener("click", () => {
        if (modoEdicionDashboard) return
        abrirModalVencimientos()
    })
    vencimientos?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            if (modoEdicionDashboard) return
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
            ${items.map(plantillaVencimiento).join("")}
        </div>`
    }

    const modalEl = abrirModal({
        titulo: "Próximos vencimientos",
        contenido,
        variante: "info",
        confirmText: "Cerrar",
        onConfirm: () => true
    })

    // Click en una tarjeta abre el modal específico: aporte para metas,
    // vista detalle para pendientes. Sin botones dentro de las tarjetas.
    const lista = modalEl?.querySelector(".vencimientos-lista")
    lista?.addEventListener("keydown", (evento) => {
        if (evento.key !== "Enter" && evento.key !== " ") return
        const card = evento.target.closest(".card-item")
        if (!card) return
        evento.preventDefault()
        card.click()
    })
    lista?.addEventListener("click", async (evento) => {
        const card = evento.target.closest(".card-item")
        if (!card) return

        const opcion = vencimientosData.items.find(
            v => v.tipo === card.dataset.tipo && v.id === card.dataset.id
        )
        if (!opcion) return

        if (opcion.tipo === "meta") {
            const { abrirModalAporteMeta } = await import("../ui/metas.js")
            abrirModalAporteMeta(opcion.meta)
            return
        }

        if (opcion.tipo === "pendiente") {
            const { abrirVistaPendiente } = await import("../ui/pendientes.js")
            abrirVistaPendiente(opcion.pendiente, uid)
            return
        }

        if (opcion.tipo === "tarjeta") {
            const { abrirPagarTarjeta } = await import("./cuentas.js")
            await abrirPagarTarjeta(opcion.cuenta)
        }
    })
}

function plantillaVencimiento(v) {
    const esPendiente = v.tipo === "pendiente"
    const accionable = esPendiente || v.tipo === "meta" || v.tipo === "tarjeta"
    const signo = esPendiente ? (v.esCobrar ? "+" : "-") : ""
    const claseValor = esPendiente
        ? (v.esCobrar ? "positive" : "negative")
        : (v.vencido ? "negative" : "")

    return `
        <div class="card-item vencimiento-item ${v.vencido ? "vencido" : ""} ${accionable ? "clickeable" : ""}"
            data-tipo="${v.tipo}" data-id="${v.id}" role="button" tabindex="0">
            <div class="card-item-info">
                <span class="card-item-titulo">${v.titulo} ${v.vencido ? "· VENCIDO" : ""}</span>
                <span class="card-item-detalle">
                    ${v.subtitulo} · ${textoDias(v.diasRestantes)}
                </span>
            </div>
            <span class="card-item-valor ${claseValor}">
                ${signo ? `${signo} ` : ""}${v.monto.toFixed(2)} ${(v.divisa || "PEN").toUpperCase()}
            </span>
        </div>
    `
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
        ?.addEventListener("click", () => {
            if (modoEdicionDashboard) return
            abrirModalMeta()
        })

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

    const spinner = tipo === "cargando" ? `${LOGO_ESCINCO_CARGA}` : ""

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