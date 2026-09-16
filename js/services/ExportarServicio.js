import { obtenerCuentas, obtenerMovimientos } from "../../firebase/firestore.js"
import { obtenerActivos } from "../repositories/ActivoRepositorio.js"
import { obtenerPendientes } from "../repositories/PendienteRepositorio.js"
import { obtenerSnapshots } from "../repositories/SnapshotRepositorio.js"

// ============================================
// EXPORTAR SERVICIO
// ============================================

/**
 * Exporta TODOS los datos del usuario a un archivo .dvid (JSON).
 *
 * @param {string} uid
 * @returns {Promise<{ ok: boolean, archivo: string }>}
 */
export async function exportarDVID(uid) {
    try {
        console.log("[INFO] Exportando datos como .dvid...")

        const [
            cuentas,
            movimientos,
            activos,
            pendientes,
            snapshots
        ] = await Promise.all([
            obtenerCuentas(uid),
            obtenerMovimientos(uid),
            obtenerActivos(uid),
            obtenerPendientes(uid, false),   // false = incluir consolidados
            obtenerSnapshots(uid, 365)       // últimos 365 días
        ])

        const datos = {
            formato: "CINCO",
            version: "2.0.0",
            fechaExportacion: new Date().toISOString(),
            uid,
            cuentas,
            movimientos,
            activos,
            pendientes,
            snapshots
        }

        const json = JSON.stringify(datos, null, 2)
        const blob = new Blob([json], { type: "application/x-cinco-backup" })
        const url = URL.createObjectURL(blob)

        const fecha = new Date().toISOString().split("T")[0]
        const nombreArchivo = `cinco_backup_${fecha}.dvid`

        descargarArchivo(url, nombreArchivo)
        URL.revokeObjectURL(url)

        console.log("[INFO] .dvid exportado:", nombreArchivo)
        return { ok: true, archivo: nombreArchivo }
    } catch (error) {
        console.error("[ERROR] Error exportando .dvid:", error)
        throw error
    }
}

// ============================================
// DESCARGAR ARCHIVO
// ============================================

function descargarArchivo(url, nombre) {
    const link = document.createElement("a")
    link.href = url
    link.download = nombre
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}