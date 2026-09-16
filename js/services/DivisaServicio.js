import { actualizarPreferencias } from "../../firebase/firestore.js"
import { DIVISAS, DIVISAS_SYMBOLS, TIPO_CAMBIO_DEFAULT } from "../../constants/divisas.js"
import { sesion } from "../core/sesion.js"

// ============================================
// DIVISA SERVICIO
// ============================================

export function getDivisaPrincipal() {
    const prefs = sesion.getPreferencias()
    return prefs?.divisaPrincipal || DIVISAS.PEN
}

export function getSimboloDivisaPrincipal() {
    return DIVISAS_SYMBOLS[getDivisaPrincipal()] || "S/"
}

export function getTipoCambio() {
    const prefs = sesion.getPreferencias()
    return prefs?.tipoCambio || TIPO_CAMBIO_DEFAULT
}

// --------------------------------------------
// CONVERSIÓN
// --------------------------------------------

export function convertirMonto(monto, desde, hacia) {
    if (desde === hacia) return monto

    const tc = getTipoCambio()
    const penUSD = tc.pen_usd || 3.75

    // USDT = USD siempre
    const normalizar = (div) => (div === DIVISAS.USDT ? DIVISAS.USD : div)

    const desdeNorm = normalizar(desde)
    const haciaNorm = normalizar(hacia)

    if (desdeNorm === haciaNorm) return monto

    // Convertir a PEN primero
    let montoPEN = monto
    if (desdeNorm === DIVISAS.USD) {
        montoPEN = monto * penUSD
    }

    // Convertir de PEN a destino
    if (haciaNorm === DIVISAS.PEN) return montoPEN
    if (haciaNorm === DIVISAS.USD) return montoPEN / penUSD

    return monto
}

// --------------------------------------------
// FORMATEO
// --------------------------------------------

export function formatearMonto(monto, divisa = null) {
    const div = divisa || getDivisaPrincipal()
    const simbolo = DIVISAS_SYMBOLS[div] || "S/"
    return `${simbolo} ${Number(monto).toFixed(2)}`
}

export function formatearMontoEnPrincipal(monto, divisaOrigen) {
    const divPrincipal = getDivisaPrincipal()
    const montoConvertido = convertirMonto(monto, divisaOrigen, divPrincipal)
    return formatearMonto(montoConvertido, divPrincipal)
}

// --------------------------------------------
// PERSISTENCIA
// --------------------------------------------

/**
 * Guarda la divisa principal en Firestore y sesión.
 * Usa dot notation para no pisar otras preferencias.
 */
export async function guardarDivisaPrincipal(uid, divisa) {
    if (!["pen", "usd", "usdt"].includes(divisa)) {
        throw new Error(`Divisa inválida: ${divisa}`)
    }

    await actualizarPreferencias(uid, { divisaPrincipal: divisa })

    const prefs = sesion.getPreferencias()
    sesion.setPreferencias({ ...prefs, divisaPrincipal: divisa })
}

/**
 * Guarda el tipo de cambio en Firestore y sesión.
 */
export async function guardarTipoCambio(uid, penUSD, modo = "manual") {
    const tipoCambio = {
        pen_usd: penUSD,
        modo,
        actualizacion: new Date().toISOString()
    }

    await actualizarPreferencias(uid, { tipoCambio })

    const prefs = sesion.getPreferencias()
    sesion.setPreferencias({ ...prefs, tipoCambio })
}