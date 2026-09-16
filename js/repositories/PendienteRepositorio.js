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
    return resultado.id
}

export async function obtenerPendientes(uid, soloPendientes = true) {
    const referencia = collection(db, "usuarios", uid, "pendientes")
    let q = referencia
    
    if (soloPendientes) {
        q = query(referencia, where("pendiente", "==", true))
        // ⚠️ Temporalmente sin orderBy hasta que el índice esté listo
        // q = query(referencia, where("pendiente", "==", true), orderBy("fechaRegistro", "desc"))
    } else {
        q = query(referencia, orderBy("fechaRegistro", "desc"))
    }
    
    const resultado = await getDocs(q)
    
    const pendientes = resultado.docs.map(doc => {
        return Pendiente.fromFirestore(doc.id, doc.data())
    })
    
    // Ordenar en JavaScript si no usamos orderBy
    pendientes.sort((a, b) => {
        const fechaA = a.fechaRegistro?.toDate?.() || new Date(a.fechaRegistro)
        const fechaB = b.fechaRegistro?.toDate?.() || new Date(b.fechaRegistro)
        return fechaB - fechaA
    })
    
    return pendientes
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
    return await updateDoc(referencia, datos)
}

export async function eliminarPendiente(uid, pendienteId) {
    const referencia = doc(db, "usuarios", uid, "pendientes", pendienteId)
    return await deleteDoc(referencia)
}

export async function consolidarPendiente(uid, pendienteId, movimientoId) {
    const referencia = doc(db, "usuarios", uid, "pendientes", pendienteId)
    return await updateDoc(referencia, {
        pendiente: false,
        fechaConsolidacion: serverTimestamp()
    })
}