import {
    crearTrade,
    obtenerTrades,
    obtenerTrade,
    cerrarTrade,
    eliminarTrade
} from "../repositories/TradeRepositorio.js"

// ============================================
// TRADING SERVICIO
// ============================================

export async function registrarTrade(uid, datos) {
    return await crearTrade(uid, datos)
}

export async function obtenerTradesConFiltros(uid, filtros = {}) {
    const trades = await obtenerTrades(uid, filtros)

    let pnlTotal = 0
    let ganancias = 0
    let perdidas = 0
    let abiertos = 0
    let cerrados = 0

    trades.forEach(t => {
        if (t.estaCerrado) {
            pnlTotal += t.pnl
            if (t.esGanancia) ganancias++
            if (t.esPerdida) perdidas++
            cerrados++
        } else {
            abiertos++
        }
    })

    return {
        trades,
        metricas: {
            total: trades.length,
            abiertos,
            cerrados,
            ganancias,
            perdidas,
            pnlTotal
        }
    }
}

export async function finalizarTrade(uid, tradeId, salida) {
    if (!salida || salida <= 0) {
        throw new Error("La salida debe ser mayor a 0")
    }
    return await cerrarTrade(uid, tradeId, salida)
}

export async function borrarTrade(uid, tradeId) {
    return await eliminarTrade(uid, tradeId)
}