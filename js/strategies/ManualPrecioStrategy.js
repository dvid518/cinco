// ============================================
// ESTRATEGIA DE PRECIO · MANUAL
// ============================================
// Los precios de un activo "manual" los ingresa el usuario.
// No consulta ninguna API externa: se lee el último precio conocido
// y el historial queda tal como está en Firestore.

export const ManualPrecioStrategy = {
    nombre: "manual",

    /**
     * Devuelve el último precio conocido del activo.
     */
    async obtenerPrecio(activo) {
        return activo?.ultimoPrecio ?? null
    },

    /**
     * Un activo manual no tiene serie histórica externa.
     */
    async obtenerPreciosDiarios(activo, dias = 7) {
        return []
    }
}