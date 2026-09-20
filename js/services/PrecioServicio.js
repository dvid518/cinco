// ============================================
// PRECIO SERVICIO
// ============================================
// Orquesta las estrategias de precio (manual | api) sobre los
// repositorios. La UI siempre trabaja contra este servicio.

import {
    obtenerPrecioActual as leerPrecioStorage,
    obtenerHistorialPrecios,
    guardarPrecio,
    guardarRegistroPrecio,
    obtenerEstrategia
} from "../repositories/PrecioRepositorio.js"
import { ManualPrecioStrategy } from "../strategies/ManualPrecioStrategy.js"
import { PrecioAutomaticoStrategy } from "../strategies/PrecioAutomaticoStrategy.js"

// --------------------------------------------
// SELECCIÓN DE ESTRATEGIA
// --------------------------------------------

export function obtenerEstrategiaPrecio(activo) {
    return obtenerEstrategia(activo) === "api"
        ? PrecioAutomaticoStrategy
        : ManualPrecioStrategy
}

// --------------------------------------------
// LECTURA
// --------------------------------------------

/**
 * Precio actual guardado + fuente + fecha de la última actualización.
 */
export async function obtenerPrecioActual(uid, activoId) {
    return leerPrecioStorage(uid, activoId)
}

// --------------------------------------------
// ESCRITURA
// --------------------------------------------

/**
 * Guarda un precio ingresado a mano (fuente "manual").
 */
export async function actualizarPrecioManual(uid, activo, precio) {
    if (!precio || precio <= 0) {
        throw new Error("El precio debe ser mayor a 0")
    }

    await guardarPrecio(uid, activo.id, precio, "manual")
    return precio
}

/**
 * Consulta la API y guarda el precio (fuente "api").
 * Para activos manuales devuelve el último precio conocido, sin tocar nada.
 */
export async function actualizarPrecioAutomatico(uid, activo) {
    const estrategia = obtenerEstrategiaPrecio(activo)

    if (estrategia === ManualPrecioStrategy) {
        return {
            precio: activo?.ultimoPrecio ?? null,
            fuente: "manual",
            actualizado: false
        }
    }

    const precio = await estrategia.obtenerPrecio(activo)
    await guardarPrecio(uid, activo.id, precio, "api")

    return {
        precio,
        fuente: "api",
        actualizado: true
    }
}

/**
 * Serie diaria [{fecha, precio}] de la API para un activo automático.
 * En activos manuales devuelve [].
 */
export async function obtenerPreciosDiarios(activo, dias = 7) {
    const estrategia = obtenerEstrategiaPrecio(activo)

    if (estrategia === ManualPrecioStrategy) {
        return []
    }

    return estrategia.obtenerPreciosDiarios(activo, dias)
}

/**
 * Datos listos para Chart.js ({ labels, data }) de los últimos `dias` días.
 *
 * - Se usa primero el historial local.
 * - Si el activo es automático y falta historia, se descarga la serie de
 *   la API, se persiste y se devuelve (la siguiente carga sale de cache).
 * - Cualquier fallo degrada a lo que haya localmente o a un gráfico vacío.
 */
export async function historialParaGrafico(uid, activo, dias = 7) {
    const estrategia = obtenerEstrategiaPrecio(activo)

    try {
        const historial = await obtenerHistorialPrecios(uid, activo.id, dias)

        if (estrategia === ManualPrecioStrategy || historial.length >= dias) {
            return aDatosGrafico(historial)
        }
    } catch (error) {
        console.warn("No se pudo leer el historial local:", error.message)
    }

    if (estrategia === ManualPrecioStrategy) {
        return { labels: [], data: [] }
    }

    try {
        const serie = await estrategia.obtenerPreciosDiarios(activo, dias)

        if (serie.length === 0) {
            return { labels: [], data: [] }
        }

        for (const registro of serie) {
            try {
                await guardarRegistroPrecio(uid, activo.id, registro.fecha, registro.precio)
            } catch (error) {
                console.warn("No se pudo guardar el registro diario:", error.message)
            }
        }

        return aDatosGrafico(serie)
    } catch (error) {
        console.warn("No se pudo descargar la serie desde la API:", error.message)
        return { labels: [], data: [] }
    }
}

// --------------------------------------------
// UTILIDAD
// --------------------------------------------

function aDatosGrafico(serie) {
    return {
        labels: serie.map(item => {
            const fecha = item.fecha instanceof Date
                ? item.fecha
                : new Date(`${item.fecha}T00:00:00`)
            return Number.isNaN(fecha.getTime())
                ? ""
                : fecha.toLocaleDateString("es-PE", {
                    day: "2-digit",
                    month: "2-digit"
                })
        }),
        data: serie.map(item => item.precio)
    }
}