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
import { Activo } from "../models/Activo.js"
import { cacheCapa } from "../core/cache.js"

// ============================================
// ACTIVO REPOSITORIO (por usuario)
// ============================================
// Ruta: usuarios/{uid}/activos/{activoId}
// ============================================

function refActivos(uid) {
    return collection(db, "usuarios", uid, "activos")
}

// --------------------------------------------
// CREAR
// --------------------------------------------

export async function crearActivo(uid, datos) {
    const activo = new Activo(datos)
    activo.validar()

    const referencia = refActivos(uid)
    const resultado = await addDoc(referencia, {
        ...activo.toFirestore(),
        fechaCreacion: serverTimestamp()
    })
    cacheCapa.invalidar(uid, "activos")

    return resultado.id
}

// --------------------------------------------
// LEER
// --------------------------------------------

export async function obtenerActivos(uid) {
    return cacheCapa.obtener(uid, "activos", async () => {
        const referencia = refActivos(uid)
        const q = query(referencia, orderBy("nombre", "asc"))
        const resultado = await getDocs(q)

        return resultado.docs.map(documento => {
            return Activo.fromFirestore(documento.id, documento.data())
        })
    })
}

export async function obtenerActivo(uid, activoId) {
    if (!activoId) return null

    const referencia = doc(db, "usuarios", uid, "activos", activoId)
    const resultado = await getDoc(referencia)

    if (!resultado.exists()) {
        return null
    }

    return Activo.fromFirestore(resultado.id, resultado.data())
}

export async function buscarActivoPorSimbolo(uid, simbolo) {
    if (!simbolo) return null

    const referencia = refActivos(uid)
    const q = query(
        referencia,
        where("simbolo", "==", simbolo.toUpperCase())
    )
    const resultado = await getDocs(q)

    if (resultado.empty) {
        return null
    }

    const documento = resultado.docs[0]
    return Activo.fromFirestore(documento.id, documento.data())
}

// --------------------------------------------
// ACTUALIZAR
// --------------------------------------------

export async function actualizarActivo(uid, activoId, datos) {
    const referencia = doc(db, "usuarios", uid, "activos", activoId)
    const resultado = await updateDoc(referencia, {
        ...datos,
        ultimaActualizacion: serverTimestamp()
    })
    cacheCapa.invalidar(uid, "activos")
    // Las posiciones unen el activo: su valor/ganancia cambia
    cacheCapa.invalidar(uid, "posiciones")
    return resultado
}

export async function actualizarPrecioActivo(uid, activoId, precio, fuente = null) {
    const referencia = doc(db, "usuarios", uid, "activos", activoId)
    const resultado = await updateDoc(referencia, {
        ultimoPrecio: precio,
        ultimaActualizacion: serverTimestamp(),
        ...(fuente ? { fuente } : {})
    })
    cacheCapa.invalidar(uid, "activos")
    // Las posiciones unen el activo: su valor/ganancia cambia
    cacheCapa.invalidar(uid, "posiciones")
    return resultado
}

export async function marcarFavoritoActivo(uid, activoId, favorito) {
    const referencia = doc(db, "usuarios", uid, "activos", activoId)
    const resultado = await updateDoc(referencia, {
        favorito: !!favorito
    })
    cacheCapa.invalidar(uid, "activos")
    // Las posiciones incluyen el activo; el favorito se refleja en la lista
    cacheCapa.invalidar(uid, "posiciones")
    return resultado
}

// --------------------------------------------
// ELIMINAR
// --------------------------------------------

export async function eliminarActivo(uid, activoId) {
    const referencia = doc(db, "usuarios", uid, "activos", activoId)
    const resultado = await deleteDoc(referencia)
    cacheCapa.invalidar(uid, "activos")
    cacheCapa.invalidar(uid, "posiciones")
    return resultado
}