import {
    obtenerPosicionPorActivo,
    crearOActualizarPosicion,
    obtenerPosiciones,
    actualizarPosicion
} from "../repositories/PosicionRepositorio.js"
import {
    obtenerActivo,
    actualizarPrecioActivo
} from "../repositories/ActivoRepositorio.js"
import { convertirMonto, getDivisaPrincipal } from "./DivisaServicio.js"

// ============================================
// POSICIÓN SERVICIO
// ============================================

/**
 * Aplica el efecto de un movimiento de compra/venta a la posición del activo.
 * @param {string} uid
 * @param {Object} movimiento - { tipo, activo, cuenta, cantidad, precio, comision, divisa }
 */
export async function actualizarPosicionPorMovimiento(uid, movimiento) {
    const { activo, cantidad, precio, comision = 0, divisa, tipo } = movimiento

    console.log("[INFO] Actualizando posición por movimiento:", movimiento)

    const activoDoc = await obtenerActivo(uid, activo)
    if (!activoDoc) {
        throw new Error(`Activo no encontrado: ${activo}`)
    }

    await actualizarPrecioActivo(uid, activoDoc.id, precio)

    const esCompra =
        tipo === "compraActivo" ||
        tipo === "p2pCompra"

    let nuevaCantidad
    let precioConComision = precio

    if (esCompra) {
        nuevaCantidad = Math.abs(cantidad)
        if (comision > 0) {
            // Precio efectivo = (cantidad × precio + comisión) / cantidad
            precioConComision = ((cantidad * precio) + comision) / cantidad
        }
    } else {
        // Venta: cantidad negativa, precio sin comisión
        // (la comisión afecta el saldo, no el precio promedio de la posición restante)
        nuevaCantidad = -Math.abs(cantidad)
    }

    const posicionId = await crearOActualizarPosicion(
        uid,
        activoDoc.id,
        nuevaCantidad,
        precioConComision,
        divisa
    )

    return posicionId
}

// ============================================
// POSICIONES CON VALOR (para dashboard e inversiones)
// ============================================
// Convierte todos los valores a una divisa objetivo para que la suma
// sea coherente aunque las posiciones estén en distintas divisas.
// ============================================

/**
 * @param {string} uid
 * @param {string} [divisaObjetivo] - divisa a la que convertir los valores.
 *                                    Por defecto, la divisa principal del usuario.
 * @returns {Promise<{ posiciones: Array, valorTotal: number, gananciaTotal: number, cantidad: number, divisa: string }>}
 */
export async function obtenerPosicionesConValor(uid, divisaObjetivo = null) {
    const objetivo = divisaObjetivo || getDivisaPrincipal()
    const posiciones = await obtenerPosiciones(uid)

    let valorTotal = 0
    let gananciaTotal = 0

    posiciones.forEach(pos => {
        const divisaPos = pos.divisa || "usd"

        // valorTotal de la posición (en su divisa nativa)
        const valorNativo = pos.valorTotal || 0
        const gananciaNativa = pos.ganancia || 0

        // Convertir a la divisa objetivo
        valorTotal += convertirMonto(valorNativo, divisaPos, objetivo)
        gananciaTotal += convertirMonto(gananciaNativa, divisaPos, objetivo)
    })

    return {
        posiciones,
        valorTotal,
        gananciaTotal,
        cantidad: posiciones.length,
        divisa: objetivo
    }
}

// ============================================
// (Opción B — mantener funciones individuales si las necesitas)
// ============================================

export async function obtenerPosicion(uid, activoId) {
    return await obtenerPosicionPorActivo(uid, activoId)
}

export async function aplicarAjustePosicion(uid, posicionId, datos) {
    return await actualizarPosicion(uid, posicionId, datos)
}