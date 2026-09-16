import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { db } from "../../firebase/firestore.js"
import { VERSION } from "../../constants/version.js"

// ============================================
// VERSION SERVICIO
// ============================================

export function getVersionLocal() {
    return VERSION
}

/**
 * Versión remota (desde Firestore, colección `config`).
 * Requiere que las reglas permitan `read` a autenticados.
 */
export async function getVersionRemota() {
    try {
        const ref = doc(db, "config", "version")
        const snap = await getDoc(ref)

        if (snap.exists()) {
            return snap.data()
        }
        return null
    } catch (error) {
        console.warn("No se pudo obtener la versión remota:", error)
        return null
    }
}

/**
 * Compara versiones. Devuelve `{ actualizada: true/false, nuevaVersion }`.
 */
export function compararVersiones(local, remota) {
    if (!remota) return { actualizada: true }
    if (local.numero === remota.numero) return { actualizada: true }
    return { actualizada: false, nuevaVersion: remota.numero }
}