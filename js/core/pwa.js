import { mostrarNotificacion } from "../ui/notificaciones.js"

// ============================================
// PWA · Registro del Service Worker
// ============================================

const INTERVALO_COMPROBACION_MINUTOS = 60

let registroSW = null
let avisoMostrado = false
let intervaloComprobacion = null

export function initPWA() {
    if (!("serviceWorker" in navigator)) {
        console.log("[PWA] Service Worker no soportado")
        return
    }

    if (esEntornoDeDesarrollo()) {
        console.log("[PWA] SW no registrado en desarrollo (localhost / 127.0.0.1)")
        limpiarSWEnDesarrollo()
        return
    }

    window.addEventListener("load", registrarSW)
}

// Evita el SW pegado en desarrollo comprobando el host local
function esEntornoDeDesarrollo() {
    const host = window.location.hostname
    return host === "localhost" || host === "127.0.0.1"
}

// Elimina un SW viejo que haya quedado registrado de sesiones anteriores
async function limpiarSWEnDesarrollo() {
    try {
        const registracion = await navigator.serviceWorker.getRegistration()
        if (!registracion) return

        await registracion.unregister()
        console.log("[PWA] SW antiguo eliminado en desarrollo")

        // Recargar una sola vez para soltar el control del SW viejo
        if (navigator.serviceWorker.controller) {
            window.location.reload()
        }
    } catch (error) {
        console.warn("[PWA] No se pudo limpiar el SW en desarrollo:", error)
    }
}

async function registrarSW() {
    try {
        registroSW = await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
            type: "module"
        })
        console.log("[PWA] SW registrado:", registroSW.scope)

        // Forzar comprobación de actualización en cada carga
        registroSW.update().catch(err => console.warn("[PWA] update()", err))

        registroSW.addEventListener("updatefound", manejarActualizacion)

        programarComprobacionPeriodica()
    } catch (error) {
        console.warn("[PWA] Error registrando SW:", error)
    }
}

// Comprueba actualizaciones mientras la app sigue abierta
function programarComprobacionPeriodica() {
    if (intervaloComprobacion) return

    intervaloComprobacion = setInterval(() => {
        if (!registroSW) return
        registroSW.update().catch(err => console.warn("[PWA] update() periódico:", err))
    }, INTERVALO_COMPROBACION_MINUTOS * 60 * 1000)
}

function manejarActualizacion() {
    const nuevoSW = registroSW.installing
    if (!nuevoSW) return

    nuevoSW.addEventListener("statechange", () => {
        if (nuevoSW.state === "installed" && navigator.serviceWorker.controller) {
            console.log("[PWA] Nueva versión disponible")
            mostrarAvisoActualizacion()
        }
    })
}

function mostrarAvisoActualizacion() {
    if (avisoMostrado) return
    avisoMostrado = true

    mostrarNotificacion("info", "Hay una nueva versión disponible", 0, {
        texto: "Actualizar",
        alClick: () => {
            const swEnEspera = registroSW?.waiting

            // Sin SW en espera → recargar directamente
            if (!swEnEspera) {
                window.location.reload()
                return
            }

            // Escuchar el cambio de control ANTES de pedir el skipWaiting,
            // así la recarga se hace con el SW nuevo ya al mando
            navigator.serviceWorker.addEventListener("controllerchange", () => {
                window.location.reload()
            }, { once: true })

            // Red de seguridad por si no llega a dispararse controllerchange
            setTimeout(() => window.location.reload(), 5000)

            swEnEspera.postMessage({ tipo: "SKIP_WAITING" })
        }
    })
}