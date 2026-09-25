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
import { cacheCapa } from "../core/cache.js"

const TTL_SNAPSHOTS = 45 * 1000

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
        const actuales = existente.data()
        const totalesSinCambios = ["patrimonioPEN", "patrimonioUSD", "patrimonioUSDT"]
            .every(campo => Number(actuales[campo] ?? 0) === Number(datos[campo] ?? 0))
        if (totalesSinCambios) return false
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

    cacheCapa.invalidarPrefijo(uid, "snapshots")
    return true
}

// ============================================
// CERRAR SNAPSHOT DEL DÍA
// ============================================

export async function cerrarSnapshotDelDia(uid) {
    const fecha = getFechaHoy()
    const referencia = doc(db, "usuarios", uid, "snapshots", fecha)
    await setDoc(referencia, { cerrado: true }, { merge: true })
    cacheCapa.invalidarPrefijo(uid, "snapshots")
}

// ============================================
// OBTENER SNAPSHOTS (últimos N días)
// ============================================

export async function obtenerSnapshots(uid, dias = 30) {
    return cacheCapa.obtener(uid, `snapshots:periodo:${dias}`, async () => {
        const referencia = collection(db, "usuarios", uid, "snapshots")
        const q = query(referencia, orderBy("__name__", "desc"), limit(dias))
        const resultado = await getDocs(q)

        const snapshots = resultado.docs.map(doc => ({
            fecha: doc.id,
            ...doc.data()
        }))

        return snapshots.reverse()
    }, { ttl: TTL_SNAPSHOTS })
}

// ============================================
// OBTENER SNAPSHOT DE HOY
// ============================================

export async function obtenerSnapshotHoy(uid) {
    return cacheCapa.obtener(uid, "snapshots:hoy", async () => {
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
    }, { ttl: TTL_SNAPSHOTS })
}

// ============================================
// OBTENER SNAPSHOT POR FECHA
// ============================================

export async function obtenerSnapshotPorFecha(uid, fecha) {
    return cacheCapa.obtener(uid, `snapshots:fecha:${fecha}`, async () => {
        const referencia = doc(db, "usuarios", uid, "snapshots", fecha)
        const resultado = await getDoc(referencia)

        if (!resultado.exists()) {
            return null
        }

        return {
            fecha: resultado.id,
            ...resultado.data()
        }
    }, { ttl: TTL_SNAPSHOTS })
}