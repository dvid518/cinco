import { FRECUENCIAS } from "../models/Estrategia.js"
import { buscarActivoPorSimbolo } from "../repositories/ActivoRepositorio.js"
import { actualizarEstrategia } from "../repositories/EstrategiaRepositorio.js"
import { registrarMovimiento } from "./MovimientoServicio.js"
import { registrarPrecio } from "./HistorialServicio.js"
import { TIPOS_MOVIMIENTO } from "../../constants/tiposMovimiento.js"

// ============================================
// ESTRATEGIA SERVICIO
// ============================================
// Lógica de ejecución de compras programadas (DCA):
//   - Calcula la fecha de la siguiente ejecución.
//   - Ejecuta la compra usando el último precio conocido
//     del activo y actualiza la programación.
// ============================================

/**
 * Calcula la próxima fecha de ejecución de una estrategia.
 *
 * @param {string} frecuencia     "diaria" | "semanal" | "mensual"
 * @param {number|null} diaPreferido  Día de la semana (0-6) o del mes (1-31)
 * @param {Date} [desde]          Punto de partida (por defecto, ahora)
 * @returns {Date}
 */
export function calcularProximaEjecucion(frecuencia, diaPreferido = null, desde = new Date()) {
    const base = new Date(desde)

    if (frecuencia === FRECUENCIAS.DIARIA) {
        base.setDate(base.getDate() + 1)
        return base
    }

    if (frecuencia === FRECUENCIAS.SEMANAL) {
        const objetivo = diaPreferido !== null && diaPreferido !== undefined
            ? Number(diaPreferido)
            : base.getDay()

        // Avanza al menos un día y luego al próximo día objetivo.
        const avance = new Date(base)
        avance.setDate(avance.getDate() + 1)
        let dias = (objetivo - avance.getDay() + 7) % 7
        if (dias === 0) dias = 7
        avance.setDate(avance.getDate() + dias)
        return avance
    }

    // Mensual: primer día del mes siguiente, respetando el fin de mes.
    const anio = base.getFullYear()
    const mes = base.getMonth() + 1
    const primerDiaSiguiente = new Date(anio, mes, 1)
    const ultimoDia = new Date(
        primerDiaSiguiente.getFullYear(),
        primerDiaSiguiente.getMonth() + 1,
        0
    ).getDate()

    const dia = (diaPreferido ? Number(diaPreferido) : base.getDate())
    const diaFinal = Math.min(Math.max(dia, 1), ultimoDia)

    return new Date(primerDiaSiguiente.getFullYear(), primerDiaSiguiente.getMonth(), diaFinal)
}

/**
 * Ejecuta una estrategia: registra la compra con el último precio
 * conocido del activo y reprograma la siguiente ejecución.
 *
 * @returns {Promise<{cantidad:number, precio:number, proximaEjecucion:Date}>}
 */
export async function ejecutarEstrategia(uid, estrategia, fecha = new Date()) {
    if (!estrategia) {
        throw new Error("Estrategia no encontrada")
    }

    const activo = await buscarActivoPorSimbolo(uid, estrategia.activoSimbolo)
    if (!activo) {
        throw new Error(`No existe un activo con el símbolo ${estrategia.activoSimbolo}`)
    }

    const precio = activo.ultimoPrecio
    if (!precio || precio <= 0) {
        throw new Error(`El activo ${estrategia.activoSimbolo} no tiene un precio válido`)
    }

    const cantidad = estrategia.montoFijo / precio

    await registrarMovimiento(uid, TIPOS_MOVIMIENTO.COMPRA_ACTIVO, {
        // PosicionServicio resuelve el activo por SÍMBOLO; pasar el doc-ID
        // crearía un activo fantasma (bug #3).
        activo: estrategia.activoSimbolo,
        cuenta: estrategia.cuentaId,
        cantidad,
        precio,
        divisa: estrategia.divisa,
        fechaRealizacion: fecha
    })

    const proximaEjecucion = calcularProximaEjecucion(
        estrategia.frecuencia,
        estrategia.diaPreferido,
        fecha
    )

    await actualizarEstrategia(uid, estrategia.id, {
        ultimaEjecucion: fecha,
        proximaEjecucion
    })

    await registrarPrecio(uid, activo.id, precio)

    return { cantidad, precio, proximaEjecucion }
}
