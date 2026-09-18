// ============================================
// FECHAS · UTILIDADES
// ============================================

/**
 * Fecha de hoy en hora LOCAL (YYYY-MM-DD).
 * No usar toISOString(), que devuelve la fecha en UTC
 * (p. ej. a las 8pm en Perú ya es "mañana" en UTC).
 */
export function getFechaHoy() {
    const ahora = new Date()
    const anio = ahora.getFullYear()
    const mes = String(ahora.getMonth() + 1).padStart(2, "0")
    const dia = String(ahora.getDate()).padStart(2, "0")
    return `${anio}-${mes}-${dia}`
}

/**
 * Convierte una fecha ISO "YYYY-MM-DD" a un Date LOCAL
 * (evita el desfase que produce Date.parse con la zona horaria UTC).
 *
 * @param {string} fechaISO
 * @returns {Date}
 */
export function parseFechaLocal(fechaISO) {
    if (!fechaISO || typeof fechaISO !== "string") return new Date()
    const [anio, mes, dia] = fechaISO.split("-").map(n => parseInt(n, 10))
    return new Date(anio, (mes || 1) - 1, dia || 1)
}

/**
 * Formatea un Date como "YYYY-MM-DD" en hora local.
 *
 * @param {Date} fecha
 * @returns {string}
 */
export function fechaLocalISO(fecha) {
    const anio = fecha.getFullYear()
    const mes = String(fecha.getMonth() + 1).padStart(2, "0")
    const dia = String(fecha.getDate()).padStart(2, "0")
    return `${anio}-${mes}-${dia}`
}