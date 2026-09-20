import {
    crearTrade,
    obtenerTrades,
    actualizarTrade,
    cerrarTrade,
    reabrirTrade,
    actualizarNotaTrade,
    eliminarTrade
} from "../repositories/TradeRepositorio.js"
import { buscarActivoPorSimbolo } from "../repositories/ActivoRepositorio.js"
import { obtenerPrecioHistorialDeHoy } from "./HistorialServicio.js"

// ============================================
// TRADING SERVICIO
// ============================================

export async function registrarTrade(uid, datos) {
    return await crearTrade(uid, datos)
}

/**
 * Obtiene los trades con métricas y P&L flotante para los abiertos.
 * El P&L flotante usa el último precio conocido del activo (por símbolo),
 * con respaldo en ultimoPrecio del activo cuando no hay precio de hoy.
 */
export async function obtenerTradesConFiltros(uid, filtros = {}) {
    const trades = await obtenerTrades(uid, filtros)

    await anexarPnlFlotante(uid, trades)

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

async function anexarPnlFlotante(uid, trades) {
    const preciosPorSimbolo = new Map()

    for (const t of trades) {
        if (!t.estaAbierto) continue

        const simbolo = t.activo?.trim().toUpperCase()
        if (!simbolo || preciosPorSimbolo.has(simbolo)) continue

        preciosPorSimbolo.set(simbolo, null)

        try {
            const activo = await buscarActivoPorSimbolo(uid, simbolo)
            if (activo) {
                const precioHoy = await obtenerPrecioHistorialDeHoy(uid, activo.id)
                preciosPorSimbolo.set(simbolo, precioHoy ?? activo.ultimoPrecio ?? null)
            }
        } catch (error) {
            console.warn(`[WARN] Sin precio para ${simbolo}:`, error)
        }
    }

    trades.forEach(t => {
        if (t.estaAbierto) {
            const precio = preciosPorSimbolo.get(t.activo?.trim().toUpperCase()) ?? null

            if (precio && precio > 0) {
                if (t.tipo === "long") {
                    t.pnlFlotante = (precio - t.entrada) * t.lotaje
                    t.precioActual = precio
                } else {
                    t.pnlFlotante = (t.entrada - precio) * t.lotaje
                    t.precioActual = precio
                }
            } else {
                t.pnlFlotante = null
                t.precioActual = null
            }
        }
    })
}

export async function editarTrade(uid, tradeId, datos) {
    if (!datos || typeof datos !== "object") {
        throw new Error("Datos de trade inválidos")
    }
    return await actualizarTrade(uid, tradeId, datos)
}

export async function finalizarTrade(uid, tradeId, salida) {
    if (!salida || salida <= 0) {
        throw new Error("La salida debe ser mayor a 0")
    }
    return await cerrarTrade(uid, tradeId, salida)
}

export async function reabrirTradeAbierto(uid, tradeId) {
    return await reabrirTrade(uid, tradeId)
}

export async function actualizarNota(uid, tradeId, nota) {
    return await actualizarNotaTrade(uid, tradeId, nota)
}

export async function borrarTrade(uid, tradeId) {
    return await eliminarTrade(uid, tradeId)
}