import { obtenerCuenta, actualizarCuenta } from "../../firebase/firestore.js"

// ============================================
// CALCULAR USO DE TARJETA
// ============================================

export function calcularUsoTarjeta(tarjeta) {
    if (!tarjeta.limite || tarjeta.limite === 0) {
        return { porcentaje: 0, nivel: 'sin_limite' }
    }

    const deuda = tarjeta.deuda || 0
    const porcentaje = (deuda / tarjeta.limite) * 100

    let nivel = 'normal'
    if (porcentaje >= 70) {
        nivel = 'critico'
    } else if (porcentaje >= 30) {
        nivel = 'advertencia'
    }

    return {
        porcentaje: Math.round(porcentaje * 100) / 100,
        nivel
    }
}

// ============================================
// CALCULAR DÍAS HASTA PRÓXIMO CORTE/PAGO
// ============================================

export function calcularDiasHasta(diaMes) {
    const hoy = new Date()
    const año = hoy.getFullYear()
    const mes = hoy.getMonth()
    
    let fecha = new Date(año, mes, diaMes)
    
    if (fecha < hoy) {
        fecha = new Date(año, mes + 1, diaMes)
    }
    
    const diff = fecha - hoy
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function getProximoCorte(tarjeta) {
    if (!tarjeta.diaCorte) return null
    const dias = calcularDiasHasta(tarjeta.diaCorte)
    const fecha = new Date()
    fecha.setDate(fecha.getDate() + dias)
    return {
        dias,
        fecha: fecha.toLocaleDateString()
    }
}

export function getProximoPago(tarjeta) {
    if (!tarjeta.diaPago) return null
    const dias = calcularDiasHasta(tarjeta.diaPago)
    const fecha = new Date()
    fecha.setDate(fecha.getDate() + dias)
    return {
        dias,
        fecha: fecha.toLocaleDateString()
    }
}

// ============================================
// CALCULAR COMISIÓN POR PAGO
// ============================================

export function calcularComision(monto, desgravamen) {
    if (!desgravamen || desgravamen === 0) return 0
    // desgravamen está en porcentaje (ej: 0.34 = 0.34%)
    return (monto * desgravamen) / 100
}

// ============================================
// OBTENER CRÉDITO DISPONIBLE
// ============================================

export function getCreditoDisponible(tarjeta) {
    if (!tarjeta.limite) return 0
    return tarjeta.limite - (tarjeta.deuda || 0)
}