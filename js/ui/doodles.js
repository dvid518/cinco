import { cambiarTema, nombreModoTema } from "../core/tema.js"
import { sesion } from "../core/sesion.js"
import { mostrarNotificacion } from "./notificaciones.js"

// ============================================
// ESCINCOS DOODLES · EASTER EGGS
// ============================================
// Pequeños easter eggs ocultos. Funcionan SIEMPRE (independientemente de la
// preferencia "Habilitar escindos doodles", que se registra en accesibilidad).
//
//  · Tap con 5 dedos → alterna entre tema claro y oscuro.
//  · Clic en el logotipo "cinco" (login / register) → clase .spin (toggle).
// ============================================

let inicializado = false

export function initDoodles(opciones = {}) {
    if (inicializado) return
    inicializado = true

    activarDoodleCincoDedos()
    if (opciones.logoSpin) {
        activarDoodleGiroLogo()
    }
}

// --------------------------------------------
// DOODLE · TAP CON 5 DEDOS → CAMBIAR TEMA
// --------------------------------------------

const dedosActivos = new Set()
let cincoDedosListos = false

function activarDoodleCincoDedos() {
    document.addEventListener("touchstart", manejarTouches, { passive: true })
    document.addEventListener("touchend", manejarTouches, { passive: true })
    document.addEventListener("touchcancel", manejarTouches, { passive: true })
}

function manejarTouches(evento) {
    for (const touch of evento.changedTouches) {
        if (evento.type === "touchstart") {
            dedosActivos.add(touch.identifier)
        } else {
            dedosActivos.delete(touch.identifier)
        }
    }

    if (dedosActivos.size >= 5) {
        cincoDedosListos = true
        console.log("[DOODLE] 5 dedos detectados", { dedosActivos: dedosActivos.size })
    }

    if (cincoDedosListos && dedosActivos.size === 0) {
        cincoDedosListos = false
        ciclarTemaDoodle()
    }
}

async function ciclarTemaDoodle() {
    try {
        const actual = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"
        const siguiente = actual === "light" ? "dark" : "light"
        const tema = await cambiarTema(sesion.uid, siguiente)
        mostrarNotificacion("exito", nombreModoTema(tema))
    } catch (error) {
        console.error("[ERROR] No se pudo cambiar el tema con el doodle:", error)
        mostrarNotificacion("error", "No se pudo cambiar el tema")
    }
}

// --------------------------------------------
// DOODLE · LOGOTIPO "CINCO" → CLASE .spin
// --------------------------------------------
// Clic en el logo (login / register): aplica .spin. Clic de nuevo: la quita.

function activarDoodleGiroLogo() {
    const logo = document.getElementById("logo")
    if (!logo) return

    logo.addEventListener("click", () => {
        logo.classList.toggle("spin")
    })
}