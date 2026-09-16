import { sesion } from "../core/sesion.js"
import {
    crearMovimiento,
    obtenerCuenta,
    actualizarCuenta,
    obtenerMovimientos
} from "../../firebase/firestore.js"
import { TIPOS_MOVIMIENTO, CONFIG_MOVIMIENTOS } from "../../constants/tiposMovimiento.js"

// ============================================
// REGISTRAR MOVIMIENTO
// ============================================

export async function registrarMovimiento(uid, tipo, datos) {
    const tipoUpper = tipo.toUpperCase()
    const tipoValido = Object.values(TIPOS_MOVIMIENTO).find(
        t => t.toUpperCase() === tipoUpper
    )

    if (!tipoValido) {
        throw new Error(`Tipo de movimiento inválido: ${tipo}`)
    }

    const tipoFinal = tipoValido
    const config = CONFIG_MOVIMIENTOS[tipoFinal]

    if (!config) {
        throw new Error(`Configuración no encontrada para: ${tipoFinal}`)
    }

    const camposFaltantes = config.camposObligatorios.filter(campo => {
        return datos[campo] === undefined || datos[campo] === null || datos[campo] === ""
    })

    if (camposFaltantes.length > 0) {
        throw new Error(`Campos obligatorios faltantes: ${camposFaltantes.join(", ")}`)
    }

    // 1. Crear el movimiento
    const movimiento = await crearMovimiento(uid, {
        tipo: tipoFinal,
        ...datos
    })

    // 2. Actualizar saldos
    await actualizarSaldos(uid, tipoFinal, datos)

    // 3. Actualizar posición si es compra/venta de activo
    if (esMovimientoDeActivo(tipoFinal)) {
        try {
            const { actualizarPosicionPorMovimiento } = await import("./PosicionServicio.js")
            await actualizarPosicionPorMovimiento(uid, {
                tipo: tipoFinal,
                activo: datos.activo,
                cuenta: datos.cuenta,
                cantidad: datos.cantidad,
                precio: datos.precio,
                comision: datos.comision || 0,       // ✅ AHORA SÍ SE PASA
                divisa: datos.divisa
            })
            console.log(`[INFO] Posición actualizada para activo: ${datos.activo}`)
        } catch (error) {
            console.error("[ERROR] Error actualizando posición:", error)
            // No lanzamos para no bloquear el movimiento ya creado
        }
    }

    return movimiento
}

function esMovimientoDeActivo(tipo) {
    return (
        tipo === TIPOS_MOVIMIENTO.COMPRA_ACTIVO ||
        tipo === TIPOS_MOVIMIENTO.VENTA_ACTIVO ||
        tipo === TIPOS_MOVIMIENTO.P2P_COMPRA ||
        tipo === TIPOS_MOVIMIENTO.P2P_VENTA
    )
}

// ============================================
// ACTUALIZAR SALDOS SEGÚN TIPO
// ============================================

async function actualizarSaldos(uid, tipo, datos) {
    switch (tipo) {
        case TIPOS_MOVIMIENTO.INGRESO:
            await actualizarSaldoCuenta(uid, datos.cuenta, datos.monto, "sumar")
            break

        case TIPOS_MOVIMIENTO.GASTO:
            await actualizarSaldoCuenta(uid, datos.cuenta, datos.monto, "restar")
            break

        case TIPOS_MOVIMIENTO.TRANSFERENCIA:
            await actualizarSaldoCuenta(uid, datos.cuentaOrigen, datos.monto, "restar")
            await actualizarSaldoCuenta(uid, datos.cuentaDestino, datos.monto, "sumar")
            break

        case TIPOS_MOVIMIENTO.CAMBIO_DIVISA:
            await actualizarSaldoCuenta(uid, datos.cuentaOrigen, datos.montoOrigen, "restar")
            await actualizarSaldoCuenta(uid, datos.cuentaDestino, datos.montoDestino, "sumar")
            break

        case TIPOS_MOVIMIENTO.COMPRA_ACTIVO: {
            // ✅ Comisión incluida en el saldo
            const totalCompra = (datos.cantidad * datos.precio) + (datos.comision || 0)
            await actualizarSaldoCuenta(uid, datos.cuenta, totalCompra, "restar")
            break
        }

        case TIPOS_MOVIMIENTO.VENTA_ACTIVO: {
            // ✅ Comisión descontada del saldo recibido
            const totalVenta = (datos.cantidad * datos.precio) - (datos.comision || 0)
            await actualizarSaldoCuenta(uid, datos.cuenta, totalVenta, "sumar")
            break
        }

        case TIPOS_MOVIMIENTO.P2P_COMPRA: {
            const totalP2PCompra = (datos.cantidad * datos.precio) + (datos.comision || 0)
            await actualizarSaldoCuenta(uid, datos.cuenta, totalP2PCompra, "restar")
            break
        }

        case TIPOS_MOVIMIENTO.P2P_VENTA: {
            const totalP2PVenta = (datos.cantidad * datos.precio) - (datos.comision || 0)
            await actualizarSaldoCuenta(uid, datos.cuenta, totalP2PVenta, "sumar")
            break
        }

        case TIPOS_MOVIMIENTO.COMPRA_TARJETA:
            await actualizarDeudaTarjeta(uid, datos.cuenta, datos.monto, "aumentar")
            break

        case TIPOS_MOVIMIENTO.PAGO_TARJETA:
            await actualizarDeudaTarjeta(uid, datos.tarjeta, datos.monto, "reducir")
            await actualizarSaldoCuenta(uid, datos.cuentaOrigen, datos.monto, "restar")
            break

        case TIPOS_MOVIMIENTO.ERROR:
            // Sin efecto en saldos
            break

        default:
            console.warn(`Tipo de movimiento sin actualización de saldo: ${tipo}`)
    }
}

// ============================================
// ACTUALIZAR SALDO DE UNA CUENTA
// ============================================

async function actualizarSaldoCuenta(uid, cuentaId, monto, operacion) {
    if (!cuentaId) {
        console.warn("No se proporcionó cuentaId para actualizar saldo")
        return
    }

    try {
        const cuenta = await obtenerCuenta(uid, cuentaId)
        if (!cuenta) {
            console.warn(`Cuenta no encontrada: ${cuentaId}`)
            return
        }

        const saldoActual = cuenta.saldoInicial || 0
        let nuevoSaldo

        switch (operacion) {
            case "sumar":
                nuevoSaldo = saldoActual + monto
                break
            case "restar":
                nuevoSaldo = saldoActual - monto
                break
            default:
                throw new Error(`Operación inválida: ${operacion}`)
        }

        if (cuenta.tipo !== "credito" && nuevoSaldo < 0) {
            console.warn(`Saldo negativo en cuenta ${cuenta.nombre}: ${nuevoSaldo}`)
        }

        await actualizarCuenta(uid, cuentaId, { saldoInicial: nuevoSaldo })
        console.log(`[INFO] Cuenta ${cuenta.nombre}: ${saldoActual} → ${nuevoSaldo}`)
    } catch (error) {
        console.error("Error actualizando saldo:", error)
        throw error
    }
}

// ============================================
// ACTUALIZAR DEUDA DE UNA TARJETA
// ============================================

async function actualizarDeudaTarjeta(uid, tarjetaId, monto, operacion) {
    if (!tarjetaId) {
        console.warn("No se proporcionó tarjetaId para actualizar deuda")
        return
    }

    try {
        const tarjeta = await obtenerCuenta(uid, tarjetaId)
        if (!tarjeta) {
            console.warn(`Tarjeta no encontrada: ${tarjetaId}`)
            return
        }

        if (tarjeta.tipo !== "credito") {
            console.warn(`La cuenta ${tarjetaId} no es una tarjeta de crédito`)
            return
        }

        const deudaActual = tarjeta.deuda || 0
        let nuevaDeuda

        switch (operacion) {
            case "aumentar":
                nuevaDeuda = deudaActual + monto
                break
            case "reducir":
                nuevaDeuda = Math.max(0, deudaActual - monto)
                break
            default:
                throw new Error(`Operación inválida: ${operacion}`)
        }

        await actualizarCuenta(uid, tarjetaId, { deuda: nuevaDeuda })
        console.log(`[INFO] Tarjeta ${tarjeta.nombre}: deuda ${deudaActual} → ${nuevaDeuda}`)
    } catch (error) {
        console.error("Error actualizando deuda:", error)
        throw error
    }
}

// ============================================
// OBTENER MOVIMIENTOS CON FILTROS
// ============================================

export async function obtenerMovimientosConFiltros(uid, filtros = {}) {
    const movimientos = await obtenerMovimientos(uid)

    let resultado = movimientos

    if (filtros.tipo) {
        resultado = resultado.filter(m => m.tipo === filtros.tipo)
    }

    if (filtros.desde) {
        const desde = new Date(filtros.desde)
        resultado = resultado.filter(m => {
            const fecha = normalizarFecha(m.fechaRealizacion)
            return fecha >= desde
        })
    }

    if (filtros.hasta) {
        const hasta = new Date(filtros.hasta)
        hasta.setHours(23, 59, 59)
        resultado = resultado.filter(m => {
            const fecha = normalizarFecha(m.fechaRealizacion)
            return fecha <= hasta
        })
    }

    if (filtros.cuenta) {
        resultado = resultado.filter(m => {
            return (
                m.cuenta === filtros.cuenta ||
                m.cuentaOrigen === filtros.cuenta ||
                m.cuentaDestino === filtros.cuenta
            )
        })
    }

    resultado.sort((a, b) => {
        const fechaA = normalizarFecha(a.fechaRealizacion)
        const fechaB = normalizarFecha(b.fechaRealizacion)
        return fechaB - fechaA
    })

    return resultado
}

// Normaliza un valor de fecha que puede ser Timestamp, Date o string ISO
function normalizarFecha(valor) {
    if (!valor) return new Date(0)
    if (valor?.toDate) return valor.toDate()
    if (valor instanceof Date) return valor
    return new Date(valor)
}