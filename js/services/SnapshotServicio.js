import {
    guardarSnapshotDelDia,
    obtenerSnapshots,
    obtenerSnapshotHoy
} from "../repositories/SnapshotRepositorio.js"
import { convertirMonto, getDivisaPrincipal } from "./DivisaServicio.js"
import { obtenerCuentas } from "../../firebase/firestore.js"

// ============================================
// SNAPSHOT SERVICIO
// ============================================

/**
 * Calcula el patrimonio actual del usuario en las 3 divisas base.
 * No usa precios de posiciones (eso se valora en otro sitio).
 */
export async function calcularPatrimonio(uid) {
    const cuentas = await obtenerCuentas(uid)

    let patrimonioPEN = 0
    let patrimonioUSD = 0
    let patrimonioUSDT = 0
    let totalActivos = 0
    let totalDeuda = 0
    let totalCuentas = 0

    cuentas.forEach(c => {
        if (c.estado === "archivada") return

        totalCuentas++

        if (c.esPatrimonio === false) return

        const divisa = c.moneda || "pen"

        // Tarjetas de crédito: restar deuda
        if (c.tipo === "credito") {
            const deuda = c.deuda || 0
            const deudaPEN = convertirMonto(deuda, divisa, "pen")
            const deudaUSD = convertirMonto(deuda, divisa, "usd")

            totalDeuda += deudaPEN
            patrimonioPEN -= deudaPEN
            patrimonioUSD -= deudaUSD
            patrimonioUSDT -= deudaUSD
            return
        }

        // Cuentas normales
        const saldo = c.saldoInicial || 0
        const saldoPEN = convertirMonto(saldo, divisa, "pen")
        totalActivos += saldoPEN
        patrimonioPEN += saldoPEN
        patrimonioUSD += convertirMonto(saldo, divisa, "usd")
        patrimonioUSDT += convertirMonto(saldo, divisa, "usd")
    })

    return {
        patrimonioPEN,
        patrimonioUSD,
        patrimonioUSDT,
        totalActivos,
        totalDeuda,
        totalCuentas,
        patrimonio: patrimonioPEN,
        tieneDeuda: totalDeuda > 0
    }
}

/**
 * Registra (o actualiza) el snapshot del día.
 */
export async function registrarSnapshot(uid) {
    try {
        const patrimonio = await calcularPatrimonio(uid)

        await guardarSnapshotDelDia(uid, {
            patrimonioPEN: patrimonio.patrimonioPEN,
            patrimonioUSD: patrimonio.patrimonioUSD,
            patrimonioUSDT: patrimonio.patrimonioUSDT
        })

        console.log("[INFO] Snapshot registrado:", patrimonio)
        return patrimonio
    } catch (error) {
        console.error("Error registrando snapshot:", error)
        throw error
    }
}

/**
 * Devuelve los datos para el gráfico de patrimonio.
 */
export async function obtenerPatrimonioParaGrafico(uid, dias = 30) {
    try {
        const snapshots = await obtenerSnapshots(uid, dias)

        return {
            labels: snapshots.map(s => {
                const fecha = new Date(s.fecha + "T00:00:00")
                return fecha.toLocaleDateString("es-PE", {
                    day: "2-digit",
                    month: "2-digit"
                })
            }),
            dataPEN: snapshots.map(s => s.patrimonioPEN || 0),
            dataUSD: snapshots.map(s => s.patrimonioUSD || 0),
            dataUSDT: snapshots.map(s => s.patrimonioUSDT || 0),
            snapshots
        }
    } catch (error) {
        console.error("Error obteniendo snapshots para gráfico:", error)
        return {
            labels: [],
            dataPEN: [],
            dataUSD: [],
            dataUSDT: [],
            snapshots: []
        }
    }
}

/**
 * Snapshot de hoy o lo crea si no existe.
 */
export async function obtenerOCrearSnapshotHoy(uid) {
    try {
        let snapshot = await obtenerSnapshotHoy(uid)

        if (!snapshot) {
            await registrarSnapshot(uid)
            snapshot = await obtenerSnapshotHoy(uid)
        }

        return snapshot
    } catch (error) {
        console.error("Error obteniendo snapshot de hoy:", error)
        return null
    }
}