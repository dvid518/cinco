import { sesion } from "../core/sesion.js"
import { cacheCapa } from "../core/cache.js"
import { activarSpinLogo, desactivarSpinLogo, navigateTo } from "../core/router.js"
import { obtenerCuentas, obtenerMovimientos, obtenerPreferencias, actualizarPreferencias } from "../../firebase/firestore.js"
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
    getFormatoDivisa,
    convertirMonto,
    formatearMonto,
    formatearMontoConDivisa,
    presentarDivisa
} from "../services/DivisaServicio.js"
import { obtenerPosicionesConValor } from "../services/PosicionServicio.js"
import { estadoCicloDe, nivelUsoDe, proximaAnualidad } from "../services/CreditoServicio.js"
import { obtenerPendientes } from "../repositories/PendienteRepositorio.js"
import { obtenerOrdenes } from "../repositories/OrdenRepositorio.js"
import { obtenerEstrategias } from "../repositories/EstrategiaRepositorio.js"
import { calcularProximaEjecucion } from "../services/EstrategiaServicio.js"
import { abrirModal } from "../ui/modal.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"
import { icono, LOGO_ESCINCO_CARGA } from "../core/iconos.js"
import { skeletonMarkup, skeletonText } from "../ui/skeletons.js"

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
let movimientosCompletosData = []
let pendientesData = []
let ordenesData = []
let estrategiasData = []
let analiticaData = null
let cargado = false
let eventosRefreshDashboardListos = false
let timerRefreshDashboard = null
let secuenciaGraficoDashboard = 0

const DIAS_VENCIMIENTO = 7
const NUEVAS_CARDS_DASHBOARD = ["flujo-caja", "deudas", "ahorro", "distribucion", "programados", "alertas"]
const DASHBOARD_CARDS = [
    { id: "patrimonio", label: "Patrimonio total" },
    { id: "cuentas", label: "Cuentas" },
    { id: "inversiones", label: "Inversiones" },
    { id: "vencimientos", label: "Próximos vencimientos" },
    { id: "movimientos", label: "Últimos movimientos" },
    { id: "favoritos", label: "Favoritos" },
    { id: "metas", label: "Metas de ahorro" },
    { id: "pendientes", label: "Pendientes" },
    { id: "ordenes", label: "Órdenes" },
    { id: "estrategias", label: "Estrategias" },
    { id: "flujo-caja", label: "Flujo de caja" },
    { id: "deudas", label: "Deudas" },
    { id: "ahorro", label: "Ahorro" },
    { id: "distribucion", label: "Distribución patrimonial" },
    { id: "programados", label: "Movimientos programados" },
    { id: "alertas", label: "Alertas" },
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
let eventosLayoutDashboardListos = false
let timerLayoutDashboard = null

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

function configurarCardsDashboardDesdeSesion() {
    const dashboard = sesion.getPreferencias()?.dashboard
    const cardsGuardadas = dashboard?.cardsVisibles
    const migrar = Array.isArray(cardsGuardadas) && dashboard?.nuevasCardsV1 !== true
    cardsVisiblesDashboard = migrar
        ? normalizarCardsVisibles([...cardsGuardadas, ...NUEVAS_CARDS_DASHBOARD])
        : normalizarCardsVisibles(cardsGuardadas)
    cardsOrdenDashboard = normalizarCardsOrden(dashboard?.orden)
}

async function cargarCardsVisiblesDashboard() {
    if (!uid) return
    try {
        const preferencias = sesion.getPreferencias() || await obtenerPreferencias(uid)
        const cardsGuardadas = preferencias?.dashboard?.cardsVisibles
        const migrarCards = Array.isArray(cardsGuardadas) && preferencias?.dashboard?.nuevasCardsV1 !== true
        cardsVisiblesDashboard = migrarCards
            ? normalizarCardsVisibles([...cardsGuardadas, ...NUEVAS_CARDS_DASHBOARD])
            : normalizarCardsVisibles(cardsGuardadas)
        cardsOrdenDashboard = normalizarCardsOrden(preferencias?.dashboard?.orden)
        if (migrarCards) {
            actualizarPreferencias(uid, {
                "dashboard.cardsVisibles": cardsVisiblesDashboard,
                "dashboard.nuevasCardsV1": true
            }).catch(error => console.warn("No se pudo guardar la migración de cards:", error))
        }
    } catch (error) {
        console.warn("No se pudieron cargar las cards visibles del dashboard:", error)
        cardsVisiblesDashboard = [...DEFAULT_CARDS_VISIBLES]
        cardsOrdenDashboard = [...DEFAULT_CARDS_ORDEN]
    }
}

function cantidadColumnasDashboard() {
    if (window.matchMedia("(max-width: 599px)").matches) return 1
    if (window.matchMedia("(max-width: 899px)").matches) return 2
    if (window.matchMedia("(max-width: 1199px)").matches) return 3
    return 4
}

function alturaMasonryCard(card, grid) {
    const alturaRect = card.getBoundingClientRect().height
    if (alturaRect > 0) return alturaRect

    const estilo = window.getComputedStyle(card)
    const alturaMinima = Number.parseFloat(estilo.minHeight) || 0
    const gap = Number.parseFloat(window.getComputedStyle(grid).rowGap) || 0
    return Math.max(alturaMinima, 148) + gap
}

function crearColumnasDashboard(cards, ordenVisible, cantidadColumnas, grid) {
    const columnas = Array.from({ length: cantidadColumnas }, () => {
        const columna = document.createElement("div")
        columna.className = "dashboard-column"
        return columna
    })
    const alturas = Array.from({ length: cantidadColumnas }, () => 0)
    const visibles = new Set(ordenVisible)

    cards.forEach(card => {
        card.hidden = !visibles.has(card.dataset.dashboardCard)
    })

    ordenVisible.forEach(id => {
        const card = cards.find(item => item.dataset.dashboardCard === id)
        if (!card) return
        const indice = alturas.indexOf(Math.min(...alturas))
        columnas[indice].appendChild(card)
        alturas[indice] += alturaMasonryCard(card, grid)
    })

    cards.filter(card => card.hidden).forEach(card => columnas[columnas.length - 1].appendChild(card))
    return columnas
}

function aplicarLayoutDashboard(forzar = false) {
    const grid = document.querySelector(".dashboard")
    if (!grid) return
    const visibles = new Set(["patrimonio", ...cardsVisiblesDashboard])
    const ordenVisible = ["patrimonio", ...cardsOrdenDashboard.filter(id => visibles.has(id))]
    const cantidadColumnas = cantidadColumnasDashboard()
    const firma = `${cantidadColumnas}|${ordenVisible.join(",")}`
    if (!forzar && grid.dataset.layoutFirma === firma) return

    const cards = [...grid.querySelectorAll("[data-dashboard-card]")]
    const columnas = crearColumnasDashboard(cards, ordenVisible, cantidadColumnas, grid)
    grid.replaceChildren(...columnas)
    grid.dataset.layoutFirma = firma
}

function configurarLayoutDashboard() {
    if (eventosLayoutDashboardListos) return
    eventosLayoutDashboardListos = true
    window.addEventListener("resize", () => {
        clearTimeout(timerLayoutDashboard)
        timerLayoutDashboard = setTimeout(() => aplicarLayoutDashboard(true), 120)
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
        card.draggable = true
        const controlesExistentes = card.querySelector(".dashboard-card-edicion")
        if (controlesExistentes) {
            controlesExistentes.querySelector("[data-dashboard-drag-handle]")?.removeAttribute("draggable")
            return
        }
        const controles = document.createElement("div")
        controles.className = "dashboard-card-edicion"
        controles.innerHTML = `
            <span class="dashboard-card-handle" data-dashboard-drag-handle role="button" tabindex="0" aria-label="Arrastrar card">${icono("grip", 16)}</span>
            <button type="button" class="dashboard-card-mover" data-dashboard-mover data-id="${id}" data-direccion="-1" aria-label="Mover card hacia arriba">↑</button>
            <button type="button" class="dashboard-card-mover" data-dashboard-mover data-id="${id}" data-direccion="1" aria-label="Mover card hacia abajo">↓</button>
        `
        card.appendChild(controles)
    })
}

function desactivarEdicionCardsDashboard() {
    document.querySelectorAll(".dashboard [data-dashboard-card]").forEach(card => {
        card.draggable = false
        card.classList.remove("dashboard-card-arrastrando")
    })
    document.body.classList.remove("dashboard-card-dragging")
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
        if (evento.dataTransfer) {
            evento.dataTransfer.effectAllowed = "move"
            evento.dataTransfer.setDragImage(card, 24, 24)
        }
        card.classList.add("dashboard-card-arrastrando")
        document.body.classList.add("dashboard-card-dragging")
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
        document.body.classList.remove("dashboard-card-dragging")
    })

    grid.addEventListener("click", (evento) => {
        const boton = evento.target.closest("[data-dashboard-mover]")
        if (!modoEdicionDashboard || !boton) return
        evento.stopPropagation()
        moverCardDashboard(boton.dataset.id, Number(boton.dataset.direccion))
    })
}

async function manejarTeclaEdicionDashboard(evento) {
    if ((evento.key !== "Escape" && evento.key !== "Enter") || !modoEdicionDashboard) return
    if (document.querySelector(".modal-overlay")) return
    if (evento.target instanceof Element && evento.target.closest("button, a, input, select, textarea, [contenteditable='true']")) return
    evento.preventDefault()
    if (evento.key === "Enter" || cambiosPendientesDashboard) {
        await guardarYSalirEdicionDashboard()
        return
    }
    salirModoEdicionDashboard()
}

function configurarEdicionDashboard() {
    if (!eventosEdicionDashboardListos) {
        eventosEdicionDashboardListos = true
        document.addEventListener("pagina-cambiando", manejarCambioPaginaDashboard)
        document.addEventListener("keydown", manejarTeclaEdicionDashboard)
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

function normalizarNivelResalte(valor) {
    const nivel = Number(valor)
    return [0, 1, 2].includes(nivel) ? nivel : 0
}

function obtenerPeriodo(id) {
    return PERIODOS_GRAFICO.find(p => p.id === id) || PERIODOS_GRAFICO[1]
}

// ============================================
// RENDER
// ============================================

export function render() {
    configurarCardsDashboardDesdeSesion()
    const nivelResalte = normalizarNivelResalte(sesion.getPreferencias()?.resaltarPatrimonio)
    const contenido = `
        <div class="dashboard-edicion-bar" id="dashboard-edicion-bar" hidden>
            <div class="dashboard-edicion-acciones">
                <button type="button" class="glass-btn glass" id="dashboard-abrir-cards">Añadir/quitar cards</button>
                <button type="button" class="glass-btn glass" id="dashboard-listo">Listo</button>
            </div>
        </div>
        <div class="dashboard dashboard-cargando">
            <div class="glass card primary patrimonio-card${nivelResalte ? ` resaltado-${nivelResalte}` : ""}" data-dashboard-card="patrimonio" role="button" tabindex="0" aria-haspopup="dialog" aria-label="Patrimonio total, valor actual">
                <div class="card-header">
                    <span class="card-title">Patrimonio Total</span>
                    <select class="divisa-select" id="divisa-select" aria-label="Divisa">
                         <option value="pen">${getFormatoDivisa() === "codigo" ? "PEN" : presentarDivisa("pen")}</option>
                         <option value="usd">${getFormatoDivisa() === "codigo" ? "USD" : presentarDivisa("usd")}</option>
                         <option value="usdt">${getFormatoDivisa() === "codigo" ? "USDT" : presentarDivisa("usdt")}</option>
                    </select>
                </div>
                <div class="card-value" id="patrimonio-valor" aria-live="polite">${skeletonText("skeleton-value-large")}</div>
                <div class="card-sub" id="patrimonio-detalle">${skeletonText()}</div>
            </div>

            <div class="glass card card-navegable positive" id="card-cuentas" data-dashboard-card="cuentas" role="button" tabindex="0" title="Ver cuentas">
                <div class="card-title">Cuentas</div>
                <div class="card-value" id="total-cuentas">${skeletonText("skeleton-value")}</div>
                <div class="card-sub">Activas y tarjetas</div>
            </div>

            <div class="glass card card-navegable" id="card-inversiones" data-dashboard-card="inversiones" role="button" tabindex="0" title="Ver inversiones">
                <div class="card-title">Inversiones</div>
                <div class="card-value" id="inversiones-valor">${skeletonText("skeleton-value")}</div>
                <div class="card-sub" id="inversiones-detalle">${skeletonText()}</div>
            </div>

            <div class="glass card card-navegable" id="card-vencimientos" data-dashboard-card="vencimientos" role="button" tabindex="0" title="Ver pendientes">
                <div class="card-title">Próximos vencimientos</div>
                <div class="card-value" id="vencimientos-cantidad">${skeletonText("skeleton-value")}</div>
                <div class="card-sub" id="vencimientos-detalle">${skeletonText()}</div>
            </div>

            <div class="glass card card-navegable movimientos-card" id="card-movimientos" data-dashboard-card="movimientos" role="button" tabindex="0" title="Ver movimientos">
                <div class="card-title">Últimos movimientos</div>
                <div class="movimientos-lista" id="movimientos-lista">
                    ${skeletonMarkup({ rows: 2, className: "skeleton-dashboard-list" })}
                </div>
            </div>

            <div class="glass card card-navegable favoritos-card" id="card-favoritos" data-dashboard-card="favoritos" role="button" tabindex="0" title="Ver inversiones">
                <div class="card-header">
                    <span class="card-title">Favoritos</span>
                    <span class="card-badge" id="favoritos-cantidad">${skeletonText("skeleton-badge")}</span>
                </div>
                <div class="favoritos-lista" id="favoritos-lista">
                    ${skeletonMarkup({ rows: 2, className: "skeleton-dashboard-list" })}
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
                    ${skeletonMarkup({ rows: 2, className: "skeleton-dashboard-list" })}
                </div>
            </div>

            <div class="glass card card-navegable pendientes-card" id="card-pendientes" data-dashboard-card="pendientes" role="button" tabindex="0" title="Ver pendientes">
                <div class="card-header">
                    <span class="card-title">Pendientes</span>
                    <span class="card-badge" id="pendientes-cantidad">${skeletonText("skeleton-badge")}</span>
                </div>
                <div class="pendientes-lista" id="pendientes-lista">${skeletonMarkup({ rows: 2, className: "skeleton-dashboard-list" })}</div>
            </div>

            <div class="glass card card-navegable ordenes-card" id="card-ordenes" data-dashboard-card="ordenes" role="button" tabindex="0" title="Ver órdenes">
                <div class="card-header">
                    <span class="card-title">Órdenes</span>
                    <span class="card-badge" id="ordenes-cantidad">${skeletonText("skeleton-badge")}</span>
                </div>
                <div class="ordenes-lista" id="ordenes-lista">${skeletonMarkup({ rows: 2, className: "skeleton-dashboard-list" })}</div>
            </div>

            <div class="glass card estrategias-card" id="card-estrategias" data-dashboard-card="estrategias" role="region" tabindex="0" aria-label="Próximas estrategias">
                <div class="card-header">
                    <span class="card-title">Estrategias</span>
                    <span class="card-badge" id="estrategias-cantidad">${skeletonText("skeleton-badge")}</span>
                </div>
                <div class="estrategias-lista" id="estrategias-lista">${skeletonMarkup({ rows: 3, className: "skeleton-dashboard-list skeleton-dashboard-list-estrategias" })}</div>
            </div>

            <div class="glass card card-navegable metric-card" id="card-flujo-caja" data-dashboard-card="flujo-caja" role="button" tabindex="0" title="Ver movimientos">
                <div class="card-title">Flujo de caja</div>
                <div class="card-value" id="flujo-caja-valor">${skeletonText("skeleton-value")}</div>
                <div class="card-sub" id="flujo-caja-detalle">${skeletonText()}</div>
            </div>

            <div class="glass card card-navegable metric-card" id="card-deudas" data-dashboard-card="deudas" role="button" tabindex="0" title="Ver cuentas">
                <div class="card-title">Deudas</div>
                <div class="card-value" id="deudas-valor">${skeletonText("skeleton-value")}</div>
                <div class="card-sub" id="deudas-detalle">${skeletonText()}</div>
            </div>

            <div class="glass card card-navegable metric-card" id="card-ahorro" data-dashboard-card="ahorro" role="button" tabindex="0" title="Ver movimientos">
                <div class="card-title">Ahorro</div>
                <div class="card-value" id="ahorro-valor">${skeletonText("skeleton-value")}</div>
                <div class="card-sub" id="ahorro-detalle">${skeletonText()}</div>
            </div>

            <div class="glass card card-navegable distribucion-card" id="card-distribucion" data-dashboard-card="distribucion" role="button" tabindex="0" title="Ver cuentas">
                <div class="card-header">
                    <span class="card-title">Distribución patrimonial</span>
                </div>
                <div class="distribucion-lista" id="distribucion-lista">${skeletonMarkup({ rows: 3, className: "skeleton-dashboard-list" })}</div>
            </div>

            <div class="glass card programados-card" id="card-programados" data-dashboard-card="programados" role="button" tabindex="0" title="Ver movimientos programados">
                <div class="card-header">
                    <span class="card-title">Programados</span>
                    <span class="card-badge" id="programados-cantidad">${skeletonText("skeleton-badge")}</span>
                </div>
                <div class="programados-lista" id="programados-lista">${skeletonMarkup({ rows: 2, className: "skeleton-dashboard-list" })}</div>
            </div>

            <div class="glass card alertas-card" id="card-alertas" data-dashboard-card="alertas" role="button" tabindex="0" title="Ver alertas">
                <div class="card-header">
                    <span class="card-title">Alertas</span>
                    <span class="card-badge" id="alertas-cantidad">${skeletonText("skeleton-badge")}</span>
                </div>
                <div class="alertas-lista" id="alertas-lista">${skeletonMarkup({ rows: 2, className: "skeleton-dashboard-list" })}</div>
            </div>

            <div class="glass card grafico-patrimonio-card" data-dashboard-card="grafico" role="region" tabindex="0" aria-label="Evolución patrimonial">
                <div class="card-header">
                    <span class="card-title">Evolución patrimonial</span>
                </div>
                <div class="toggle-group grafico-periodos" id="grafico-periodos">
                    ${PERIODOS_GRAFICO.map(p => `
                        <span class="toggle-option" data-periodo="${p.id}">${p.etiqueta}</span>
                    `).join('')}
                </div>
                <div class="grafico-container-dashboard" role="button" tabindex="0" aria-label="Abrir evolución patrimonial">
                    <canvas id="grafico-patrimonio"></canvas>
                    <div class="grafico-estado" id="grafico-estado">${skeletonMarkup({ variant: "chart", label: "Cargando gráfico" })}</div>
                </div>
            </div>
        </div>
    `

    const contenedor = document.createElement("div")
    contenedor.innerHTML = contenido
    const grid = contenedor.querySelector(".dashboard")
    const cards = [...grid.querySelectorAll("[data-dashboard-card]")]
    const visibles = new Set(["patrimonio", ...cardsVisiblesDashboard])
    const ordenVisible = ["patrimonio", ...cardsOrdenDashboard.filter(id => visibles.has(id))]
    const columnas = crearColumnasDashboard(cards, ordenVisible, cantidadColumnasDashboard(), grid)
    grid.replaceChildren(...columnas)
    return contenedor.innerHTML
}

// ============================================
// INIT
// ============================================

function mostrarEsqueletosDashboard() {
    const dashboard = document.querySelector(".dashboard")
    dashboard?.setAttribute("aria-busy", "true")
    const listas = ["movimientos-lista", "favoritos-lista", "metas-lista", "pendientes-lista", "ordenes-lista", "estrategias-lista", "distribucion-lista", "programados-lista", "alertas-lista"]
    listas.forEach(id => {
        const lista = document.getElementById(id)
        if (!lista) return
        const filas = id === "distribucion-lista" || id === "estrategias-lista" ? 3 : 2
        const clase = id === "estrategias-lista"
            ? "skeleton-dashboard-list skeleton-dashboard-list-estrategias"
            : "skeleton-dashboard-list"
        lista.innerHTML = skeletonMarkup({ rows: filas, className: clase })
    })
    const valores = ["patrimonio-valor", "total-cuentas", "inversiones-valor", "vencimientos-cantidad", "flujo-caja-valor", "deudas-valor", "ahorro-valor"]
    valores.forEach(id => {
        const valor = document.getElementById(id)
        if (valor) valor.innerHTML = skeletonText("skeleton-value")
    })
    const detalles = ["patrimonio-detalle", "inversiones-detalle", "vencimientos-detalle", "flujo-caja-detalle", "deudas-detalle", "ahorro-detalle"]
    detalles.forEach(id => {
        const detalle = document.getElementById(id)
        if (detalle) detalle.innerHTML = skeletonText()
    })
    const contadores = ["favoritos-cantidad", "pendientes-cantidad", "ordenes-cantidad", "estrategias-cantidad", "programados-cantidad", "alertas-cantidad"]
    contadores.forEach(id => {
        const contador = document.getElementById(id)
        if (contador) contador.innerHTML = skeletonText("skeleton-badge")
    })
    mostrarEstadoGrafico("cargando", "")
}

export async function init() {
    uid = sesion.uid
    const barraEdicion = document.getElementById("dashboard-edicion-bar")
    if (barraEdicion && barraEdicion.parentElement !== document.body) {
        document.body.appendChild(barraEdicion)
    }
    // Divisiva reactiva: se relee al entrar, no solo al importar el módulo.
    divisaActual = getDivisaPrincipal()
    periodoGrafico = obtenerPeriodo(sesion.getPreferencias()?.periodoEvolucion || PERIODO_POR_DEFECTO).id
    console.log("[INFO] Dashboard iniciado para UID:", uid)

    await cargarCardsVisiblesDashboard()
    mostrarEsqueletosDashboard()
    configurarLayoutDashboard()
    aplicarLayoutDashboard()
    configurarDivisa()
    configurarPeriodos()
    configurarCardsNavegacion()
    configurarMetas()
    configurarEdicionDashboard()
    configurarRefreshDashboard()

    try {
        await cargarTodo()
        void actualizarGraficoPatrimonio()
    } finally {
        const dashboard = document.querySelector(".dashboard")
        dashboard?.classList.remove("dashboard-cargando")
        dashboard?.removeAttribute("aria-busy")
        cargado = true
    }
}

function configurarRefreshDashboard() {
    if (eventosRefreshDashboardListos) return
    eventosRefreshDashboardListos = true
    window.addEventListener("movimientos-actualizados", () => {
        if (!document.getElementById("dashboard") && !document.querySelector(".dashboard")) return
        clearTimeout(timerRefreshDashboard)
        timerRefreshDashboard = setTimeout(async () => {
            mostrarEsqueletosDashboard()
            cacheCapa.limpiar(uid)
            try {
                await cargarTodo()
            } finally {
                document.querySelector(".dashboard")?.removeAttribute("aria-busy")
            }
        }, 150)
    })
}

// ============================================
// RECARGAR (invocado por "Actualizar" del lastbar)
// ============================================

export async function recargarDatos() {
    activarSpinLogo()
    mostrarEsqueletosDashboard()
    try {
        cacheCapa.limpiar(uid)
        await Promise.all([
            cargarTodo(),
            actualizarGraficoPatrimonio()
        ])
    } catch (error) {
        console.error("Error recargando dashboard:", error)
    } finally {
        document.querySelector(".dashboard")?.removeAttribute("aria-busy")
        desactivarSpinLogo()
    }
}

// ============================================
// CARGA GLOBAL
// ============================================

async function cargarTodo() {
    try {
        const [cuentasResp, movimientosResp] = await Promise.all([
            obtenerCuentas(uid),
            cargarMovimientos()
        ])
        const [inversionesResp, vencimientosResp, metasResp, pendientesResp, ordenesResp, estrategiasResp] = await Promise.all([
            cargarInversiones(),
            cargarVencimientos(cuentasResp, movimientosResp),
            cargarMetas(),
            cargarPendientes(),
            cargarOrdenes(),
            cargarEstrategias()
        ])

        cuentas = cuentasResp
        inversionesData = inversionesResp
        vencimientosData = vencimientosResp
        favoritosData = inversionesResp.favoritos || []
        metasData = metasResp
        movimientosCompletosData = movimientosResp
        movimientosData = movimientosResp.slice(0, cantidadMovimientosRecientes())
        pendientesData = pendientesResp
        ordenesData = ordenesResp
        estrategiasData = estrategiasResp
        analiticaData = construirAnaliticaDashboard(movimientosResp)

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

async function cargarPendientes() {
    try {
        return await obtenerPendientes(uid, true)
    } catch (error) {
        console.error("Error cargando pendientes:", error)
        return []
    }
}

async function cargarOrdenes() {
    try {
        const ordenes = await obtenerOrdenes(uid)
        return ordenes.filter(orden => orden.estaPendiente)
    } catch (error) {
        console.error("Error cargando órdenes:", error)
        return []
    }
}

async function cargarEstrategias() {
    try {
        const estrategias = await obtenerEstrategias(uid)
        return estrategias
            .filter(estrategia => estrategia.activa)
            .map(estrategia => ({
                ...estrategia,
                proximaEjecucion: estrategia.proximaEjecucion ||
                    calcularProximaEjecucion(estrategia.frecuencia, estrategia.diaPreferido)
            }))
            .sort((a, b) => new Date(a.proximaEjecucion) - new Date(b.proximaEjecucion))
    } catch (error) {
        console.error("Error cargando estrategias:", error)
        return []
    }
}

function construirAnaliticaDashboard(movimientos) {
    const ahora = new Date()
    const anio = ahora.getFullYear()
    const mes = ahora.getMonth()
    let ingresos = 0
    let gastos = 0

    for (const movimiento of movimientos) {
        if (movimiento.tipo !== TIPOS_MOVIMIENTO.INGRESO && movimiento.tipo !== TIPOS_MOVIMIENTO.GASTO) continue
        const fecha = fechaDeMovimiento(movimiento)
        if (!fecha || fecha.getFullYear() !== anio || fecha.getMonth() !== mes) continue
        const monto = convertirMonto(
            Math.abs(montoDeMovimiento(movimiento)),
            divisaDeMovimiento(movimiento),
            divisaActual
        )
        if (movimiento.tipo === TIPOS_MOVIMIENTO.INGRESO) ingresos += monto
        else gastos += monto
    }

    const balance = ingresos - gastos
    const tarjetas = cuentas.filter(cuenta => cuenta.tipo === "credito" && cuenta.estado !== "archivada")
    const deudas = tarjetas.reduce((total, cuenta) => {
        return total + convertirMonto(Math.max(0, Number(cuenta.deuda) || 0), cuenta.moneda || "pen", divisaActual)
    }, 0)
    const liquidez = cuentas
        .filter(cuenta => cuenta.tipo !== "credito" && cuenta.estado !== "archivada" && cuenta.esPatrimonio !== false)
        .reduce((total, cuenta) => {
            return total + convertirMonto(Number(cuenta.saldoInicial) || 0, cuenta.moneda || "pen", divisaActual)
        }, 0)
    const inversiones = convertirMonto(
        inversionesData?.valorTotal || 0,
        inversionesData?.divisa || divisaActual,
        divisaActual
    )
    const brutoDistribucion = Math.max(0, liquidez) + Math.max(0, inversiones) + Math.max(0, deudas)
    const distribucion = [
        { label: "Liquidez", valor: Math.max(0, liquidez), clase: "liquidez" },
        { label: "Inversiones", valor: Math.max(0, inversiones), clase: "inversiones" },
        { label: "Deudas", valor: Math.max(0, deudas), clase: "deudas" }
    ].map(item => ({
        ...item,
        porcentaje: brutoDistribucion > 0 ? (item.valor / brutoDistribucion) * 100 : 0
    }))

    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const programados = (vencimientosData?.items || []).map(item => {
        const fecha = new Date(hoy)
        fecha.setDate(fecha.getDate() + Number(item.diasRestantes || 0))
        const cuenta = item.cuenta
        const divisa = item.divisa || cuenta?.moneda || "pen"
        const monto = convertirMonto(Math.abs(Number(item.monto) || 0), divisa, divisaActual)
        const titulo = item.tipo === "pendiente"
            ? item.titulo
            : item.tipo === "meta"
                ? item.titulo
                : item.tipo === "anualidad"
                    ? `Anualidad · ${item.titulo}`
                    : `Pago de tarjeta · ${item.titulo}`
        return { titulo, fecha, monto, tipo: item.tipo }
    })

    estrategiasData.forEach(estrategia => {
        const fecha = new Date(estrategia.proximaEjecucion)
        if (Number.isNaN(fecha.getTime())) return
        programados.push({
            titulo: `${estrategia.nombre} · ${estrategia.activoSimbolo}`,
            fecha,
            monto: convertirMonto(estrategia.montoFijo, estrategia.divisa, divisaActual),
            tipo: "estrategia"
        })
    })
    programados.sort((a, b) => a.fecha - b.fecha)

    const alertas = []
    ;(vencimientosData?.items || []).filter(item => item.vencido).forEach(item => {
        alertas.push({ titulo: `${item.titulo} está vencido`, detalle: item.subtitulo, nivel: "critico" })
    })
    tarjetas.forEach(cuenta => {
        const uso = nivelUsoDe(cuenta)
        if (uso.nivel !== "normal") {
            alertas.push({
                titulo: `${cuenta.nombre} · uso ${uso.porcentaje.toFixed(0)}%`,
                detalle: uso.nivel === "critico" ? "Uso crítico del límite" : "Uso elevado del límite",
                nivel: uso.nivel
            })
        }
    })
    cuentas
        .filter(cuenta => cuenta.tipo !== "credito" && cuenta.estado !== "archivada" && Number(cuenta.saldoInicial) < 0)
        .forEach(cuenta => {
            alertas.push({ titulo: `${cuenta.nombre} tiene saldo negativo`, detalle: "Revisa los movimientos de la cuenta", nivel: "aviso" })
        })
    estrategiasData.forEach(estrategia => {
        const fecha = new Date(estrategia.proximaEjecucion)
        if (!Number.isNaN(fecha.getTime()) && fecha < hoy) {
            alertas.push({ titulo: `${estrategia.nombre} está atrasada`, detalle: "Revisa la próxima ejecución", nivel: "critico" })
        }
    })

    return {
        ingresos,
        gastos,
        balance,
        tasaAhorro: ingresos > 0 ? (balance / ingresos) * 100 : null,
        tarjetasConDeuda: tarjetas.filter(cuenta => Number(cuenta.deuda) > 0).length,
        deudas,
        liquidez,
        inversiones,
        brutoDistribucion,
        distribucion,
        programados,
        alertas
    }
}

function divisaDeMovimiento(movimiento) {
    if (movimiento.divisa) return String(movimiento.divisa).toLowerCase()
    const cuentaId = movimiento.cuenta || movimiento.cuentaOrigen
    const cuenta = cuentas.find(item => item.id === cuentaId)
    return cuenta?.moneda || "pen"
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

// Cantidad de "últimos movimientos" a mostrar, desde Configuración (2-5).
function cantidadMovimientosRecientes() {
    const prefs = sesion.getPreferencias()
    const n = Number.parseInt(prefs?.movimientosRecientes, 10)
    if (!Number.isFinite(n)) return 5
    return Math.min(5, Math.max(2, n))
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
    actualizarPendientes()
    actualizarOrdenes()
    actualizarEstrategias()
    actualizarFlujoCaja()
    actualizarDeudas()
    actualizarAhorro()
    actualizarDistribucion()
    actualizarProgramados()
    actualizarAlertas()
    actualizarMovimientos()
    aplicarLayoutDashboard(true)
}

async function actualizarCuentas() {
    const stats = await calcularPatrimonio(uid)

    const totalEl = document.getElementById("total-cuentas")
    if (totalEl) totalEl.textContent = stats.totalCuentas

    const detalleEl = document.getElementById("patrimonio-detalle")
    if (detalleEl) {
        const activos = convertirMonto(stats.totalActivos, "pen", divisaActual)
        let detalle = `Activos: ${formatearMontoConDivisa(activos, divisaActual)}`
        if (stats.tieneDeuda) {
            detalle += ` | Deuda: -${formatearMontoConDivisa(convertirMonto(stats.totalDeuda, "pen", divisaActual), divisaActual)}`
        }
        detalleEl.textContent = detalle
    }
}

async function actualizarPatrimonio() {
    const stats = await calcularPatrimonio(uid)
    const valorEl = document.getElementById("patrimonio-valor")

    if (!valorEl) return

    const valor = convertirMonto(stats.patrimonio, "pen", divisaActual)
    valorEl.textContent = formatearMontoConDivisa(valor, divisaActual)

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

    valorEl.textContent = formatearMontoConDivisa(valorConvertido, divisaActual)

    if (detalleEl) {
        const signo = inversionesData.gananciaTotal >= 0 ? "+" : ""
        detalleEl.textContent =
            `${signo}${formatearMontoConDivisa(inversionesData.gananciaTotal, inversionesData.divisa)}` +
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
    const listas = ["movimientos-lista", "favoritos-lista", "metas-lista", "pendientes-lista", "ordenes-lista", "estrategias-lista", "distribucion-lista", "programados-lista", "alertas-lista"]
    listas.forEach(id => {
        const lista = document.getElementById(id)
        if (lista) lista.innerHTML = `<p class="card-vacio">No se pudieron cargar estos datos.</p>`
    })
    const valores = ["patrimonio-valor", "total-cuentas", "inversiones-valor", "vencimientos-cantidad", "flujo-caja-valor", "deudas-valor", "ahorro-valor"]
    valores.forEach(id => {
        const valor = document.getElementById(id)
        if (valor) valor.textContent = "—"
    })
    const detalles = ["patrimonio-detalle", "inversiones-detalle", "vencimientos-detalle", "flujo-caja-detalle", "deudas-detalle", "ahorro-detalle"]
    detalles.forEach(id => {
        const detalle = document.getElementById(id)
        if (detalle) detalle.textContent = "—"
    })
    const contadores = ["favoritos-cantidad", "pendientes-cantidad", "ordenes-cantidad", "estrategias-cantidad", "programados-cantidad", "alertas-cantidad"]
    contadores.forEach(id => {
        const contador = document.getElementById(id)
        if (contador) contador.textContent = "—"
    })
}

function actualizarPendientes() {
    const lista = document.getElementById("pendientes-lista")
    const cantidadEl = document.getElementById("pendientes-cantidad")
    if (!lista) return

    if (cantidadEl) cantidadEl.textContent = pendientesData.length
    if (pendientesData.length === 0) {
        lista.innerHTML = `<p class="card-vacio">No tienes cobros ni pagos pendientes.</p>`
        return
    }

    lista.innerHTML = pendientesData.slice(0, 3).map(pendiente => {
        const clase = pendiente.tipo ? "positive" : "negative"
        const signo = pendiente.tipo ? "+" : "−"
        const detalle = pendiente.fechaVencimiento
            ? `Vence ${formatearFecha(pendiente.fechaVencimiento)}`
            : pendiente.tipoTexto
        return `
            <div class="dashboard-list-item">
                <div class="dashboard-list-info">
                    <span class="dashboard-list-title">${pendiente.concepto}</span>
                    <span class="dashboard-list-detail">${detalle}</span>
                </div>
                <span class="dashboard-list-value ${clase}">${signo} ${formatearMontoConDivisa(pendiente.monto, pendiente.divisa)}</span>
            </div>
        `
    }).join("")
}

function actualizarOrdenes() {
    const lista = document.getElementById("ordenes-lista")
    const cantidadEl = document.getElementById("ordenes-cantidad")
    if (!lista) return

    if (cantidadEl) cantidadEl.textContent = ordenesData.length
    if (ordenesData.length === 0) {
        lista.innerHTML = `<p class="card-vacio">No tienes órdenes pendientes.</p>`
        return
    }

    lista.innerHTML = ordenesData.slice(0, 3).map(orden => `
        <div class="dashboard-list-item">
            <div class="dashboard-list-info">
                <span class="dashboard-list-title">${orden.activo}</span>
                <span class="dashboard-list-detail">${orden.tipoLabel} · ${orden.direccionLabel}</span>
            </div>
            <span class="dashboard-list-value">${formatearMontoConDivisa(orden.precioDisparo, orden.divisa)}</span>
        </div>
    `).join("")
}

function actualizarEstrategias() {
    const lista = document.getElementById("estrategias-lista")
    const cantidadEl = document.getElementById("estrategias-cantidad")
    if (!lista) return

    if (cantidadEl) cantidadEl.textContent = estrategiasData.length
    if (estrategiasData.length === 0) {
        lista.innerHTML = `<p class="card-vacio">No tienes estrategias activas.</p>`
        return
    }

    lista.innerHTML = estrategiasData.slice(0, 3).map(estrategia => {
        const cuenta = cuentas.find(item => item.id === estrategia.cuentaId)
        const controlCuenta = cuenta ? `
            <button type="button" class="estrategia-cuenta" data-dashboard-cuenta-estrategia="${estrategia.cuentaId}">
                ${icono("landmark", 11)} ${cuenta.nombre}
            </button>
        ` : ""
        return `
            <div class="dashboard-list-item estrategia-dashboard-item">
                <div class="dashboard-list-info">
                    <span class="dashboard-list-title">${estrategia.nombre}</span>
                    <span class="dashboard-list-detail">${estrategia.activoSimbolo} · ${formatearProximaEjecucion(estrategia.proximaEjecucion)}</span>
                    ${controlCuenta}
                </div>
                <span class="dashboard-list-value">${formatearMontoConDivisa(estrategia.montoFijo, estrategia.divisa)}</span>
            </div>
        `
    }).join("")
}

function actualizarFlujoCaja() {
    const valorEl = document.getElementById("flujo-caja-valor")
    const detalleEl = document.getElementById("flujo-caja-detalle")
    const cardEl = document.getElementById("card-flujo-caja")
    if (!valorEl || !analiticaData) return

    valorEl.textContent = formatearMontoConDivisa(analiticaData.balance, divisaActual)
    if (detalleEl) {
        detalleEl.textContent = `+${formatearMontoConDivisa(analiticaData.ingresos, divisaActual)} · −${formatearMontoConDivisa(analiticaData.gastos, divisaActual)}`
    }
    cardEl?.classList.toggle("positive", analiticaData.balance > 0)
    cardEl?.classList.toggle("negative", analiticaData.balance < 0)
}

function actualizarDeudas() {
    const valorEl = document.getElementById("deudas-valor")
    const detalleEl = document.getElementById("deudas-detalle")
    const cardEl = document.getElementById("card-deudas")
    if (!valorEl || !analiticaData) return

    valorEl.textContent = formatearMontoConDivisa(analiticaData.deudas, divisaActual)
    if (detalleEl) {
        const proximo = analiticaData.programados.find(item => item.tipo === "tarjeta")
        detalleEl.textContent = proximo
            ? `Próximo pago ${formatearProximaEjecucion(proximo.fecha)}`
            : `${analiticaData.tarjetasConDeuda} tarjeta${analiticaData.tarjetasConDeuda === 1 ? "" : "s"} con deuda`
    }
    cardEl?.classList.toggle("negative", analiticaData.deudas > 0)
}

function actualizarAhorro() {
    const valorEl = document.getElementById("ahorro-valor")
    const detalleEl = document.getElementById("ahorro-detalle")
    const cardEl = document.getElementById("card-ahorro")
    if (!valorEl || !analiticaData) return

    valorEl.textContent = formatearMontoConDivisa(analiticaData.balance, divisaActual)
    if (detalleEl) {
        detalleEl.textContent = analiticaData.tasaAhorro === null
            ? "Sin ingresos registrados este mes"
            : `${analiticaData.tasaAhorro.toFixed(0)}% de los ingresos`
    }
    cardEl?.classList.toggle("positive", analiticaData.balance > 0)
    cardEl?.classList.toggle("negative", analiticaData.balance < 0)
}

function actualizarDistribucion() {
    const lista = document.getElementById("distribucion-lista")
    const totalEl = document.getElementById("distribucion-total")
    if (!lista || !analiticaData) return

    if (totalEl) totalEl.textContent = formatearMontoConDivisa(analiticaData.brutoDistribucion, divisaActual)
    lista.innerHTML = analiticaData.distribucion.map(item => `
        <div class="distribucion-item">
            <div class="distribucion-cabecera">
                <span>${item.label}</span>
                <strong>${item.porcentaje.toFixed(0)}%</strong>
            </div>
            <div class="distribucion-barra">
                <span class="${item.clase}" style="width: ${Math.max(0, Math.min(100, item.porcentaje))}%"></span>
            </div>
            <span class="distribucion-valor">${formatearMontoConDivisa(item.valor, divisaActual)}</span>
        </div>
    `).join("")
}

function actualizarProgramados() {
    const lista = document.getElementById("programados-lista")
    const cantidadEl = document.getElementById("programados-cantidad")
    if (!lista || !analiticaData) return

    if (cantidadEl) cantidadEl.textContent = analiticaData.programados.length
    if (analiticaData.programados.length === 0) {
        lista.innerHTML = `<p class="card-vacio">No hay movimientos programados próximos.</p>`
        return
    }

    lista.innerHTML = analiticaData.programados.slice(0, 3).map(item => `
        <div class="dashboard-list-item">
            <div class="dashboard-list-info">
                <span class="dashboard-list-title">${item.titulo}</span>
                <span class="dashboard-list-detail">${formatearProximaEjecucion(item.fecha)}</span>
            </div>
            <span class="dashboard-list-value">${formatearMontoConDivisa(item.monto, divisaActual)}</span>
        </div>
    `).join("")
}

function actualizarAlertas() {
    const lista = document.getElementById("alertas-lista")
    const cantidadEl = document.getElementById("alertas-cantidad")
    const cardEl = document.getElementById("card-alertas")
    if (!lista || !analiticaData) return

    const alertas = analiticaData.alertas
    if (cantidadEl) cantidadEl.textContent = alertas.length
    cardEl?.classList.toggle("negative", alertas.some(alerta => alerta.nivel === "critico"))
    cardEl?.classList.toggle("positive", alertas.length === 0)

    if (alertas.length === 0) {
        lista.innerHTML = `<p class="card-vacio">Todo en orden. No hay alertas.</p>`
        return
    }

    lista.innerHTML = alertas.slice(0, 3).map(alerta => `
        <div class="alerta-item ${alerta.nivel}">
            ${icono("triangle-alert", 14)}
            <div>
                <span>${alerta.titulo}</span>
                <small>${alerta.detalle}</small>
            </div>
        </div>
    `).join("")
}

function formatearProximaEjecucion(fecha) {
    if (!fecha) return "Sin próxima ejecución"
    const proxima = new Date(fecha)
    if (Number.isNaN(proxima.getTime())) return "Sin próxima ejecución"
    const dias = diasHasta(proxima)
    const momento = dias === 0 ? "hoy" : dias === 1 ? "mañana" : proxima.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })
    return `Próxima: ${momento}`
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
            <span class="movimiento-monto ${clase}">${signo} ${formatearMontoConDivisa(Math.abs(monto), m.divisa || "pen")}</span>
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
    bindNavegacion("card-ordenes", "/trading")
    bindNavegacion("card-estrategias", "/inversiones")
    bindNavegacion("card-movimientos", "/movimientos")
    bindNavegacion("card-flujo-caja", "/movimientos")
    bindNavegacion("card-deudas", "/cuentas")
    bindNavegacion("card-ahorro", "/movimientos")
    bindNavegacion("card-distribucion", "/cuentas")

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

    const pendientes = document.getElementById("card-pendientes")
    const abrirPendientes = async () => {
        if (modoEdicionDashboard) return
        const { mostrarPendientes } = await import("../ui/pendientes.js")
        await mostrarPendientes()
    }
    pendientes?.addEventListener("click", abrirPendientes)
    pendientes?.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter" || evento.key === " ") {
            evento.preventDefault()
            abrirPendientes()
        }
    })

    const bindModalDashboard = (id, abrir) => {
        const card = document.getElementById(id)
        card?.addEventListener("click", () => {
            if (!modoEdicionDashboard) abrir()
        })
        card?.addEventListener("keydown", evento => {
            if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault()
                if (!modoEdicionDashboard) abrir()
            }
        })
    }
    bindModalDashboard("card-programados", abrirModalProgramados)
    bindModalDashboard("card-alertas", abrirModalAlertas)

    const patrimonio = document.querySelector('[data-dashboard-card="patrimonio"]')
    const abrirPatrimonio = () => {
        if (modoEdicionDashboard) return
        abrirModalPatrimonioDashboard()
    }
    patrimonio?.addEventListener("click", evento => {
        if (evento.target.closest("#divisa-select")) return
        abrirPatrimonio()
    })
    patrimonio?.addEventListener("keydown", evento => {
        if (evento.key === "Enter" || evento.key === " ") {
            evento.preventDefault()
            abrirPatrimonio()
        }
    })

    const grafico = document.querySelector('[data-dashboard-card="grafico"] .grafico-container-dashboard')
    grafico?.addEventListener("click", abrirModalEvolucionDashboard)
    grafico?.addEventListener("keydown", evento => {
        if (evento.key === "Enter" || evento.key === " ") {
            evento.preventDefault()
            abrirModalEvolucionDashboard()
        }
    })

    document.getElementById("estrategias-lista")?.addEventListener("click", async evento => {
        const botonCuenta = evento.target.closest("[data-dashboard-cuenta-estrategia]")
        if (!botonCuenta || modoEdicionDashboard) return
        evento.preventDefault()
        evento.stopPropagation()
        const { seleccionarCuentaPorId } = await import("./cuentas.js")
        seleccionarCuentaPorId(botonCuenta.dataset.dashboardCuentaEstrategia)
        navigateTo("/cuentas")
    })
}

function abrirModalPatrimonioDashboard() {
    if (modoEdicionDashboard) return

    const modal = abrirModal({
        titulo: "Patrimonio total",
        contenido: `<div class="patrimonio-modal-loading">${LOGO_ESCINCO_CARGA}</div>`,
        variante: "form",
        confirmText: "Cerrar",
        cancelText: null,
        onConfirm: () => true
    })

    calcularPatrimonio(uid)
        .then(stats => {
            const body = modal?.querySelector(".modal-body")
            if (!body || !modal.isConnected) return
            const activos = convertirMonto(stats.totalActivos, "pen", divisaActual)
            const deudas = convertirMonto(stats.totalDeuda, "pen", divisaActual)
            const invertido = convertirMonto(inversionesData?.valorTotal || 0, inversionesData?.divisa || divisaActual, divisaActual)
            const disponible = Math.max(0, activos - invertido)
            const patrimonioNeto = activos - deudas
            const nombreUsuario = sesion.nombre?.trim() || "Tú"
            body.innerHTML = `
                <p class="patrimonio-modal-caption patrimonio-modal-owner">${nombreUsuario}, posees</p>
                <div class="patrimonio-modal-total ${patrimonioNeto < 0 ? "negative" : "positive"}">
                    ${formatearMontoConDivisa(patrimonioNeto, divisaActual)}
                </div>
                <div class="patrimonio-modal-stats">
                    <div class="patrimonio-modal-stat">
                        <span>Disponible</span>
                        <strong>${formatearMontoConDivisa(disponible, divisaActual)}</strong>
                    </div>
                    <div class="patrimonio-modal-stat">
                        <span>Inmovil / invertido</span>
                        <strong>${formatearMontoConDivisa(invertido, divisaActual)}</strong>
                    </div>
                    <div class="patrimonio-modal-stat">
                        <span>Deudas</span>
                        <strong>${formatearMontoConDivisa(deudas, divisaActual)}</strong>
                    </div>
                </div>
            `
        })
        .catch(error => {
            const body = modal?.querySelector(".modal-body")
            if (!body || !modal.isConnected) return
            body.innerHTML = `<p class="modal-message-desc">No se pudo calcular el patrimonio: ${error.message || "error desconocido"}</p>`
        })
}

async function abrirModalEvolucionDashboard() {
    if (modoEdicionDashboard) return

    let cancelado = false
    let secuenciaModal = 0
    const restaurarGrafico = () => {
        cancelado = true
        secuenciaModal++
        destruirGraficoPatrimonio("evolucion-modal")
        if (datosGrafico?.labels?.length) dibujarGrafico()
    }

    const modal = abrirModal({
        titulo: "Evolución patrimonial",
        contenido: `<div class="patrimonio-modal-loading">${LOGO_ESCINCO_CARGA}</div>`,
        variante: "wide",
        confirmText: "Cerrar",
        cancelText: null,
        onConfirm: () => {
            restaurarGrafico()
            return true
        },
        onCancel: restaurarGrafico
    })

    try {
        const periodo = obtenerPeriodo(periodoGrafico)
        const datos = datosGrafico?.labels?.length
            ? datosGrafico
            : await obtenerPatrimonioParaGrafico(uid, periodo.dias)
        const body = modal?.querySelector(".modal-body")
        if (!body || !modal.isConnected || cancelado) return

        body.innerHTML = `
            <div class="evolucion-modal-grafico">
                <canvas id="grafico-patrimonio-modal"></canvas>
            </div>
            <div class="toggle-group grafico-periodos-modal" id="grafico-periodos-modal">
                ${PERIODOS_GRAFICO.map(p => `
                    <span class="toggle-option" data-periodo="${p.id}">${p.etiqueta}</span>
                `).join('')}
            </div>
        `
        configurarPeriodos(body.querySelector("#grafico-periodos-modal"), async () => {
            if (!modal?.isConnected || cancelado) return
            const secuencia = ++secuenciaModal
            const datosPeriodo = await obtenerPatrimonioParaGrafico(uid, obtenerPeriodo(periodoGrafico).dias)
            if (!modal.isConnected || cancelado || secuencia !== secuenciaModal) return
            datosGrafico = datosPeriodo
            await crearGraficoPatrimonio("grafico-patrimonio-modal", datosPeriodo, {
                divisa: divisaActual.toUpperCase(),
                etiquetaDivisa: presentarDivisa(divisaActual),
                chartKey: "evolucion-modal"
            })
        })
        await crearGraficoPatrimonio("grafico-patrimonio-modal", datos, {
            divisa: divisaActual.toUpperCase(),
            etiquetaDivisa: presentarDivisa(divisaActual),
            chartKey: "evolucion-modal"
        })
        if (cancelado && datosGrafico?.labels?.length) dibujarGrafico()
    } catch (error) {
        const body = modal?.querySelector(".modal-body")
        if (!body || !modal.isConnected || cancelado) return
        body.innerHTML = `<p class="modal-message-desc">No se pudo cargar la evolución: ${error.message || "error desconocido"}</p>`
    }
}

function abrirModalProgramados() {
    const items = analiticaData?.programados || []
    const contenido = items.length > 0
        ? `<div class="modal-lista-dashboard">${items.map(item => `
            <div class="dashboard-list-item">
                <div class="dashboard-list-info">
                    <span class="dashboard-list-title">${item.titulo}</span>
                    <span class="dashboard-list-detail">${formatearFecha(item.fecha)}</span>
                </div>
                <span class="dashboard-list-value">${formatearMontoConDivisa(item.monto, divisaActual)}</span>
            </div>
        `).join("")}</div>`
        : `<div class="modal-message"><p class="modal-message-desc">No hay movimientos programados próximos.</p></div>`

    abrirModal({
        titulo: "Movimientos programados",
        contenido,
        variante: "info",
        confirmText: "Cerrar",
        onConfirm: () => true
    })
}

function abrirModalAlertas() {
    const items = analiticaData?.alertas || []
    const contenido = items.length > 0
        ? `<div class="modal-lista-dashboard">${items.map(alerta => `
            <div class="alerta-item ${alerta.nivel}">
                ${icono("triangle-alert", 16)}
                <div>
                    <span>${alerta.titulo}</span>
                    <small>${alerta.detalle}</small>
                </div>
            </div>
        `).join("")}</div>`
        : `<div class="modal-message"><p class="modal-message-desc">Todo en orden. No hay alertas.</p></div>`

    abrirModal({
        titulo: "Alertas",
        contenido,
        variante: "info",
        confirmText: "Cerrar",
        onConfirm: () => true
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
                ${signo ? `${signo} ` : ""}${formatearMontoConDivisa(v.monto, v.divisa)}
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
            <span class="favorito-precio">${formatearMontoConDivisa(precio, posicion.divisa)}</span>
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
    const clases = [
        "meta-item",
        meta.completada ? "completada" : "",
        meta.activa ? "" : "pausada"
    ].filter(Boolean).join(" ")

    return `
        <div class="${clases}" data-meta-id="${meta.id}" role="button" tabindex="0" title="Aportar a la meta">
            <div class="meta-info">
                <span class="meta-nombre">${meta.nombre}</span>
                <span class="meta-cantidad">${formatearMontoConDivisa(meta.montoActual, meta.divisa)}</span>
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
        analiticaData = construirAnaliticaDashboard(movimientosCompletosData)
        actualizarFlujoCaja()
        actualizarDeudas()
        actualizarAhorro()
        actualizarDistribucion()
        actualizarProgramados()
        actualizarAlertas()

        // Redibujar el gráfico manteniendo el periodo actual
        if (datosGrafico?.labels?.length) {
            await crearGraficoPatrimonio("grafico-patrimonio", datosGrafico, {
                divisa: divisaActual.toUpperCase(),
                etiquetaDivisa: presentarDivisa(divisaActual)
            })
        }
    })
}

// ============================================
// SELECTOR DE PERIODO
// ============================================

function configurarPeriodos(contenedor = document.getElementById("grafico-periodos"), alCambiar = cargarGraficoPatrimonio) {
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
            sesion.setPreferencias({ periodoEvolucion: periodoGrafico })
            actualizarPreferencias(uid, { periodoEvolucion: periodoGrafico }).catch(error => {
                console.warn("No se pudo guardar el periodo del gráfico:", error)
            })
            await alCambiar()
        })
    })

    marcarActivo()
}

// ============================================
// GRÁFICO DE PATRIMONIO
// ============================================

async function actualizarGraficoPatrimonio() {
    if (!document.querySelector('[data-dashboard-card="grafico"]')?.isConnected) return
    try {
        await registrarSnapshot(uid)
    } catch (error) {
        console.warn("No se pudo registrar snapshot:", error)
    }
    return cargarGraficoPatrimonio()
}

async function cargarGraficoPatrimonio() {
    const secuencia = ++secuenciaGraficoDashboard
    const periodo = obtenerPeriodo(periodoGrafico)
    const card = document.querySelector('[data-dashboard-card="grafico"]')
    if (!card?.isConnected) return
    mostrarEstadoGrafico("cargando", "")

    try {
        const datos = await obtenerPatrimonioParaGrafico(uid, periodo.dias)
        if (secuencia !== secuenciaGraficoDashboard || !card.isConnected) return
        datosGrafico = datos

        if (!datos?.labels?.length) {
            mostrarEstadoGrafico("vacio", "Sin datos para este periodo", "Los datos se registran automáticamente cada día")
            ocultarCanvas()
            return
        }

        mostrarCanvas()
        const instancia = await dibujarGrafico(datos, secuencia)
        if (!instancia) throw new Error("No se pudo crear el gráfico")
        if (secuencia === secuenciaGraficoDashboard && card.isConnected) ocultarEstadoGrafico()
    } catch (error) {
        if (secuencia !== secuenciaGraficoDashboard || !card.isConnected) return
        console.error("Error cargando gráfico de patrimonio:", error)
        mostrarEstadoGrafico("vacio", "No se pudo cargar el gráfico", error.message)
        ocultarCanvas()
    }
}

async function dibujarGrafico(datos = datosGrafico, secuencia = secuenciaGraficoDashboard) {
    const card = document.querySelector('[data-dashboard-card="grafico"]')
    const canvas = document.getElementById("grafico-patrimonio")
    if (!card?.isConnected || !canvas?.isConnected || secuencia !== secuenciaGraficoDashboard) return null
    return crearGraficoPatrimonio("grafico-patrimonio", datos, {
        divisa: divisaActual.toUpperCase(),
        etiquetaDivisa: presentarDivisa(divisaActual)
    })
}

function mostrarEstadoGrafico(tipo, texto, hint = "") {
    const estado = document.getElementById("grafico-estado")
    if (!estado) return

    estado.innerHTML = tipo === "cargando"
        ? skeletonMarkup({ variant: "chart", label: "Cargando gráfico" })
        : `
            <div class="grafico-vacio">
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
    secuenciaGraficoDashboard++
    destruirGraficoPatrimonio()
    destruirGraficoPatrimonio("evolucion-modal")
}