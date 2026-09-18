import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    query,
    orderBy,
    limit,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { db } from "../../firebase/firestore.js"
import { cacheCapa } from "../core/cache.js"
import { getFechaHoy } from "../core/fechas.js"

// ============================================
// HISTORIAL REPOSITORIO (por usuario)
// ============================================
// Ruta: usuarios/{uid}/activos/{activoId}/historial/{fecha}
// donde {fecha} es un string "YYYY-MM-DD"
// ============================================

// --------------------------------------------
// REFERENCIAS
// --------------------------------------------

function refHistorial(uid, activoId) {
    return collection(db, "usuarios", uid, "activos", activoId, "historial")
}

function refDia(uid, activoId, fecha) {
    return doc(db, "usuarios", uid, "activos", activoId, "historial", fecha)
}

// --------------------------------------------
// GUARDAR PRECIO DEL DÍA (crea o actualiza)
// --------------------------------------------

export async function guardarPrecioDelDia(uid, activoId, precio) {
    const fecha = getFechaHoy()
    const referencia = refDia(uid, activoId, fecha)

    const existente = await getDoc(referencia)

    if (existente.exists()) {
        // Actualizar el mismo documento
        await setDoc(referencia, {
            precio: precio,
            actualizacion: serverTimestamp()
        }, { merge: true })
    } else {
        // Crear nuevo documento para hoy
        await setDoc(referencia, {
            fecha: fecha,
            precio: precio,
            cerrado: false,
            actualizacion: serverTimestamp()
        })
    }

    cacheCapa.invalidarPrefijo(uid, `historial:${activoId}`)

    return fecha
}

// --------------------------------------------
// CERRAR DÍA (marcar como cerrado)
// --------------------------------------------

export async function cerrarDia(uid, activoId, fecha) {
    const referencia = refDia(uid, activoId, fecha)
    await setDoc(referencia, { cerrado: true }, { merge: true })
    cacheCapa.invalidarPrefijo(uid, `historial:${activoId}`)
}

// --------------------------------------------
// OBTENER HISTORIAL DE UN ACTIVO (últimos N días)
// --------------------------------------------

export async function obtenerHistorial(uid, activoId, dias = 7) {
    return cacheCapa.obtener(
        uid,
        `historial:${activoId}:${dias}`,
        async () => {
            const referencia = refHistorial(uid, activoId)
            const q = query(referencia, orderBy("fecha", "desc"), limit(dias))
            const resultado = await getDocs(q)

            const historial = resultado.docs.map(documento => ({
                fecha: documento.id,
                ...documento.data()
            }))

            // Devolver del más antiguo al más reciente (para gráficos)
            return historial.reverse()
        }
    )
}

// --------------------------------------------
// OBTENER PRECIO DE HOY
// --------------------------------------------

export async function obtenerPrecioHoy(uid, activoId) {
    return cacheCapa.obtener(
        uid,
        `historial:${activoId}:hoy`,
        async () => {
            const fecha = getFechaHoy()
            const referencia = refDia(uid, activoId, fecha)
            const resultado = await getDoc(referencia)

            if (!resultado.exists()) {
                return null
            }

            return {
                fecha: resultado.id,
                ...resultado.data()
            }
        }
    )
}

// --------------------------------------------
// LIMPIAR HISTORIAL ANTIGUO (mantener solo últimos 7 días)
// --------------------------------------------

export async function limpiarHistorialAntiguo(uid, activoId) {
    const referencia = refHistorial(uid, activoId)
    const q = query(referencia, orderBy("fecha", "desc"))
    const resultado = await getDocs(q)

    const documentos = resultado.docs

    // Eliminar todos los que excedan los últimos 7
    if (documentos.length > 7) {
        for (let i = 7; i < documentos.length; i++) {
            await deleteDoc(documentos[i].ref)
        }
    }

    cacheCapa.invalidarPrefijo(uid, `historial:${activoId}`)
}