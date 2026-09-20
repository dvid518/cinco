import {
    guardarPrecioDelDia,
    obtenerHistorial,
    obtenerPrecioHoy,
    limpiarHistorialAntiguo
} from "../repositories/HistorialRepositorio.js"

// ============================================
// HISTORIAL SERVICIO
// ============================================

/**
 * Registra el precio del día para un activo.
 * Si ya existe el doc de hoy, lo actualiza.
 */
export async function registrarPrecio(uid, activoId, precio) {
    try {
        await guardarPrecioDelDia(uid, activoId, precio)
        console.log(`[INFO] Precio registrado · activo ${activoId}: ${precio}`)
    } catch (error) {
        console.error("Error registrando precio:", error)
    }
}

/**
 * Devuelve los datos listos para Chart.js: { labels, data }.
 */
export async function obtenerHistorialParaGrafico(uid, activoId, dias = 7) {
    try {
        const historial = await obtenerHistorial(uid, activoId, dias)

        return {
            labels: historial.map(h => {
                const fecha = new Date(h.fecha + 'T00:00:00')
                return fecha.toLocaleDateString('es-PE', {
                    day: '2-digit',
                    month: '2-digit'
                })
            }),
            data: historial.map(h => h.precio)
        }
    } catch (error) {
        console.error("Error obteniendo historial:", error)
        return { labels: [], data: [] }
    }
}

/**
 * Devuelve el precio del día de HOY del historial del activo, o null.
 * (Distinto del precio actual del activo guardado en su doc: este es el
 * precio registrado en el doc de historial diario, no el `ultimoPrecio`.)
 */
export async function obtenerPrecioHistorialDeHoy(uid, activoId) {
    try {
        const hoy = await obtenerPrecioHoy(uid, activoId)
        return hoy?.precio ?? null
    } catch (error) {
        console.error("Error obteniendo precio actual:", error)
        return null
    }
}

/**
 * Elimina los registros de historial más antiguos (mantiene 7 días).
 */
export async function limpiarHistorial(uid, activoId) {
    try {
        await limpiarHistorialAntiguo(uid, activoId)
    } catch (error) {
        console.error("Error limpiando historial:", error)
    }
}