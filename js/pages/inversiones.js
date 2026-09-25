import { sesion } from "../core/sesion.js"
import { getFechaHoy, parseFechaLocal } from "../core/fechas.js"
import { obtenerPosicionesConValor } from "../services/PosicionServicio.js"
import {
    buscarActivoPorSimbolo,
    crearActivo,
    actualizarPrecioActivo,
    marcarFavoritoActivo
} from "../repositories/ActivoRepositorio.js"
import { eliminarPosicion } from "../repositories/PosicionRepositorio.js"
import {
    obtenerEstrategias,
    crearEstrategia,
    actualizarEstrategia,
    eliminarEstrategia
} from "../repositories/EstrategiaRepositorio.js"
import {
    calcularProximaEjecucion,
    ejecutarEstrategia
} from "../services/EstrategiaServicio.js"
import { DIAS_SEMANA } from "../models/Estrategia.js"
import {
    actualizarPrecioManual,
    actualizarPrecioAutomatico,
    historialParaGrafico
} from "../services/PrecioServicio.js"
import { crearGraficoEvolucionPrecio, destruirGrafico } from "../ui/graficos.js"
import { abrirModal, estaAbierto } from "../ui/modal.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"
import { ofrecerDeshacer } from "../services/DeshacerServicio.js"
import { obtenerCuentas, restaurarDocumento } from "../../firebase/firestore.js"
import { icono } from "../core/iconos.js"
import { skeletonMarkup, skeletonText } from "../ui/skeletons.js"
import { envolverSidebar } from "../ui/colapsoSidebar.js"
import { DIVISAS_SYMBOLS } from "../../constants/divisas.js"
import { expandirSeleccion } from "../ui/seleccion.js"
import { formatearMontoConDivisa } from "../services/DivisaServicio.js"

let uid = null
let posicionesData = null
let estrategiasData = []
let vistaActual = "posiciones"
let cargasVisibles = 0
let estrategiasCargadas = false

let clickTimer = null

// Selección de tarjetas (mismas reglas que movimientos/pendientes/metas):
// dblclick o clic sostenido alternan, modo "un click" selecciona con un
// toque y al repetir deselecciona, Shift añade/quita, Escape limpia y
// Delete/Backspace quita la última. Solo interacción: sin contador ni
// eliminación en lote.
let seleccionadas = new Set()
let ordenSeleccion = []
let supresorClick = false
let supresorClickTimer = null
let eventosSeleccionListos = false
let cardConAcciones = null

// ============================================
// RENDER
// ============================================

export function render() {
    return `
        ${envolverSidebar(`
        <section id="sidebar">
            <button class="glass act" data-filtro="todas">${icono("list", 18)}<span>Todas</span></button>
            <button class="glass" data-filtro="accion">${icono("trending-up", 18)}<span>Acciones</span></button>
            <button class="glass" data-filtro="etf">${icono("layers", 18)}<span>ETFs</span></button>
            <button class="glass" data-filtro="crypto">${icono("bitcoin", 18)}<span>Cripto</span></button>
        </section>
    `)}
        <section id="panel" class="glass">
            <div class="panel-header">
                <div class="toggle-group" id="toggle-vista-inversiones">
                    <span class="toggle-option active" data-vista="posiciones">Posiciones</span>
                    <span class="toggle-option" data-vista="estrategias">Estrategias</span>
                </div>
            </div>
            <div class="portfolio-resumen">
                <div class="resumen-card">
                    <div class="resumen-label">Valor total</div>
                    <div class="resumen-valor" id="valor-total">${skeletonText("skeleton-value-large")}</div>
                </div>
                <div class="resumen-card">
                    <div class="resumen-label">Rendimiento</div>
                    <div class="resumen-valor" id="rendimiento-total">${skeletonText("skeleton-value-large")}</div>
                </div>
                <div class="resumen-card">
                    <div class="resumen-label">Posiciones</div>
                    <div class="resumen-valor" id="total-posiciones">${skeletonText("skeleton-value")}</div>
                </div>
            </div>
            <div id="lista-posiciones" class="lista-posiciones" aria-busy="true">
                ${skeletonMarkup({ rows: 4 })}
            </div>
        </section>
    `
}

// ============================================
// INIT
// ============================================

export async function init() {
    uid = sesion.uid
    vistaActual = "posiciones"
    console.log("[INFO] Inversiones iniciado para UID:", uid)

    configurarEventos()
    configurarToggleVista()

    await Promise.all([cargarPosiciones(), cargarEstrategias()])
}

// ============================================
// CARGAR POSICIONES
// ============================================

function iniciarCargaVisible() {
    cargasVisibles++
    const panel = document.getElementById("panel")
    const lista = document.getElementById("lista-posiciones")
    panel?.setAttribute("aria-busy", "true")
    lista?.setAttribute("aria-busy", "true")
    if (lista) lista.innerHTML = skeletonMarkup({ rows: 4 })
    const resumenIds = ["valor-total", "rendimiento-total", "total-posiciones"]
    resumenIds.forEach(id => {
        const valor = document.getElementById(id)
        if (valor) valor.innerHTML = skeletonText(id === "total-posiciones" ? "skeleton-value" : "skeleton-value-large")
    })
}

function finalizarCargaVisible() {
    cargasVisibles = Math.max(0, cargasVisibles - 1)
    if (cargasVisibles > 0) return
    const panel = document.getElementById("panel")
    const lista = document.getElementById("lista-posiciones")
    panel?.removeAttribute("aria-busy")
    lista?.removeAttribute("aria-busy")
    if (posicionesData) actualizarResumen()
    if (vistaActual === "posiciones" && posicionesData) renderizarPosiciones()
    else if (vistaActual === "estrategias" && estrategiasCargadas) renderizarEstrategias()
}

export async function cargarPosiciones() {
    iniciarCargaVisible()
    try {
        posicionesData = await obtenerPosicionesConValor(uid)
        if (cargasVisibles === 0) {
            actualizarResumen()
            if (vistaActual === "posiciones") renderizarPosiciones()
        }
    } catch (error) {
        console.error("Error cargando posiciones:", error)
        if (vistaActual !== "posiciones") return
        const container = document.getElementById("lista-posiciones")
        if (container) {
            container.innerHTML = `<p class="lista-vacia error">Error al cargar posiciones</p>`
        }
    } finally {
        finalizarCargaVisible()
    }
}

// ============================================
// CARGAR ESTRATEGIAS
// ============================================

async function cargarEstrategias() {
    iniciarCargaVisible()
    try {
        estrategiasData = await obtenerEstrategias(uid)
        estrategiasCargadas = true
        if (cargasVisibles === 0 && vistaActual === "estrategias") {
            renderizarEstrategias()
        }
    } catch (error) {
        console.error("Error cargando estrategias:", error)
        if (vistaActual !== "estrategias") return
        const container = document.getElementById("lista-posiciones")
        if (container) {
            container.innerHTML = `<p class="lista-vacia error">Error al cargar estrategias</p>`
        }
    } finally {
        finalizarCargaVisible()
    }
}

// ============================================
// RENDERIZAR POSICIONES
// ============================================

function renderizarPosiciones() {
    const container = document.getElementById("lista-posiciones")
    if (!container) return

    const posiciones = posicionesData?.posiciones || []

    // Podar ids de selección que ya no existen en la lista actual.
    const vivas = new Set(posiciones.map(p => p.id))
    seleccionadas = new Set([...seleccionadas].filter(id => vivas.has(id)))
    ordenSeleccion = ordenSeleccion.filter(id => vivas.has(id))

    if (posiciones.length === 0) {
        container.innerHTML = plantillaVacio()
        return
    }

    container.innerHTML = posiciones.map(plantillaPosicion).join("")
    enlazarListaPosiciones(container)
    cardConAcciones = null
}

function plantillaVacio() {
    return `
        <p class="lista-vacia">
            No hay posiciones activas.
            <br><br>
            <span class="lista-vacia-hint">
                Usa el botón <strong>"Comprar"</strong> en la barra inferior
                para agregar tu primera inversión.
            </span>
        </p>
    `
}

function plantillaPosicion(p) {
    const activo = p.activo
    const rendimiento = p.rendimientoPorcentual || 0
    const esGanancia = rendimiento >= 0
    const valor = p.valorTotal || 0
    const esFavorito = activo?.favorito === true

    // Badge de fuente de precio
    const fuente = activo?.fuente || "manual"
    const fuenteLabel = fuente === "api" ? "Auto" : "Manual"
    const fuenteClase = fuente === "api" ? "fuente-api" : "fuente-manual"

    // Fecha de última actualización
    let fechaActualizacion = ""
    if (activo?.ultimaActualizacion) {
        const fecha = activo.ultimaActualizacion instanceof Date
            ? activo.ultimaActualizacion
            : new Date(activo.ultimaActualizacion)
        if (!Number.isNaN(fecha.getTime())) {
            fechaActualizacion = fecha.toLocaleDateString("es-PE", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit"
            })
        }
    }

    return `
        <div class="posicion-item${seleccionadas.has(p.id) ? " seleccionado" : ""}" data-posicion-id="${p.id}" data-activo-id="${p.activoId}">
            <button
                type="button"
                class="posicion-favorito ${esFavorito ? "es-favorito" : ""}"
                data-activo-id="${p.activoId}"
                aria-label="${esFavorito ? "Quitar de favoritos" : "Marcar como favorito"}"
                title="${esFavorito ? "Quitar de favoritos" : "Marcar como favorito"}"
            >${icono("star", 16)}</button>
            <div class="posicion-info">
                <div class="posicion-nombre">
                    ${activo?.nombre || p.activoId}
                    <span class="posicion-simbolo">${activo?.simbolo || ""}</span>
                    <span class="posicion-fuente ${fuenteClase}">${fuenteLabel}</span>
                </div>
                <div class="posicion-detalle">
                    ${p.cantidad.toFixed(4)} · Precio: ${formatearMontoConDivisa(activo?.ultimoPrecio || 0, p.divisa)}
                    ${fechaActualizacion ? ` · Act. ${fechaActualizacion}` : ""}
                </div>
            </div>
            <div class="card-item-valor-wrap">
                    <div class="posicion-valores">
                        <div class="posicion-valor">
                            ${formatearMontoConDivisa(valor, p.divisa)}
                        </div>
                        <div class="posicion-rendimiento ${esGanancia ? "positive" : "negative"}">
                            ${esGanancia ? "+" : ""}${rendimiento.toFixed(2)}%
                        </div>
                    </div>
                    <div class="card-item-acciones">
                        <button type="button" class="card-action-btn" data-accion="precio" data-posicion-id="${p.id}" title="Actualizar precio" aria-label="Actualizar precio">${icono("refresh-cw", 16)}</button>
                        <button type="button" class="card-action-btn danger" data-accion="eliminar" data-posicion-id="${p.id}" title="Eliminar" aria-label="Eliminar">${icono("trash-2", 16)}</button>
                    </div>
                </div>
            </div>
    `
}

// Resuelve una card de posiciones o de estrategias: su id de selección y la
// acción de detalle (gráfico / edición) que se abre en el modo clásico.
function resolverTarjetaInversiones(card) {
    if (card.classList.contains("estrategia-item")) {
        const estrategia = estrategiasData.find(e => e.id === card.dataset.id)
        return estrategia
            ? { id: estrategia.id, abrirDetalle: () => abrirModalEstrategia(estrategia) }
            : null
    }
    const posicion = buscarPosicion(card.dataset.posicionId)
    return posicion
        ? { id: posicion.id, abrirDetalle: () => mostrarGraficoActivo(posicion.activoId, posicion.activo, posicion) }
        : null
}

// Acciones de las posiciones (análogo a movimientos/trading): delegan por
// data-accion sobre la card, respetando el estado de selección.
function ejecutarAccionPosicion(accion, posicionId) {
    const posicion = buscarPosicion(posicionId)
    if (!posicion) return
    if (accion === "precio") {
        abrirModalActualizarPrecio(posicion.activo, posicion)
    } else if (accion === "eliminar") {
        confirmarEliminarPosicion(posicion)
    }
}

function mostrarAccionesCard(card) {
    if (cardConAcciones && cardConAcciones !== card) {
        cardConAcciones.classList.remove("acciones-visibles")
    }
    card.classList.add("acciones-visibles")
    cardConAcciones = card
}

function ocultarAccionesCards() {
    if (!cardConAcciones) return
    cardConAcciones.classList.remove("acciones-visibles")
    cardConAcciones = null
}

function enlazarListaPosiciones(container) {
    if (!container || container.dataset.listaEnlazada) return
    container.dataset.listaEnlazada = "1"

    container.addEventListener("click", (evento) => {
        const favorito = evento.target.closest(".posicion-favorito")
        if (favorito) {
            evento.stopPropagation()
            alternarFavorito(favorito.dataset.activoId)
            return
        }

        const accionBtn = evento.target.closest(".card-item-acciones .card-action-btn")
        if (accionBtn && accionBtn.dataset.posicionId) {
            evento.stopPropagation()
            ejecutarAccionPosicion(accionBtn.dataset.accion, accionBtn.dataset.posicionId)
            return
        }
        if (evento.target.closest(".card-item-acciones")) return

        const card = evento.target.closest(".posicion-item, .estrategia-item")
        if (!card) return

        ocultarAccionesCards()

        // Click inmediatamente tras selección por clic sostenido.
        if (consumirSupresorClick()) return

        const tarjeta = resolverTarjetaInversiones(card)
        if (!tarjeta) return

        if (evento.shiftKey && expandirSeleccion((vistaActual === "estrategias" ? estrategiasData : posicionesData?.posiciones || []).map(item => item.id), tarjeta.id, seleccionadas, ordenSeleccion)) {
            aplicarSeleccionDOM()
            return
        }

        if (modoUnClickSeleccion()) {
            seleccionarPorUnClick(tarjeta.id, evento.shiftKey)
            return
        }

        if (seleccionadas.size > 0) {
            toggleSeleccion(tarjeta.id)
            return
        }

        // Clásico sin selección: un click abre el detalle de la card.
        if (clickTimer) {
            clearTimeout(clickTimer)
            clickTimer = null
        }

        clickTimer = setTimeout(() => {
            clickTimer = null
            if (seleccionadas.size === 0) tarjeta.abrirDetalle()
        }, 280)
    })

    container.addEventListener("dblclick", (evento) => {
        if (evento.target.closest(".posicion-favorito, .card-item-acciones")) return
        const card = evento.target.closest(".posicion-item, .estrategia-item")
        if (!card) return

        if (clickTimer) {
            clearTimeout(clickTimer)
            clickTimer = null
        }

        const tarjeta = resolverTarjetaInversiones(card)
        if (!tarjeta) return

        // Con la opción activa el click ya selecciona; el doble click abre el detalle.
        if (modoUnClickSeleccion()) {
            limpiarSeleccion()
            tarjeta.abrirDetalle()
            return
        }

        toggleSeleccion(tarjeta.id)
    })

    vincularGestosPosiciones(container)
}

// ============================================
// POSICIONES
// ============================================

function buscarPosicion(id) {
    return (posicionesData?.posiciones || []).find(p => p.id === id) || null
}

// ============================================
// SELECCIÓN DE POSICIONES
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
    aplicarSeleccionDOM()
}

function aplicarSeleccionDOM() {
    document.querySelectorAll("#lista-posiciones .posicion-item, #lista-posiciones .estrategia-item").forEach(card => {
        const id = card.dataset.posicionId || card.dataset.id
        card.classList.toggle("seleccionado", seleccionadas.has(id))
    })
}

function configurarEventosSeleccionGlobal() {
    if (eventosSeleccionListos) return
    eventosSeleccionListos = true
    document.addEventListener("click", manejarClickFueraCards)
    document.addEventListener("keydown", manejarTecladoSeleccionCards)
}

function manejarClickFueraCards(evento) {
    if (vistaActual !== "posiciones" && vistaActual !== "estrategias") return
    if (!document.getElementById("lista-posiciones")) return
    if (evento.target.closest("#lista-posiciones")) return
    if (evento.target.closest("#app-footer")) return
    if (evento.target.closest(".modal-overlay")) return
    ocultarAccionesCards()
    limpiarSeleccion()
}

function manejarTecladoSeleccionCards(evento) {
    if (vistaActual !== "posiciones" && vistaActual !== "estrategias") return
    if (!document.getElementById("lista-posiciones")) return
    if (estaAbierto()) return

    if (evento.key === "Escape") {
        if (seleccionadas.size > 0) limpiarSeleccion()
        return
    }

    if (evento.key !== "Delete" && evento.key !== "Backspace") return
    if (evento.target.matches("input, textarea, select")) return
    if (seleccionadas.size === 0) return
    evento.preventDefault()
    deseleccionarUltima()
}

// Clic sostenido sobre una card → seleccionar (en móvil). Swipe horizontal
// → revelar/ocultar las acciones de la card (patrón movimientos/trading).
function vincularGestosPosiciones(container) {
    let gesto = null

    const cancelar = () => {
        if (gesto?.timer) clearTimeout(gesto.timer)
        gesto = null
    }

    container.addEventListener("pointerdown", (evento) => {
        if (evento.pointerType === "mouse" && evento.button !== 0) return
        if (evento.target.closest(".posicion-favorito, .card-item-acciones")) return

        const card = evento.target.closest(".posicion-item, .estrategia-item")
        if (!card) return

        cancelar()

        gesto = {
            card,
            pointerId: evento.pointerId,
            pointerType: evento.pointerType,
            startX: evento.clientX,
            startY: evento.clientY,
            movido: false,
            timer: null
        }

        const duracion = evento.pointerType === "touch" ? 500 : 700
        gesto.timer = setTimeout(() => {
            if (!gesto) return
            toggleSeleccion(card.dataset.posicionId || card.dataset.id)
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
    })

    const finalizar = (evento) => {
        if (!gesto || evento.pointerId !== gesto.pointerId) return
        const dx = evento.clientX - gesto.startX
        const dy = evento.clientY - gesto.startY
        cancelar()

        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) {
                mostrarAccionesCard(gesto.card)
            } else {
                ocultarAccionesCards()
            }
            marcarSupresorClick()
        }
    }

    container.addEventListener("pointerup", finalizar)
    container.addEventListener("pointercancel", finalizar)
}

// ============================================
// FAVORITO DE ACTIVO
// ============================================

// Favoritos con respuesta visual inmediata y escritura con debounce:
// el toggle aplica al instante y los clicks en ráfaga se juntan en un solo
// guardado, por eso aparece una sola notificación al confirmarse.
const favoritosPendientes = {}
const timersFavorito = {}
const semillasFavorito = {}
const escriturasFavorito = new Set()

function activoFavorito(activoId) {
    return (posicionesData?.posiciones || []).find(p => p.activoId === activoId)?.activo || null
}

function aplicarFavoritoEnBotones(activoId) {
    const favorito = activoFavorito(activoId)?.favorito === true
    document.querySelectorAll(`.posicion-favorito[data-activo-id="${activoId}"]`).forEach(boton => {
        boton.classList.toggle("es-favorito", favorito)
        const etiqueta = favorito ? "Quitar de favoritos" : "Marcar como favorito"
        boton.setAttribute("aria-label", etiqueta)
        boton.setAttribute("title", etiqueta)
    })
}

function alternarFavorito(activoId) {
    const activo = activoFavorito(activoId)
    if (!activo) return

    const nuevo = !(activo.favorito === true)
    activo.favorito = nuevo
    favoritosPendientes[activoId] = nuevo
    if (!(activoId in semillasFavorito)) semillasFavorito[activoId] = !nuevo

    aplicarFavoritoEnBotones(activoId)

    clearTimeout(timersFavorito[activoId])
    timersFavorito[activoId] = setTimeout(() => {
        delete timersFavorito[activoId]
        escribirFavorito(activoId)
    }, 400)
}

async function escribirFavorito(activoId) {
    const objetivo = favoritosPendientes[activoId]
    if (objetivo === undefined) return
    delete favoritosPendientes[activoId]

    // Ya hay una escritura en curso: se reencola el último estado pedido.
    if (escriturasFavorito.has(activoId)) {
        favoritosPendientes[activoId] = objetivo
        return
    }

    escriturasFavorito.add(activoId)

    try {
        await marcarFavoritoActivo(uid, activoId, objetivo)
        const activo = activoFavorito(activoId)
        if (activo) activo.favorito = objetivo
        aplicarFavoritoEnBotones(activoId)

        // Si el usuario ya pidió otro estado mientras guardábamos, se saltea
        // esta notificación intermedia; el write encadenado emite la final.
        if (!(activoId in favoritosPendientes)) {
            mostrarNotificacion("exito", objetivo ? "Agregado a favoritos" : "Quitado de favoritos")
        }

        // Si durante la escritura se pidió otro estado, escribirlo también.
        if (activoId in favoritosPendientes) {
            escribirFavorito(activoId)
        }
    } catch (error) {
        console.error("Error actualizando favorito:", error)
        const activo = activoFavorito(activoId)
        if (activo) activo.favorito = semillasFavorito[activoId] === true
        aplicarFavoritoEnBotones(activoId)
        delete favoritosPendientes[activoId]
        mostrarNotificacion("error", "No se pudo actualizar el favorito")
    } finally {
        escriturasFavorito.delete(activoId)
        delete semillasFavorito[activoId]
    }
}

// ============================================
// VISTA: POSICIONES / ESTRATEGIAS
// ============================================

function configurarToggleVista() {
    const contenedor = document.getElementById("toggle-vista-inversiones")
    if (!contenedor) return

    contenedor.querySelectorAll(".toggle-option").forEach(opcion => {
        opcion.addEventListener("click", () => cambiarVista(opcion.dataset.vista))
    })

    actualizarBotonesVista()
}

function actualizarBotonesVista() {
    const contenedor = document.getElementById("toggle-vista-inversiones")
    contenedor?.querySelectorAll(".toggle-option").forEach(opcion => {
        opcion.classList.toggle("active", opcion.dataset.vista === vistaActual)
    })
}

function cambiarVista(vista) {
    vistaActual = vista === "estrategias" ? "estrategias" : "posiciones"
    limpiarSeleccion()
    actualizarBotonesVista()

    if (cargasVisibles > 0) {
        const lista = document.getElementById("lista-posiciones")
        if (lista) lista.innerHTML = skeletonMarkup({ rows: 4 })
    } else if (vistaActual === "estrategias" && estrategiasCargadas) {
        renderizarEstrategias()
    } else if (vistaActual === "posiciones" && posicionesData) {
        renderizarPosiciones()
    }
}

// ============================================
// RENDERIZAR ESTRATEGIAS
// ============================================

function renderizarEstrategias() {
    const container = document.getElementById("lista-posiciones")
    if (!container) return

    // Podar ids de selección que ya no existen en la lista actual.
    const vivas = new Set(estrategiasData.map(e => e.id))
    seleccionadas = new Set([...seleccionadas].filter(id => vivas.has(id)))
    ordenSeleccion = ordenSeleccion.filter(id => vivas.has(id))

    if (estrategiasData.length === 0) {
        container.innerHTML = `
            <p class="lista-vacia">
                No hay estrategias de compra programada.
                <br><br>
                <span class="lista-vacia-hint">
                    Usa <strong>"Nueva estrategia"</strong> para programar
                    compras automáticas (DCA) de tus activos.
                </span>
            </p>
        `
        return
    }

    container.innerHTML = estrategiasData.map(plantillaEstrategia).join("")
    enlazarAccionesEstrategias(container)
    cardConAcciones = null
}

function plantillaEstrategia(estrategia) {
    const simboloDivisa = DIVISAS_SYMBOLS[String(estrategia.divisa).toLowerCase()] || String(estrategia.divisa).toUpperCase()

    return `
        <div class="estrategia-item ${estrategia.activa ? "" : "pausada"}${seleccionadas.has(estrategia.id) ? " seleccionado" : ""}" data-id="${estrategia.id}">
            <div class="estrategia-info">
                <div class="estrategia-nombre">
                    ${estrategia.nombre}
                    <span class="estrategia-simbolo">${estrategia.activoSimbolo}</span>
                </div>
                <div class="estrategia-detalle">
                    ${estrategia.frecuenciaTexto} · ${estrategia.divisa.toUpperCase()}
                </div>
            </div>
            <div class="card-item-valor-wrap">
                <div class="posicion-valores">
                    <div class="posicion-valor">${simboloDivisa} ${estrategia.montoFormateado}</div>
                    <div class="posicion-rendimiento">${estrategia.activa ? "Activa" : "Pausada"}</div>
                </div>
                <div class="card-item-acciones">
                    <button type="button" class="card-action-btn estrategia-ejecutar" data-accion="ejecutar" data-id="${estrategia.id}" title="Ejecutar ahora" aria-label="Ejecutar ahora">${icono("play", 16)}</button>
                    <button type="button" class="card-action-btn estrategia-editar" data-accion="editar" data-id="${estrategia.id}" title="Editar" aria-label="Editar">${icono("pencil", 16)}</button>
                    <button type="button" class="card-action-btn estrategia-pausar" data-accion="${estrategia.activa ? "pausar" : "reanudar"}" data-id="${estrategia.id}" title="${estrategia.activa ? "Pausar" : "Reanudar"}" aria-label="${estrategia.activa ? "Pausar" : "Reanudar"}">${icono(estrategia.activa ? "pause" : "play", 16)}</button>
                    <button type="button" class="card-action-btn danger estrategia-eliminar" data-accion="eliminar" data-id="${estrategia.id}" title="Eliminar" aria-label="Eliminar">${icono("trash-2", 16)}</button>
                </div>
            </div>
        </div>
    `
}

function enlazarAccionesEstrategias(container) {
    container.querySelectorAll(".estrategia-ejecutar").forEach(btn => {
        btn.addEventListener("click", async () => {
            const estrategia = estrategiasData.find(e => e.id === btn.dataset.id)
            if (estrategia) await ejecutarEstrategiaDesdeUI(estrategia)
        })
    })

    container.querySelectorAll(".estrategia-editar").forEach(btn => {
        btn.addEventListener("click", () => {
            const estrategia = estrategiasData.find(e => e.id === btn.dataset.id)
            if (estrategia) abrirModalEstrategia(estrategia)
        })
    })

    container.querySelectorAll(".estrategia-pausar").forEach(btn => {
        btn.addEventListener("click", async () => {
            const estrategia = estrategiasData.find(e => e.id === btn.dataset.id)
            if (estrategia) await cambiarEstadoEstrategiaUI(estrategia)
        })
    })

    container.querySelectorAll(".estrategia-eliminar").forEach(btn => {
        btn.addEventListener("click", () => {
            const estrategia = estrategiasData.find(e => e.id === btn.dataset.id)
            if (estrategia) confirmarEliminarEstrategia(estrategia)
        })
    })
}

// ============================================
// ACCIONES DE ESTRATEGIAS
// ============================================

async function ejecutarEstrategiaDesdeUI(estrategia) {
    try {
        const resultado = await ejecutarEstrategia(uid, estrategia)
        await Promise.all([cargarPosiciones(), cargarEstrategias()])
        mostrarNotificacion(
            "exito",
            `Compra ejecutada: ${resultado.cantidad.toFixed(4)} ${estrategia.activoSimbolo}`
        )
    } catch (error) {
        console.error("Error ejecutando estrategia:", error)
        mostrarNotificacion("error", `Error: ${error.message}`)
    }
}

async function cambiarEstadoEstrategiaUI(estrategia) {
    try {
        await actualizarEstrategia(uid, estrategia.id, { activa: !estrategia.activa })
        await cargarEstrategias()
        mostrarNotificacion("exito", estrategia.activa ? "Estrategia pausada" : "Estrategia reanudada")
    } catch (error) {
        console.error("Error cambiando estado de estrategia:", error)
        mostrarNotificacion("error", `Error: ${error.message}`)
    }
}

function confirmarEliminarEstrategia(estrategia) {
    abrirModal({
        titulo: "Eliminar estrategia",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    ¿Eliminar la estrategia <strong>${estrategia.nombre}</strong>
                    (${estrategia.activoSimbolo})?
                </p>
                <p class="modal-message-warning">
                    Las compras ya ejecutadas se conservan en tu historial.
                </p>
            </div>
        `,
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            try {
                const snapshot = { id: estrategia.id, ...estrategia.toFirestore() }
                await eliminarEstrategia(uid, estrategia.id)
                await cargarEstrategias()
                ofrecerDeshacer({
                    mensaje: `Estrategia "${estrategia.nombre}" eliminada. ¿Deshacer?`,
                    restaurar: () => restaurarDocumento(uid, "estrategias", snapshot.id, snapshot),
                    alRestaurar: () => cargarEstrategias()
                })
                return true
            } catch (error) {
                console.error("Error eliminando estrategia:", error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })
}

// ============================================
// MODAL ESTRATEGIA (CREAR / EDITAR)
// ============================================

export function abrirModalEstrategia(estrategia = null) {
    const esEdicion = !!estrategia
    const frecuencia = estrategia?.frecuencia || "mensual"
    const divisa = estrategia?.divisa || "pen"

    const html = `
        <form id="form-estrategia" class="form-movimiento form-movimiento-grid estrategia-form">
            <div class="form-group full">
                <label for="estrategia-nombre">Nombre de la estrategia *</label>
                <input type="text" id="estrategia-nombre" class="form-input"
                    placeholder="Ej: DCA mensual VOO" value="${estrategia?.nombre || ""}" required>
            </div>
            <div class="form-group">
                <label for="estrategia-simbolo">Símbolo del activo *</label>
                <input type="text" id="estrategia-simbolo" class="form-input"
                    placeholder="Ej: VOO, BTC, AAPL" value="${estrategia?.activoSimbolo || ""}" required>
            </div>
            <div class="form-group">
                <label for="estrategia-cuenta">Cuenta de origen *</label>
                <select id="estrategia-cuenta" class="form-input" required>
                    <option value="">Seleccionar cuenta</option>
                </select>
            </div>
            <div class="form-group">
                <label for="estrategia-monto">Monto fijo por compra *</label>
                <input type="number" id="estrategia-monto" class="form-input" step="0.01" min="0.01"
                    placeholder="0.00" value="${estrategia?.montoFijo ?? ""}" required>
            </div>
            <div class="form-group">
                <label for="estrategia-divisa">Divisa *</label>
                <select id="estrategia-divisa" class="form-input" required>
                    <option value="pen" ${divisa === "pen" ? "selected" : ""}>PEN</option>
                    <option value="usd" ${divisa === "usd" ? "selected" : ""}>USD</option>
                    <option value="usdt" ${divisa === "usdt" ? "selected" : ""}>USDT</option>
                </select>
            </div>
            <div class="form-group">
                <label for="estrategia-frecuencia">Frecuencia *</label>
                <select id="estrategia-frecuencia" class="form-input">
                    <option value="diaria" ${frecuencia === "diaria" ? "selected" : ""}>Diaria</option>
                    <option value="semanal" ${frecuencia === "semanal" ? "selected" : ""}>Semanal</option>
                    <option value="mensual" ${frecuencia === "mensual" ? "selected" : ""}>Mensual</option>
                </select>
            </div>
            <div class="form-group" id="estrategia-dia-semana-group" hidden>
                <label for="estrategia-dia-semana">Día de la semana</label>
                <select id="estrategia-dia-semana" class="form-input">
                    ${DIAS_SEMANA.map((dia, indice) => `
                        <option value="${indice}">${dia}</option>
                    `).join("")}
                </select>
            </div>
            <div class="form-group" id="estrategia-dia-mes-group" hidden>
                <label for="estrategia-dia-mes">Día del mes</label>
                <input type="number" id="estrategia-dia-mes" class="form-input" min="1" max="31" value="1">
            </div>
            <div class="form-group">
                <label>Próxima ejecución</label>
                <div class="form-static" id="estrategia-proxima-preview">—</div>
            </div>
        </form>
    `

    abrirModal({
        titulo: esEdicion ? "Editar estrategia" : "Nueva estrategia",
        contenido: html,
        confirmText: esEdicion ? "Guardar" : "Crear",
        cancelText: "Cancelar",
        onConfirm: async () => {
            const nombre = document.getElementById("estrategia-nombre")?.value.trim()
            const activoSimbolo = document.getElementById("estrategia-simbolo")?.value.trim().toUpperCase()
            const cuentaId = document.getElementById("estrategia-cuenta")?.value
            const montoFijo = parseFloat(document.getElementById("estrategia-monto")?.value)
            const divisaValor = document.getElementById("estrategia-divisa")?.value || "pen"
            const frecuenciaValor = document.getElementById("estrategia-frecuencia")?.value || "mensual"
            const diaPreferido = obtenerDiaPreferidoEstrategia()

            if (!nombre) { mostrarNotificacion("error", "El nombre de la estrategia es obligatorio"); return false }
            if (!activoSimbolo) { mostrarNotificacion("error", "El símbolo del activo es obligatorio"); return false }
            if (!cuentaId) { mostrarNotificacion("error", "Selecciona una cuenta de origen"); return false }
            if (!montoFijo || montoFijo <= 0) { mostrarNotificacion("error", "El monto debe ser mayor a 0"); return false }
            if (frecuenciaValor === "mensual" && (!diaPreferido || diaPreferido < 1 || diaPreferido > 31)) {
                mostrarNotificacion("error", "El día del mes debe estar entre 1 y 31")
                return false
            }

            try {
                const activo = await buscarActivoPorSimbolo(uid, activoSimbolo)
                if (!activo) {
                    mostrarNotificacion(
                        "error",
                        `No existe un activo con el símbolo ${activoSimbolo}. Regístralo primero con una compra.`
                    )
                    return false
                }

                const datos = {
                    nombre,
                    activoSimbolo,
                    cuentaId,
                    montoFijo,
                    divisa: divisaValor,
                    frecuencia: frecuenciaValor,
                    diaPreferido,
                    proximaEjecucion: calcularProximaEjecucion(frecuenciaValor, diaPreferido, new Date()),
                    activa: esEdicion ? estrategia.activa : true
                }

                if (esEdicion) {
                    await actualizarEstrategia(uid, estrategia.id, datos)
                } else {
                    await crearEstrategia(uid, datos)
                }

                await cargarEstrategias()
                mostrarNotificacion("exito", esEdicion ? "Estrategia actualizada" : "Estrategia creada")
                return true
            } catch (error) {
                console.error("Error guardando estrategia:", error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })

    setTimeout(async () => {
        await cargarCuentasEnSelect("estrategia-cuenta")

        const cuentaSelect = document.getElementById("estrategia-cuenta")
        if (cuentaSelect && estrategia?.cuentaId) {
            cuentaSelect.value = estrategia.cuentaId
        }

        const divisaSelect = document.getElementById("estrategia-divisa")
        if (divisaSelect) divisaSelect.value = divisa

        const frecuenciaSelect = document.getElementById("estrategia-frecuencia")
        if (frecuenciaSelect) {
            frecuenciaSelect.value = frecuencia
            frecuenciaSelect.addEventListener("change", actualizarCamposEstrategia)
        }

        const diaSemana = document.getElementById("estrategia-dia-semana")
        if (diaSemana) {
            diaSemana.value = String(
                esEdicion && frecuencia === "semanal" && estrategia.diaPreferido !== null
                    ? estrategia.diaPreferido
                    : 1
            )
            diaSemana.addEventListener("change", actualizarPreviewProxima)
        }

        const diaMes = document.getElementById("estrategia-dia-mes")
        if (diaMes) {
            diaMes.value = String(
                esEdicion && frecuencia === "mensual" && estrategia.diaPreferido
                    ? estrategia.diaPreferido
                    : 1
            )
            diaMes.addEventListener("input", actualizarPreviewProxima)
        }

        cuentaSelect?.addEventListener("change", () => {
            const moneda = cuentaSelect.selectedOptions?.[0]?.dataset?.moneda
            if (moneda && divisaSelect && !esEdicion) divisaSelect.value = moneda
        })

        actualizarCamposEstrategia()
    }, 200)
}

function obtenerDiaPreferidoEstrategia() {
    const frecuencia = document.getElementById("estrategia-frecuencia")?.value

    if (frecuencia === "semanal") {
        const valor = parseInt(document.getElementById("estrategia-dia-semana")?.value ?? "0", 10)
        return Number.isNaN(valor) ? null : valor
    }
    if (frecuencia === "mensual") {
        const valor = parseInt(document.getElementById("estrategia-dia-mes")?.value ?? "1", 10)
        return Number.isNaN(valor) ? null : valor
    }
    return null
}

function actualizarCamposEstrategia() {
    const frecuencia = document.getElementById("estrategia-frecuencia")?.value

    const grupoSemana = document.getElementById("estrategia-dia-semana-group")
    const grupoMes = document.getElementById("estrategia-dia-mes-group")

    if (grupoSemana) grupoSemana.hidden = frecuencia !== "semanal"
    if (grupoMes) grupoMes.hidden = frecuencia !== "mensual"

    actualizarPreviewProxima()
}

function actualizarPreviewProxima() {
    const preview = document.getElementById("estrategia-proxima-preview")
    if (!preview) return

    const frecuencia = document.getElementById("estrategia-frecuencia")?.value
    const diaPreferido = obtenerDiaPreferidoEstrategia()
    const proxima = calcularProximaEjecucion(frecuencia, diaPreferido, new Date())

    preview.textContent = formatearFechaEstrategia(proxima)
}

function formatearFechaEstrategia(fecha) {
    if (!fecha) return "Sin programar"

    const valor = fecha instanceof Date ? fecha : new Date(fecha)
    if (Number.isNaN(valor.getTime())) return "Sin programar"

    return valor.toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    })
}

// ============================================
// MOSTRAR GRÁFICO DE ACTIVO
// ============================================

export async function mostrarGraficoActivo(activoId, activo, posicion) {
    console.log("[INFO] Mostrando gráfico para:", activo?.simbolo || activoId)

    let datos
    try {
        // Usar el nuevo servicio de precios
        datos = await historialParaGrafico(uid, activo, 7)
    } catch (error) {
        console.warn("No se pudo obtener el historial:", error.message)
        datos = { labels: [], data: [] }
    }

    if (!datos || !Array.isArray(datos.data) || datos.data.length === 0) {
        mostrarNotificacion("info", "No hay historial de precios disponible para este activo")
        return
    }

    const html = `
        <div class="grafico-container">
            <canvas id="grafico-activo"></canvas>
        </div>
        <div class="grafico-info">
            <div class="grafico-nombre">${activo?.nombre || ""} (${activo?.simbolo || ""})</div>
            <div class="grafico-precio">${activo?.ultimoPrecio?.toFixed(2) || "0.00"}</div>
            <div class="grafico-periodo">Últimos 7 días</div>
        </div>
    `

    abrirModal({
        titulo: "Historial de precios",
        contenido: html,
        headerExtra: `
            <button type="button" class="modal-header-btn btn-actualizar-precio" title="Actualizar precio" aria-label="Actualizar precio">${icono("refresh-cw", 16)}</button>
            <button type="button" class="modal-header-btn danger btn-eliminar-posicion" title="Eliminar posición" aria-label="Eliminar posición">${icono("trash-2", 16)}</button>
        `,
        confirmText: "Cerrar",
        onConfirm: () => {
            destruirGrafico()
            return true
        },
        onCancel: () => {
            destruirGrafico()
        }
    })

    setTimeout(async () => {
        await crearGraficoEvolucionPrecio("grafico-activo", datos, {
            label: activo?.simbolo || "Precio",
            simbolo: activo?.simbolo || ""
        })

        document.querySelector(".btn-actualizar-precio")?.addEventListener("click", () => {
            abrirModalActualizarPrecio(activo, posicion)
        })

        document.querySelector(".btn-eliminar-posicion")?.addEventListener("click", () => {
            confirmarEliminarPosicion(posicion)
        })
    }, 150)
}

// ============================================
// ACTUALIZAR PRECIO (MANUAL o API)
// ============================================

function abrirModalActualizarPrecio(activo, posicion) {
    const nombre = activo?.nombre || "activo"
    const precioActual = activo?.ultimoPrecio || posicion?.precioPromedio || ""
    const esAuto = activo?.fuente === "api"

    const html = `
        <form class="form-movimiento">
            ${esAuto ? `
                <div class="modal-message">
                    <p class="modal-message-desc">
                        Este activo usa <strong>precio automático</strong>.
                        Puedes actualizarlo desde la API o ingresar un precio manual.
                    </p>
                </div>
            ` : ""}
            <div class="form-group">
                <label for="precio-manual">Nuevo precio (${nombre})</label>
                <input type="number" id="precio-manual" class="form-input" step="0.01" min="0.01" value="${precioActual}" placeholder="0.00" required>
            </div>
        </form>
    `

    abrirModal({
        titulo: "Actualizar precio",
        contenido: html,
        confirmText: "Guardar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            const precio = parseFloat(document.getElementById("precio-manual")?.value)

            if (!precio || precio <= 0) {
                mostrarNotificacion("error", "El precio debe ser mayor a 0")
                return false
            }

            try {
                await actualizarPrecioManual(uid, activo, precio)
                await cargarPosiciones()
                mostrarNotificacion("exito", "Precio actualizado correctamente")
                return true
            } catch (error) {
                console.error("Error actualizando precio:", error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })
}

// ============================================
// ELIMINAR POSICIÓN
// ============================================

function confirmarEliminarPosicion(posicion) {
    if (!posicion?.id) {
        mostrarNotificacion("error", "Posición no encontrada")
        return
    }

    abrirModal({
        titulo: "Eliminar posición",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    ¿Eliminar la posición de <strong>${posicion.activo?.nombre || posicion.activoId}</strong>
                    (${posicion.cantidad.toFixed(4)})?
                </p>
                <p class="modal-message-warning">
                    Solo se elimina la posición. Los movimientos de compra/venta
                    se conservan en tu historial.
                </p>
            </div>
        `,
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            try {
                const snapshot = { id: posicion.id, ...posicion.toFirestore() }
                await eliminarPosicion(uid, posicion.id)
                await cargarPosiciones()
                ofrecerDeshacer({
                    mensaje: "Posición eliminada. ¿Deshacer?",
                    restaurar: () => restaurarDocumento(uid, "posiciones", snapshot.id, snapshot),
                    alRestaurar: () => cargarPosiciones()
                })
                return true
            } catch (error) {
                console.error("Error eliminando posición:", error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })
}

// ============================================
// ACTUALIZAR RESUMEN
// ============================================

function actualizarResumen() {
    const valorTotal = document.getElementById("valor-total")
    const rendimientoTotal = document.getElementById("rendimiento-total")
    const totalPosiciones = document.getElementById("total-posiciones")

    if (valorTotal) {
        const divisa = posicionesData?.posiciones?.[0]?.divisa || "usd"
        valorTotal.textContent = formatearMontoConDivisa(posicionesData?.valorTotal || 0, divisa)
    }

    if (rendimientoTotal) {
        const divisaRaw = posicionesData?.posiciones?.[0]?.divisa || "usd"
        const ganancia = posicionesData?.gananciaTotal || 0
        const signo = ganancia >= 0 ? "+" : ""
        rendimientoTotal.textContent = `${signo}${formatearMontoConDivisa(Math.abs(ganancia), divisaRaw)}`
        rendimientoTotal.className = `resumen-valor ${ganancia >= 0 ? "positive" : "negative"}`
    }

    if (totalPosiciones) {
        totalPosiciones.textContent = posicionesData?.cantidad || 0
    }
}

// ============================================
// EVENTOS DEL SIDEBAR
// ============================================

function configurarEventos() {
    configurarEventosSeleccionGlobal()

    document.querySelectorAll("#sidebar button").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#sidebar button").forEach(b => b.classList.remove("act"))
            btn.classList.add("act")

            if (vistaActual === "estrategias") {
                cambiarVista("posiciones")
            }

            const filtro = btn.dataset.filtro
            const posiciones = posicionesData?.posiciones || []

            if (filtro === "todas") {
                renderizarPosiciones()
                return
            }

            const filtradas = posiciones.filter(p => p.activo?.tipo === filtro)
            const container = document.getElementById("lista-posiciones")
            if (!container) return

            if (filtradas.length === 0) {
                container.innerHTML = `<p class="lista-vacia">No hay posiciones de este tipo.</p>`
                return
            }

            // Podar ids de selección que quedaron fuera del filtro.
            const vivas = new Set(filtradas.map(p => p.id))
            seleccionadas = new Set([...seleccionadas].filter(id => vivas.has(id)))
            ordenSeleccion = ordenSeleccion.filter(id => vivas.has(id))

            container.innerHTML = filtradas.map(plantillaPosicion).join("")
            enlazarListaPosiciones(container)
        })
    })
}

// ============================================
// ACCIONES EXPORTADAS PARA LASTBAR
// ============================================

/**
 * Acción "Actualizar" desde el lastbar.
 * Refresca posiciones y, si hay activos automáticos, consulta la API.
 */
export async function actualizarPrecios() {
    iniciarCargaVisible()
    try {
        const posiciones = posicionesData?.posiciones || []
        const automaticos = posiciones.filter(p => p.activo?.fuente === "api")

        if (automaticos.length === 0) {
            await cargarPosiciones()
            mostrarNotificacion("exito", "Posiciones actualizadas")
            return
        }

        let actualizados = 0
        let errores = 0

        for (const posicion of automaticos) {
            try {
                await actualizarPrecioAutomatico(uid, posicion.activo)
                actualizados++
            } catch (error) {
                console.error(`Error actualizando ${posicion.activo?.simbolo}:`, error)
                errores++
            }
        }

        await cargarPosiciones()

        if (errores > 0) {
            mostrarNotificacion("error", `${actualizados} actualizados, ${errores} errores`)
        } else {
            mostrarNotificacion("exito", `${actualizados} precios actualizados`)
        }
    } finally {
        finalizarCargaVisible()
    }
}

// ============================================
// MODAL COMPRAR ACTIVO
// ============================================

export function abrirModalCompra() {
    const hoy = getFechaHoy()

    const html = `
        <form id="form-comprar" class="form-movimiento form-movimiento-grid">
            <div class="form-group">
                <label for="compra-simbolo">Símbolo del activo *</label>
                <input type="text" id="compra-simbolo" class="form-input" placeholder="Ej: VOO, BTC, AAPL" required>
            </div>
            <div class="form-group">
                <label for="compra-nombre">Nombre del activo (solo si es nuevo)</label>
                <input type="text" id="compra-nombre" class="form-input" placeholder="Ej: Vanguard S&P 500 ETF">
            </div>
            <div class="form-group">
                <label for="compra-tipo">Tipo (solo si es nuevo)</label>
                <select id="compra-tipo" class="form-input">
                    <option value="accion">Acción</option>
                    <option value="etf">ETF</option>
                    <option value="crypto">Cripto</option>
                </select>
            </div>
            <div class="form-group">
                <label for="compra-cantidad">Cantidad *</label>
                <input type="number" id="compra-cantidad" class="form-input" step="0.0001" min="0.0001" placeholder="0" required>
            </div>
            <div class="form-group">
                <label for="compra-precio">Precio unitario *</label>
                <input type="number" id="compra-precio" class="form-input" step="0.01" min="0.01" placeholder="0.00" required>
            </div>
            <div class="form-group">
                <label for="compra-comision">Comisión</label>
                <input type="number" id="compra-comision" class="form-input" step="0.01" min="0" placeholder="0.00" value="0">
            </div>
            <div class="form-group">
                <label for="compra-cuenta">Cuenta de origen *</label>
                <select id="compra-cuenta" class="form-input" required>
                    <option value="">Seleccionar cuenta</option>
                </select>
            </div>
            <div class="form-group">
                <label for="compra-fecha">Fecha</label>
                <div class="campo-fecha">
                    <input type="date" id="compra-fecha" class="form-input" value="${hoy}">
                    <button type="button" class="btn-calendario" aria-label="Abrir calendario">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-days preview-icon">
                            <path d="M8 2v4"/>
                            <path d="M16 2v4"/>
                            <rect width="18" height="18" x="3" y="4" rx="2"/>
                            <path d="M3 10h18"/>
                            <path d="M8 14h.01"/>
                            <path d="M12 14h.01"/>
                            <path d="M16 14h.01"/>
                            <path d="M8 18h.01"/>
                            <path d="M12 18h.01"/>
                            <path d="M16 18h.01"/>
                        </svg>
                    </button>
                </div>
            </div>
        </form>
    `

    abrirModal({
        titulo: "Comprar activo",
        contenido: html,
        confirmText: "Comprar",
        onConfirm: async () => {
            const simbolo = document.getElementById("compra-simbolo")?.value.trim().toUpperCase()
            const nombre = document.getElementById("compra-nombre")?.value.trim()
            const tipo = document.getElementById("compra-tipo")?.value || "accion"
            const cantidad = parseFloat(document.getElementById("compra-cantidad")?.value)
            const precio = parseFloat(document.getElementById("compra-precio")?.value)
            const comision = parseFloat(document.getElementById("compra-comision")?.value) || 0
            const cuentaEl = document.getElementById("compra-cuenta")
            const cuentaId = cuentaEl?.value
            const divisa = cuentaEl?.selectedOptions?.[0]?.dataset?.moneda || "usd"
            const fecha = document.getElementById("compra-fecha")?.value

            if (!simbolo) { mostrarNotificacion("error", "El símbolo del activo es obligatorio"); return false }
            if (!cantidad || cantidad <= 0) { mostrarNotificacion("error", "La cantidad debe ser mayor a 0"); return false }
            if (!precio || precio <= 0) { mostrarNotificacion("error", "El precio debe ser mayor a 0"); return false }
            if (!cuentaId) { mostrarNotificacion("error", "Selecciona una cuenta de origen"); return false }

            try {
                let activo = await buscarActivoPorSimbolo(uid, simbolo)
                if (!activo) {
                    if (!nombre) { mostrarNotificacion("error", "El nombre del activo es obligatorio para activos nuevos"); return false }
                    await crearActivo(uid, {
                        nombre,
                        simbolo,
                        tipo,
                        ultimoPrecio: precio
                    })
                    activo = await buscarActivoPorSimbolo(uid, simbolo)
                }

                const { registrarMovimiento } = await import("../services/MovimientoServicio.js")
                await registrarMovimiento(uid, "compraActivo", {
                    // Símbolo, no doc-ID: PosicionServicio resuelve por símbolo (bug #3)
                    activo: simbolo,
                    cuenta: cuentaId,
                    cantidad,
                    precio,
                    comision,
                    divisa,
                    fechaRealizacion: fecha ? parseFechaLocal(fecha) : new Date()
                })

                await cargarPosiciones()
                mostrarNotificacion("exito", "Compra registrada correctamente")
                return true
            } catch (error) {
                console.error("Error en compra:", error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })

    setTimeout(() => cargarCuentasEnSelect("compra-cuenta"), 200)
}

// ============================================
// MODAL VENDER ACTIVO
// ============================================

export function abrirModalVenta() {
    const posiciones = posicionesData?.posiciones || []
    if (posiciones.length === 0) {
        mostrarNotificacion("error", "No hay posiciones para vender")
        return
    }

    const options = posiciones.map(p => {
        const activo = p.activo
        return `<option value="${p.id}">${activo?.nombre || p.activoId} (${p.cantidad.toFixed(4)} disponibles)</option>`
    }).join("")

    const hoy = getFechaHoy()

    const html = `
        <form id="form-vender" class="form-movimiento form-movimiento-grid">
            <div class="form-group span-full">
                <label for="venta-posicion">Seleccionar posición *</label>
                <select id="venta-posicion" class="form-input" required>
                    <option value="">Seleccionar...</option>
                    ${options}
                </select>
            </div>
            <div class="form-group">
                <label for="venta-cantidad">Cantidad a vender *</label>
                <input type="number" id="venta-cantidad" class="form-input" step="0.0001" min="0.0001" placeholder="0" required>
            </div>
            <div class="form-group">
                <label for="venta-precio">Precio de venta *</label>
                <input type="number" id="venta-precio" class="form-input" step="0.01" min="0.01" placeholder="0.00" required>
            </div>
            <div class="form-group">
                <label for="venta-comision">Comisión</label>
                <input type="number" id="venta-comision" class="form-input" step="0.01" min="0" placeholder="0.00" value="0">
            </div>
            <div class="form-group">
                <label for="venta-cuenta">Cuenta de destino *</label>
                <select id="venta-cuenta" class="form-input" required>
                    <option value="">Seleccionar cuenta</option>
                </select>
            </div>
            <div class="form-group">
                <label for="venta-fecha">Fecha</label>
                <div class="campo-fecha">
                    <input type="date" id="venta-fecha" class="form-input" value="${hoy}">
                    <button type="button" class="btn-calendario" aria-label="Abrir calendario">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-days preview-icon">
                            <path d="M8 2v4"/>
                            <path d="M16 2v4"/>
                            <rect width="18" height="18" x="3" y="4" rx="2"/>
                            <path d="M3 10h18"/>
                            <path d="M8 14h.01"/>
                            <path d="M12 14h.01"/>
                            <path d="M16 14h.01"/>
                            <path d="M8 18h.01"/>
                            <path d="M12 18h.01"/>
                            <path d="M16 18h.01"/>
                        </svg>
                    </button>
                </div>
            </div>
        </form>
    `

    abrirModal({
        titulo: "Vender activo",
        contenido: html,
        confirmText: "Vender",
        onConfirm: async () => {
            const posicionId = document.getElementById("venta-posicion")?.value
            const cantidad = parseFloat(document.getElementById("venta-cantidad")?.value)
            const precio = parseFloat(document.getElementById("venta-precio")?.value)
            const comision = parseFloat(document.getElementById("venta-comision")?.value) || 0
            const cuentaId = document.getElementById("venta-cuenta")?.value
            const fecha = document.getElementById("venta-fecha")?.value

            if (!posicionId) { mostrarNotificacion("error", "Selecciona una posición"); return false }
            if (!cantidad || cantidad <= 0) { mostrarNotificacion("error", "La cantidad debe ser mayor a 0"); return false }
            if (!precio || precio <= 0) { mostrarNotificacion("error", "El precio debe ser mayor a 0"); return false }
            if (!cuentaId) { mostrarNotificacion("error", "Selecciona una cuenta de destino"); return false }

            try {
                const posicion = posiciones.find(p => p.id === posicionId)
                if (!posicion) { mostrarNotificacion("error", "Posición no encontrada"); return false }
                if (cantidad > posicion.cantidad) {
                    mostrarNotificacion("error", `No tienes suficientes unidades. Disponibles: ${posicion.cantidad.toFixed(4)}`)
                    return false
                }

                const { registrarMovimiento } = await import("../services/MovimientoServicio.js")
                await registrarMovimiento(uid, "ventaActivo", {
                    // Símbolo, no doc-ID: PosicionServicio resuelve por símbolo (bug #3)
                    activo: posicion.activo?.simbolo,
                    cuenta: cuentaId,
                    cantidad,
                    precio,
                    comision,
                    divisa: posicion.divisa || "usd",
                    fechaRealizacion: fecha ? parseFechaLocal(fecha) : new Date()
                })

                await cargarPosiciones()
                mostrarNotificacion("exito", "Venta registrada correctamente")
                return true
            } catch (error) {
                console.error("Error en venta:", error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })

    setTimeout(() => cargarCuentasEnSelect("venta-cuenta"), 200)
}

// ============================================
// MODAL BROKER
// ============================================

export function abrirModalBroker() {
    abrirModal({
        titulo: "Broker",
        contenido: `<p class="lista-vacia">Configuración de brokers (en desarrollo)</p>`,
        confirmText: "Cerrar"
    })
}

// ============================================
// UTILIDAD: Cargar cuentas en select
// ============================================

async function cargarCuentasEnSelect(selectId) {
    try {
        const cuentas = await obtenerCuentas(uid)
        const select = document.getElementById(selectId)
        if (!select) return

        const activas = cuentas.filter(c => c.estado !== "archivada" && c.tipo !== "credito")
        select.innerHTML = `
            <option value="">Seleccionar cuenta</option>
            ${activas.map(c => `
                <option value="${c.id}" data-moneda="${(c.moneda || "pen").toLowerCase()}">${c.nombre} (${c.moneda?.toUpperCase() || "PEN"})</option>
            `).join("")}
        `
    } catch (error) {
        console.error("Error cargando cuentas:", error)
    }
}