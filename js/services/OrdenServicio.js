import {
    obtenerOrdenes,
    crearOrden,
    actualizarOrden,
    eliminarOrden,
    marcarOrdenEjecutada
} from "../repositories/OrdenRepositorio.js"
import { buscarActivoPorSimbolo } from "../repositories/ActivoRepositorio.js"
import { obtenerPrecioActual } from "./HistorialServicio.js"
import { registrarTrade } from "./TradingServicio.js"
import { ESTADOS_ORDEN } from "../models/Orden.js"

// ============================================
// ORDEN SERVICIO
// ============================================
// Lógica de órdenes (límite/stop):
//   - Crear y cancelar órdenes pendientes.
//   - Evaluar el precio actual de cada activo y, si la
//     condición se cumple, abrir un trade nuevo y marcar
//     la orden como ejecutada.
//
// La evaluación es pull (sin scheduler): se dispara al
// entrar a Trading y al pulsar "Actualizar".
// ============================================

/**
 * Crea una orden pendiente.
 *
 * @returns {Promise<string>} id de la orden
 */
export async function registrarOrden(uid, datos) {
    return await crearOrden(uid, datos)
}

/**
 * Devuelve las órdenes con filtros opcionales.
 * Ordena las pendientes primero y, dentro de cada grupo,
 * por fecha de creación descendente.
 *
 * @param {object} [filtros] { estado, activo }
 */
export async function obtenerOrdenesConFiltros(uid, filtros = {}) {
    const ordenes = await obtenerOrdenes(uid)

    let filtradas = ordenes
    if (filtros.estado) {
        filtradas = filtradas.filter(o => o.estado === filtros.estado)
    }
    if (filtros.activo) {
        const simbolo = filtros.activo.toUpperCase()
        filtradas = filtradas.filter(o => o.activo === simbolo)
    }

    return [...filtradas].sort((a, b) => {
        if (a.estaPendiente !== b.estaPendiente) {
            return a.estaPendiente ? -1 : 1
        }
        const fechaA = a.fechaCreacion?.getTime?.() || 0
        const fechaB = b.fechaCreacion?.getTime?.() || 0
        return fechaB - fechaA
    })
}

/**
 * Cancela una orden pendiente (no la elimina).
 */
export async function cancelarOrden(uid, ordenId) {
    return await actualizarOrden(uid, ordenId, { estado: ESTADOS_ORDEN.CANCELADA })
}

/**
 * Elimina una orden.
 */
export async function borrarOrden(uid, ordenId) {
    return await eliminarOrden(uid, ordenId)
}

/**
 * Evalúa todas las órdenes pendientes contra el último precio
 * conocido de su activo. Las que se disparan abren un trade
 * long/short y pasan a estado "ejecutada".
 *
 * @returns {Promise<{evaluadas:number, ejecutadas:number, detalles:Array, errores:Array}>}
 */
export async function evaluarOrdenesPendientes(uid) {
    const ordenes = await obtenerOrdenes(uid)
    const pendientes = ordenes.filter(o => o.estaPendiente)

    const resultado = {
        evaluadas: pendientes.length,
        ejecutadas: 0,
        detalles: [],
        errores: []
    }

    if (pendientes.length === 0) {
        return resultado
    }

    // Cache local de precios por símbolo durante esta evaluación.
    const preciosPorSimbolo = new Map()

    for (const orden of pendientes) {
        try {
            const simbolo = orden.activo

            if (!preciosPorSimbolo.has(simbolo)) {
                const activo = await buscarActivoPorSimbolo(uid, simbolo)

                if (!activo) {
                    preciosPorSimbolo.set(simbolo, null)
                } else {
                    const precioHoy = await obtenerPrecioActual(uid, activo.id)
                    preciosPorSimbolo.set(simbolo, {
                        activo,
                        precio: precioHoy ?? activo.ultimoPrecio ?? null
                    })
                }
            }

            const encontrado = preciosPorSimbolo.get(simbolo)

            if (!encontrado || !encontrado.precio || encontrado.precio <= 0) {
                resultado.errores.push(`${simbolo}: sin precio disponible`)
                continue
            }

            if (!orden.debeDisparar(encontrado.precio)) {
                continue
            }

            const precio = encontrado.precio

            const tradeId = await registrarTrade(uid, {
                activo: orden.activo,
                cuenta: orden.cuenta,
                entrada: precio,
                lotaje: orden.lotaje,
                sl: orden.sl,
                tp: orden.tp,
                tipo: orden.direccion,
                estado: "abierto",
                divisa: orden.divisa,
                nota: orden.nota,
                ordenId: orden.id
            })

            await marcarOrdenEjecutada(uid, orden.id, tradeId, precio)

            resultado.ejecutadas++
            resultado.detalles.push({
                ordenId: orden.id,
                tradeId,
                activo: orden.activo,
                precio
            })
        } catch (error) {
            console.error(`[ERROR] No se pudo ejecutar la orden ${orden.id}:`, error)
            resultado.errores.push(`${orden.activo}: ${error.message}`)
        }
    }

    return resultado
}
