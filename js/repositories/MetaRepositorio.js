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
import { Meta } from "../models/Meta.js"
import { cacheCapa } from "../core/cache.js"

// ============================================
// META REPOSITORIO (por usuario)
// ============================================
// Ruta: usuarios/{uid}/metas/{metaId}
// ============================================

const CLAVE_CACHE = "metas"

function refMetas(uid) {
    return collection(db, "usuarios", uid, "metas")
}

// --------------------------------------------
// CREAR
// --------------------------------------------

export async function crearMeta(uid, datos) {
    const meta = new Meta(datos)
    meta.validar()

    const resultado = await addDoc(refMetas(uid), {
        ...meta.toFirestore(),
        fechaCreacion: serverTimestamp()
    })
    cacheCapa.invalidar(uid, CLAVE_CACHE)

    return resultado.id
}

// --------------------------------------------
// LEER
// --------------------------------------------

export async function obtenerMetas(uid) {
    return cacheCapa.obtener(uid, CLAVE_CACHE, async () => {
        const q = query(refMetas(uid), orderBy("fechaCreacion", "desc"))
        const resultado = await getDocs(q)

        return resultado.docs.map(documento => {
            return Meta.fromFirestore(documento.id, documento.data())
        })
    })
}

export async function obtenerMeta(uid, metaId) {
    if (!metaId) return null

    const referencia = doc(db, "usuarios", uid, "metas", metaId)
    const resultado = await getDoc(referencia)

    if (!resultado.exists()) {
        return null
    }

    return Meta.fromFirestore(resultado.id, resultado.data())
}

// --------------------------------------------
// ACTUALIZAR
// --------------------------------------------

export async function actualizarMeta(uid, metaId, datos) {
    const referencia = doc(db, "usuarios", uid, "metas", metaId)
    const resultado = await updateDoc(referencia, { ...datos })
    cacheCapa.invalidar(uid, CLAVE_CACHE)

    return resultado
}

// --------------------------------------------
// ELIMINAR
// --------------------------------------------

export async function eliminarMeta(uid, metaId) {
    const referencia = doc(db, "usuarios", uid, "metas", metaId)
    const resultado = await deleteDoc(referencia)
    cacheCapa.invalidar(uid, CLAVE_CACHE)

    return resultado
}
