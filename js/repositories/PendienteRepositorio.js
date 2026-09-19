import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { db } from "../../firebase/firestore.js"
import { Pendiente } from "../models/Pendiente.js"
import { cacheCapa } from "../core/cache.js"

// ============================================
// PENDIENTE REPOSITORIO
// ============================================

export async function crearPendiente(uid, datos) {
    const referencia = collection(db, "usuarios", uid, "pendientes")
    const resultado = await addDoc(referencia, {
        ...datos,
        fechaRegistro: serverTimestamp(),
        pendiente: true
    })
    cacheCapa.invalidarPrefijo(uid, "pendientes")
    return resultado.id
}

export async function obtenerPendientes(uid, soloPendientes = true) {
    return cacheCapa.obtener(
        uid,
        `pendientes:${soloPendientes}`,
        async () => {
            const referencia = collection(db, "usuarios", uid, "pendientes")
            let q = referencia
            
            if (soloPendientes) {
                q = query(referencia, where("pendiente", "==", true), orderBy("fechaRegistro", "desc"))
            } else {
                q = query(referencia, orderBy("fechaRegistro", "desc"))
            }
            
            const resultado = await getDocs(q)
            
            const pendientes = resultado.docs.map(doc => {
                return Pendiente.fromFirestore(doc.id, doc.data())
            })
            
            return pendientes
        }
    )
}

export async function obtenerPendiente(uid, pendienteId) {
    const referencia = doc(db, "usuarios", uid, "pendientes", pendienteId)
    const resultado = await getDoc(referencia)
    
    if (!resultado.exists()) {
        return null
    }
    
    return Pendiente.fromFirestore(resultado.id, resultado.data())
}

export async function actualizarPendiente(uid, pendienteId, datos) {
    const referencia = doc(db, "usuarios", uid, "pendientes", pendienteId)
    const resultado = await updateDoc(referencia, datos)
    cacheCapa.invalidarPrefijo(uid, "pendientes")
    return resultado
}

export async function eliminarPendiente(uid, pendienteId) {
    const referencia = doc(db, "usuarios", uid, "pendientes", pendienteId)
    const resultado = await deleteDoc(referencia)
    cacheCapa.invalidarPrefijo(uid, "pendientes")
    return resultado
}

export async function consolidarPendiente(uid, pendienteId, movimientoId) {
    const referencia = doc(db, "usuarios", uid, "pendientes", pendienteId)
    const datos = {
        pendiente: false,
        fechaConsolidacion: serverTimestamp()
    }
    if (movimientoId) {
        datos.movimientoId = movimientoId
    }
    const resultado = await updateDoc(referencia, datos)
    cacheCapa.invalidarPrefijo(uid, "pendientes")
    return resultado
}