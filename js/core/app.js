import { observeAuth, startInactivityTimer } from "../../firebase/auth.js"
import { sesion } from "./sesion.js"
import { initRouter, getPaginaActual } from "./router.js"
import { obtenerPreferencias } from "../../firebase/firestore.js"
import { initTemaLocal, sincronizarTemaFirestore } from "./tema.js"
import { initPWA } from "./pwa.js"
import { abrirModal, cerrarModal } from "../ui/modal.js"

let appInicializado = false
let bootFinalizado = false
let bootEnProgreso = false
let avisoBootVisible = false

// Aplicar tema ANTES de cualquier otra cosa (evita flash)
initTemaLocal()
initPWA()

export async function initApp() {
    if (bootEnProgreso) return
    bootEnProgreso = true

    // ⏰ Timeout de seguridad: si en 5 s el arranque no termina,
    // se quita el .loading igualmente (evita pantalla negra).
    setTimeout(mostrarAvisoTimeout, 5000)

    observeAuth(async (user) => {
        if (bootFinalizado) return

        if (!user) {
            quitarCarga()
            window.location.replace("/login.html")
            return
        }

        sesion.setUsuario({
            uid: user.uid,
            email: user.email,
            nombre: user.displayName || "Usuario"
        })
        console.log("[INFO] Usuario autenticado:", user.uid)

        try {
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
            // ❌ Si cargar preferencias falla, continuar con los valores por defecto
            console.warn("[WARN] Error cargando preferencias:", error)
            sesion.setPreferencias({})
        }

        try {
            if (!appInicializado) {
                appInicializado = true
                initRouter("dashboard")
                startInactivityTimer()
                configurarDelegacionLastbar()
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
            <span class="lista-vacia-icon">⏳</span>
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
            <span class="lista-vacia-icon">⚠️</span>
            <p>No se pudo cargar la aplicación.</p>
            <p class="lista-vacia-hint">${error?.message || "Error desconocido"}</p>
        </div>
    `
}

// ============================================
// DELEGACIÓN CENTRAL DE LA LASTBAR
// ============================================
// Un único listener delegado en #app-footer que sobrevive a los re-renders
// de footer.innerHTML al navegar. Usa el texto del <span> para identificar
// el botón y `getPaginaActual()` para el contexto de la página activa.
// ============================================

function configurarDelegacionLastbar() {
    const footer = document.getElementById("app-footer")
    if (!footer) return

    footer.addEventListener("click", async (e) => {
        const item = e.target.closest(".lastbar .item")
        if (!item) return

        const span = item.querySelector("span")
        if (!span) return

        const texto = span.textContent.trim()
        const pagina = getPaginaActual()
        const manejador = MAPA_ACCIONES[texto]

        if (!manejador) {
            console.warn(`[WARN] Sin manejador para lastbar: "${texto}"`)
            return
        }

        try {
            await manejador(pagina)
        } catch (error) {
            console.error(`[ERROR] Error en lastbar "${texto}":`, error)
        }
    })
}

// ============================================
// MAPA DE ACCIONES POR TEXTO
// ============================================
// Cada función recibe `pagina` (string) como argumento opcional.
// La importación dinámica cachea el módulo para no re-descargar.
// ============================================

const MAPA_ACCIONES = {
    // ── GLOBAL ──
    "Pendientes": async () => {
        const { mostrarPendientes } = await import("../ui/pendientes.js")
        await mostrarPendientes()
    },

    "Cerrar sesión": async () => {
        const { abrirModalLogout } = await import("../pages/configuracion.js")
        abrirModalLogout()
    },

    // ── DASHBOARD / MOVIMIENTOS ──
    "Movimiento": async () => {
        const { abrirSelectorTipoMovimiento } = await import("../pages/movimientos.js")
        abrirSelectorTipoMovimiento()
    },

    "Extracto": async () => {
        await accionExportar()
    },

    // ── DASHBOARD (Actualizar) ──
    "Actualizar": async (pagina) => {
        switch (pagina) {
            case "dashboard": {
                const m = await import("../pages/dashboard.js")
                await m.recargarDatos()
                break
            }
            case "inversiones": {
                const m = await import("../pages/inversiones.js")
                await m.cargarPosiciones()
                break
            }
            case "trading": {
                const m = await import("../pages/trading.js")
                await m.cargarTrades()
                break
            }
            default:
                console.warn(`"Actualizar" no implementado para la página "${pagina}"`)
        }
    },

    // ── CUENTAS ──
    "Cuenta": async () => {
        const { abrirModalCrearCuenta } = await import("../pages/cuentas.js")
        abrirModalCrearCuenta()
    },

    "Editar": async () => {
        const { editarCuentaSeleccionada } = await import("../pages/cuentas.js")
        editarCuentaSeleccionada()
    },

    "Archivar": async () => {
        const { archivarCuentaSeleccionada } = await import("../pages/cuentas.js")
        archivarCuentaSeleccionada()
    },

    // ── INVERSIONES ──
    "Comprar": async () => {
        const { abrirModalCompra } = await import("../pages/inversiones.js")
        abrirModalCompra()
    },

    "Vender": async () => {
        const { abrirModalVenta } = await import("../pages/inversiones.js")
        abrirModalVenta()
    },

    "Broker": async (pagina) => {
        const modulo = await import(
            pagina === "trading"
                ? "../pages/trading.js"
                : "../pages/inversiones.js"
        )
        modulo.abrirModalBroker()
    },

    "Exportar": async () => {
        await accionExportar()
    },

    // ── TRADING ──
    "Largo": async () => {
        const { abrirModalNuevoTrade } = await import("../pages/trading.js")
        abrirModalNuevoTrade("long")
    },

    "Corto": async () => {
        const { abrirModalNuevoTrade } = await import("../pages/trading.js")
        abrirModalNuevoTrade("short")
    },

    // ── CONFIGURACIÓN ──
    "Guardar": async () => {
        const { guardarDesdeLastbar } = await import("../pages/configuracion.js")
        guardarDesdeLastbar()
    },

    "Restaurar": async () => {
        const { restaurarDesdeLastbar } = await import("../pages/configuracion.js")
        restaurarDesdeLastbar()
    }
}

// ============================================
// EXPORTAR / EXTRACTO (reutilizable)
// ============================================

async function accionExportar() {
    const uid = sesion.uid
    if (!uid) return

    abrirModal({
        titulo: "📥 Exportando respaldo",
        contenido: `
            <div class="modal-loading">
                <div class="loading-spinner"></div>
                <p class="modal-loading-text">Preparando archivo .dvid...</p>
            </div>
        `,
        variante: "narrow",
        confirmText: null,
        cancelText: null
    })

    try {
        const { exportarDVID } = await import("../services/ExportarServicio.js")
        const resultado = await exportarDVID(uid)
        cerrarModal()

        setTimeout(() => {
            abrirModal({
                titulo: "✅ Respaldo exportado",
                contenido: `
                    <div class="modal-message">
                        <div class="modal-message-icon">📦</div>
                        <p class="modal-message-title">${resultado.archivo}</p>
                        <p class="modal-message-desc">
                            El archivo se ha descargado correctamente.<br>
                            Guárdalo en un lugar seguro.
                        </p>
                    </div>
                `,
                variante: "info",
                confirmText: "Entendido",
                onConfirm: () => true
            })
        }, 100)
    } catch (error) {
        console.error("Error exportando:", error)
        cerrarModal()

        setTimeout(() => {
            abrirModal({
                titulo: "❌ Error al exportar",
                contenido: `
                    <div class="modal-message">
                        <div class="modal-message-icon">⚠️</div>
                        <p class="modal-message-error">${error.message}</p>
                    </div>
                `,
                variante: "info",
                confirmText: "Cerrar",
                onConfirm: () => true
            })
        }, 100)
    }
}

document.addEventListener("DOMContentLoaded", initApp)