import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { db } from "../../firebase/firestore.js"

// ============================================
// TEMA
// ============================================
// Valores posibles: 'dark' | 'light' | 'system'
// Persistencia:
//   - localStorage  → aplicación inmediata antes de auth
//   - Firestore     → sincronización entre dispositivos
//
// FAVICON: se decide por CSS con <link media="(prefers-color-scheme: ...)">,
// que responde al tema del SISTEMA OPERATIVO, no al de la app.
// Por eso aquí ya NO se manipulan los <link> del favicon.
// ============================================

const STORAGE_KEY = "cinco_tema"
const MEDIA_QUERY = "(prefers-color-scheme: dark)"

let mediaListenerActivo = false

// --------------------------------------------
// APLICAR TEMA EN EL DOM
// --------------------------------------------

function temaEfectivo(tema) {
    if (tema === "system") {
        return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light"
    }
    return tema === "light" ? "light" : "dark"
}

export function aplicarTema(tema) {
    const efectivo = temaEfectivo(tema)
    document.documentElement.setAttribute("data-theme", efectivo)

    const themeColor = document.querySelector('meta[name="theme-color"]')
    if (themeColor) {
        themeColor.setAttribute("content", efectivo === "dark" ? "#141414" : "#cfcfcf")
    }
}


// --------------------------------------------
// LEER / ESCRIBIR EN LOCALSTORAGE
// --------------------------------------------

export function getTemaLocal() {
    try {
        const tema = localStorage.getItem(STORAGE_KEY)
        if (tema === "dark" || tema === "light" || tema === "system") {
            return tema
        }
    } catch (e) {
        // Ignorar errores de storage
    }
    return "dark" // valor por defecto
}

export function setTemaLocal(tema) {
    try {
        localStorage.setItem(STORAGE_KEY, tema)
    } catch (e) {
        // Ignorar errores de storage
    }
}

// --------------------------------------------
// LISTENER DE "SYSTEM"
// --------------------------------------------

function activarListenerSystem() {
    if (mediaListenerActivo) return
    mediaListenerActivo = true

    const mq = window.matchMedia(MEDIA_QUERY)
    mq.addEventListener("change", () => {
        if (getTemaLocal() === "system") {
            aplicarTema("system")
        }
    })
}

// --------------------------------------------
// INICIALIZACIÓN (arranque)
// --------------------------------------------

/**
 * Aplica el tema guardado en localStorage SIN esperar a Firebase.
 * Se llama antes de que se muestre el body.
 */
export function initTemaLocal() {
    const tema = getTemaLocal()
    aplicarTema(tema)
    activarListenerSystem()
}

/**
 * Sincroniza con Firestore: si el usuario tiene tema guardado,
 * lo aplica y lo deja en localStorage. Si no, guarda el local.
 */
export async function sincronizarTemaFirestore(uid, temaRemoto) {
    if (!uid) return

    if (temaRemoto === "dark" || temaRemoto === "light" || temaRemoto === "system") {
        setTemaLocal(temaRemoto)
        aplicarTema(temaRemoto)
    } else {
        // No hay tema remoto → subir el local para no perderlo
        try {
            await guardarTemaFirestore(uid, getTemaLocal())
        } catch (error) {
            console.warn("No se pudo sincronizar el tema:", error)
        }
    }
}

// --------------------------------------------
// GUARDAR EN FIRESTORE
// --------------------------------------------

export async function guardarTemaFirestore(uid, tema) {
    if (!uid) throw new Error("uid requerido")
    if (!["dark", "light", "system"].includes(tema)) {
        throw new Error(`Tema inválido: ${tema}`)
    }

    const referencia = doc(db, "usuarios", uid)
    await updateDoc(referencia, {
        "preferencias.tema": tema
    })
}

// --------------------------------------------
// CAMBIO COMPLETO (local + Firestore + DOM)
// --------------------------------------------

export async function cambiarTema(uid, tema) {
    setTemaLocal(tema)
    aplicarTema(tema)

    if (uid) {
        try {
            await guardarTemaFirestore(uid, tema)
        } catch (error) {
            console.warn("Tema aplicado localmente, pero falló guardar en Firestore:", error)
            throw error
        }
    }
}

