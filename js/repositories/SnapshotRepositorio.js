import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    query,
    orderBy,
    limit,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { db } from "../../firebase/firestore.js"
import { getFechaHoy } from "../core/fechas.js"

// ============================================
// SNAPSHOT REPOSITORIO
// ============================================

// ============================================
// GUARDAR SNAPSHOT DEL DÍA (crea o actualiza)
// ============================================

export async function guardarSnapshotDelDia(uid, datos) {
    const fecha = getFechaHoy()
    const referencia = doc(db, "usuarios", uid, "snapshots", fecha)
    
    const existente = await getDoc(referencia)
    
    if (existente.exists()) {
        await setDoc(referencia, {
            ...datos,
            actualizacion: serverTimestamp()
        }, { merge: true })
    } else {
        await setDoc(referencia, {
            ...datos,
            cerrado: false,
            actualizacion: serverTimestamp()
        })
    }
    
    return fecha
}

// ============================================
// CERRAR SNAPSHOT DEL DÍA
// ============================================

export async function cerrarSnapshotDelDia(uid) {
    const fecha = getFechaHoy()
    const referencia = doc(db, "usuarios", uid, "snapshots", fecha)
    await setDoc(referencia, { cerrado: true }, { merge: true })
}

// ============================================
// OBTENER SNAPSHOTS (últimos N días)
// ============================================

export async function obtenerSnapshots(uid, dias = 30) {
    const referencia = collection(db, "usuarios", uid, "snapshots")
    const q = query(referencia, orderBy("__name__", "desc"), limit(dias))
    const resultado = await getDocs(q)
    
    const snapshots = resultado.docs.map(doc => ({
        fecha: doc.id,
        ...doc.data()
    }))
    
    // Ordenar de más antiguo a más reciente
    return snapshots.reverse()
}

// ============================================
// OBTENER SNAPSHOT DE HOY
// ============================================

export async function obtenerSnapshotHoy(uid) {
    const fecha = getFechaHoy()
    const referencia = doc(db, "usuarios", uid, "snapshots", fecha)
    const resultado = await getDoc(referencia)
    
    if (!resultado.exists()) {
        return null
    }
    
    return {
        fecha: resultado.id,
        ...resultado.data()
    }
}

// ============================================
// OBTENER SNAPSHOT POR FECHA
// ============================================

export async function obtenerSnapshotPorFecha(uid, fecha) {
    const referencia = doc(db, "usuarios", uid, "snapshots", fecha)
    const resultado = await getDoc(referencia)
    
    if (!resultado.exists()) {
        return null
    }
    
    return {
        fecha: resultado.id,
        ...resultado.data()
    }
}