import { actualizarMeta } from "../repositories/MetaRepositorio.js"
import { registrarMovimiento } from "./MovimientoServicio.js"
import { obtenerCuenta } from "../../firebase/firestore.js"
import { TIPOS_MOVIMIENTO } from "../../constants/tiposMovimiento.js"

// ============================================
// META SERVICIO
// ============================================
// Un aporte descuenta el monto de una cuenta (movimiento tipo gasto)
// y lo suma al monto actual de la meta.
// ============================================

/**
 * Registra un aporte a una meta de ahorro.
 *
 * @param {string} uid
 * @param {Object} meta        Instancia de Meta
 * @param {Object} datos       { monto, cuentaId, fecha }
 * @returns {Promise<{ montoActual: number }>}
 */
export async function aportarMeta(uid, meta, { monto, cuentaId, fecha = new Date() }) {
    if (!meta) {
        throw new Error("Meta no encontrada")
    }
    if (!monto || monto <= 0) {
        throw new Error("El monto del aporte debe ser mayor a 0")
    }
    if (!cuentaId) {
        throw new Error("Selecciona una cuenta de origen")
    }

    const cuenta = await obtenerCuenta(uid, cuentaId)
    if (!cuenta) {
        throw new Error("Cuenta de origen no encontrada")
    }

    const monedaCuenta = (cuenta.moneda || "pen").toLowerCase()
    const divisaMeta = (meta.divisa || "pen").toLowerCase()
    if (monedaCuenta !== divisaMeta) {
        throw new Error(
            `La cuenta "${cuenta.nombre}" está en ${monedaCuenta.toUpperCase()} y la meta en ${divisaMeta.toUpperCase()}. Selecciona una cuenta en ${divisaMeta.toUpperCase()}.`
        )
    }

    await registrarMovimiento(uid, TIPOS_MOVIMIENTO.GASTO, {
        cuenta: cuentaId,
        concepto: `Aporte a meta: ${meta.nombre}`,
        monto,
        divisa: meta.divisa,
        fechaRealizacion: fecha,
        metaId: meta.id
    })

    const montoActual = (meta.montoActual || 0) + monto
    await actualizarMeta(uid, meta.id, { montoActual })

    return { montoActual }
}
