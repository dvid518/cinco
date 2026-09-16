import {
    buscarActivoPorSimbolo,
    crearActivo,
    actualizarPrecioActivo
} from "../repositories/ActivoRepositorio.js"

// ============================================
// ACTIVO SERVICIO
// ============================================

/**
 * Busca un activo por símbolo. Si existe, actualiza su precio
 * (si es distinto). Si no existe, lo crea.
 *
 * @param {string} uid
 * @param {Object} datos - { nombre, simbolo, tipo, ultimoPrecio }
 * @returns {Promise<Activo>}
 */
export async function obtenerOCrearActivo(uid, datos) {
    if (!uid) throw new Error("uid requerido")
    if (!datos?.simbolo) throw new Error("símbolo requerido")

    // 1. Buscar por símbolo
    let activo = await buscarActivoPorSimbolo(uid, datos.simbolo)

    if (activo) {
        // 2. Si existe y el precio cambió, actualizarlo
        if (
            datos.ultimoPrecio !== undefined &&
            activo.ultimoPrecio !== datos.ultimoPrecio
        ) {
            await actualizarPrecioActivo(uid, activo.id, datos.ultimoPrecio)
            activo.ultimoPrecio = datos.ultimoPrecio
            activo.ultimaActualizacion = new Date()
        }
        return activo
    }

    // 3. Si no existe, crearlo
    const id = await crearActivo(uid, datos)

    // 4. Devolver el activo recién creado
    return {
        id,
        nombre: datos.nombre,
        simbolo: (datos.simbolo || "").toUpperCase(),
        tipo: datos.tipo || "accion",
        ultimoPrecio: datos.ultimoPrecio || 0,
        ultimaActualizacion: new Date(),
        fechaCreacion: new Date()
    }
}