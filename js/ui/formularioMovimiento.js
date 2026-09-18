import { CONFIG_MOVIMIENTOS } from "../../constants/tiposMovimiento.js"
import { DIVISAS, DIVISAS_LABELS } from "../../constants/divisas.js"
import { obtenerCuentas } from "../../firebase/firestore.js"
import { sesion } from "../core/sesion.js"
import { mostrarNotificacion } from "./notificaciones.js"

// ============================================
// GENERAR FORMULARIO SEGÚN TIPO
// ============================================

export async function generarFormularioMovimiento(tipo) {
    const uid = sesion.uid
    const config = CONFIG_MOVIMIENTOS[tipo]
    const cuentas = await obtenerCuentas(uid)

    const cuentasActivas = cuentas.filter(c => c.estado !== "archivada")
    const cuentasOptions = cuentasActivas
        .map(c => `<option value="${c.id}">${c.nombre} (${c.moneda?.toUpperCase() || "PEN"})</option>`)
        .join("")

    const tarjetas = cuentasActivas.filter(c => c.tipo === "credito")
    const tarjetasOptions = tarjetas
        .map(c => `<option value="${c.id}">${c.nombre} (deuda: ${(c.deuda || 0).toFixed(2)})</option>`)
        .join("")

    const hoy = new Date().toISOString().split("T")[0]
    const campos = config.camposObligatorios

    let html = `
        <form id="form-movimiento" class="form-movimiento form-movimiento-grid">
            <div class="form-group">
                <label>Tipo de movimiento</label>
                <span class="form-static">${config.nombre}</span>
            </div>
    `

    for (const campo of campos) {
        html += generarCampo(campo, { cuentasOptions, tarjetasOptions, hoy })
    }

    html += `</form>`
    return html
}

// ============================================
// GENERADOR DE CAMPO
// ============================================

const CAMPOS_ANCHO_COMPLETO = [
    "activo",
    "concepto",
    "tasa",
    "exchange",
    "nombreVendedor",
    "nombreComprador",
    "cuentaPago",
    "cuentaCobro",
    "comision",
    "fechaRealizacion"
]

function claseAncho(campo) {
    return CAMPOS_ANCHO_COMPLETO.includes(campo) ? " span-full" : ""
}

function opcionDivisa(codigo) {
    const superior = codigo.toUpperCase()
    return `<option value="${codigo}" ${codigo === DIVISAS.USD ? 'selected' : ''}>${DIVISAS_LABELS[codigo] || superior}</option>`
}

function generarCampo(campo, contexto) {
    const { cuentasOptions, tarjetasOptions, hoy } = contexto
    const ancho = claseAncho(campo)

    switch (campo) {
        case "cuenta":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-cuenta">Cuenta</label>
                    <select id="campo-cuenta" class="form-input" required>
                        <option value="">Seleccionar cuenta</option>
                        ${cuentasOptions}
                    </select>
                </div>
            `
        case "cuentaOrigen":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-cuentaOrigen">Cuenta origen</label>
                    <select id="campo-cuentaOrigen" class="form-input" required>
                        <option value="">Seleccionar cuenta</option>
                        ${cuentasOptions}
                    </select>
                </div>
            `
        case "cuentaDestino":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-cuentaDestino">Cuenta destino</label>
                    <select id="campo-cuentaDestino" class="form-input" required>
                        <option value="">Seleccionar cuenta</option>
                        ${cuentasOptions}
                    </select>
                </div>
            `
        case "tarjeta":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-tarjeta">Tarjeta de crédito</label>
                    <select id="campo-tarjeta" class="form-input" required>
                        <option value="">Seleccionar tarjeta</option>
                        ${tarjetasOptions}
                    </select>
                </div>
            `
        case "activo":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-activo">Activo</label>
                    <input type="text" id="campo-activo" class="form-input" placeholder="Ej: VOO, BTC..." required>
                </div>
            `
        case "concepto":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-concepto">Concepto</label>
                    <input type="text" id="campo-concepto" class="form-input" placeholder="Descripción" required>
                </div>
            `
        case "monto":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-monto">Monto</label>
                    <input type="number" id="campo-monto" class="form-input" step="0.01" min="0.01" placeholder="0.00" required>
                </div>
            `
        case "montoOrigen":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-montoOrigen">Monto origen</label>
                    <input type="number" id="campo-montoOrigen" class="form-input" step="0.01" min="0.01" placeholder="0.00" required>
                </div>
            `
        case "montoDestino":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-montoDestino">Monto destino</label>
                    <input type="number" id="campo-montoDestino" class="form-input" step="0.01" min="0.01" placeholder="0.00" required>
                </div>
            `
        case "cantidad":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-cantidad">Cantidad</label>
                    <input type="number" id="campo-cantidad" class="form-input" step="0.0001" min="0.0001" placeholder="0" required>
                </div>
            `
        case "precio":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-precio">Precio unitario</label>
                    <input type="number" id="campo-precio" class="form-input" step="0.01" min="0.01" placeholder="0.00" required>
                </div>
            `
        case "comision":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-comision">Comisión</label>
                    <input type="number" id="campo-comision" class="form-input" step="0.01" min="0" placeholder="0.00" value="0">
                </div>
            `
        case "divisa":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-divisa">Divisa</label>
                    <select id="campo-divisa" class="form-input" required>
                        ${opcionDivisa(DIVISAS.PEN)}
                        ${opcionDivisa(DIVISAS.USD)}
                        ${opcionDivisa(DIVISAS.USDT)}
                    </select>
                </div>
            `
        case "tasa":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-tasa">Tasa de cambio</label>
                    <input type="number" id="campo-tasa" class="form-input" step="0.0001" min="0.0001" placeholder="0.00" required>
                    <span class="form-hint">Se calcula automáticamente al completar montos</span>
                </div>
            `
        case "exchange":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-exchange">Exchange</label>
                    <input type="text" id="campo-exchange" class="form-input" placeholder="Ej: Binance, Kraken" required>
                </div>
            `
        case "nombreVendedor":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-nombreVendedor">Nombre del vendedor</label>
                    <input type="text" id="campo-nombreVendedor" class="form-input" placeholder="Nombre" required>
                </div>
            `
        case "nombreComprador":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-nombreComprador">Nombre del comprador</label>
                    <input type="text" id="campo-nombreComprador" class="form-input" placeholder="Nombre" required>
                </div>
            `
        case "cuentaPago":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-cuentaPago">Cuenta de pago</label>
                    <input type="text" id="campo-cuentaPago" class="form-input" placeholder="Número de cuenta" required>
                </div>
            `
        case "cuentaCobro":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-cuentaCobro">Cuenta de cobro</label>
                    <input type="text" id="campo-cuentaCobro" class="form-input" placeholder="Número de cuenta" required>
                </div>
            `
        case "fechaRealizacion":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-fecha">Fecha de realización</label>
                    <input type="date" id="campo-fecha" class="form-input" value="${hoy}" required>
                </div>
            `
        default:
            return `
                <div class="form-group${ancho}">
                    <label for="campo-${campo}">${campo}</label>
                    <input type="text" id="campo-${campo}" class="form-input" placeholder="${campo}" required>
                </div>
            `
    }
}

// ============================================
// RECOGER DATOS DEL FORMULARIO
// ============================================

export function recogerDatosFormulario(tipo) {
    const config = CONFIG_MOVIMIENTOS[tipo]
    const datos = {}
    const errores = []

    for (const campo of config.camposObligatorios) {
        const input = document.getElementById(`campo-${campo}`)
        if (!input) continue

        const valor = input.value.trim()

        if (!valor) {
            errores.push(campo)
            input.classList.add("input-error")
        } else {
            input.classList.remove("input-error")
            datos[campo] = input.type === "number" ? parseFloat(valor) : valor
        }
    }

    const comisionInput = document.getElementById("campo-comision")
    if (comisionInput && comisionInput.value) {
        datos.comision = parseFloat(comisionInput.value) || 0
    }

    if (errores.length > 0) {
        mostrarNotificacion("error", `Campos obligatorios faltantes: ${errores.join(", ")}`)
        return null
    }

    return datos
}