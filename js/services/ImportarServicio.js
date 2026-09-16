import { crearCuenta, crearMovimiento } from "../../firebase/firestore.js"
import {
    crearActivo,
    buscarActivoPorSimbolo
} from "../repositories/ActivoRepositorio.js"
import { crearPendiente } from "../repositories/PendienteRepositorio.js"
import { guardarSnapshotDelDia } from "../repositories/SnapshotRepositorio.js"

// ============================================
// IMPORTAR SERVICIO
// ============================================

/**
 * Importa un archivo .dvid en la cuenta del usuario.
 * Los datos se AGREGAN a los existentes (no se borra nada).
 *
 * @param {string} uid
 * @param {File} archivo
 * @returns {Promise<Object>} resumen con contadores y errores
 */
export async function importarDVID(uid, archivo) {
    try {
        console.log("[INFO] Importando .dvid...")

        const texto = await leerArchivo(archivo)
        const datos = JSON.parse(texto)

        if (datos.formato !== "CINCO") {
            throw new Error("El archivo no es un respaldo válido de CINCO")
        }

        console.log("[INFO] Datos a importar:", {
            formato: datos.formato,
            version: datos.version,
            cuentas: datos.cuentas?.length || 0,
            movimientos: datos.movimientos?.length || 0,
            activos: datos.activos?.length || 0,
            pendientes: datos.pendientes?.length || 0,
            snapshots: datos.snapshots?.length || 0
        })

        const resultado = {
            cuentas: 0,
            movimientos: 0,
            activos: 0,
            pendientes: 0,
            snapshots: 0,
            errores: []
        }

        // --------------------------------------
        // 1. ACTIVOS
        // --------------------------------------
        await importarActivos(uid, datos.activos, resultado)

        // --------------------------------------
        // 2. CUENTAS
        // --------------------------------------
        await importarCuentas(uid, datos.cuentas, resultado)

        // --------------------------------------
        // 3. MOVIMIENTOS
        // --------------------------------------
        await importarMovimientos(uid, datos.movimientos, resultado)

        // --------------------------------------
        // 4. PENDIENTES
        // --------------------------------------
        await importarPendientes(uid, datos.pendientes, resultado)

        // --------------------------------------
        // 5. SNAPSHOTS
        // --------------------------------------
        await importarSnapshots(uid, datos.snapshots, resultado)

        console.log("[INFO] Importación completada:", resultado)
        return resultado
    } catch (error) {
        console.error("[ERROR] Error importando:", error)
        throw error
    }
}

// ============================================
// IMPORTADORES POR COLECCIÓN
// ============================================

async function importarActivos(uid, activos, resultado) {
    if (!activos || activos.length === 0) return

    for (const activo of activos) {
        try {
            const existente = await buscarActivoPorSimbolo(uid, activo.simbolo)

            if (!existente) {
                const { id, creadoPor, ...datosLimpios } = activo
                await crearActivo(uid, datosLimpios)
                resultado.activos++
            }
        } catch (error) {
            resultado.errores.push(`Activo ${activo.simbolo}: ${error.message}`)
        }
    }
}

async function importarCuentas(uid, cuentas, resultado) {
    if (!cuentas || cuentas.length === 0) return

    for (const cuenta of cuentas) {
        try {
            const { id, ...datosLimpios } = cuenta
            await crearCuenta(uid, datosLimpios)
            resultado.cuentas++
        } catch (error) {
            resultado.errores.push(`Cuenta ${cuenta.nombre}: ${error.message}`)
        }
    }
}

async function importarMovimientos(uid, movimientos, resultado) {
    if (!movimientos || movimientos.length === 0) return

    for (const movimiento of movimientos) {
        try {
            const { id, ...datosLimpios } = movimiento
            await crearMovimiento(uid, datosLimpios)
            resultado.movimientos++
        } catch (error) {
            resultado.errores.push(`Movimiento: ${error.message}`)
        }
    }
}

async function importarPendientes(uid, pendientes, resultado) {
    if (!pendientes || pendientes.length === 0) return

    for (const pendiente of pendientes) {
        try {
            const { id, ...datosLimpios } = pendiente
            await crearPendiente(uid, datosLimpios)
            resultado.pendientes++
        } catch (error) {
            resultado.errores.push(`Pendiente: ${error.message}`)
        }
    }
}

async function importarSnapshots(uid, snapshots, resultado) {
    if (!snapshots || snapshots.length === 0) return

    for (const snapshot of snapshots) {
        try {
            // El snapshot viene con { fecha, patrimonioPEN, patrimonioUSD, patrimonioUSDT, ... }
            // El repositorio guarda por id = fecha (YYYY-MM-DD) y hace merge,
            // pero para importar fechas históricas necesitamos forzar el id.
            const { fecha, id, ...datosLimpios } = snapshot
            const fechaFinal = fecha || id

            if (!fechaFinal) {
                resultado.errores.push("Snapshot sin fecha, omitido")
                continue
            }

            await guardarSnapshotPorFecha(uid, fechaFinal, datosLimpios)
            resultado.snapshots++
        } catch (error) {
            resultado.errores.push(`Snapshot ${snapshot.fecha}: ${error.message}`)
        }
    }
}

// ============================================
// GUARDAR SNAPSHOT EN FECHA ESPECÍFICA
// ============================================
// Nota: importamos setDoc directamente aquí para no sobrecargar el repo
// con una función específica de importación.

import {
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { db } from "../../firebase/firestore.js"

async function guardarSnapshotPorFecha(uid, fecha, datos) {
    const referencia = doc(db, "usuarios", uid, "snapshots", fecha)
    await setDoc(referencia, {
        ...datos,
        actualizacion: serverTimestamp()
    }, { merge: true })
}

// ============================================
// LEER ARCHIVO
// ============================================

function leerArchivo(archivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target.result)
        reader.onerror = () => reject(new Error("Error leyendo archivo"))
        reader.readAsText(archivo)
    })
}

// ============================================
// PREVISUALIZAR IMPORTACIÓN
// ============================================

export async function previsualizarImportacion(archivo) {
    const texto = await leerArchivo(archivo)
    const datos = JSON.parse(texto)

    if (datos.formato !== "CINCO") {
        throw new Error("El archivo no es un respaldo válido de CINCO")
    }

    return {
        formato: datos.formato,
        version: datos.version,
        fechaExportacion: datos.fechaExportacion,
        resumen: {
            cuentas: datos.cuentas?.length || 0,
            movimientos: datos.movimientos?.length || 0,
            activos: datos.activos?.length || 0,
            pendientes: datos.pendientes?.length || 0,
            snapshots: datos.snapshots?.length || 0
        }
    }
}