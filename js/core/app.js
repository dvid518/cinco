import { observeAuth, startInactivityTimer, aplicarPersistenciaSesion } from "../../firebase/auth.js"
import { sesion } from "./sesion.js"
import { initRouter } from "./router.js"
import { obtenerPreferencias, asegurarCuentaEfectivoInicial } from "../../firebase/firestore.js"
import { initTemaLocal, sincronizarTemaFirestore } from "./tema.js"
import { initPWA } from "./pwa.js"
import { initDoodles } from "../ui/doodles.js"
import { configurarDelegacionLastbar } from "./lastbar.js"
import { configurarColapsoSidebar } from "../ui/colapsoSidebar.js"
import { iniciarDesvanecidoScrolls } from "../ui/scrollEdges.js"

let appInicializado = false
let bootFinalizado = false
let bootEnProgreso = false
let avisoBootVisible = false

// Aplicar tema ANTES de cualquier otra cosa (evita flash)
initTemaLocal()
initPWA()
iniciarDesvanecidoScrolls()

// Escincos doodles (solo el tap de 5 dedos; el spin del logo es de login/register)
initDoodles({ logoSpin: false })

export async function initApp() {
    if (bootEnProgreso) return
    bootEnProgreso = true

    // Timeout de seguridad: si en 5 s el arranque no termina,
    // se quita el .loading igualmente (evita pantalla negra).
    setTimeout(mostrarAvisoTimeout, 5000)

    observeAuth(async (user) => {
        if (bootFinalizado) return

        if (!user) {
            quitarCarga()
            window.location.replace("/login")
            return
        }

        sesion.setUsuario({
            uid: user.uid,
            email: user.email,
            nombre: user.displayName || "Usuario"
        })
        console.log("[INFO] Usuario autenticado:", user.uid)

        try {
            await asegurarCuentaEfectivoInicial(user.uid, user)
            const prefs = await obtenerPreferencias(user.uid)
            if (prefs) {
                sesion.setPreferencias(prefs)
                console.log("[INFO] Preferencias cargadas:", prefs)

                // Sincronizar tema local ↔ Firestore
                await sincronizarTemaFirestore(user.uid, prefs.tema)
            } else {
                console.log("[INFO] Sin preferencias guardadas, usando valores por defecto")
                // Sincronizar el tema local hacia Firestore
                await sincronizarTemaFirestore(user.uid, null)
            }
        } catch (error) {
            // Si cargar preferencias falla, continuar con los valores por defecto
            console.warn("[WARN] Error cargando preferencias:", error)
            sesion.setPreferencias({})
        }

        // Persistencia de sesión según preferencias.seg.cerrarAlCerrarPestana
        // (true = sessionStorage, false = localStorage).
        const seg = sesion.getPreferencias()?.seg || {}
        try {
            await aplicarPersistenciaSesion(seg.cerrarAlCerrarPestana !== false)
        } catch (error) {
            console.warn("[WARN] No se pudo aplicar la persistencia de sesión:", error)
        }

        try {
            if (!appInicializado) {
                appInicializado = true
                aplicarAparienciaInicial()
                initRouter("dashboard")
                startInactivityTimer()
                configurarDelegacionLastbar()
                configurarColapsoSidebar()
            }

            await new Promise(resolve => setTimeout(resolve, 50))
            finalizarBoot()
        } catch (error) {
            console.error("[ERROR] Error inicializando la app:", error)
            finalizarBoot()
            mostrarErrorBoot(error)
        }
    })
}

// ============================================
// APARIENCIA INICIAL (lastbar + navegación)
// ============================================
// Se aplica en cada arranque según preferencias, no solo al guardar.

function aplicarAparienciaInicial() {
    const prefs = sesion.getPreferencias()

    // Páginas visibles en el menú (bug de persistencia)
    const paginas = prefs.paginas || {}
    document.querySelectorAll(".nav-container a").forEach(link => {
        const page = link.dataset.page
        if (page && paginas[page] === false) {
            link.classList.add("nav-oculto")
        } else {
            link.classList.remove("nav-oculto")
        }
    })

    // El modo de la lastbar (siempre visible / auto-hide) se aplica en
    // router.js tras renderizar cada lastbar, leyendo localStorage.
}

// ============================================
// ARRANQUE · CONTROL DE LA PANTALLA DE CARGA
// ============================================

function quitarCarga() {
    document.body.classList.remove("loading")
}

function finalizarBoot() {
    if (bootFinalizado) return
    bootFinalizado = true
    quitarCarga()
    ocultarAvisoBoot()
}

function mostrarAvisoTimeout() {
    if (bootFinalizado) return
    console.warn("[WARN] La app tarda más de 5 s en arrancar. Se muestra la interfaz igualmente.")
    quitarCarga()
    mostrarAvisoBoot("La aplicación tardó demasiado en cargar. Si el problema persiste, recarga la página.")
}

function mostrarAvisoBoot(mensaje) {
    const contenido = document.getElementById("app-content")
    if (!contenido) return
    avisoBootVisible = true
    contenido.innerHTML = `
        <div class="lista-vacia" id="aviso-boot">
            <p>${mensaje}</p>
        </div>
    `
}

function ocultarAvisoBoot() {
    if (!avisoBootVisible) return
    avisoBootVisible = false
    document.getElementById("aviso-boot")?.remove()
}

function mostrarErrorBoot(error) {
    const contenido = document.getElementById("app-content")
    if (!contenido) return
    contenido.innerHTML = `
        <div class="lista-vacia error">
            <p>No se pudo cargar la aplicación.</p>
            <p class="lista-vacia-hint">${error?.message || "Error desconocido"}</p>
        </div>
    `
}

document.addEventListener("DOMContentLoaded", initApp)