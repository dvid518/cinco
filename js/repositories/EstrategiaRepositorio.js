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
import { Estrategia } from "../models/Estrategia.js"
import { cacheCapa } from "../core/cache.js"

// ============================================
// ESTRATEGIA REPOSITORIO (por usuario)
// ============================================
// Ruta: usuarios/{uid}/estrategias/{estrategiaId}
// ============================================

const CLAVE_CACHE = "estrategias"

function refEstrategias(uid) {
    return collection(db, "usuarios", uid, "estrategias")
}

// --------------------------------------------
// CREAR
// --------------------------------------------

export async function crearEstrategia(uid, datos) {
    const estrategia = new Estrategia(datos)
    estrategia.validar()

    const referencia = refEstrategias(uid)
    const resultado = await addDoc(referencia, {
        ...estrategia.toFirestore(),
        fechaCreacion: serverTimestamp()
    })
    cacheCapa.invalidar(uid, CLAVE_CACHE)

    return resultado.id
}

// --------------------------------------------
// LEER
// --------------------------------------------

export async function obtenerEstrategias(uid) {
    return cacheCapa.obtener(uid, CLAVE_CACHE, async () => {
        const referencia = refEstrategias(uid)
        const q = query(referencia, orderBy("fechaCreacion", "desc"))
        const resultado = await getDocs(q)

        return resultado.docs.map(documento => {
            return Estrategia.fromFirestore(documento.id, documento.data())
        })
    })
}

export async function obtenerEstrategia(uid, estrategiaId) {
    if (!estrategiaId) return null

    const referencia = doc(db, "usuarios", uid, "estrategias", estrategiaId)
    const resultado = await getDoc(referencia)

    if (!resultado.exists()) {
        return null
    }

    return Estrategia.fromFirestore(resultado.id, resultado.data())
}

// --------------------------------------------
// ACTUALIZAR
// --------------------------------------------

export async function actualizarEstrategia(uid, estrategiaId, datos) {
    const referencia = doc(db, "usuarios", uid, "estrategias", estrategiaId)
    const resultado = await updateDoc(referencia, { ...datos })
    cacheCapa.invalidar(uid, CLAVE_CACHE)

    return resultado
}

export async function cambiarEstadoEstrategia(uid, estrategiaId, activa) {
    return actualizarEstrategia(uid, estrategiaId, { activa })
}

// --------------------------------------------
// ELIMINAR
// --------------------------------------------

export async function eliminarEstrategia(uid, estrategiaId) {
    const referencia = doc(db, "usuarios", uid, "estrategias", estrategiaId)
    const resultado = await deleteDoc(referencia)
    cacheCapa.invalidar(uid, CLAVE_CACHE)

    return resultado
}
