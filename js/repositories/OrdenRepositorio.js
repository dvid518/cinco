import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { db } from "../../firebase/firestore.js"
import { Orden, ESTADOS_ORDEN } from "../models/Orden.js"
import { cacheCapa } from "../core/cache.js"

// ============================================
// ORDEN REPOSITORIO (por usuario)
// ============================================
// Ruta: usuarios/{uid}/ordenes/{ordenId}
// ============================================

const CLAVE_CACHE = "ordenes"

function refOrdenes(uid) {
    return collection(db, "usuarios", uid, "ordenes")
}

// --------------------------------------------
// CREAR
// --------------------------------------------

export async function crearOrden(uid, datos) {
    const orden = new Orden(datos)
    orden.validar()

    const resultado = await addDoc(refOrdenes(uid), {
        ...orden.toFirestore(),
        fechaCreacion: serverTimestamp()
    })
    cacheCapa.invalidar(uid, CLAVE_CACHE)

    return resultado.id
}

// --------------------------------------------
// LEER
// --------------------------------------------

export async function obtenerOrdenes(uid) {
    return cacheCapa.obtener(uid, CLAVE_CACHE, async () => {
        const q = query(refOrdenes(uid), orderBy("fechaCreacion", "desc"))
        const resultado = await getDocs(q)

        return resultado.docs.map(documento => {
            return Orden.fromFirestore(documento.id, documento.data())
        })
    })
}

export async function obtenerOrden(uid, ordenId) {
    if (!ordenId) return null

    const referencia = doc(db, "usuarios", uid, "ordenes", ordenId)
    const resultado = await getDoc(referencia)

    if (!resultado.exists()) {
        return null
    }

    return Orden.fromFirestore(resultado.id, resultado.data())
}

// --------------------------------------------
// ACTUALIZAR
// --------------------------------------------

export async function actualizarOrden(uid, ordenId, datos) {
    const referencia = doc(db, "usuarios", uid, "ordenes", ordenId)
    const resultado = await updateDoc(referencia, { ...datos })
    cacheCapa.invalidar(uid, CLAVE_CACHE)

    return resultado
}

export async function marcarOrdenEjecutada(uid, ordenId, tradeId, precioEjecucion) {
    const referencia = doc(db, "usuarios", uid, "ordenes", ordenId)
    const resultado = await updateDoc(referencia, {
        estado: ESTADOS_ORDEN.EJECUTADA,
        tradeId,
        precioEjecucion,
        fechaEjecucion: serverTimestamp()
    })
    cacheCapa.invalidar(uid, CLAVE_CACHE)

    return resultado
}

// --------------------------------------------
// ELIMINAR
// --------------------------------------------

export async function eliminarOrden(uid, ordenId) {
    const referencia = doc(db, "usuarios", uid, "ordenes", ordenId)
    const resultado = await deleteDoc(referencia)
    cacheCapa.invalidar(uid, CLAVE_CACHE)

    return resultado
}
