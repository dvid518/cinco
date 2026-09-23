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
    serverTimestamp,
    writeBatch
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

export async function asegurarCuentaEfectivoInicial(uid, usuario = null) {
    if (!uid) return null

    const usuarioRef = doc(db, "usuarios", uid)
    const usuarioDoc = await getDoc(usuarioRef)
    if (!usuarioDoc.exists()) {
        await setDoc(usuarioRef, {
            email: usuario?.email || null,
            nombre: usuario?.displayName || usuario?.nombre || null,
            foto: usuario?.photoURL || null,
            fechaRegistro: serverTimestamp(),
            preferencias: {}
        })
    } else if (usuarioDoc.data().efectivoInicialCreado === true) {
        return null
    }

    const cuentas = await obtenerCuentas(uid)
    const tieneEfectivo = cuentas.some(c => c.tipo === "efectivo")

    if (tieneEfectivo) {
        await updateDoc(usuarioRef, { efectivoInicialCreado: true })
        return null
    }

    const referencia = doc(db, "usuarios", uid, "cuentas", "efectivo-inicial")
    const existente = await getDoc(referencia)
    if (!existente.exists()) {
        await setDoc(referencia, {
            nombre: "Efectivo",
            tipo: "efectivo",
            moneda: "pen",
            saldoInicial: 0,
            estado: "activa",
            esPatrimonio: true,
            orden: 0,
            fechaCreacion: serverTimestamp()
        })
    }

    await updateDoc(usuarioRef, { efectivoInicialCreado: true })
    cacheCapa.invalidar(uid, "cuentas")
    return referencia.id
}

export async function normalizarOrdenCuentas(uid, cuentas) {
    if (!uid || !cuentas.length || cuentas.every(c => Number.isFinite(Number(c.orden)))) return

    const ordenadas = cuentas.slice().sort((a, b) => {
        if (a.id === "efectivo-inicial") return -1
        if (b.id === "efectivo-inicial") return 1
        const fa = a.fechaCreacion?.toDate?.()?.getTime?.() || a.fechaCreacion?.seconds || 0
        const fb = b.fechaCreacion?.toDate?.()?.getTime?.() || b.fechaCreacion?.seconds || 0
        return fa - fb
    })

    const batch = writeBatch(db)
    ordenadas.forEach((cuenta, index) => {
        batch.update(doc(db, "usuarios", uid, "cuentas", cuenta.id), { orden: index })
    })
    await batch.commit()
    cacheCapa.invalidar(uid, "cuentas")
}

export async function reordenarCuentas(uid, cuentasOrdenados) {
    if (!uid || !Array.isArray(cuentasOrdenados)) return
    const batch = writeBatch(db)
    cuentasOrdenados.forEach((cuenta, index) => {
        batch.update(doc(db, "usuarios", uid, "cuentas", cuenta.id), { orden: index })
    })
    await batch.commit()
    cacheCapa.invalidar(uid, "cuentas")
}

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