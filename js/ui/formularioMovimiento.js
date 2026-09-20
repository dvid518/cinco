import { CONFIG_MOVIMIENTOS } from "../../constants/tiposMovimiento.js"
import { obtenerCuentas } from "../../firebase/firestore.js"
import { sesion } from "../core/sesion.js"
import { getFechaHoy } from "../core/fechas.js"
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
        .map(c => `<option value="${c.id}" data-moneda="${(c.moneda || "pen").toLowerCase()}">${c.nombre} (${c.moneda?.toUpperCase() || "PEN"})</option>`)
        .join("")

    const tarjetas = cuentasActivas.filter(c => c.tipo === "credito")
    const tarjetasOptions = tarjetas
        .map(c => `<option value="${c.id}" data-moneda="${(c.moneda || "pen").toLowerCase()}">${c.nombre} (deuda: ${(c.deuda || 0).toFixed(2)})</option>`)
        .join("")

    const hoy = getFechaHoy()
    const obligatorios = config.camposObligatorios || []
    const opcionales = config.camposOpcionales || []
    const campos = [...new Set([...obligatorios, ...opcionales])]

    let html = `
        <form id="form-movimiento" class="form-movimiento form-movimiento-grid">
    `

    for (const campo of campos) {
        html += generarCampo(campo, { cuentasOptions, tarjetasOptions, hoy }, !obligatorios.includes(campo))
    }

    html += `</form>`
    return html
}

// ============================================
// GENERADOR DE CAMPO
// ============================================

const CAMPOS_ANCHO_COMPLETO = [
    "cuenta",
    "cuentaOrigen",
    "cuentaDestino",
    "tarjeta",
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

function generarCampo(campo, contexto, opcional) {
    const { cuentasOptions, tarjetasOptions, hoy } = contexto
    const ancho = claseAncho(campo)
    const req = opcional ? "" : " required"

    switch (campo) {
        case "cuenta":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-cuenta">Cuenta</label>
                    <select id="campo-cuenta" class="form-input"${req}>
                        <option value="">Seleccionar cuenta</option>
                        ${cuentasOptions}
                    </select>
                </div>
            `
        case "cuentaOrigen":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-cuentaOrigen">Cuenta origen</label>
                    <select id="campo-cuentaOrigen" class="form-input"${req}>
                        <option value="">Seleccionar cuenta</option>
                        ${cuentasOptions}
                    </select>
                </div>
            `
        case "cuentaDestino":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-cuentaDestino">Cuenta destino</label>
                    <select id="campo-cuentaDestino" class="form-input"${req}>
                        <option value="">Seleccionar cuenta</option>
                        ${cuentasOptions}
                    </select>
                </div>
            `
        case "tarjeta":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-tarjeta">Tarjeta de crédito</label>
                    <select id="campo-tarjeta" class="form-input"${req}>
                        <option value="">Seleccionar tarjeta</option>
                        ${tarjetasOptions}
                    </select>
                </div>
            `
        case "activo":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-activo">Activo</label>
                    <input type="text" id="campo-activo" class="form-input" placeholder="Ej: VOO, BTC..."${req}>
                </div>
            `
        case "concepto":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-concepto">Concepto</label>
                    <input type="text" id="campo-concepto" class="form-input" placeholder="Descripción"${req}>
                </div>
            `
        case "monto":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-monto">Monto (<span id="simbolo-monto" class="simbolo-divisa">S/</span>)</label>
                    <input type="number" id="campo-monto" class="form-input" step="0.01" min="0.01" placeholder="0.00"${req}>
                </div>
            `
        case "montoOrigen":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-montoOrigen">Monto origen</label>
                    <input type="number" id="campo-montoOrigen" class="form-input" step="0.01" min="0.01" placeholder="0.00"${req}>
                </div>
            `
        case "montoDestino":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-montoDestino">Monto destino</label>
                    <input type="number" id="campo-montoDestino" class="form-input" step="0.01" min="0.01" placeholder="0.00"${req}>
                </div>
            `
        case "cantidad":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-cantidad">Cantidad</label>
                    <input type="number" id="campo-cantidad" class="form-input" step="0.0001" min="0.0001" placeholder="0"${req}>
                </div>
            `
        case "precio":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-precio">Precio unitario</label>
                    <input type="number" id="campo-precio" class="form-input" step="0.01" min="0.01" placeholder="0.00"${req}>
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
            return ""
        case "tasa":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-tasa">Tasa de cambio</label>
                    <input type="number" id="campo-tasa" class="form-input" step="0.0001" min="0.0001" placeholder="0.00"${req}>
                    <span class="form-hint">Se calcula automáticamente al completar montos</span>
                </div>
            `
        case "exchange":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-exchange">Exchange</label>
                    <input type="text" id="campo-exchange" class="form-input" placeholder="Ej: Binance, Kraken"${req}>
                </div>
            `
        case "nombreVendedor":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-nombreVendedor">Nombre del vendedor</label>
                    <input type="text" id="campo-nombreVendedor" class="form-input" placeholder="Nombre"${req}>
                </div>
            `
        case "nombreComprador":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-nombreComprador">Nombre del comprador</label>
                    <input type="text" id="campo-nombreComprador" class="form-input" placeholder="Nombre"${req}>
                </div>
            `
        case "cuentaPago":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-cuentaPago">Cuenta de pago</label>
                    <input type="text" id="campo-cuentaPago" class="form-input" placeholder="Número de cuenta"${req}>
                </div>
            `
        case "cuentaCobro":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-cuentaCobro">Cuenta de cobro</label>
                    <input type="text" id="campo-cuentaCobro" class="form-input" placeholder="Número de cuenta"${req}>
                </div>
            `
        case "fechaRealizacion":
            return `
                <div class="form-group${ancho}">
                    <label for="campo-fecha">Fecha de realización</label>
                    <div class="campo-fecha">
                        <input type="date" id="campo-fecha" class="form-input" value="${hoy}" max="${hoy}"${req}>
                        <button type="button" class="btn-calendario" aria-label="Abrir calendario">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-days preview-icon">
                                <path d="M8 2v4"/>
                                <path d="M16 2v4"/>
                                <rect width="18" height="18" x="3" y="4" rx="2"/>
                                <path d="M3 10h18"/>
                                <path d="M8 14h.01"/>
                                <path d="M12 14h.01"/>
                                <path d="M16 14h.01"/>
                                <path d="M8 18h.01"/>
                                <path d="M12 18h.01"/>
                                <path d="M16 18h.01"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `
        default:
            return `
                <div class="form-group${ancho}">
                    <label for="campo-${campo}">${campo}</label>
                    <input type="text" id="campo-${campo}" class="form-input" placeholder="${campo}"${req}>
                </div>
            `
    }
}

// ============================================
// SÍMBOLO DE DIVISA SEGÚN CUENTA
// ============================================

const SIMBOLO_MONEDA = { pen: "S/", usd: "$", usdt: "$" }

// Para cada tipo, qué select de cuenta define la divisa del movimiento.
const CUENTA_FUENTE_DIVISA = {
    ingreso: "campo-cuenta",
    gasto: "campo-cuenta",
    transferencia: "campo-cuentaOrigen",
    compraActivo: "campo-cuenta",
    ventaActivo: "campo-cuenta",
    p2pCompra: "campo-cuenta",
    p2pVenta: "campo-cuenta",
    compraTarjeta: "campo-cuenta",
    pagoTarjeta: "campo-cuentaOrigen",
    error: "campo-cuenta"
}

/**
 * Vincula el cambio de cuenta con el símbolo que acompaña al label Monto
 * y actualiza la divisa guardada. Llamar justo después de abrir el modal.
 */
export function vincularSimboloDivisa() {
    const ids = [...new Set(Object.values(CUENTA_FUENTE_DIVISA))]

    const actualizar = () => {
        const objetivo = document.getElementById("simbolo-monto")
        if (!objetivo) return

        for (const id of ids) {
            const select = document.getElementById(id)
            if (!select) continue
            const moneda = select.selectedOptions?.[0]?.dataset?.moneda
            if (moneda) {
                objetivo.textContent = SIMBOLO_MONEDA[moneda] || "$"
            }
        }
    }

    ids.forEach(id => {
        const select = document.getElementById(id)
        select?.addEventListener("change", actualizar)
    })

    actualizar()
}

// ============================================
// RECOGER DATOS DEL FORMULARIO
// ============================================

export function recogerDatosFormulario(tipo) {
    const config = CONFIG_MOVIMIENTOS[tipo]
    const obligatorios = config.camposObligatorios || []
    const opcionales = config.camposOpcionales || []
    const campos = [...new Set([...obligatorios, ...opcionales])]
    const datos = {}
    const errores = []

    for (const campo of campos) {
        const input = document.getElementById(`campo-${campo}`)
        if (!input) continue

        const esObligatorio = obligatorios.includes(campo)
        const valor = input.value.trim()

        if (!valor) {
            if (esObligatorio) {
                errores.push(campo)
                input.classList.add("input-error")
            }
            continue
        }

        input.classList.remove("input-error")
        datos[campo] = input.type === "number" ? parseFloat(valor) : valor
    }

    const comisionInput = document.getElementById("campo-comision")
    if (comisionInput && comisionInput.value) {
        datos.comision = parseFloat(comisionInput.value) || 0
    }

    // La divisa no se elige: se deriva de la cuenta seleccionada.
    const idFuente = CUENTA_FUENTE_DIVISA[tipo]
    if (idFuente) {
        const selectCuenta = document.getElementById(idFuente)
        const moneda = selectCuenta?.selectedOptions?.[0]?.dataset?.moneda
        if (moneda) datos.divisa = moneda
    }

    if (errores.length > 0) {
        mostrarNotificacion("error", `Campos obligatorios faltantes: ${errores.join(", ")}`)
        return null
    }

    return datos
}