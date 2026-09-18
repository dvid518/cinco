import { sesion } from "../core/sesion.js"
import { abrirModal, cerrarModal } from "./modal.js"
import { mostrarNotificacion } from "./notificaciones.js"

// ============================================
// EXPORTAR / EXTRACTO (reutilizable)
// ============================================

export async function accionExportar() {
    const uid = sesion.uid
    if (!uid) return

    abrirModal({
        titulo: "Exportando respaldo",
        contenido: `
            <div class="modal-loading">
                <div class="loading-spinner"></div>
                <p class="modal-loading-text">Preparando archivo .dvid...</p>
            </div>
        `,
        variante: "narrow",
        confirmText: null,
        cancelText: null
    })

    try {
        const { exportarDVID } = await import("../services/ExportarServicio.js")
        const resultado = await exportarDVID(uid)
        cerrarModal()

        setTimeout(() => {
            abrirModal({
                titulo: "Respaldo exportado",
                contenido: `
                    <div class="modal-message">
                        <p class="modal-message-title">${resultado.archivo}</p>
                        <p class="modal-message-desc">
                            El archivo se ha descargado correctamente.<br>
                            Guárdalo en un lugar seguro.
                        </p>
                    </div>
                `,
                variante: "info",
                confirmText: "Entendido",
                onConfirm: () => true
            })
        }, 100)
    } catch (error) {
        console.error("Error exportando:", error)
        cerrarModal()
        mostrarNotificacion("error", `No se pudo exportar el respaldo: ${error.message}`)
    }
}