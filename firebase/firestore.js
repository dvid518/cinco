import {
    getFirestore,
    doc,
    getDoc,
    getDocs,
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { app } from "./firebaseClient.js"

const db = getFirestore(app)
export { db }

// ============================================
// USUARIO
// ============================================

export async function obtenerUsuario(uid) {
    const referencia = doc(db, "usuarios", uid)
    const resultado = await getDoc(referencia)

    if (!resultado.exists()) return null

    return { id: resultado.id, ...resultado.data() }
}

// ============================================
// CUENTAS
// ============================================

export async function crearCuenta(uid, datos) {
    const referencia = collection(db, "usuarios", uid, "cuentas")
    return await addDoc(referencia, {
        ...datos,
        fechaCreacion: serverTimestamp()
    })
}

export async function obtenerCuentas(uid) {
    const referencia = collection(db, "usuarios", uid, "cuentas")
    const resultado = await getDocs(referencia)
    return resultado.docs.map(documento => ({
        id: documento.id,
        ...documento.data()
    }))
}

export async function obtenerCuenta(uid, cuentaId) {
    const referencia = doc(db, "usuarios", uid, "cuentas", cuentaId)
    const resultado = await getDoc(referencia)

    if (!resultado.exists()) return null

    return { id: resultado.id, ...resultado.data() }
}

export async function actualizarCuenta(uid, cuentaId, datos) {
    const referencia = doc(db, "usuarios", uid, "cuentas", cuentaId)
    return await updateDoc(referencia, datos)
}

export async function eliminarCuenta(uid, cuentaId) {
    const referencia = doc(db, "usuarios", uid, "cuentas", cuentaId)
    return await deleteDoc(referencia)
}

// ============================================
// MOVIMIENTOS
// ============================================

export async function crearMovimiento(uid, datos) {
    const referencia = collection(db, "usuarios", uid, "movimientos")
    return await addDoc(referencia, {
        ...datos,
        fechaRegistro: serverTimestamp()
    })
}

export async function obtenerMovimientos(uid) {
    const referencia = collection(db, "usuarios", uid, "movimientos")
    const resultado = await getDocs(referencia)
    return resultado.docs.map(documento => ({
        id: documento.id,
        ...documento.data()
    }))
}

// ============================================
// PREFERENCIAS DE USUARIO
// ============================================
// Usa dot notation para no pisar campos no tocados.
// Ejemplo: actualizarPreferencias(uid, { tema: 'dark' })
//          NO borra `divisaPrincipal`.
// ============================================

export async function obtenerPreferencias(uid) {
    const usuario = await obtenerUsuario(uid)
    if (!usuario) return null
    return usuario.preferencias || null
}

export async function actualizarPreferencias(uid, preferencias) {
    if (!preferencias || typeof preferencias !== "object") {
        throw new Error("Las preferencias deben ser un objeto")
    }

    const referencia = doc(db, "usuarios", uid)

    // Construimos un objeto con notación de punto para merge real
    const datosMerge = {}
    for (const [clave, valor] of Object.entries(preferencias)) {
        if (valor !== undefined) {
            datosMerge[`preferencias.${clave}`] = valor
        }
    }

    return await updateDoc(referencia, datosMerge)
}