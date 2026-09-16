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

    return resultado.id
}

export async function obtenerTrades(uid, filtros = {}) {
    const referencia = collection(db, "usuarios", uid, "trades")
    let q = referencia

    if (filtros.tipo) {
        q = query(referencia, where("tipo", "==", filtros.tipo))
    } else if (filtros.estado) {
        q = query(referencia, where("estado", "==", filtros.estado))
    }

    const resultado = await getDocs(q)

    const trades = resultado.docs.map(doc => Trade.fromFirestore(doc.id, doc.data()))

    // Ordenar en JS por fecha descendente
    trades.sort((a, b) => {
        const fechaA = a.fechaRegistro?.getTime?.() || 0
        const fechaB = b.fechaRegistro?.getTime?.() || 0
        return fechaB - fechaA
    })

    // Aplicar filtros adicionales en JS
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
    return await updateDoc(referencia, {
        salida: salida,
        estado: 'cerrado',
        fechaCierre: serverTimestamp()
    })
}

export async function eliminarTrade(uid, tradeId) {
    const referencia = doc(db, "usuarios", uid, "trades", tradeId)
    return await deleteDoc(referencia)
}