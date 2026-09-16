// ============================================
// PWA · Registro del Service Worker
// ============================================

let registroSW = null

export function initPWA() {
    if (!("serviceWorker" in navigator)) {
        console.log("[PWA] Service Worker no soportado")
        return
    }

    window.addEventListener("load", registrarSW)
}

async function registrarSW() {
    try {
        registroSW = await navigator.serviceWorker.register("/sw.js", {
            scope: "/"
        })
        console.log("[PWA] SW registrado:", registroSW.scope)

        registroSW.addEventListener("updatefound", manejarActualizacion)
    } catch (error) {
        console.warn("[PWA] Error registrando SW:", error)
    }
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
    const aviso = document.createElement("div")
    aviso.className = "pwa-update-banner"
    aviso.innerHTML = `
        <span class="pwa-update-texto">Hay una nueva versión disponible</span>
        <button class="pwa-update-btn" type="button" id="pwa-update-btn">Actualizar</button>
    `
    document.body.appendChild(aviso)

    document.getElementById("pwa-update-btn")?.addEventListener("click", () => {
        if (registroSW?.waiting) {
            registroSW.waiting.postMessage({ tipo: "SKIP_WAITING" })
        }
        setTimeout(() => window.location.reload(), 200)
    })
}