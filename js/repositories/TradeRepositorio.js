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
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { db } from "../../firebase/firestore.js"
import { Trade } from "../models/Trade.js"
import { cacheCapa } from "../core/cache.js"

// ============================================
// TRADE REPOSITORIO
// ============================================

export async function crearTrade(uid, datos) {
    const trade = new Trade(datos)
    trade.validar()

    const referencia = collection(db, "usuarios", uid, "trades")
    const resultado = await addDoc(referencia, {
        ...trade.toFirestore(),
        fechaRegistro: serverTimestamp()
    })
    cacheCapa.invalidar(uid, "trades")

    return resultado.id
}

export async function obtenerTrades(uid, filtros = {}) {
    const trades = await cacheCapa.obtener(uid, "trades", async () => {
        const referencia = collection(db, "usuarios", uid, "trades")
        const resultado = await getDocs(referencia)

        const trades = resultado.docs.map(doc => Trade.fromFirestore(doc.id, doc.data()))

        // Ordenar en JS por fecha descendente
        trades.sort((a, b) => {
            const fechaA = a.fechaRegistro?.getTime?.() || 0
            const fechaB = b.fechaRegistro?.getTime?.() || 0
            return fechaB - fechaA
        })

        return trades
    })

    // Aplicar filtros en cada lectura (no se cachea la consulta filtrada)
    let filtrados = trades
    if (filtros.tipo) {
        filtrados = filtrados.filter(t => t.tipo === filtros.tipo)
    }
    if (filtros.estado) {
        filtrados = filtrados.filter(t => t.estado === filtros.estado)
    }

    return filtrados
}

export async function obtenerTrade(uid, tradeId) {
    const referencia = doc(db, "usuarios", uid, "trades", tradeId)
    const resultado = await getDoc(referencia)

    if (!resultado.exists()) return null

    return Trade.fromFirestore(resultado.id, resultado.data())
}

export async function cerrarTrade(uid, tradeId, salida) {
    const referencia = doc(db, "usuarios", uid, "trades", tradeId)
    const resultado = await updateDoc(referencia, {
        salida: salida,
        estado: 'cerrado',
        fechaCierre: serverTimestamp()
    })
    cacheCapa.invalidar(uid, "trades")
    return resultado
}

export async function reabrirTrade(uid, tradeId) {
    const referencia = doc(db, "usuarios", uid, "trades", tradeId)
    const resultado = await updateDoc(referencia, {
        salida: null,
        estado: 'abierto',
        fechaCierre: null
    })
    cacheCapa.invalidar(uid, "trades")
    return resultado
}

export async function actualizarNotaTrade(uid, tradeId, nota) {
    const referencia = doc(db, "usuarios", uid, "trades", tradeId)
    const resultado = await updateDoc(referencia, {
        nota: (nota || "").slice(0, 1500)
    })
    cacheCapa.invalidar(uid, "trades")
    return resultado
}

export async function eliminarTrade(uid, tradeId) {
    const referencia = doc(db, "usuarios", uid, "trades", tradeId)
    const resultado = await deleteDoc(referencia)
    cacheCapa.invalidar(uid, "trades")
    return resultado
}