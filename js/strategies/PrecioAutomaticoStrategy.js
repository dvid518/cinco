// ============================================
// ESTRATEGIA DE PRECIO · AUTOMÁTICA (API)
// ============================================
// Consulta precios actuales e históricos de activos de renta variable
// usando APIs públicas sin clave, con CORS habilitado:
//
//   - Cripto (BTC, ETH, ...)  → Binance API pública
//       https://api.binance.com/api/v3/...
//   - Acciones / ETFs / Bonos  → Yahoo Finance chart API,
//       consultada a través del proxy CORS público de allorigins:
//       https://api.allorigins.win/raw?url=...
//
// El símbolo resuelto se obtiene del campo `apiSimbolo` del activo o,
// si no está definido, se deduce: "BTC" → "BTCUSDT" en cripto, y el
// símbolo en mayúsculas en el resto.

import { fechaLocalISO } from "../core/fechas.js"

const TIEMPO_MAXIMO_API = 10000

const BINANCE_API_BASE = "https://api.binance.com/api/v3"
const YAHOO_API_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"
const PROXY_CORS = "https://api.allorigins.win/raw?url="

// --------------------------------------------
// SÍMBOLO RESUELTO PARA LA API
// --------------------------------------------

function simboloResuelto(activo) {
    if (activo?.apiSimbolo) {
        return activo.apiSimbolo.toUpperCase()
    }

    const base = (activo?.simbolo || "").toUpperCase().trim()

    if (activo?.tipo === "crypto") {
        // Si el símbolo ya es un par (BTCUSDT, BTCUSD), usarlo tal cual
        if (/(USDT|USDC|USD|PERP|BUSD)$/.test(base)) {
            return base
        }
        return `${base}USDT`
    }

    return base
}

function esCripto(activo) {
    return activo?.tipo === "crypto"
}

// --------------------------------------------
// FETCH CON TIMEOUT (patrón de DivisaServicio)
// --------------------------------------------

async function fetchJson(url) {
    const controlador = new AbortController()
    const temporizador = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_API)

    try {
        const respuesta = await fetch(url, { signal: controlador.signal })

        if (!respuesta.ok) {
            throw new Error(`La API respondió ${respuesta.status}`)
        }

        return await respuesta.json()
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("La API del precio tardó demasiado en responder")
        }
        throw error
    } finally {
        clearTimeout(temporizador)
    }
}

function validarPrecio(precio) {
    const valor = Number(precio)
    if (!valor || valor <= 0 || !Number.isFinite(valor)) {
        throw new Error("La API no devolvió un precio válido")
    }
    return valor
}

// --------------------------------------------
// PROVEEDORES
// --------------------------------------------

async function precioBinance(simbolo) {
    const datos = await fetchJson(`${BINANCE_API_BASE}/ticker/price?symbol=${simbolo}`)
    return validarPrecio(datos?.price)
}

async function precioYahoo(simbolo) {
    const urlApi = `${YAHOO_API_BASE}/${simbolo}?interval=1d&range=1d&includePrePost=false&events=div%2Csplit`
    const datos = await fetchJson(`${PROXY_CORS}${encodeURIComponent(urlApi)}`)

    if (datos?.chart?.error) {
        throw new Error(datos.chart.error.description || "Yahoo no respondió para este símbolo")
    }

    const result = datos?.chart?.result?.[0]
    if (!result) {
        throw new Error("Yahoo no devolvió datos para este símbolo")
    }

    return validarPrecio(result?.meta?.regularMarketPrice ?? result?.indicators?.quote?.[0]?.close?.[0])
}

async function historicoBinance(simbolo, dias) {
    const datos = await fetchJson(
        `${BINANCE_API_BASE}/klines?symbol=${simbolo}&interval=1d&limit=${dias}`
    )

    if (!Array.isArray(datos)) {
        throw new Error("Binance no devolvió el histórico")
    }

    return datos
        .map(k => ({
            fecha: fechaLocalISO(new Date(k[0])),
            precio: Number(k[4])
        }))
        .filter(r => r.precio > 0)
        .slice(-dias)
}

async function historicoYahoo(simbolo, dias) {
    // Yahoo no acepta "Nd"; se pide un mes y se recorta a los últimos N días
    const urlApi = `${YAHOO_API_BASE}/${simbolo}?interval=1d&range=1mo&includePrePost=false`
    const datos = await fetchJson(`${PROXY_CORS}${encodeURIComponent(urlApi)}`)

    if (datos?.chart?.error) {
        throw new Error(datos.chart.error.description || "Yahoo no respondió para este símbolo")
    }

    const result = datos?.chart?.result?.[0]
    if (!result) {
        throw new Error("Yahoo no devolvió el histórico para este símbolo")
    }

    const marcas = result.timestamp || []
    const cierres = result.indicators?.quote?.[0]?.close || []

    return marcas
        .map((marca, i) => ({
            fecha: fechaLocalISO(new Date(marca * 1000)),
            precio: Number(cierres[i])
        }))
        .filter(r => r.precio > 0)
        .slice(-dias)
}

// --------------------------------------------
// INTERFAZ DE LA ESTRATEGIA
// --------------------------------------------

export const PrecioAutomaticoStrategy = {
    nombre: "api",

    /**
     * Precio actual del activo (scope intradía / último cierre).
     */
    async obtenerPrecio(activo) {
        const simbolo = simboloResuelto(activo)

        if (esCripto(activo)) {
            return precioBinance(simbolo)
        }

        return precioYahoo(simbolo)
    },

    /**
     * Serie diaria [{fecha, precio}] de los últimos N días, del más
     * antiguo al más reciente. Lanza error si la API falla; la capa de
     * servicio degrada al historial local y al modo manual.
     */
    async obtenerPreciosDiarios(activo, dias = 7) {
        const simbolo = simboloResuelto(activo)

        if (esCripto(activo)) {
            return historicoBinance(simbolo, dias)
        }

        return historicoYahoo(simbolo, dias)
    }
}