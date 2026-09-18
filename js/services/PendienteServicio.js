import { obtenerPendiente, consolidarPendiente } from "../repositories/PendienteRepositorio.js"
import { registrarMovimiento } from "./MovimientoServicio.js"
import { getFechaHoy } from "../core/fechas.js"
import { TIPOS_MOVIMIENTO } from "../../constants/tiposMovimiento.js"

// ============================================
// PENDIENTE SERVICIO
// ============================================

const MOVIMIENTOS_COMPATIBLES = {
    cobrar: [TIPOS_MOVIMIENTO.INGRESO],
    pagar: [TIPOS_MOVIMIENTO.GASTO]
}

export function obtenerTiposCompatibles(tipoPendiente) {
    // tipoPendiente es booleano: true = cobrar, false = pagar
    const tipo = tipoPendiente ? "cobrar" : "pagar"
    return MOVIMIENTOS_COMPATIBLES[tipo] || []
}

export async function consolidarPendienteAMovimiento(
    uid,
    pendienteId,
    tipoMovimiento,
    datosMovimiento
) {
    const pendiente = await obtenerPendiente(uid, pendienteId)

    if (!pendiente) {
        throw new Error("Pendiente no encontrado")
    }

    if (!pendiente.estaPendiente) {
        throw new Error("El pendiente ya está consolidado")
    }

    const tiposCompatibles = obtenerTiposCompatibles(pendiente.tipo)
    if (!tiposCompatibles.includes(tipoMovimiento)) {
        throw new Error(
            `Tipo de movimiento incompatible. Compatibles: ${tiposCompatibles.join(", ")}`
        )
    }

    if (!datosMovimiento.fechaRealizacion) {
        datosMovimiento.fechaRealizacion = getFechaHoy()
    }

    const movimiento = await registrarMovimiento(uid, tipoMovimiento, datosMovimiento)
    await consolidarPendiente(uid, pendienteId, movimiento.id)

    return { movimiento, pendiente }
}

export function getMovimientosParaPendiente(tipoPendiente) {
    const tipos = obtenerTiposCompatibles(tipoPendiente)
    return tipos.map(tipo => ({
        tipo,
        label: tipo.charAt(0).toUpperCase() + tipo.slice(1)
    }))
}