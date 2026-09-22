import {
    getFirestore,
    doc,
    getDoc,
    getDocs,
    collection,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { app } from "./firebaseClient.js"
import { cacheCapa } from "../js/core/cache.js"

const db = getFirestore(app)

// Re-exportamos utilidades de Firestore para que el resto de la app
// no importe desde la CDN directamente (punto único de acceso).
export { db, doc, updateDoc }

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
    const resultado = await addDoc(referencia, {
        ...datos,
        fechaCreacion: serverTimestamp()
    })
    cacheCapa.invalidar(uid, "cuentas")
    return resultado
}

export async function obtenerCuentas(uid) {
    return cacheCapa.obtener(uid, "cuentas", async () => {
        const referencia = collection(db, "usuarios", uid, "cuentas")
        const resultado = await getDocs(referencia)
        return resultado.docs.map(documento => ({
            id: documento.id,
            ...documento.data()
        }))
    })
}

export async function obtenerCuenta(uid, cuentaId) {
    const referencia = doc(db, "usuarios", uid, "cuentas", cuentaId)
    const resultado = await getDoc(referencia)

    if (!resultado.exists()) return null

    return { id: resultado.id, ...resultado.data() }
}

export async function actualizarCuenta(uid, cuentaId, datos) {
    const referencia = doc(db, "usuarios", uid, "cuentas", cuentaId)
    const resultado = await updateDoc(referencia, datos)
    cacheCapa.invalidar(uid, "cuentas")
    return resultado
}

export async function eliminarCuenta(uid, cuentaId) {
    const referencia = doc(db, "usuarios", uid, "cuentas", cuentaId)
    const resultado = await deleteDoc(referencia)
    cacheCapa.invalidar(uid, "cuentas")
    return resultado
}

// ============================================
// MOVIMIENTOS
// ============================================

export async function crearMovimiento(uid, datos) {
    const referencia = collection(db, "usuarios", uid, "movimientos")
    const resultado = await addDoc(referencia, {
        ...datos,
        fechaRegistro: serverTimestamp()
    })
    cacheCapa.invalidar(uid, "movimientos")
    return resultado
}

export async function obtenerMovimientos(uid) {
    return cacheCapa.obtener(uid, "movimientos", async () => {
        const referencia = collection(db, "usuarios", uid, "movimientos")
        const resultado = await getDocs(referencia)
        return resultado.docs.map(documento => ({
            id: documento.id,
            ...documento.data()
        }))
    })
}

export async function actualizarMovimientoDoc(uid, movimientoId, datos) {
    const referencia = doc(db, "usuarios", uid, "movimientos", movimientoId)
    const resultado = await updateDoc(referencia, datos)
    cacheCapa.invalidar(uid, "movimientos")
    return resultado
}

export async function eliminarMovimientoDoc(uid, movimientoId) {
    const referencia = doc(db, "usuarios", uid, "movimientos", movimientoId)
    const resultado = await deleteDoc(referencia)
    cacheCapa.invalidar(uid, "movimientos")
    return resultado
}

export async function restaurarDocumento(uid, coleccion, id, datos) {
    if (!datos || typeof datos !== "object") {
        throw new Error("No hay datos para restaurar")
    }
    const { id: _campoId, ...datosGuardados } = datos
    const referencia = doc(db, "usuarios", uid, coleccion, id)
    const resultado = await setDoc(referencia, datosGuardados)
    cacheCapa.invalidar(uid, coleccion)
    return resultado
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