import { icono } from "../core/iconos.js"

// ============================================
// NOTIFICACIONES
// ============================================
// Uso: mostrarNotificacion("exito", "Cambios guardados")
// Tipos: exito | error | info | warning
// Se apilan en un contenedor fijo y se autoeliminan.

const TIPOS = {
    exito:   { icono: "check",        clase: "exito" },
    error:   { icono: "x-circle",     clase: "error" },
    info:    { icono: "info",         clase: "info" },
    warning: { icono: "alert-triangle", clase: "warning" }
}

let contenedorInyectado = false
const activas = new Map()

function obtenerContenedor() {
    let contenedor = document.querySelector(".notificaciones-container")
    if (!contenedor) {
        contenedor = document.createElement("div")
        contenedor.className = "notificaciones-container"
        contenedor.setAttribute("aria-live", "polite")
        contenedorInyectado = true
        document.body.appendChild(contenedor)
    }
    return contenedor
}

function limpiarContenedorVacio() {
    const contenedor = document.querySelector(".notificaciones-container")
    if (!contenedor) return
    if (contenedor.childElementCount === 0 && contenedorInyectado) {
        contenedor.remove()
        contenedorInyectado = false
    }
}

/**
 * Muestra una notificación transitoria.
 * @param {("exito"|"error"|"info"|"warning")} tipo
 * @param {string} mensaje
 * @param {number} [duracion=3000] ms. 0 = no se autoelimina.
 * @param {{texto: string, alClick: Function}|null} [accion] botón opcional.
 * @returns {Function} función para cerrarla manualmente.
 */
export function mostrarNotificacion(tipo = "info", mensaje, duracion = 3000, accion = null) {
    if (!mensaje) return

    const config = TIPOS[tipo] || TIPOS.info
    const contenedor = obtenerContenedor()
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

    const notificacion = document.createElement("div")
    notificacion.className = `notificacion notificacion-${config.clase}`
    notificacion.dataset.id = id
    notificacion.innerHTML = `
        <span class="notificacion-icono">${icono(config.icono, 20)}</span>
        <span class="notificacion-mensaje"></span>
        ${accion ? `
            <button type="button" class="notificacion-accion">${accion.texto}</button>
        ` : ""}
        <button type="button" class="notificacion-cerrar" aria-label="Cerrar notificación">${icono("x", 16)}</button>
    `
    notificacion.querySelector(".notificacion-mensaje").textContent = mensaje

    contenedor.appendChild(notificacion)

    // Forzar reflow para disparar la animación de entrada
    requestAnimationFrame(() => notificacion.classList.add("notificacion-activa"))

    const cerrar = () => {
        if (!notificacion.isConnected) return
        activas.delete(id)
        notificacion.classList.remove("notificacion-activa")
        notificacion.classList.add("notificacion-saliendo")
        setTimeout(() => {
            notificacion.remove()
            limpiarContenedorVacio()
        }, 250)
    }

    notificacion.querySelector(".notificacion-cerrar").addEventListener("click", cerrar)

    if (accion) {
        notificacion.querySelector(".notificacion-accion").addEventListener("click", async () => {
            try {
                await accion.alClick()
            } finally {
                cerrar()
            }
        })
    }

    let timer = null
    if (duracion > 0) {
        timer = setTimeout(() => {
            activas.delete(id)
            cerrar()
        }, duracion)
    }

    activas.set(id, { notificacion, cerrar, timer })

    // Gesto swipe horizontal para descartar en táctil
    manejarSwipe(notificacion)

    return cerrar
}

/** Cierra todas las notificaciones visibles. */
export function cerrarNotificaciones() {
    for (const { cerrar } of activas.values()) {
        cerrar()
    }
    activas.clear()
}

// ============================================
// GESTO SWIPE HORIZONTAL PARA DESCARTAR
// ============================================
// Durante el arrastre se expone la variable CSS --desplazamiento
// (el CSS la usa para el transform). Al superar 50px se cierra la
// notificación. Una sola versión, sin duplicados.

function manejarSwipe(notificacionElemento) {
    if (!notificacionElemento) return

    let inicioX = 0
    let arrastreActivo = false
    const id = notificacionElemento.dataset.id

    notificacionElemento.addEventListener("pointerdown", (e) => {
        inicioX = e.clientX
        arrastreActivo = true
    })

    notificacionElemento.addEventListener("pointermove", (e) => {
        if (!arrastreActivo) return
        const desplazamiento = e.clientX - inicioX
        notificacionElemento.style.setProperty("--desplazamiento", `${desplazamiento}px`)
    })

    notificacionElemento.addEventListener("pointerup", (e) => {
        if (!arrastreActivo) return
        arrastreActivo = false
        notificacionElemento.style.removeProperty("--desplazamiento")

        const deltaX = Math.abs(e.clientX - inicioX)
        if (deltaX > 50) {
            const entrada = activas.get(id)
            if (entrada) entrada.cerrar()
        }
    })

    notificacionElemento.addEventListener("pointercancel", () => {
        arrastreActivo = false
        notificacionElemento.style.removeProperty("--desplazamiento")
    })
}