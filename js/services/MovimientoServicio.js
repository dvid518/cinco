import { sesion } from "../core/sesion.js"
import {
    crearMovimiento,
    obtenerCuenta,
    actualizarCuenta,
    obtenerMovimientos,
    actualizarMovimientoDoc,
    eliminarMovimientoDoc
} from "../../firebase/firestore.js"
import { TIPOS_MOVIMIENTO, CONFIG_MOVIMIENTOS } from "../../constants/tiposMovimiento.js"
import { getFechaHoy } from "../core/fechas.js"
import { obtenerMeta, actualizarMeta } from "../repositories/MetaRepositorio.js"

// No se permiten fechas futuras: cualquier fechaRealizacion mayor que hoy
// se normaliza al día de hoy. Aplica tanto al registrar como al editar.
function normalizarFechaFutura(datos) {
    const iso = typeof datos?.fechaRealizacion === "string" ? datos.fechaRealizacion.slice(0, 10) : ""
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && iso > getFechaHoy()) {
        datos.fechaRealizacion = getFechaHoy()
    }
    return datos
}

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

    normalizarFechaFutura(datos)

    // 1. Crear el movimiento
    const movimiento = await crearMovimiento(uid, {
        tipo: tipoFinal,
        ...datos
    })

    // 2. Actualizar saldos
    await actualizarSaldos(uid, tipoFinal, datos)

    // 3. Actualizar posición si es compra/venta de activo.
    //    El error NO se traga: si la posición no pudo actualizarse, el
    //    usuario debe saberlo para no dejar el inventario inconsistente.
    if (esMovimientoDeActivo(tipoFinal)) {
        try {
            await aplicarPosicion(uid, tipoFinal, datos)
            console.log(`[INFO] Posición actualizada para activo: ${datos.activo}`)
        } catch (error) {
            console.error("[ERROR] Error actualizando posición:", error)
            throw new Error(
                `El movimiento se guardó, pero no se pudo actualizar la posición de "${datos.activo}": ${error.message}`
            )
        }
    }

    return movimiento
}

/**
 * Aplica el efecto de un movimiento de activo a la posición.
 * Se reutiliza tras crear, al revertir y al volver a aplicar en ediciones.
 */
async function aplicarPosicion(uid, tipo, datos) {
    const { actualizarPosicionPorMovimiento } = await import("./PosicionServicio.js")
    await actualizarPosicionPorMovimiento(uid, {
        tipo,
        activo: datos.activo,
        cuenta: datos.cuenta,
        cantidad: datos.cantidad,
        precio: datos.precio,
        comision: datos.comision || 0,
        divisa: datos.divisa
    })
}

/**
 * Revierte el efecto de un movimiento de activo (compra ↔ venta).
 */
async function revertirPosicion(uid, m) {
    if (!esMovimientoDeActivo(m.tipo)) return

    const tipoInverso = {
        [TIPOS_MOVIMIENTO.COMPRA_ACTIVO]: TIPOS_MOVIMIENTO.VENTA_ACTIVO,
        [TIPOS_MOVIMIENTO.VENTA_ACTIVO]: TIPOS_MOVIMIENTO.COMPRA_ACTIVO,
        [TIPOS_MOVIMIENTO.P2P_COMPRA]: TIPOS_MOVIMIENTO.P2P_VENTA,
        [TIPOS_MOVIMIENTO.P2P_VENTA]: TIPOS_MOVIMIENTO.P2P_COMPRA
    }[m.tipo]

    await aplicarPosicion(uid, tipoInverso, {
        activo: m.activo,
        cuenta: m.cuenta,
        cantidad: Math.abs(m.cantidad || 0),
        precio: m.precio,
        comision: 0,
        divisa: m.divisa
    })
}

// ============================================
// ACTUALIZAR MOVIMIENTO
// ============================================
// Revierte el efecto del movimiento original (saldos + posición) y aplica
// el del nuevo. NO reescribe fechaRegistro (se mantiene la creación).

export async function actualizarMovimiento(uid, movimientoId, movimientoOriginal, tipo, datos) {
    const tipoUpper = tipo.toUpperCase()
    const tipoFinal = Object.values(TIPOS_MOVIMIENTO).find(
        t => t.toUpperCase() === tipoUpper
    )

    if (!tipoFinal) {
        throw new Error(`Tipo de movimiento inválido: ${tipo}`)
    }

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

    normalizarFechaFutura(datos)

    // 1. Deshacer el efecto del movimiento original
    await revertirSaldos(uid, movimientoOriginal.tipo, movimientoOriginal)
    await revertirPosicion(uid, movimientoOriginal)
    if (movimientoOriginal?.metaId) {
        await revertirAporteMeta(uid, movimientoOriginal)
    }

    // 2. Aplicar el nuevo efecto
    await actualizarSaldos(uid, tipoFinal, datos)
    if (esMovimientoDeActivo(tipoFinal)) {
        await aplicarPosicion(uid, tipoFinal, datos)
    }
    if (movimientoOriginal?.metaId) {
        await aplicarAporteMeta(uid, movimientoOriginal.metaId, Math.abs(datos.monto || 0))
    }

    // 3. Actualizar el documento (conserva el vínculo con la meta)
    const datosGuardado = { tipo: tipoFinal, ...datos }
    if (movimientoOriginal?.metaId) {
        datosGuardado.metaId = movimientoOriginal.metaId
    }
    await actualizarMovimientoDoc(uid, movimientoId, datosGuardado)

    return true
}

// ============================================
// ELIMINAR MOVIMIENTO
// ============================================
// Revierte el efecto del movimiento (saldos + posición) y borra el doc.

export async function eliminarMovimiento(uid, m) {
    await revertirSaldos(uid, m.tipo, m)
    await revertirPosicion(uid, m)
    if (m?.metaId) {
        await revertirAporteMeta(uid, m)
    }
    await eliminarMovimientoDoc(uid, m.id)
    return true
}

// ============================================
// VÍNCULO CON METAS DE AHORRO
// ============================================
// Un gasto creado por "Aportar a meta" guarda `metaId`. Al eliminar o editar
// ese movimiento se ajusta el monto actual de la meta para que el fondo y el
// total aportado reflejen el nuevo estado de la cuenta.

async function revertirAporteMeta(uid, m) {
    if (!m?.metaId) return

    const meta = await obtenerMeta(uid, m.metaId)
    if (!meta) return

    const monto = Math.abs(m.monto || 0)
    await actualizarMeta(uid, m.metaId, {
        montoActual: Math.max(0, (meta.montoActual || 0) - monto)
    })
}

async function aplicarAporteMeta(uid, metaId, monto) {
    if (!metaId || !monto || monto <= 0) return

    const meta = await obtenerMeta(uid, metaId)
    if (!meta) return

    await actualizarMeta(uid, metaId, {
        montoActual: (meta.montoActual || 0) + monto
    })
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

        case TIPOS_MOVIMIENTO.GASTO: {
            const cuenta = await obtenerCuenta(uid, datos.cuenta)
            if (cuenta?.tipo === "credito") {
                // Comprar con una tarjeta de crédito es un gasto que
                // aumenta su deuda (no mueve saldoInicial).
                await actualizarDeudaTarjeta(uid, datos.cuenta, datos.monto, "aumentar")
            } else {
                await actualizarSaldoCuenta(uid, datos.cuenta, datos.monto, "restar")
            }
            break
        }

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
            if (datos.operacion === "sumar") {
                await actualizarSaldoCuenta(uid, datos.cuenta, datos.monto, "sumar")
            } else if (datos.operacion === "restar") {
                await actualizarSaldoCuenta(uid, datos.cuenta, datos.monto, "restar")
            }
            break

        default:
            console.warn(`Tipo de movimiento sin actualización de saldo: ${tipo}`)
    }
}

// ============================================
// REVERTIR SALDOS (inverso de actualizarSaldos)
// ============================================

async function revertirSaldos(uid, tipo, datos) {
    switch (tipo) {
        case TIPOS_MOVIMIENTO.INGRESO:
            await actualizarSaldoCuenta(uid, datos.cuenta, datos.monto, "restar")
            break

        case TIPOS_MOVIMIENTO.GASTO: {
            const cuenta = await obtenerCuenta(uid, datos.cuenta)
            if (cuenta?.tipo === "credito") {
                await actualizarDeudaTarjeta(uid, datos.cuenta, datos.monto, "reducir")
            } else {
                await actualizarSaldoCuenta(uid, datos.cuenta, datos.monto, "sumar")
            }
            break
        }

        case TIPOS_MOVIMIENTO.TRANSFERENCIA:
            await actualizarSaldoCuenta(uid, datos.cuentaOrigen, datos.monto, "sumar")
            await actualizarSaldoCuenta(uid, datos.cuentaDestino, datos.monto, "restar")
            break

        case TIPOS_MOVIMIENTO.CAMBIO_DIVISA:
            await actualizarSaldoCuenta(uid, datos.cuentaOrigen, datos.montoOrigen, "sumar")
            await actualizarSaldoCuenta(uid, datos.cuentaDestino, datos.montoDestino, "restar")
            break

        case TIPOS_MOVIMIENTO.COMPRA_ACTIVO:
        case TIPOS_MOVIMIENTO.P2P_COMPRA: {
            const total = (datos.cantidad * datos.precio) + (datos.comision || 0)
            await actualizarSaldoCuenta(uid, datos.cuenta, total, "sumar")
            break
        }

        case TIPOS_MOVIMIENTO.VENTA_ACTIVO:
        case TIPOS_MOVIMIENTO.P2P_VENTA: {
            const total = (datos.cantidad * datos.precio) - (datos.comision || 0)
            await actualizarSaldoCuenta(uid, datos.cuenta, total, "restar")
            break
        }

        case TIPOS_MOVIMIENTO.COMPRA_TARJETA:
            await actualizarDeudaTarjeta(uid, datos.cuenta, datos.monto, "reducir")
            break

        case TIPOS_MOVIMIENTO.PAGO_TARJETA:
            await actualizarDeudaTarjeta(uid, datos.tarjeta, datos.monto, "aumentar")
            await actualizarSaldoCuenta(uid, datos.cuentaOrigen, datos.monto, "sumar")
            break

        case TIPOS_MOVIMIENTO.ERROR:
            if (datos.operacion === "sumar") {
                await actualizarSaldoCuenta(uid, datos.cuenta, datos.monto, "restar")
            } else if (datos.operacion === "restar") {
                await actualizarSaldoCuenta(uid, datos.cuenta, datos.monto, "sumar")
            }
            break

        default:
            break
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

    if (filtros.tipos && filtros.tipos.length > 0) {
        const tiposValidos = filtros.tipos
        resultado = resultado.filter(m => tiposValidos.includes(m.tipo))
    } else if (filtros.tipo) {
        resultado = resultado.filter(m => m.tipo === filtros.tipo)
    }

    if (filtros.desde) {
        const desde = parseFechaLocal(filtros.desde)
        resultado = resultado.filter(m => {
            const fecha = normalizarFecha(m.fechaRealizacion || m.fechaRegistro)
            return fecha >= desde
        })
    }

    if (filtros.hasta) {
        const hasta = parseFechaLocal(filtros.hasta)
        hasta.setHours(23, 59, 59, 999)
        resultado = resultado.filter(m => {
            const fecha = normalizarFecha(m.fechaRealizacion || m.fechaRegistro)
            return fecha <= hasta
        })
    }

    if (filtros.cuenta) {
        resultado = resultado.filter(m => {
            return (
                m.cuenta === filtros.cuenta ||
                m.cuentaOrigen === filtros.cuenta ||
                m.cuentaDestino === filtros.cuenta ||
                m.tarjeta === filtros.cuenta
            )
        })
    }

    if (filtros.divisa) {
        const divisa = filtros.divisa.toUpperCase()
        resultado = resultado.filter(m => {
            return (
                (m.divisa || "").toUpperCase() === divisa ||
                (m.cuentaDivisa || "").toUpperCase() === divisa
            )
        })
    }

    if (filtros.q) {
        const busqueda = filtros.q.toLowerCase().trim()
        if (busqueda) {
            resultado = resultado.filter(m => {
                const texto = [
                    m.concepto,
                    m.activo,
                    m.exchange,
                    m.nombreVendedor,
                    m.nombreComprador,
                    m.cuentaPago,
                    m.cuentaCobro
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase()
                return texto.includes(busqueda)
            })
        }
    }

    resultado.sort((a, b) => {
        const fechaA = normalizarFecha(a.fechaRealizacion || a.fechaRegistro)
        const fechaB = normalizarFecha(b.fechaRealizacion || b.fechaRegistro)
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

// Parsea "YYYY-MM-DD" como fecha LOCAL (no UTC), para que los filtros
// coincidan con el día mostrado en el formulario.
function parseFechaLocal(valor) {
    if (!valor) return null
    const [anio, mes, dia] = String(valor).split("-").map(Number)
    if (!anio || !mes || !dia) return new Date(valor)
    return new Date(anio, mes - 1, dia)
}