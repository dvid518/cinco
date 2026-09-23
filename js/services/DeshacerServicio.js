import { mostrarNotificacion } from "../ui/notificaciones.js"

const DURACION_DESHACER = 10000

// Muestra la notificación de "deshacer" tras una eliminación.
// - Botón "Aceptar"  → restaura el/los elemento(s) eliminado(s).
// - Botón "Rechazar" → mantiene el borrado.
// El cierre automático de la notificación = mantener el borrado.
export function ofrecerDeshacer({
    mensaje,
    restaurar,
    alRestaurar = null,
    duracion = DURACION_DESHACER
}) {
    if (!mensaje || typeof restaurar !== "function") return

    const ejecutarRestauracion = async () => {
        try {
            await restaurar()
            if (typeof alRestaurar === "function") {
                try {
                    await alRestaurar()
                } catch (error) {
                    console.error("[deshacer] Error actualizando la vista:", error)
                }
            }
            mostrarNotificacion("exito", "Elemento restaurado")
        } catch (error) {
            console.error("[deshacer] Error restaurando:", error)
            mostrarNotificacion("error", `No se pudo deshacer: ${error.message || "error desconocido"}`)
        }
    }

    mostrarNotificacion("info", mensaje, duracion, [
        { texto: "Aceptar", primaria: true, alClick: ejecutarRestauracion },
        { texto: "Cancelar", clase: "cancel", alClick: () => {} }
    ])
}