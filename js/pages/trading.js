import { sesion } from "../core/sesion.js"
import { obtenerTradesConFiltros, registrarTrade, finalizarTrade, borrarTrade, reabrirTradeAbierto, editarTrade } from "../services/TradingServicio.js"
import {
    obtenerOrdenesConFiltros,
    registrarOrden,
    editarOrden,
    borrarOrden,
    evaluarOrdenesPendientes
} from "../services/OrdenServicio.js"
import { abrirModal, cerrarModal, estaAbierto } from "../ui/modal.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"
import { ofrecerDeshacer } from "../services/DeshacerServicio.js"
import { restaurarDocumento } from "../../firebase/firestore.js"
import { icono, LOGO_ESCINCO_CARGA } from "../core/iconos.js"
import { envolverSidebar } from "../ui/colapsoSidebar.js"
import { DIVISAS_SYMBOLS } from "../../constants/divisas.js"

let uid = null
let datosTrades = null
let filtroActual = 'todos'
let ordenesData = []
let vistaActual = "trades"

// Selección de tarjetas (mismas reglas que movimientos/pendientes/metas):
// dblclick o clic sostenido alternan, modo "un click" selecciona con un
// toque y al repetir deselecciona, Shift añade/quita, Escape limpia y
// Delete/Backspace quita la última. Solo interacción: sin contador ni
// eliminación en lote.
let seleccionadas = new Set()
let ordenSeleccion = []
let supresorClick = false
let supresorClickTimer = null
let clickTimer = null
let cardConAcciones = null
let eventosSeleccionListos = false

export function render() {
    return `
        ${envolverSidebar(`
        <section id="sidebar">
            <button class="glass act" data-filtro="todos">${icono("list", 18)}<span>Todas</span></button>
            <button class="glass" data-filtro="long">${icono("trending-up", 18)}<span>Long</span></button>
            <button class="glass" data-filtro="short">${icono("trending-down", 18)}<span>Short</span></button>
            <button class="glass" data-filtro="abierto">${icono("eye", 18)}<span>Abiertos</span></button>
            <button class="glass" data-filtro="cerrado">${icono("circle-check", 18)}<span>Cerrados</span></button>
        </section>
    `)}
        <section id="panel" class="glass">
            <div class="panel-header">
                <div class="toggle-group" id="toggle-vista-trading">
                    <span class="toggle-option active" data-vista="trades">Trades</span>
                    <span class="toggle-option" data-vista="ordenes">Órdenes</span>
                </div>
            </div>

            <div class="portfolio-resumen">
                <div class="resumen-card">
                    <div class="resumen-label" id="resumen-label-1">P&L Total</div>
                    <div class="resumen-valor" id="pnl-total">0.00</div>
                </div>
                <div class="resumen-card">
                    <div class="resumen-label" id="resumen-label-2">Abiertos</div>
                    <div class="resumen-valor" id="total-abiertos">0</div>
                </div>
                <div class="resumen-card">
                    <div class="resumen-label" id="resumen-label-3">Cerrados</div>
                    <div class="resumen-valor" id="total-cerrados">0</div>
                </div>
            </div>

            <div id="lista-trades" class="lista-posiciones">
                <div class="lista-vacia">${LOGO_ESCINCO_CARGA}</div>
            </div>
        </section>
    `
}

export async function init() {
    uid = sesion.uid
    vistaActual = "trades"
    console.log("[INFO] Trading iniciado para UID:", uid)

    configurarEventos()
    configurarToggleVista()

    await evaluarYNotificar()
    await Promise.all([cargarTrades(), cargarOrdenes()])
}

// ============================================
// EVALUACIÓN DE ÓRDENES
// ============================================

async function evaluarYNotificar() {
    try {
        const resultado = await evaluarOrdenesPendientes(uid)
        if (resultado.ejecutadas > 0) {
            mostrarNotificacion("exito", `${resultado.ejecutadas} orden(es) ejecutada(s)`)
        }
        return resultado
    } catch (error) {
        console.error("Error evaluando órdenes:", error)
        return { ejecutadas: 0 }
    }
}

/**
 * Refresca trades y órdenes, evaluando antes las órdenes pendientes.
 * Usada por el botón "Actualizar" de la lastbar.
 */
export async function recargarTrading() {
    await evaluarYNotificar()
    await Promise.all([cargarTrades(), cargarOrdenes()])
}

export async function cargarTrades() {
    try {
        const filtros = {}
        if (filtroActual === 'long' || filtroActual === 'short') {
            filtros.tipo = filtroActual
        } else if (filtroActual === 'abierto') {
            filtros.estado = 'abierto'
        } else if (filtroActual === 'cerrado') {
            filtros.estado = 'cerrado'
        }

        datosTrades = await obtenerTradesConFiltros(uid, filtros)
        if (vistaActual === "trades") renderizarTrades()
        actualizarResumen()
    } catch (error) {
        console.error("Error cargando trades:", error)
        if (vistaActual !== "trades") return
        const container = document.getElementById('lista-trades')
        if (container) {
            container.innerHTML = `<p class="lista-vacia error">Error al cargar trades</p>`
        }
    }
}

// ============================================
// CARGAR ÓRDENES
// ============================================

async function cargarOrdenes() {
    try {
        ordenesData = await obtenerOrdenesConFiltros(uid, {})
        if (vistaActual === "ordenes") renderizarOrdenes()
        actualizarResumen()
    } catch (error) {
        console.error("Error cargando órdenes:", error)
        if (vistaActual !== "ordenes") return
        const container = document.getElementById('lista-trades')
        if (container) {
            container.innerHTML = `<p class="lista-vacia error">Error al cargar órdenes</p>`
        }
    }
}

function renderizarTrades() {
    const container = document.getElementById('lista-trades')
    if (!container) return

    const lista = datosTrades?.trades || []

    // Podar ids de selección que ya no existen en la lista actual.
    const vivas = new Set(lista.map(t => t.id))
    seleccionadas = new Set([...seleccionadas].filter(id => vivas.has(id)))
    ordenSeleccion = ordenSeleccion.filter(id => vivas.has(id))

    if (lista.length === 0) {
        container.innerHTML = `
            <p class="lista-vacia">
                No hay trades registrados.
                <br><br>
                <span class="lista-vacia-hint">Usa los botones <strong>"Largo"</strong> o <strong>"Corto"</strong> en la barra inferior para registrar tu primer trade.</span>
            </p>
        `
        return
    }

    container.innerHTML = lista.map(t => {
        const pnl = t.pnl
        const pnlPct = t.pnlPorcentaje
        const esGanancia = pnl >= 0
        const simbolo = DIVISAS_SYMBOLS[t.divisa] || '$'

        return `
            <div class="posicion-item trade-item${seleccionadas.has(t.id) ? " seleccionado" : ""}" data-trade-id="${t.id}">
                <div class="card-item-main">
                    <div class="posicion-info">
                        <div class="posicion-nombre">
                            ${t.activo}
                            <span class="posicion-simbolo">${t.tipoLabel}</span>
                        </div>
                        <div class="posicion-detalle">
                            Lotaje: ${t.lotaje} · ${t.estaCerrado ? "Cerrado" : "Abierto"}
                        </div>
                    </div>
                    <div class="card-item-valor-wrap">
                        <div class="posicion-valores">
                            ${t.estaCerrado ? `
                                <div class="posicion-valor ${esGanancia ? 'positive' : 'negative'}">
                                    ${esGanancia ? '+' : ''}${simbolo} ${pnl.toFixed(2)}
                                </div>
                                <div class="posicion-rendimiento ${esGanancia ? 'positive' : 'negative'}">
                                    ${esGanancia ? '+' : ''}${pnlPct.toFixed(2)}%
                                </div>
                            ` : t.pnlFlotante !== null && t.pnlFlotante !== undefined ? `
                                <div class="posicion-valor ${t.pnlFlotante >= 0 ? 'positive' : 'negative'}">
                                    ${t.pnlFlotante >= 0 ? '+' : ''}${simbolo} ${t.pnlFlotante.toFixed(2)}
                                </div>
                                <div class="posicion-rendimiento ${t.pnlFlotante >= 0 ? 'positive' : 'negative'}">
                                    P&L flotante
                                </div>
                            ` : `
                                <div class="posicion-valor">Abierto</div>
                            `}
                        </div>
                        <div class="card-item-acciones">
                            ${t.estaAbierto ? `
                                <button type="button" class="card-action-btn" data-accion="cerrar" data-id="${t.id}" title="Cerrar" aria-label="Cerrar">${icono("x", 16)}</button>
                            ` : `
                                <button type="button" class="card-action-btn" data-accion="reabrir" data-id="${t.id}" title="Reabrir" aria-label="Reabrir">${icono("refresh-cw", 16)}</button>
                            `}
                            <button type="button" class="card-action-btn" data-accion="editar" data-id="${t.id}" title="Editar" aria-label="Editar">${icono("pencil", 16)}</button>
                            <button type="button" class="card-action-btn danger" data-accion="eliminar" data-id="${t.id}" title="Eliminar" aria-label="Eliminar">${icono("trash-2", 16)}</button>
                        </div>
                    </div>
                </div>
            </div>
        `
    }).join('')

    // Las acciones ahora las maneja el contenedor (delegadas).
    cardConAcciones = null
}

// ============================================
// RENDERIZAR ÓRDENES
// ============================================

function renderizarOrdenes() {
    const container = document.getElementById('lista-trades')
    if (!container) return

    const lista = ordenesData || []

    // Podar ids de selección que ya no existen en la lista actual.
    const vivas = new Set(lista.map(o => o.id))
    seleccionadas = new Set([...seleccionadas].filter(id => vivas.has(id)))
    ordenSeleccion = ordenSeleccion.filter(id => vivas.has(id))

    if (lista.length === 0) {
        container.innerHTML = `
            <p class="lista-vacia">
                No hay órdenes registradas.
                <br><br>
                <span class="lista-vacia-hint">Usa <strong>"Nueva orden"</strong> para programar una compra o venta límite/stop.</span>
            </p>
        `
        return
    }

    container.innerHTML = lista.map(o => {
        const simbolo = DIVISAS_SYMBOLS[o.divisa] || '$'
        const claseDireccion = o.direccion === "long" ? "positive" : "negative"
        const claseEstado = o.estaPendiente ? "pendiente" : (o.fueEjecutada ? "ejecutada" : "cancelada")

        return `
            <div class="posicion-item trade-item orden-item${seleccionadas.has(o.id) ? " seleccionado" : ""}" data-orden-id="${o.id}">
                <div class="card-item-main">
                    <div class="posicion-info">
                        <div class="posicion-nombre">
                            ${o.activo}
                            <span class="posicion-simbolo">${o.direccion === "long" ? "Largo" : "Corto"}</span>
                            <span class="orden-badge ${claseEstado}">${o.estadoTexto}</span>
                        </div>
                        <div class="posicion-detalle">
                            Lotaje: ${o.lotaje}
                        </div>
                    </div>
                    <div class="card-item-valor-wrap">
                        <div class="posicion-valores">
                            <div class="posicion-valor">
                                ${simbolo} ${o.precioDisparo.toFixed(2)}
                            </div>
                            <div class="posicion-rendimiento ${claseDireccion}">
                                ${o.tipoLabel}
                            </div>
                        </div>
                        <div class="card-item-acciones">
                            ${o.estaPendiente ? `
                                <button type="button" class="card-action-btn" data-accion="editar" data-id="${o.id}" title="Editar" aria-label="Editar">${icono("pencil", 16)}</button>
                            ` : ''}
                            <button type="button" class="card-action-btn danger" data-accion="eliminar" data-id="${o.id}" title="Eliminar" aria-label="Eliminar">${icono("trash-2", 16)}</button>
                        </div>
                    </div>
                </div>
            </div>
        `
    }).join('')

    // Las acciones ahora las maneja el contenedor (delegadas).
    cardConAcciones = null
}

function actualizarResumen() {
    const label1 = document.getElementById('resumen-label-1')
    const label2 = document.getElementById('resumen-label-2')
    const label3 = document.getElementById('resumen-label-3')
    const valor1 = document.getElementById('pnl-total')
    const valor2 = document.getElementById('total-abiertos')
    const valor3 = document.getElementById('total-cerrados')

    if (vistaActual === "ordenes") {
        if (label1) label1.textContent = "Pendientes"
        if (label2) label2.textContent = "Ejecutadas"
        if (label3) label3.textContent = "Canceladas"

        const pendientes = ordenesData.filter(o => o.estaPendiente).length
        const ejecutadas = ordenesData.filter(o => o.fueEjecutada).length
        const canceladas = ordenesData.length - pendientes - ejecutadas

        if (valor1) { valor1.textContent = pendientes; valor1.className = "resumen-valor" }
        if (valor2) { valor2.textContent = ejecutadas; valor2.className = "resumen-valor" }
        if (valor3) { valor3.textContent = canceladas; valor3.className = "resumen-valor" }
        return
    }

    if (label1) label1.textContent = "P&L Total"
    if (label2) label2.textContent = "Abiertos"
    if (label3) label3.textContent = "Cerrados"

    if (valor1 && datosTrades) {
        const pnl = datosTrades.metricas.pnlTotal
        valor1.textContent = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`
        valor1.className = `resumen-valor ${pnl >= 0 ? 'positive' : 'negative'}`
    }

    if (valor2 && datosTrades) {
        valor2.textContent = datosTrades.metricas.abiertos
    }

    if (valor3 && datosTrades) {
        valor3.textContent = datosTrades.metricas.cerrados
    }
}

// ============================================
// VISTA: TRADES / ÓRDENES
// ============================================

function configurarToggleVista() {
    const contenedor = document.getElementById("toggle-vista-trading")
    if (!contenedor) return

    contenedor.querySelectorAll(".toggle-option").forEach(opcion => {
        opcion.addEventListener("click", () => cambiarVista(opcion.dataset.vista))
    })

    actualizarBotonesVista()
}

function actualizarBotonesVista() {
    const contenedor = document.getElementById("toggle-vista-trading")
    contenedor?.querySelectorAll(".toggle-option").forEach(opcion => {
        opcion.classList.toggle("active", opcion.dataset.vista === vistaActual)
    })
}

function cambiarVista(vista) {
    vistaActual = vista === "ordenes" ? "ordenes" : "trades"
    actualizarBotonesVista()
    actualizarResumen()

    if (vistaActual === "ordenes") {
        renderizarOrdenes()
    } else {
        renderizarTrades()
    }
}

// ============================================
// EVENTOS DEL SIDEBAR
// ============================================

function configurarEventos() {
    configurarEventosSeleccionGlobal()
    enlazarSeleccionTarjetas()

    document.querySelectorAll('#sidebar button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#sidebar button').forEach(b => b.classList.remove('act'))
            btn.classList.add('act')

            filtroActual = btn.dataset.filtro

            // Los filtros del sidebar aplican a trades: volver a esa vista.
            if (vistaActual !== "trades") {
                vistaActual = "trades"
                actualizarBotonesVista()
            }

            cargarTrades()
        })
    })
}

// ============================================
// SELECCIÓN DE TARJETAS (Trades y Órdenes)
// ============================================
// Mismas reglas que movimientos/pendientes/metas: dblclick o clic sostenido
// alternan, modo "un click" selecciona con un toque y al repetir deselecciona
// (Shift añade/quita), Escape limpia y Delete/Backspace quita la última.
// Solo interacción: no hay contador ni botón de eliminación en lote.

function modoUnClickSeleccion() {
    return sesion.getPreferencias()?.accesibilidad?.unClickSeleccion === true
}

function marcarSupresorClick() {
    supresorClick = true
    clearTimeout(supresorClickTimer)
    supresorClickTimer = setTimeout(() => { supresorClick = false }, 400)
}

function consumirSupresorClick() {
    if (!supresorClick) return false
    supresorClick = false
    clearTimeout(supresorClickTimer)
    return true
}

function toggleSeleccion(id) {
    if (seleccionadas.has(id)) {
        seleccionadas.delete(id)
        const indice = ordenSeleccion.indexOf(id)
        if (indice !== -1) ordenSeleccion.splice(indice, 1)
    } else {
        seleccionadas.add(id)
        if (!ordenSeleccion.includes(id)) ordenSeleccion.push(id)
    }
    aplicarSeleccionDOM()
}

// Modo "un click": un click (sin modificador) selecciona y deselecciona las
// demás; repetir el click sobre el único seleccionado lo deselecciona.
// Shift + click añade o quita.
function seleccionarPorUnClick(id, conShift) {
    if (conShift) {
        toggleSeleccion(id)
        return
    }
    if (seleccionadas.size === 1 && seleccionadas.has(id)) {
        seleccionadas.clear()
        ordenSeleccion.length = 0
        aplicarSeleccionDOM()
        return
    }
    seleccionadas.clear()
    ordenSeleccion.length = 0
    seleccionadas.add(id)
    ordenSeleccion.push(id)
    aplicarSeleccionDOM()
}

function deseleccionarUltima() {
    const id = ordenSeleccion.pop()
    if (!id) return
    seleccionadas.delete(id)
    aplicarSeleccionDOM()
}

function limpiarSeleccion() {
    if (seleccionadas.size === 0) return
    seleccionadas.clear()
    ordenSeleccion.length = 0
    ocultarAccionesCards()
    aplicarSeleccionDOM()
}

function aplicarSeleccionDOM() {
    document.querySelectorAll("#lista-trades .trade-item").forEach(card => {
        const id = card.dataset.tradeId || card.dataset.ordenId
        card.classList.toggle("seleccionado", seleccionadas.has(id))
    })
}

function configurarEventosSeleccionGlobal() {
    if (eventosSeleccionListos) return
    eventosSeleccionListos = true
    document.addEventListener("click", manejarClickFueraTarjetas)
    document.addEventListener("keydown", manejarTecladoSeleccionTarjetas)
}

function manejarClickFueraTarjetas(evento) {
    if (!document.getElementById("lista-trades")) return
    if (evento.target.closest("#lista-trades")) return
    if (evento.target.closest("#app-footer")) return
    if (evento.target.closest(".modal-overlay")) return
    ocultarAccionesCards()
    limpiarSeleccion()
}

function manejarTecladoSeleccionTarjetas(evento) {
    if (!document.getElementById("lista-trades")) return
    if (estaAbierto()) return

    if (evento.key === "Escape") {
        if (seleccionadas.size > 0) {
            ocultarAccionesCards()
            limpiarSeleccion()
        }
        return
    }

    if (evento.key !== "Delete" && evento.key !== "Backspace") return
    if (evento.target.matches("input, textarea, select")) return
    if (seleccionadas.size === 0) return
    evento.preventDefault()
    deseleccionarUltima()
}

// Listeners delegados sobre la lista (persisten entre renders). Los botones
// de acción (revelados por hover/swipe) y las reglas de selección se
// manejan acá.
function enlazarSeleccionTarjetas() {
    const container = document.getElementById("lista-trades")
    if (!container || container.dataset.seleccionLista) return
    container.dataset.seleccionLista = "1"

    container.addEventListener("click", manejarClickTarjeta)
    container.addEventListener("dblclick", manejarDobleClickTarjeta)
    vincularGestosTarjetas(container)
}

function manejarClickTarjeta(evento) {
    // Botones de acción revelados por hover/swipe.
    const accionBtn = evento.target.closest(".card-action-btn")
    if (accionBtn) {
        evento.stopPropagation()
        const card = accionBtn.closest(".trade-item")
        ocultarAccionesCards()
        if (!card) return
        ejecutarAccionTarjeta(accionBtn.dataset.accion, card)
        return
    }

    const card = evento.target.closest(".trade-item")

    // Un toque sobre la card con acciones reveladas solo las oculta.
    if (cardConAcciones) {
        const esLaMisma = card === cardConAcciones
        ocultarAccionesCards()
        if (esLaMisma) {
            consumirSupresorClick()
            return
        }
    }

    // Click inmediatamente tras selección por clic sostenido o swipe.
    if (consumirSupresorClick()) return

    if (!card) return

    const id = card.dataset.tradeId || card.dataset.ordenId
    if (!id) return

    if (modoUnClickSeleccion()) {
        seleccionarPorUnClick(id, evento.shiftKey)
        return
    }

    if (seleccionadas.size > 0) {
        toggleSeleccion(id)
        return
    }

    // Clásico sin selección: un click en un trade abre su edición.
    if (card.dataset.tradeId) {
        if (clickTimer) {
            clearTimeout(clickTimer)
            clickTimer = null
        }
        clickTimer = setTimeout(() => {
            clickTimer = null
            if (seleccionadas.size === 0) abrirModalEditarTrade(card.dataset.tradeId)
        }, 280)
    }
}

function manejarDobleClickTarjeta(evento) {
    if (evento.target.closest(".glass-btn, .card-action-btn")) return
    const card = evento.target.closest(".trade-item")
    if (!card) return

    if (clickTimer) {
        clearTimeout(clickTimer)
        clickTimer = null
    }

    // Órdenes: el doble click abre el detalle de la orden.
    if (card.dataset.ordenId) {
        limpiarSeleccion()
        abrirModalDetalleOrden(card.dataset.ordenId)
        return
    }

    // Con la opción activa el click ya selecciona; el doble click abre la edición.
    if (modoUnClickSeleccion()) {
        limpiarSeleccion()
        if (card.dataset.tradeId) abrirModalEditarTrade(card.dataset.tradeId)
        return
    }

    const id = card.dataset.tradeId || card.dataset.ordenId
    if (id) toggleSeleccion(id)
}

function ejecutarAccionTarjeta(accion, card) {
    if (!card) return
    const id = card.dataset.tradeId || card.dataset.ordenId
    if (!id) return
    const esOrden = !!card.dataset.ordenId
    if (accion === "cerrar") abrirModalCerrarTrade(id)
    else if (accion === "reabrir") abrirModalReabrirTrade(id)
    else if (accion === "editar") esOrden ? abrirModalEditarOrden(id) : abrirModalEditarTrade(id)
    else if (accion === "eliminar") esOrden ? confirmarEliminarOrden(id) : confirmarEliminarTrade(id)
}

function mostrarAccionesCard(card) {
    if (cardConAcciones && cardConAcciones !== card) {
        cardConAcciones.classList.remove("acciones-visibles")
    }
    cardConAcciones = card
    card.classList.add("acciones-visibles")
}

function ocultarAccionesCards() {
    if (!cardConAcciones) return
    cardConAcciones.classList.remove("acciones-visibles")
    cardConAcciones = null
}

// Clic sostenido → seleccionar; swipe horizontal → revelar acciones (en móvil).
function vincularGestosTarjetas(container) {
    let gesto = null

    const cancelar = () => {
        if (gesto?.timer) clearTimeout(gesto.timer)
        gesto = null
    }

    container.addEventListener("pointerdown", (evento) => {
        if (evento.pointerType === "mouse" && evento.button !== 0) return
        if (evento.target.closest(".glass-btn, .card-action-btn")) return

        const card = evento.target.closest(".trade-item")
        if (!card) return

        cancelar()
        if (cardConAcciones && cardConAcciones !== card) ocultarAccionesCards()

        gesto = {
            card,
            pointerId: evento.pointerId,
            pointerType: evento.pointerType,
            startX: evento.clientX,
            startY: evento.clientY,
            movido: false,
            swipeRevelado: false,
            timer: null
        }

        const duracion = evento.pointerType === "touch" ? 500 : 700
        gesto.timer = setTimeout(() => {
            if (!gesto) return
            toggleSeleccion(card.dataset.tradeId || card.dataset.ordenId)
            marcarSupresorClick()
            cancelar()
        }, duracion)
    })

    container.addEventListener("pointermove", (evento) => {
        if (!gesto || evento.pointerId !== gesto.pointerId) return

        const dx = evento.clientX - gesto.startX
        const dy = evento.clientY - gesto.startY

        if (!gesto.movido && Math.hypot(dx, dy) > 10) {
            gesto.movido = true
            if (gesto.timer) {
                clearTimeout(gesto.timer)
                gesto.timer = null
            }
        }

        if (!gesto.movido || gesto.pointerType === "mouse") return

        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
            gesto.swipeRevelado = true
            if (dx < 0) mostrarAccionesCard(gesto.card)
            else ocultarAccionesCards()
        }
    })

    const finalizar = (evento) => {
        if (!gesto || evento.pointerId !== gesto.pointerId) return
        if (gesto.swipeRevelado) marcarSupresorClick()
        cancelar()
    }

    container.addEventListener("pointerup", finalizar)
    container.addEventListener("pointercancel", finalizar)
}

// ============================================
// LASTRAR (handlers centralizados en app.js)
// ============================================

export function abrirModalBroker() {
    abrirModal({
        titulo: "Broker",
        contenido: `<div class="modal-message"><p class="modal-message-desc">Configuración de brokers (en desarrollo)</p></div>`,
        confirmText: 'Cerrar'
    })
}

// ============================================
// ACCIONES EXPORTADAS PARA LASTBAR
// ============================================

export function abrirModalNuevoTrade(tipo) {
    uid = sesion.uid
    const esLong = tipo === 'long'
    const titulo = esLong ? 'Nuevo trade largo' : 'Nuevo trade corto'

    const html = `
        <form class="form-movimiento form-movimiento-grid">
            <div class="form-group">
                <label for="trade-activo">Activo *</label>
                <input type="text" id="trade-activo" class="form-input" placeholder="Ej: BTC, ETH, AAPL" required>
            </div>
            <div class="form-group">
                <label for="trade-cuenta">Cuenta *</label>
                <select id="trade-cuenta" class="form-input" required>
                    <option value="">Seleccionar cuenta</option>
                </select>
            </div>
            <div class="form-group">
                <label for="trade-entrada">Entrada *</label>
                <input type="number" id="trade-entrada" class="form-input" step="0.01" min="0.01" placeholder="0.00" required>
            </div>
            <div class="form-group">
                <label for="trade-lotaje">Lotaje *</label>
                <input type="number" id="trade-lotaje" class="form-input" step="0.0001" min="0.0001" placeholder="0" required>
            </div>
            <div class="form-group">
                <label for="trade-sl">Stop Loss</label>
                <input type="number" id="trade-sl" class="form-input" step="0.01" min="0" placeholder="0.00">
            </div>
            <div class="form-group">
                <label for="trade-tp">Take Profit</label>
                <input type="number" id="trade-tp" class="form-input" step="0.01" min="0" placeholder="0.00">
            </div>
            <div class="form-group full">
                <label for="trade-nota">Nota</label>
                <textarea id="trade-nota" class="form-input form-textarea" rows="3" maxlength="1500" placeholder="Estrategia, contexto del mercado, decisiones..."></textarea>
                <span class="form-hint">Máximo 1500 caracteres</span>
            </div>
        </form>
    `

    abrirModal({
        titulo,
        contenido: html,
        confirmText: 'Registrar trade',
        onConfirm: async () => {
            const activo = document.getElementById('trade-activo')?.value.trim().toUpperCase()
            const cuentaEl = document.getElementById('trade-cuenta')
            const cuenta = cuentaEl?.value
            const divisa = cuentaEl?.selectedOptions?.[0]?.dataset?.moneda || "usd"
            const entrada = parseFloat(document.getElementById('trade-entrada')?.value)
            const lotaje = parseFloat(document.getElementById('trade-lotaje')?.value)
            const sl = parseFloat(document.getElementById('trade-sl')?.value) || null
            const tp = parseFloat(document.getElementById('trade-tp')?.value) || null
            const nota = document.getElementById('trade-nota')?.value.trim()

            if (!activo) { mostrarNotificacion("error", "El activo es obligatorio"); return false }
            if (!cuenta) { mostrarNotificacion("error", "Selecciona una cuenta"); return false }
            if (!entrada || entrada <= 0) { mostrarNotificacion("error", "La entrada debe ser mayor a 0"); return false }
            if (!lotaje || lotaje <= 0) { mostrarNotificacion("error", "El lotaje debe ser mayor a 0"); return false }

            try {
                await registrarTrade(uid, {
                    activo,
                    cuenta,
                    entrada,
                    lotaje,
                    sl,
                    tp,
                    divisa,
                    nota,
                    tipo,
                    estado: 'abierto'
                })

                await cargarTrades()
                mostrarNotificacion("exito", "Trade registrado correctamente")
                return true
            } catch (error) {
                console.error('Error creando trade:', error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })

    setTimeout(() => cargarCuentasEnSelect('trade-cuenta'), 200)
}

// ============================================
// MODAL CERRAR TRADE
// ============================================

function abrirModalCerrarTrade(tradeId) {
    const trade = datosTrades?.trades.find(t => t.id === tradeId)
    if (!trade) return

    const html = `
        <form class="form-movimiento form-movimiento-grid">
            <div class="form-group">
                <label>Activo</label>
                <span class="form-static">${trade.activo} (${trade.tipoLabel})</span>
            </div>
            <div class="form-group">
                <label>Entrada</label>
                <span class="form-static">${trade.entrada.toFixed(2)}</span>
            </div>
            <div class="form-group">
                <label>Lotaje</label>
                <span class="form-static">${trade.lotaje}</span>
            </div>
            <div class="form-group full">
                <label for="cerrar-salida">Precio de salida *</label>
                <input type="number" id="cerrar-salida" class="form-input" step="0.01" min="0.01" placeholder="0.00" required>
            </div>
        </form>
    `

    abrirModal({
        titulo: `Cerrar ${trade.activo}`,
        contenido: html,
        confirmText: 'Cerrar trade',
        onConfirm: async () => {
            const salida = parseFloat(document.getElementById('cerrar-salida')?.value)

            if (!salida || salida <= 0) {
                mostrarNotificacion("error", "La salida debe ser mayor a 0")
                return false
            }

            try {
                await finalizarTrade(uid, tradeId, salida)
                await cargarTrades()
                mostrarNotificacion("exito", "Trade cerrado correctamente")
                return true
            } catch (error) {
                console.error('Error cerrando trade:', error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })
}

// ============================================
// REABRIR TRADE
// ============================================

function abrirModalReabrirTrade(tradeId) {
    const trade = datosTrades?.trades.find(t => t.id === tradeId)
    if (!trade) return

    abrirModal({
        titulo: "Reabrir trade",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    ¿Reabrir el trade de ${trade.activo} (${trade.tipoLabel})? Se eliminará la salida registrada.
                </p>
            </div>
        `,
        confirmText: "Reabrir",
        cancelText: "Cancelar",
        onConfirm: async () => {
            try {
                await reabrirTradeAbierto(uid, tradeId)
                await cargarTrades()
                mostrarNotificacion("exito", "Trade reabierto correctamente")
                return true
            } catch (error) {
                console.error('Error reabriendo trade:', error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })
}

// ============================================
// EDITAR TRADE
// ============================================

function abrirModalEditarTrade(tradeId) {
    const trade = datosTrades?.trades.find(t => t.id === tradeId)
    if (!trade) return

    const simbolo = DIVISAS_SYMBOLS[trade.divisa] || '$'

    const html = `
        <form class="form-movimiento form-movimiento-grid">
            <div class="form-group">
                <label for="editar-trade-activo">Activo *</label>
                <input type="text" id="editar-trade-activo" class="form-input" value="${trade.activo.replace(/</g, "&lt;")}" required>
            </div>
            <div class="form-group">
                <label for="editar-trade-tipo">Dirección</label>
                <select id="editar-trade-tipo" class="form-input">
                    <option value="long" ${trade.tipo === 'long' ? 'selected' : ''}>Largo (Long)</option>
                    <option value="short" ${trade.tipo === 'short' ? 'selected' : ''}>Corto (Short)</option>
                </select>
            </div>
            <div class="form-group">
                <label for="editar-trade-entrada">Entrada *</label>
                <input type="number" id="editar-trade-entrada" class="form-input" step="0.01" min="0.01" value="${trade.entrada}" required>
            </div>
            <div class="form-group">
                <label for="editar-trade-lotaje">Lotaje *</label>
                <input type="number" id="editar-trade-lotaje" class="form-input" step="0.0001" min="0.0001" value="${trade.lotaje}" required>
            </div>
            <div class="form-group">
                <label for="editar-trade-sl">Stop Loss</label>
                <input type="number" id="editar-trade-sl" class="form-input" step="0.01" min="0" value="${trade.sl || ''}" placeholder="0.00">
            </div>
            <div class="form-group">
                <label for="editar-trade-tp">Take Profit</label>
                <input type="number" id="editar-trade-tp" class="form-input" step="0.01" min="0" value="${trade.tp || ''}" placeholder="0.00">
            </div>
            ${trade.estaCerrado ? `
                <div class="form-group full">
                    <label for="editar-trade-salida">Precio de salida</label>
                    <input type="number" id="editar-trade-salida" class="form-input" step="0.01" min="0" value="${trade.salida || ''}" placeholder="${simbolo} 0.00">
                </div>
            ` : ''}
            <div class="form-group full">
                <label for="editar-trade-nota">Nota</label>
                <textarea id="editar-trade-nota" class="form-input form-textarea" rows="3" maxlength="1500">${(trade.nota || "").replace(/</g, "&lt;")}</textarea>
                <span class="form-hint">Máximo 1500 caracteres</span>
            </div>
        </form>
    `

    abrirModal({
        titulo: `Editar ${trade.activo}`,
        contenido: html,
        confirmText: "Guardar cambios",
        cancelText: "Cancelar",
        onConfirm: async () => {
            const activo = document.getElementById('editar-trade-activo')?.value.trim().toUpperCase()
            const tipo = document.getElementById('editar-trade-tipo')?.value
            const entrada = parseFloat(document.getElementById('editar-trade-entrada')?.value)
            const lotaje = parseFloat(document.getElementById('editar-trade-lotaje')?.value)
            const sl = parseFloat(document.getElementById('editar-trade-sl')?.value) || null
            const tp = parseFloat(document.getElementById('editar-trade-tp')?.value) || null
            const nota = document.getElementById('editar-trade-nota')?.value.trim()

            if (!activo) { mostrarNotificacion("error", "El activo es obligatorio"); return false }
            if (!entrada || entrada <= 0) { mostrarNotificacion("error", "La entrada debe ser mayor a 0"); return false }
            if (!lotaje || lotaje <= 0) { mostrarNotificacion("error", "El lotaje debe ser mayor a 0"); return false }

            const datos = {
                activo,
                tipo,
                entrada,
                lotaje,
                sl,
                tp,
                nota
            }

            if (trade.estaCerrado) {
                const salida = parseFloat(document.getElementById('editar-trade-salida')?.value)
                if (salida && salida > 0) {
                    datos.salida = salida
                }
            }

            try {
                await editarTrade(uid, tradeId, datos)
                await cargarTrades()
                mostrarNotificacion("exito", "Trade actualizado correctamente")
                return true
            } catch (error) {
                console.error('Error editando trade:', error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })
}

// ============================================
// ELIMINAR TRADE
// ============================================

function confirmarEliminarTrade(tradeId) {
    const trade = datosTrades?.trades?.find(t => t.id === tradeId) || null
    const snapshot = trade ? { id: trade.id, ...trade.toFirestore() } : null
    abrirModal({
        titulo: "Eliminar trade",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">¿Estás seguro de que quieres eliminar este trade?</p>
            </div>
        `,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            try {
                await borrarTrade(uid, tradeId)
                await cargarTrades()
                if (snapshot) {
                    ofrecerDeshacer({
                        mensaje: "Trade eliminado. ¿Deshacer?",
                        restaurar: () => restaurarDocumento(uid, "trades", snapshot.id, snapshot),
                        alRestaurar: () => cargarTrades()
                    })
                } else {
                    mostrarNotificacion("exito", "Trade eliminado")
                }
                return true
            } catch (error) {
                console.error('Error eliminando trade:', error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })
}

// ============================================
// ÓRDENES · NUEVA
// ============================================

export function abrirModalNuevaOrden() {
    const html = `
        <form class="form-movimiento form-movimiento-grid">
            <div class="form-group">
                <label for="orden-activo">Activo *</label>
                <input type="text" id="orden-activo" class="form-input" placeholder="Ej: BTC, ETH, AAPL" required>
            </div>
            <div class="form-group">
                <label for="orden-cuenta">Cuenta *</label>
                <select id="orden-cuenta" class="form-input" required>
                    <option value="">Seleccionar cuenta</option>
                </select>
            </div>
            <div class="form-group">
                <label for="orden-tipo">Tipo de orden *</label>
                <select id="orden-tipo" class="form-input">
                    <option value="limite">Límite</option>
                    <option value="stop">Stop</option>
                </select>
            </div>
            <div class="form-group">
                <label for="orden-direccion">Dirección *</label>
                <select id="orden-direccion" class="form-input">
                    <option value="long">Compra (Largo)</option>
                    <option value="short">Venta (Corto)</option>
                </select>
            </div>
            <div class="form-group">
                <label for="orden-precio">Precio de disparo *</label>
                <input type="number" id="orden-precio" class="form-input" step="0.01" min="0.01" placeholder="0.00" required>
            </div>
            <div class="form-group">
                <label for="orden-lotaje">Lotaje *</label>
                <input type="number" id="orden-lotaje" class="form-input" step="0.0001" min="0.0001" placeholder="0" required>
            </div>
            <div class="form-group">
                <label for="orden-sl">Stop Loss</label>
                <input type="number" id="orden-sl" class="form-input" step="0.01" min="0" placeholder="0.00">
            </div>
            <div class="form-group">
                <label for="orden-tp">Take Profit</label>
                <input type="number" id="orden-tp" class="form-input" step="0.01" min="0" placeholder="0.00">
            </div>
            <div class="form-group full">
                <label for="orden-nota">Nota</label>
                <textarea id="orden-nota" class="form-input form-textarea" rows="3" maxlength="1500" placeholder="Estrategia, contexto del mercado, decisiones..."></textarea>
                <span class="form-hint">Máximo 1500 caracteres</span>
            </div>
        </form>
    `

    abrirModal({
        titulo: "Nueva orden",
        contenido: html,
        confirmText: 'Crear orden',
        onConfirm: async () => {
            const activo = document.getElementById('orden-activo')?.value.trim().toUpperCase()
            const cuentaEl = document.getElementById('orden-cuenta')
            const cuenta = cuentaEl?.value
            const divisa = cuentaEl?.selectedOptions?.[0]?.dataset?.moneda || "usd"
            const tipoOrden = document.getElementById('orden-tipo')?.value
            const direccion = document.getElementById('orden-direccion')?.value
            const precioDisparo = parseFloat(document.getElementById('orden-precio')?.value)
            const lotaje = parseFloat(document.getElementById('orden-lotaje')?.value)
            const sl = parseFloat(document.getElementById('orden-sl')?.value) || null
            const tp = parseFloat(document.getElementById('orden-tp')?.value) || null
            const nota = document.getElementById('orden-nota')?.value.trim()

            if (!activo) { mostrarNotificacion("error", "El activo es obligatorio"); return false }
            if (!cuenta) { mostrarNotificacion("error", "Selecciona una cuenta"); return false }
            if (!precioDisparo || precioDisparo <= 0) { mostrarNotificacion("error", "El precio de disparo debe ser mayor a 0"); return false }
            if (!lotaje || lotaje <= 0) { mostrarNotificacion("error", "El lotaje debe ser mayor a 0"); return false }

            try {
                await registrarOrden(uid, {
                    activo,
                    cuenta,
                    tipoOrden,
                    direccion,
                    precioDisparo,
                    lotaje,
                    sl,
                    tp,
                    divisa,
                    nota,
                    estado: 'pendiente'
                })

                await cargarOrdenes()
                mostrarNotificacion("exito", "Orden creada correctamente")
                return true
            } catch (error) {
                console.error('Error creando orden:', error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })

    setTimeout(() => cargarCuentasEnSelect('orden-cuenta'), 200)
}

// ============================================
// ÓRDENES · DETALLE
// ============================================
// El doble click sobre una orden abre un modal de solo lectura con todos
// sus datos. Desde el footer se puede editar o eliminar.

function abrirModalDetalleOrden(ordenId) {
    const orden = ordenesData.find(o => o.id === ordenId)
    if (!orden) return

    const simbolo = DIVISAS_SYMBOLS[orden.divisa] || '$'

    const html = `
        <div class="form-movimiento form-movimiento-grid">
            <div class="form-group">
                <label>Activo</label>
                <span class="form-static">${orden.activo} (${orden.direccion === "long" ? "Largo" : "Corto"})</span>
            </div>
            <div class="form-group">
                <label>Tipo de orden</label>
                <span class="form-static">${orden.tipoLabel}</span>
            </div>
            <div class="form-group">
                <label>Estado</label>
                <span class="form-static">${orden.estadoTexto}</span>
            </div>
            <div class="form-group">
                <label>Precio de disparo</label>
                <span class="form-static">${simbolo} ${orden.precioDisparo.toFixed(2)}</span>
            </div>
            <div class="form-group">
                <label>Lotaje</label>
                <span class="form-static">${orden.lotaje}</span>
            </div>
            <div class="form-group">
                <label>Stop Loss</label>
                <span class="form-static">${orden.sl ? `${simbolo} ${Number(orden.sl).toFixed(2)}` : "—"}</span>
            </div>
            <div class="form-group">
                <label>Take Profit</label>
                <span class="form-static">${orden.tp ? `${simbolo} ${Number(orden.tp).toFixed(2)}` : "—"}</span>
            </div>
            ${orden.fueEjecutada && orden.precioEjecucion ? `
                <div class="form-group">
                    <label>Precio ejecutado</label>
                    <span class="form-static">${simbolo} ${Number(orden.precioEjecucion).toFixed(2)}</span>
                </div>
            ` : ''}
            <div class="form-group">
                <label>Creada el</label>
                <span class="form-static">${formatearFechaOrden(orden.fechaCreacion)}</span>
            </div>
            ${orden.nota ? `
                <div class="form-group full">
                    <label>Nota</label>
                    <span class="form-static">${orden.nota.replace(/</g, "&lt;")}</span>
                </div>
            ` : ''}
        </div>
    `

    abrirModal({
        titulo: `Orden · ${orden.activo}`,
        contenido: html,
        variante: "info",
        confirmText: "Editar",
        footerExtra: `
            <button type="button" class="modal-btn modal-btn-secondary modal-btn-danger" id="detalle-orden-eliminar">
                ${icono("trash-2", 15)} Eliminar
            </button>
        `,
        onConfirm: () => {
            abrirModalEditarOrden(orden.id)
            return true
        },
        onCancel: () => true
    })

    document.getElementById('detalle-orden-eliminar')?.addEventListener('click', () => {
        cerrarModal()
        confirmarEliminarOrden(orden.id)
    })
}

function formatearFechaOrden(valor) {
    if (!valor) return "—"
    try {
        const fecha = valor?.toDate ? valor.toDate() : new Date(valor)
        if (isNaN(fecha.getTime())) return "—"
        return fecha.toLocaleDateString("es-PE", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        })
    } catch {
        return "—"
    }
}

// ============================================
// ÓRDENES · EDITAR
// ============================================

function abrirModalEditarOrden(ordenId) {
    const orden = ordenesData.find(o => o.id === ordenId)
    if (!orden) return

    const html = `
        <form class="form-movimiento form-movimiento-grid">
            <div class="form-group">
                <label for="editar-orden-activo">Activo *</label>
                <input type="text" id="editar-orden-activo" class="form-input" value="${(orden.activo || "").replace(/</g, "&lt;")}" required>
            </div>
            <div class="form-group">
                <label for="editar-orden-cuenta">Cuenta *</label>
                <select id="editar-orden-cuenta" class="form-input" required>
                    <option value="">Seleccionar cuenta</option>
                </select>
            </div>
            <div class="form-group">
                <label for="editar-orden-tipo">Tipo de orden *</label>
                <select id="editar-orden-tipo" class="form-input">
                    <option value="limite" ${orden.tipoOrden === "limite" ? "selected" : ""}>Límite</option>
                    <option value="stop" ${orden.tipoOrden === "stop" ? "selected" : ""}>Stop</option>
                </select>
            </div>
            <div class="form-group">
                <label for="editar-orden-direccion">Dirección *</label>
                <select id="editar-orden-direccion" class="form-input">
                    <option value="long" ${orden.direccion === "long" ? "selected" : ""}>Compra (Largo)</option>
                    <option value="short" ${orden.direccion === "short" ? "selected" : ""}>Venta (Corto)</option>
                </select>
            </div>
            <div class="form-group">
                <label for="editar-orden-precio">Precio de disparo *</label>
                <input type="number" id="editar-orden-precio" class="form-input" step="0.01" min="0.01" value="${orden.precioDisparo}" required>
            </div>
            <div class="form-group">
                <label for="editar-orden-lotaje">Lotaje *</label>
                <input type="number" id="editar-orden-lotaje" class="form-input" step="0.0001" min="0.0001" value="${orden.lotaje}" required>
            </div>
            <div class="form-group">
                <label for="editar-orden-sl">Stop Loss</label>
                <input type="number" id="editar-orden-sl" class="form-input" step="0.01" min="0" value="${orden.sl || ''}" placeholder="0.00">
            </div>
            <div class="form-group">
                <label for="editar-orden-tp">Take Profit</label>
                <input type="number" id="editar-orden-tp" class="form-input" step="0.01" min="0" value="${orden.tp || ''}" placeholder="0.00">
            </div>
            <div class="form-group full">
                <label for="editar-orden-nota">Nota</label>
                <textarea id="editar-orden-nota" class="form-input form-textarea" rows="3" maxlength="1500">${(orden.nota || "").replace(/</g, "&lt;")}</textarea>
                <span class="form-hint">Máximo 1500 caracteres</span>
            </div>
        </form>
    `

    abrirModal({
        titulo: `Editar orden · ${orden.activo}`,
        contenido: html,
        confirmText: "Guardar cambios",
        cancelText: "Cancelar",
        onConfirm: async () => {
            const activo = document.getElementById('editar-orden-activo')?.value.trim().toUpperCase()
            const cuentaEl = document.getElementById('editar-orden-cuenta')
            const cuenta = cuentaEl?.value
            const divisa = cuentaEl?.selectedOptions?.[0]?.dataset?.moneda || orden.divisa || "usd"
            const tipoOrden = document.getElementById('editar-orden-tipo')?.value
            const direccion = document.getElementById('editar-orden-direccion')?.value
            const precioDisparo = parseFloat(document.getElementById('editar-orden-precio')?.value)
            const lotaje = parseFloat(document.getElementById('editar-orden-lotaje')?.value)
            const sl = parseFloat(document.getElementById('editar-orden-sl')?.value) || null
            const tp = parseFloat(document.getElementById('editar-orden-tp')?.value) || null
            const nota = document.getElementById('editar-orden-nota')?.value.trim()

            if (!activo) { mostrarNotificacion("error", "El activo es obligatorio"); return false }
            if (!cuenta) { mostrarNotificacion("error", "Selecciona una cuenta"); return false }
            if (!precioDisparo || precioDisparo <= 0) { mostrarNotificacion("error", "El precio de disparo debe ser mayor a 0"); return false }
            if (!lotaje || lotaje <= 0) { mostrarNotificacion("error", "El lotaje debe ser mayor a 0"); return false }

            try {
                await editarOrden(uid, ordenId, {
                    activo,
                    cuenta,
                    tipoOrden,
                    direccion,
                    precioDisparo,
                    lotaje,
                    sl,
                    tp,
                    divisa,
                    nota
                })
                await cargarOrdenes()
                mostrarNotificacion("exito", "Orden actualizada correctamente")
                return true
            } catch (error) {
                console.error('Error editando orden:', error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })

    setTimeout(() => {
        cargarCuentasEnSelect('editar-orden-cuenta').then(() => {
            const sel = document.getElementById('editar-orden-cuenta')
            if (sel && orden.cuenta) sel.value = orden.cuenta
        })
    }, 200)
}

// ============================================
// ÓRDENES · ELIMINAR
// ============================================

function confirmarEliminarOrden(ordenId) {
    const orden = ordenesData.find(o => o.id === ordenId) || null
    const snapshot = orden ? { id: orden.id, ...orden.toFirestore() } : null
    abrirModal({
        titulo: "Eliminar orden",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">¿Estás seguro de que quieres eliminar esta orden?</p>
            </div>
        `,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            try {
                await borrarOrden(uid, ordenId)
                await cargarOrdenes()
                if (snapshot) {
                    ofrecerDeshacer({
                        mensaje: "Orden eliminada. ¿Deshacer?",
                        restaurar: () => restaurarDocumento(uid, "ordenes", snapshot.id, snapshot),
                        alRestaurar: () => cargarOrdenes()
                    })
                } else {
                    mostrarNotificacion("exito", "Orden eliminada")
                }
                return true
            } catch (error) {
                console.error('Error eliminando orden:', error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })
}

// ============================================
// UTILIDAD: Cargar cuentas en select
// ============================================

async function cargarCuentasEnSelect(selectId) {
    try {
        const { obtenerCuentas } = await import('../../firebase/firestore.js')
        const cuentas = await obtenerCuentas(uid)
        const select = document.getElementById(selectId)
        if (!select) return

        const activas = cuentas.filter(c => c.estado !== 'archivada' && c.tipo !== 'credito')
        select.innerHTML = `
            <option value="">Seleccionar cuenta</option>
            ${activas.map(c => `
                <option value="${c.id}" data-moneda="${(c.moneda || 'pen').toLowerCase()}">${c.nombre} (${c.moneda?.toUpperCase() || 'PEN'})</option>
            `).join('')}
        `
    } catch (error) {
        console.error('Error cargando cuentas:', error)
    }
}