import { sesion } from "../core/sesion.js"
import { icono, LOGO_ESCINCO_CARGA } from "../core/iconos.js"
import {
    obtenerCuentas,
    obtenerMovimientos,
    crearCuenta,
    actualizarCuenta,
    eliminarCuenta,
    normalizarOrdenCuentas,
    reordenarCuentas,
    restaurarDocumento
} from "../../firebase/firestore.js"
import { CONFIG_MOVIMIENTOS, TIPOS_MOVIMIENTO } from "../../constants/tiposMovimiento.js"
import { DIVISAS_LABELS, DIVISAS_SYMBOLS } from "../../constants/divisas.js"
import { abrirModal, cerrarModal, estaAbierto } from "../ui/modal.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"
import { ofrecerDeshacer } from "../services/DeshacerServicio.js"
import { eliminarMovimiento, restaurarMovimiento } from "../services/MovimientoServicio.js"
import { estadoCicloDe, nivelEstadoCuenta, notificarCruces, proximaAnualidad } from "../services/CreditoServicio.js"
import { envolverSidebar } from "../ui/colapsoSidebar.js"

let cuentas = []
let cuentaSeleccionada = null
let uid = null

// Interacción con las cards de movimientos de la cuenta seleccionada.
let movimientosCuentaActivos = []
const seleccionadosCuenta = new Set()
const ordenSeleccionCuenta = []
let cardConAccionesCuenta = null
let clickTimerCuenta = null
let supresorClickCuenta = false
let supresorClickTimerCuenta = null
let eventosCardsCuentaListos = false
let eventosRefreshCuentaListos = false

// ============================================
// ÍCONOS POR TIPO DE CUENTA
// ============================================

const ICONOS_POR_TIPO = {
    banco: "landmark",
    efectivo: "banknote",
    broker: "trending-up",
    exchange: "arrow-left-right",
    credito: "credit-card",
    debito: "credit-card"
}

function formatearMontoConDivisa(monto, moneda = "pen") {
    const importe = Number(monto || 0).toFixed(2)
    const clave = String(moneda || "pen").toLowerCase()
    const formato = sesion.getPreferencias()?.formatoDivisa
    if (formato === "codigo") return `${importe} ${DIVISAS_LABELS[clave] || clave.toUpperCase()}`
    return `${DIVISAS_SYMBOLS[clave] || "S/"} ${importe}`
}

function iconoPorTipo(tipo) {
    return ICONOS_POR_TIPO[tipo] || "wallet"
}

// ============================================
// RENDER
// ============================================

export function render() {
    return `
        ${envolverSidebar(`
            <section id="sidebar">
                <button name="cta" class="glass act" aria-label="Cargando cuentas"></button>
            </section>
        `)}
        <section id="panel" class="glass">
            <div class="lista-vacia">${LOGO_ESCINCO_CARGA}</div>
        </section>
    `
}

// ============================================
// INIT
// ============================================

export async function init() {
    uid = sesion.uid
    console.log("[INFO] Cuentas iniciado para UID:", uid)

    // Siempre recargar al navegar: los saldos/deudas cambian al registrar
    // movimientos desde otros modales y no deben quedar desactualizados.
    await cargarCuentas()

    configurarEventos()
    configurarRefreshCuentas()
}

function configurarRefreshCuentas() {
    if (eventosRefreshCuentaListos) return
    eventosRefreshCuentaListos = true
    window.addEventListener("movimientos-actualizados", () => {
        if (document.getElementById("lista-movimientos-cuenta")) cargarCuentas()
    })
}

// ============================================
// CARGA
// ============================================

async function cargarCuentas() {
    try {
        cuentas = await obtenerCuentas(uid)
        await normalizarOrdenCuentas(uid, cuentas)
        if (cuentas.some(c => !Number.isFinite(Number(c.orden)))) {
            cuentas = await obtenerCuentas(uid)
        }
        cuentas.sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))

        await notificarCruces(cuentas, uid)

        renderizarSidebar()

        if (cuentaSeleccionada) {
            cuentaSeleccionada = cuentas.find(c => c.id === cuentaSeleccionada.id) || null
        }

        if (!cuentaSeleccionada && cuentas.length > 0) {
            seleccionarCuenta(cuentas[0].id)
        } else if (cuentas.length === 0) {
            mostrarVacio()
        } else {
            mostrarDetalleCuenta()
        }
    } catch (error) {
        console.error("Error cargando cuentas:", error)
        mostrarNotificacion("error", "No se pudieron cargar las cuentas")
    }
}

// ============================================
// SIDEBAR
// ============================================

function renderizarSidebar() {
    const sidebar = document.getElementById("sidebar")
    if (!sidebar) return

    sidebar.innerHTML = ""

    cuentas.forEach(cuenta => {
        const item = document.createElement("div")
        item.className = "cuenta-sidebar-item"
        item.dataset.id = cuenta.id
        item.draggable = true

        const btn = document.createElement("button")
        btn.className = "glass cuenta-sidebar-btn"
        btn.name = "cta"
        btn.dataset.id = cuenta.id
        btn.draggable = false
        btn.insertAdjacentHTML("beforeend", icono(iconoPorTipo(cuenta.tipo), 18))

        const texto = document.createElement("span")
        texto.textContent = cuenta.nombre
        btn.appendChild(texto)

        if (cuentaSeleccionada && cuenta.id === cuentaSeleccionada.id) {
            btn.classList.add("act")
        }

        btn.addEventListener("click", () => seleccionarCuenta(cuenta.id))
        item.addEventListener("dragstart", evento => {
            evento.dataTransfer.effectAllowed = "move"
            evento.dataTransfer.setData("text/plain", cuenta.id)
            item.classList.add("arrastrando")
        })
        item.addEventListener("dragend", () => item.classList.remove("arrastrando"))
        item.addEventListener("dragover", evento => evento.preventDefault())
        item.addEventListener("drop", evento => {
            evento.preventDefault()
            const origenId = evento.dataTransfer.getData("text/plain")
            if (!origenId || origenId === cuenta.id) return
            const origen = cuentas.find(c => c.id === origenId)
            if (!origen) return
            const ordenadas = [...cuentas]
            const desde = ordenadas.findIndex(c => c.id === origenId)
            const hasta = ordenadas.findIndex(c => c.id === cuenta.id)
            ordenadas.splice(desde, 1)
            ordenadas.splice(hasta, 0, origen)
            reordenarCuentas(uid, ordenadas)
                .then(() => cargarCuentas())
                .catch(error => {
                    console.error("Error reordenando cuentas:", error)
                    mostrarNotificacion("error", "No se pudo guardar el orden de las cuentas")
                })
        })

        item.append(btn)
        sidebar.appendChild(item)
    })
}

// ============================================
// SELECCIÓN
// ============================================

function seleccionarCuenta(id) {
    // Si hacemos click sobre la misma cuenta ya seleccionada, mantenerla seleccionada
    // y no cerrar el panel (mostrar detalle de la cuenta)
    if (cuentaSeleccionada && cuentaSeleccionada.id === id) {
        // Ya está seleccionada, no hacer toggle off, mantener vista detalle
        actualizarLastbar()
        return
    }

    cuentaSeleccionada = cuentas.find(c => c.id === id)
    if (!cuentaSeleccionada) return

    document.querySelectorAll("#sidebar .cuenta-sidebar-btn").forEach(btn => {
        btn.classList.toggle("act", btn.dataset.id === id)
    })

    mostrarDetalleCuenta()
    actualizarLastbar()
}

// ============================================
// DETALLE
// ============================================

async function mostrarDetalleCuenta() {
    const panel = document.getElementById("panel")
    if (!panel || !cuentaSeleccionada) return

    const cuenta = cuentaSeleccionada
    let movimientos = []
    try {
        movimientos = await obtenerMovimientos(uid)
    } catch (error) {
        console.error("Error cargando movimientos de la cuenta:", error)
    }
    if (cuentaSeleccionada?.id !== cuenta.id) return

    const ciclo = cuenta.tipo === "credito" ? estadoCicloDe(cuenta, movimientos) : null
    const panelInfo = cuenta.tipo === "credito"
        ? plantillaInfoTarjeta(cuenta, ciclo)
        : plantillaInfoNormal(cuenta)

    panel.innerHTML = `
        <div class="cuenta-vista">
            <div class="cuenta-vista-movimientos">
                <div class="cuenta-mov-head">
                    <div class="totales" id="totales-movimientos-cuenta"></div>
                </div>
                <div class="lista-cards" id="lista-movimientos-cuenta">
                    ${LOGO_ESCINCO_CARGA}
                </div>
            </div>
            <div class="cuenta-vista-info">
                ${panelInfo}
            </div>
        </div>
    `

    cargarMovimientosDeCuenta(cuenta, movimientos)
    vincularInteraccionCardsCuenta()

    panel.querySelectorAll(".btn-copiar").forEach(btn => {
        btn.addEventListener("click", () => {
            const texto = btn.dataset.copiar
            if (texto) copiarTexto(texto, btn.title?.replace("Copiar ", "") || "Texto")
        })
    })
}

// ============================================
// INFO · CUENTA NORMAL
// ============================================

function plantillaInfoNormal(c) {
    const saldo = c.saldoInicial || 0
    const esPositivo = saldo >= 0

    return `
        <div class="cuenta-perfil">
            <div class="cuenta-perfil-icono">${icono(iconoPorTipo(c.tipo), 26)}</div>
            <div class="cuenta-perfil-titulo">
                <h3>${c.nombre}</h3>
            </div>
            <div class="cuenta-perfil-badges">
                <span class="cuenta-badge">${nombreTipo(c.tipo)}</span>
                <span class="cuenta-badge estado ${c.estado === "archivada" ? "archivada" : ""}">${c.estado || "activa"}</span>
            </div>
        </div>

        <div class="cuenta-saldo-grande ${esPositivo ? "positive" : "negative"}">
            ${saldo < 0 ? "−" : ""}${formatearMontoConDivisa(Math.abs(saldo), c.moneda)}
        </div>

        <div class="cuenta-detalle">
            <div class="field">
                <span class="label">Tipo</span>
                <span class="value">${nombreTipo(c.tipo)}</span>
            </div>
            <div class="field">
                <span class="label">Moneda</span>
                <span class="value">${(c.moneda || "PEN").toUpperCase()}</span>
            </div>
            <div class="field">
                <span class="label">Estado</span>
                <span class="value">${c.estado || "activa"}</span>
            </div>
            ${c.num ? `<div class="field"><span class="label">Número</span><span class="value">${c.num} <button type="button" class="btn-copiar" data-copiar="${c.num}" title="Copiar número">${icono("copy", 14)}</button></span></div>` : ""}
            ${c.vence ? `<div class="field"><span class="label">Vencimiento</span><span class="value">${c.vence}</span></div>` : ""}
            ${c.cci ? `<div class="field"><span class="label">CCI</span><span class="value">${c.cci} <button type="button" class="btn-copiar" data-copiar="${c.cci}" title="Copiar CCI">${icono("copy", 14)}</button></span></div>` : ""}
        </div>
    `
}

// ============================================
// INFO · TARJETA DE CRÉDITO
// ============================================

function plantillaInfoTarjeta(c, ciclo) {
    const deuda = Number(c.deuda) || 0
    const limite = Number(c.limite) || 0
    const disponible = Math.max(0, limite - deuda)
    const estado = ciclo || estadoCicloDe(c, [])
    const { nivel, porcentaje } = nivelEstadoCuenta(c, estado.consumos)
    const nivelTexto = estado.pagadoCompleto
        ? "Pagado"
        : nivel === "critico" ? "Crítico" : nivel === "aviso" ? "Advertencia" : "Normal"
    const claseEstado = estado.pagadoCompleto ? "positive" : nivel === "critico" ? "negative" : nivel === "aviso" ? "ambar" : "positive"
    const claseBarra = estado.pagadoCompleto ? "" : nivel === "critico" ? "negative" : nivel === "aviso" ? "ambar" : ""
    const claseBadge = estado.pagadoCompleto ? "normal" : nivel === "critico" ? "critico" : nivel === "aviso" ? "aviso" : "normal"
    const corteInfo = calcularDiasHasta(c.diaCorte)
    const pagoInfo = calcularDiasHasta(c.diaPago)
    const anualidad = proximaAnualidad(c)

    return `
        <div class="cuenta-perfil">
            <div class="cuenta-perfil-icono">${icono("credit-card", 26)}</div>
            <div class="cuenta-perfil-titulo">
                <h3>${c.nombre}</h3>
            </div>
            <div class="cuenta-perfil-badges">
                <span class="cuenta-badge">Tarjeta de crédito</span>
                <span class="cuenta-badge estado ${claseBadge}">${nivelTexto}</span>
            </div>
        </div>

        <div class="credito-resumen">
            <div class="resumen-card">
                <div class="resumen-label">Crédito disponible</div>
                <div class="resumen-valor ${disponible > 0 ? "positive" : "negative"}">${formatearMontoConDivisa(disponible, c.moneda)}</div>
            </div>
            <div class="resumen-card">
                <div class="resumen-label">Deuda total</div>
                <div class="resumen-valor">${formatearMontoConDivisa(deuda, c.moneda)}</div>
            </div>
            <div class="resumen-card">
                <div class="resumen-label">Consumos del ciclo</div>
                <div class="resumen-valor ${claseEstado}">${formatearMontoConDivisa(estado.consumos, c.moneda)}</div>
            </div>
            <div class="resumen-card">
                <div class="resumen-label">Saldo por pagar</div>
                <div class="resumen-valor ${estado.restante > 0 ? "negative" : "positive"}">${formatearMontoConDivisa(estado.restante, c.moneda)}</div>
            </div>
        </div>

        <div class="credito-uso">
            <div class="aporte-progreso-wrap">
                <div class="aporte-progreso">
                    <div class="aporte-progreso-barra ${claseBarra}" style="--progreso:${Math.min(100, porcentaje).toFixed(1)}%"></div>
                </div>
                <span class="aporte-progreso-badge ${claseEstado}">${porcentaje.toFixed(0)}%</span>
            </div>
        </div>

        <div class="cuenta-detalle">
            <div class="field">
                <span class="label">Límite</span>
                <span class="value">${formatearMontoConDivisa(limite, c.moneda)}</span>
            </div>
            <div class="field">
                <span class="label">Pagos del ciclo</span>
                <span class="value">${formatearMontoConDivisa(estado.pagos, c.moneda)}</span>
            </div>
            <div class="field">
                <span class="label">Próximo corte</span>
                <span class="value">${corteInfo ? `en ${corteInfo.dias} días (${corteInfo.fecha})` : "No definido"}</span>
            </div>
            <div class="field">
                <span class="label">Próximo pago</span>
                <span class="value">${estado.pagadoCompleto ? "Ciclo pagado" : pagoInfo ? `en ${pagoInfo.dias} días (${pagoInfo.fecha})` : "No definido"}</span>
            </div>
            <div class="field">
                <span class="label">Desgravamen</span>
                <span class="value">${c.desgravamen || "0"}%</span>
            </div>
            ${c.anualidad ? `<div class="field"><span class="label">Anualidad</span><span class="value">${formatearMontoConDivisa(c.anualidad, c.moneda)}${anualidad ? ` · ${anualidad.fecha.toLocaleDateString("es-PE")}` : ""}</span></div>` : ""}
            ${c.num ? `<div class="field"><span class="label">Número</span><span class="value">${c.num} <button type="button" class="btn-copiar" data-copiar="${c.num}" title="Copiar número">${icono("copy", 14)}</button></span></div>` : ""}
            ${c.vence ? `<div class="field"><span class="label">Vencimiento</span><span class="value">${c.vence}</span></div>` : ""}
            <div class="field">
                <span class="label">Estado del ciclo</span>
                <span class="value ${claseEstado}">${nivelTexto}</span>
            </div>
        </div>
    `
}

// "Pagar tarjeta" abierto desde la propia tarjeta (no desde el selector de movimientos).
export async function abrirPagarTarjeta(cuenta) {
    try {
        const { abrirFormularioMovimiento } = await import("./movimientos.js")
        abrirFormularioMovimiento(TIPOS_MOVIMIENTO.PAGO_TARJETA, null, {
            alGuardar: () => cargarCuentas(),
            valores: { tarjeta: cuenta.id, divisa: cuenta.moneda || "pen" }
        })
    } catch (error) {
        console.error("Error abriendo pago de tarjeta:", error)
        mostrarNotificacion("error", "No se pudo abrir el pago de tarjeta")
    }
}

// ============================================
// INFO · MOVIMIENTOS DE LA CUENTA
// ============================================

async function cargarMovimientosDeCuenta(cuenta, movimientosCargados = null) {
    const contenedor = document.getElementById("lista-movimientos-cuenta")
    if (!contenedor) return
    const contenedorTotales = document.getElementById("totales-movimientos-cuenta")

    seleccionadosCuenta.clear()
    ordenSeleccionCuenta.length = 0
    cardConAccionesCuenta = null
    movimientosCuentaActivos = []

    try {
        const movimientos = movimientosCargados || await obtenerMovimientos(uid)
        const involucrados = movimientos
            .filter(m => movimientoInvolucra(m, cuenta.id))
            .sort((a, b) => {
                const fa = (fechaDeMovimiento(a)?.getTime?.()) || 0
                const fb = (fechaDeMovimiento(b)?.getTime?.()) || 0
                if (fa !== fb) return fb - fa
                const ra = a.fechaRegistro?.toDate?.()?.getTime?.() || a.fechaRegistro?.seconds || 0
                const rb = b.fechaRegistro?.toDate?.()?.getTime?.() || b.fechaRegistro?.seconds || 0
                return rb - ra
            })

        if (contenedorTotales) {
            contenedorTotales.innerHTML = renderizarTotalesCuenta(cuenta, involucrados)
            vincularAccionesTotales(cuenta)
        }

        const recientes = involucrados.slice(0, 20)
        movimientosCuentaActivos = recientes

        if (recientes.length === 0) {
            contenedor.innerHTML = `
                <p class="lista-vacia">
                    No hay movimientos que involucren esta cuenta todavía.
                </p>
            `
            return
        }

        contenedor.innerHTML = recientes.map(m => plantillaMovimiento(m, cuenta.id)).join("")
    } catch (error) {
        console.error("Error cargando movimientos de la cuenta:", error)
        if (contenedorTotales) contenedorTotales.innerHTML = ""
        contenedor.innerHTML = `<p class="lista-vacia error">Error al cargar movimientos</p>`
    }
}

// Totales adaptados a los movimientos que involucran esta cuenta.
function renderizarTotalesCuenta(cuenta, involucrados) {
    const porDivisa = {}

    const movimientosTotales = cuenta.tipo === "credito"
        ? involucrados.filter(m => [TIPOS_MOVIMIENTO.GASTO, TIPOS_MOVIMIENTO.COMPRA_TARJETA, TIPOS_MOVIMIENTO.COMPRA_ACTIVO, TIPOS_MOVIMIENTO.P2P_COMPRA].includes(m.tipo))
        : involucrados

    movimientosTotales.forEach(m => {
        const divisa = (m.divisa || cuenta.moneda || "PEN").toUpperCase()
        if (!porDivisa[divisa]) porDivisa[divisa] = { positivo: 0, negativo: 0 }
        const monto = montoDeMovimiento(m)
        if (esMovimientoPositivo(m, cuenta.id)) porDivisa[divisa].positivo += monto
        else porDivisa[divisa].negativo += monto
    })

    const lineas = Object.entries(porDivisa)
        .map(([divisa, totales]) => cuenta.tipo === "credito" ? `
            <span class="totales-item">
                <span class="totales-negativo">−${formatearMontoConDivisa(totales.negativo, divisa)}</span>
            </span>
        ` : `
            <span class="totales-item">
                <span class="totales-positivo">+${formatearMontoConDivisa(totales.positivo, divisa)}</span>
                <span class="totales-sep">/</span>
                <span class="totales-negativo">−${formatearMontoConDivisa(totales.negativo, divisa)}</span>
            </span>
        `)
        .join("")

    // Las tarjetas de crédito solo registran gastos y pagos; el resto de
    // cuentas abre el selector con la cuenta ya preseleccionada.
    const acciones = cuenta.estado === "archivada" ? "" : cuenta.tipo === "credito" ? `
            <div class="totales-acciones">
                <button type="button" class="totales-btn" id="btn-gasto-tarjeta" title="Registrar gasto" aria-label="Registrar gasto">${icono("arrow-up-right", 16)}</button>
                <button type="button" class="totales-btn pagar-tarjeta-btn" id="btn-pagar-tarjeta" title="Pagar tarjeta" aria-label="Pagar tarjeta">Pagar tarjeta</button>
            </div>
        ` : `
            <div class="totales-acciones">
                <button type="button" class="totales-btn" id="btn-nuevo-movimiento-cuenta" title="Nuevo movimiento" aria-label="Nuevo movimiento">${icono("plus-circle", 16)}</button>
            </div>
        `

    return `
        <span class="totales-count">${movimientosTotales.length} movimientos</span>
        ${lineas}
        ${acciones}
    `
}

function vincularAccionesTotales(cuenta) {
    if (cuenta.tipo === "credito") {
        document.getElementById("btn-gasto-tarjeta")?.addEventListener("click", () => {
            import("./movimientos.js").then(({ abrirFormularioMovimiento }) => {
                abrirFormularioMovimiento(TIPOS_MOVIMIENTO.GASTO, null, {
                    alGuardar: () => cargarCuentas(),
                    valores: { cuenta: cuenta.id }
                })
            })
        })
        document.getElementById("btn-pagar-tarjeta")?.addEventListener("click", () => {
            abrirPagarTarjeta(cuenta)
        })
    } else {
        document.getElementById("btn-nuevo-movimiento-cuenta")?.addEventListener("click", () => {
            import("./movimientos.js").then(({ abrirSelectorTipoMovimiento }) => {
                abrirSelectorTipoMovimiento(cuenta.id)
            })
        })
    }
}

function movimientoInvolucra(m, cuentaId) {
    return (
        m.cuenta === cuentaId ||
        m.cuentaOrigen === cuentaId ||
        m.cuentaDestino === cuentaId ||
        m.tarjeta === cuentaId
    )
}

function plantillaMovimiento(m, cuentaId = null) {
    const monto = montoDeMovimiento(m)
    const esPositivo = esMovimientoPositivo(m, cuentaId)
    const signo = esPositivo ? "+" : "−"
    const clase = esPositivo ? "positive" : "negative"
    const tipoNombre = CONFIG_MOVIMIENTOS[m.tipo]?.nombre || m.tipo || "Desconocido"
    const fecha = formatearFecha(m.fechaRealizacion)
    const seleccionada = seleccionadosCuenta.has(m.id) ? " seleccionado" : ""

    return `
        <div class="card-item${seleccionada}" data-id="${m.id}">
            <div class="card-item-main">
                <div class="card-item-info">
                    <span class="card-item-titulo">${m.concepto || m.activo || m.tipo || "Sin concepto"}</span>
                    <span class="card-item-detalle">${fecha} · ${tipoNombre}</span>
                </div>
                <div class="card-item-valor-wrap">
                    <span class="card-item-valor ${clase}">
                        ${signo} ${formatearMontoConDivisa(Math.abs(monto), m.divisa || "pen")}
                    </span>
                    <div class="card-item-acciones">
                        <button type="button" class="card-action-btn" data-accion="editar" title="Editar" aria-label="Editar">
                            ${icono("pencil", 16)}
                        </button>
                        <button type="button" class="card-action-btn danger" data-accion="eliminar" title="Eliminar" aria-label="Eliminar">
                            ${icono("trash", 16)}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `
}

function esMovimientoPositivo(m, cuentaId = null) {
    if (m?.tipo === TIPOS_MOVIMIENTO.PAGO_TARJETA) return cuentaId ? m.tarjeta === cuentaId : false
    if (m?.tipo === TIPOS_MOVIMIENTO.ERROR) return m.operacion === "sumar"
    return m?.tipo === "ingreso" || m?.tipo === "ventaActivo" || m?.tipo === "p2pVenta"
}

// ============================================
// INTERACCIÓN CON LAS CARDS DE MOVIMIENTOS
// ============================================
// Mismo comportamiento que la página de movimientos:
//   click     → abrir edición (o seleccionar si ya hay selección activa)
//   dblclick  → seleccionar / deseleccionar
//   mantén    → seleccionar (clic sostenido)
//   swipe ←   → revelar acciones (editar / eliminar)

function vincularInteraccionCardsCuenta() {
    const container = document.getElementById("lista-movimientos-cuenta")
    container?.addEventListener("click", manejarClickCardCuenta)
    container?.addEventListener("dblclick", manejarDobleClickCardCuenta)
    vincularGestosCardCuenta(container)
    configurarEventosCardsCuentaGlobales()
}

function configurarEventosCardsCuentaGlobales() {
    if (eventosCardsCuentaListos) return
    eventosCardsCuentaListos = true
    document.addEventListener("click", manejarClickFueraCardsCuenta)
    document.addEventListener("keydown", manejarTecladoSeleccionCuenta)
}

function marcarSupresorClickCuenta() {
    supresorClickCuenta = true
    clearTimeout(supresorClickTimerCuenta)
    supresorClickTimerCuenta = setTimeout(() => { supresorClickCuenta = false }, 400)
}

function consumirSupresorClickCuenta() {
    if (!supresorClickCuenta) return false
    supresorClickCuenta = false
    clearTimeout(supresorClickTimerCuenta)
    return true
}

function modoUnClickSeleccion() {
    return sesion.getPreferencias()?.accesibilidad?.unClickSeleccion === true
}

function manejarClickCardCuenta(evento) {
    const accionBtn = evento.target.closest(".card-action-btn")
    if (accionBtn) {
        evento.stopPropagation()
        const m = movimientosCuentaActivos.find(x => x.id === accionBtn.closest(".card-item")?.dataset.id)
        ocultarAccionesCardsCuenta()
        if (!m) return
        if (accionBtn.dataset.accion === "editar") abrirEditarMovimientoCuenta(m)
        else abrirModalEliminarMovimientoCuenta(m)
        return
    }

    const card = evento.target.closest(".card-item")

    if (cardConAccionesCuenta) {
        const esLaMisma = card === cardConAccionesCuenta
        ocultarAccionesCardsCuenta()
        if (esLaMisma) {
            consumirSupresorClickCuenta()
            return
        }
    }

    if (consumirSupresorClickCuenta()) return
    if (!card) return

    const id = card.dataset.id

    if (modoUnClickSeleccion()) {
        seleccionarPorUnClickCuenta(id, evento.shiftKey)
        return
    }

    if (seleccionadosCuenta.size > 0) {
        toggleSeleccionCuenta(id)
        return
    }

    if (clickTimerCuenta) {
        clearTimeout(clickTimerCuenta)
        clickTimerCuenta = null
    }

    clickTimerCuenta = setTimeout(() => {
        clickTimerCuenta = null
        if (seleccionadosCuenta.size === 0) {
            const m = movimientosCuentaActivos.find(x => x.id === id)
            if (m) abrirEditarMovimientoCuenta(m)
        }
    }, 280)
}

function manejarDobleClickCardCuenta(evento) {
    if (evento.target.closest(".card-action-btn")) return
    const card = evento.target.closest(".card-item")
    if (!card) return
    if (clickTimerCuenta) {
        clearTimeout(clickTimerCuenta)
        clickTimerCuenta = null
    }
    if (modoUnClickSeleccion()) {
        limpiarSeleccionCuenta()
        const m = movimientosCuentaActivos.find(x => x.id === card.dataset.id)
        if (m) abrirEditarMovimientoCuenta(m)
        return
    }
    toggleSeleccionCuenta(card.dataset.id)
}

function manejarClickFueraCardsCuenta(evento) {
    if (!document.getElementById("lista-movimientos-cuenta")) return
    if (evento.target.closest(".card-item")) return
    if (evento.target.closest("#app-footer")) return
    if (evento.target.closest(".modal-overlay")) return
    ocultarAccionesCardsCuenta()
    limpiarSeleccionCuenta()
}

function manejarTecladoSeleccionCuenta(evento) {
    if (!document.getElementById("lista-movimientos-cuenta")) return
    if (estaAbierto()) return

    if (evento.key === "Escape") {
        if (seleccionadosCuenta.size > 0) {
            ocultarAccionesCardsCuenta()
            limpiarSeleccionCuenta()
        }
        return
    }

    if (evento.key !== "Delete" && evento.key !== "Backspace") return
    if (evento.target.matches("input, textarea, select")) return
    if (seleccionadosCuenta.size === 0) return
    evento.preventDefault()
    deseleccionarUltimoCuenta()
}

function seleccionarPorUnClickCuenta(id, conShift) {
    if (conShift) {
        toggleSeleccionCuenta(id)
        return
    }
    if (seleccionadosCuenta.size === 1 && seleccionadosCuenta.has(id)) return
    seleccionadosCuenta.clear()
    ordenSeleccionCuenta.length = 0
    seleccionadosCuenta.add(id)
    ordenSeleccionCuenta.push(id)
    actualizarSeleccionCuentaEnDOM()
}

function toggleSeleccionCuenta(id) {
    if (seleccionadosCuenta.has(id)) {
        seleccionadosCuenta.delete(id)
        const idx = ordenSeleccionCuenta.indexOf(id)
        if (idx !== -1) ordenSeleccionCuenta.splice(idx, 1)
    } else {
        seleccionadosCuenta.add(id)
        ordenSeleccionCuenta.push(id)
    }
    actualizarSeleccionCuentaEnDOM()
}

function limpiarSeleccionCuenta() {
    if (seleccionadosCuenta.size === 0) return
    seleccionadosCuenta.clear()
    ordenSeleccionCuenta.length = 0
    actualizarSeleccionCuentaEnDOM()
}

function deseleccionarUltimoCuenta() {
    if (ordenSeleccionCuenta.length === 0) return
    toggleSeleccionCuenta(ordenSeleccionCuenta[ordenSeleccionCuenta.length - 1])
}

function actualizarSeleccionCuentaEnDOM() {
    const container = document.getElementById("lista-movimientos-cuenta")
    if (!container) return
    container.querySelectorAll(".card-item").forEach(card => {
        card.classList.toggle("seleccionado", seleccionadosCuenta.has(card.dataset.id))
    })
}

function vincularGestosCardCuenta(container) {
    if (!container) return

    let gesto = null

    const cancelar = () => {
        if (gesto?.timer) clearTimeout(gesto.timer)
        gesto = null
    }

    container.addEventListener("pointerdown", (evento) => {
        if (evento.pointerType === "mouse" && evento.button !== 0) return
        if (evento.target.closest(".card-action-btn")) return

        const card = evento.target.closest(".card-item")
        if (!card) return

        cancelar()
        if (cardConAccionesCuenta && cardConAccionesCuenta !== card) ocultarAccionesCardsCuenta()

        gesto = {
            card,
            pointerId: evento.pointerId,
            pointerType: evento.pointerType,
            startX: evento.clientX,
            startY: evento.clientY,
            movido: false,
            swipeRevelado: false,
            timer: null
        }

        const duracion = evento.pointerType === "touch" ? 500 : 700
        gesto.timer = setTimeout(() => {
            if (!gesto) return
            toggleSeleccionCuenta(card.dataset.id)
            marcarSupresorClickCuenta()
            cancelar()
        }, duracion)
    })

    container.addEventListener("pointermove", (evento) => {
        if (!gesto || evento.pointerId !== gesto.pointerId) return

        const dx = evento.clientX - gesto.startX
        const dy = evento.clientY - gesto.startY

        if (!gesto.movido && Math.hypot(dx, dy) > 10) {
            gesto.movido = true
            if (gesto.timer) {
                clearTimeout(gesto.timer)
                gesto.timer = null
            }
        }

        if (!gesto.movido || gesto.pointerType === "mouse") return

        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
            gesto.swipeRevelado = true
            if (dx < 0) mostrarAccionesCardCuenta(gesto.card)
            else ocultarAccionesCardsCuenta()
        }
    })

    const finalizar = (evento) => {
        if (!gesto || evento.pointerId !== gesto.pointerId) return
        if (gesto.swipeRevelado) marcarSupresorClickCuenta()
        cancelar()
    }

    container.addEventListener("pointerup", finalizar)
    container.addEventListener("pointercancel", finalizar)
}

function mostrarAccionesCardCuenta(card) {
    if (cardConAccionesCuenta && cardConAccionesCuenta !== card) {
        cardConAccionesCuenta.classList.remove("acciones-visibles")
    }
    cardConAccionesCuenta = card
    card.classList.add("acciones-visibles")
}

function ocultarAccionesCardsCuenta() {
    if (!cardConAccionesCuenta) return
    cardConAccionesCuenta.classList.remove("acciones-visibles")
    cardConAccionesCuenta = null
}

async function abrirEditarMovimientoCuenta(m) {
    try {
        const { abrirFormularioMovimiento } = await import("./movimientos.js")
        abrirFormularioMovimiento(m.tipo, m, { alGuardar: () => cargarCuentas() })
    } catch (error) {
        console.error("Error abriendo edición de movimiento:", error)
        mostrarNotificacion("error", "No se pudo abrir la edición del movimiento")
    }
}

function abrirModalEliminarMovimientoCuenta(m) {
    const tipoNombre = CONFIG_MOVIMIENTOS[m.tipo]?.nombre || m.tipo || "Movimiento"
    abrirModal({
        titulo: "Eliminar movimiento",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-title-danger">¿Eliminar este movimiento?</p>
                <p class="modal-message-desc">
                    <strong>${m.concepto || m.activo || tipoNombre}</strong>
                    · ${formatearFecha(m.fechaRealizacion)}
                </p>
            </div>
        `,
        variante: "confirm",
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            try {
                const snapshot = { ...m }
                limpiarSeleccionCuenta()
                await eliminarMovimiento(uid, m)
                await cargarCuentas()
                ofrecerDeshacer({
                    mensaje: "Movimiento eliminado. ¿Deshacer?",
                    restaurar: () => restaurarMovimiento(uid, snapshot),
                    alRestaurar: () => cargarCuentas()
                })
                return true
            } catch (error) {
                console.error("Error eliminando movimiento:", error)
                mostrarNotificacion("error", `No se pudo eliminar: ${error.message || "error desconocido"}`)
                return false
            }
        }
    })
}

function montoDeMovimiento(m) {
    if (m.monto !== undefined && m.monto !== null && m.monto !== "") {
        return Number(m.monto) || 0
    }
    if (m.cantidad && m.precio) {
        const total = Number(m.cantidad) * Number(m.precio)
        const comision = Number(m.comision) || 0
        return esMovimientoPositivo(m) ? (total - comision) : (total + comision)
    }
    if (m.montoOrigen) return Number(m.montoOrigen) || 0
    if (m.montoDestino) return Number(m.montoDestino) || 0
    return 0
}

function fechaDeMovimiento(m) {
    const valor = m.fechaRealizacion || m.fechaRegistro
    if (!valor) return null
    if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
        const [anio, mes, dia] = valor.split("-").map(Number)
        return new Date(anio, mes - 1, dia)
    }
    if (valor?.toDate) return valor.toDate()
    if (valor?.seconds) return new Date(valor.seconds * 1000)
    return new Date(valor)
}

function formatearFecha(valor) {
    if (!valor) return "—"
    try {
        if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
            const [anio, mes, dia] = valor.split("-").map(Number)
            return new Date(anio, mes - 1, dia).toLocaleDateString("es-PE")
        }
        if (valor?.toDate) return valor.toDate().toLocaleDateString("es-PE")
        if (valor?.seconds) return new Date(valor.seconds * 1000).toLocaleDateString("es-PE")
        return new Date(valor).toLocaleDateString("es-PE")
    } catch {
        return "—"
    }
}

function nombreTipo(tipo) {
    const NOMBRES = {
        banco: "Banco",
        efectivo: "Efectivo",
        broker: "Broker",
        exchange: "Exchange",
        credito: "Tarjeta de crédito",
        debito: "Tarjeta de débito"
    }
    return NOMBRES[tipo] || "Cuenta"
}

async function copiarTexto(texto, etiqueta = "Texto") {
    try {
        await navigator.clipboard.writeText(texto)
        mostrarNotificacion("exito", `${etiqueta} copiado`)
    } catch (error) {
        console.error("Error copiando:", error)
        mostrarNotificacion("error", `No se pudo copiar ${etiqueta.toLowerCase()}`)
    }
}

function calcularDiasHasta(diaMes) {
    if (!diaMes || diaMes < 1 || diaMes > 31) return null

    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const crear = (anio, mes) => {
        const ultimo = new Date(anio, mes + 1, 0).getDate()
        return new Date(anio, mes, Math.min(diaMes, ultimo))
    }

    let fecha = crear(hoy.getFullYear(), hoy.getMonth())
    if (fecha < hoy) fecha = crear(hoy.getFullYear(), hoy.getMonth() + 1)
    const dias = Math.round((fecha - hoy) / 86400000)
    return { dias, fecha: fecha.toLocaleDateString("es-PE") }
}

// ============================================
// LASTRAR
// ============================================

function actualizarLastbar() {
    const editBtn = document.querySelector('.lastbar .item[data-accion="editar-cuenta"]')
    const archBtn = document.querySelector('.lastbar .item[data-accion="archivar-cuenta"]')

    const activo = !!cuentaSeleccionada
    editBtn?.classList.toggle("desact", !activo)
    archBtn?.classList.toggle("desact", !activo)
}

// ============================================
// ACCIONES EXPORTADAS PARA LASTBAR
// ============================================

export function abrirModalCrearCuenta() {
    uid = sesion.uid
    _abrirModalCrearCuentaDosPasos()
}

export function editarCuentaSeleccionada() {
    if (cuentaSeleccionada) {
        _abrirModalEditarCuenta(cuentaSeleccionada)
    } else {
        mostrarNotificacion("info", "Selecciona una cuenta primero")
    }
}

export function archivarCuentaSeleccionada() {
    if (!cuentaSeleccionada) {
        mostrarNotificacion("info", "Selecciona una cuenta primero")
        return
    }

    const cuenta = cuentaSeleccionada

    if (cuenta.estado === "archivada") {
        abrirModal({
            titulo: "Desarchivar cuenta",
            contenido: `
                <div class="modal-message">
                    <p class="modal-message-desc">
                        ¿Volver a activar la cuenta <strong>${cuenta.nombre}</strong>?
                    </p>
                </div>
            `,
            variante: "confirm",
            confirmText: "Desarchivar",
            cancelText: "Cancelar",
            onConfirm: async () => {
                await cambiarEstadoCuenta(cuenta.id, "activa")
                return true
            }
        })
        return
    }

    const saldo = saldoParaRegla(cuenta)
    if (saldo !== 0) {
        abrirModal({
            titulo: "No se puede archivar en cero",
            contenido: `
                <div class="modal-message">
                    <p class="modal-message-desc">
                        ${cuenta.tipo === "credito"
                            ? "La tarjeta <strong>" + cuenta.nombre + "</strong> tiene una deuda pendiente."
                            : "La cuenta <strong>" + cuenta.nombre + "</strong> tiene un saldo distinto de 0."
                        }
                    </p>
                    <p class="modal-message-hint">
                        Para archivar en cero primero debes dejar el saldo en 0
                        creando los movimientos de ajuste necesarios.
                    </p>
                    <p class="modal-message-warn">
                        Puedes <strong>forzar el archivo</strong>, pero NO es recomendable:
                        movimientos, posiciones, trades, órdenes, pendientes y metas que
                        usan esta cuenta quedarán afectados y deberás corregirlos creando
                        movimientos de error.
                    </p>
                </div>
            `,
            variante: "confirm",
            confirmText: "Forzar archivo",
            cancelText: "Cancelar",
            onConfirm: () => {
                cambiarEstadoCuenta(cuenta.id, "archivada")
                mostrarNotificacion(
                    "warning",
                    "Cuenta archivada a la fuerza: revisa movimientos, posiciones, trades, órdenes, pendientes y metas relacionados"
                )
                return true
            }
        })
        return
    }

    abrirModal({
        titulo: "Archivar cuenta",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    ¿Archivar la cuenta <strong>${cuenta.nombre}</strong>?
                </p>
            </div>
        `,
        variante: "confirm",
        confirmText: "Archivar",
        cancelText: "Cancelar",
        onConfirm: () => {
            cambiarEstadoCuenta(cuenta.id, "archivada")
            return true
        }
    })
}

// Saldo que importa para la regla de archivo/eliminación según el tipo:
// · cuenta normal → saldo inicial
// · tarjeta de crédito → deuda (debe estar en 0 → disponible = línea)
function saldoParaRegla(cuenta) {
    return cuenta.tipo === "credito"
        ? (cuenta.deuda || 0)
        : (cuenta.saldoInicial || 0)
}

async function cambiarEstadoCuenta(id, estado) {
    try {
        await actualizarCuenta(uid, id, { estado })
        await cargarCuentas()
        mostrarNotificacion("exito", estado === "activa" ? "Cuenta desarchivada" : "Cuenta archivada")
    } catch (error) {
        console.error(`Error cambiando estado a "${estado}":`, error)
        mostrarNotificacion("error", `No se pudo cambiar el estado: ${error.message}`)
    }
}

export function eliminarCuentaSeleccionada() {
    if (!cuentaSeleccionada) {
        mostrarNotificacion("info", "Selecciona una cuenta primero")
        return
    }
    const cuenta = cuentaSeleccionada
    const saldo = saldoParaRegla(cuenta)
    if (saldo !== 0) {
        mostrarNotificacion(
            "warning",
            cuenta.tipo === "credito"
                ? `Solo se puede eliminar una tarjeta con la deuda en 0 (deuda actual: ${saldo})`
                : `Solo se puede eliminar una cuenta con saldo 0 (saldo actual: ${saldo})`
        )
        return
    }

    abrirModal({
        titulo: "Eliminar cuenta",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    ¿Eliminar definitivamente la cuenta <strong>${cuenta.nombre}</strong>?
                </p>
            </div>
        `,
        variante: "confirm",
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            try {
                const snapshot = { ...cuenta }
                await eliminarCuenta(uid, cuenta.id)
                await cargarCuentas()
                ofrecerDeshacer({
                    mensaje: `Cuenta "${cuenta.nombre}" eliminada. ¿Deshacer?`,
                    restaurar: () => restaurarDocumento(uid, "cuentas", snapshot.id, snapshot),
                    alRestaurar: () => cargarCuentas()
                })
                return true
            } catch (error) {
                console.error("Error eliminando cuenta:", error)
                mostrarNotificacion("error", `No se pudo eliminar la cuenta: ${error.message}`)
                return false
            }
        }
    })
}

function mostrarVacio() {
    const panel = document.getElementById("panel")
    if (!panel) return
    panel.innerHTML = `
        <h2>No hay cuentas</h2>
        <p class="lista-vacia">
            Crea tu primera cuenta usando el botón <strong>"Cuenta"</strong> en la barra inferior.
        </p>
    `
}

// ============================================
// EVENTOS (hold / dblclick)
// ============================================

function configurarEventos() {
    const sidebar = document.getElementById("sidebar")
    const HOLD_DURATION = 400
    const holdState = {}

    sidebar?.addEventListener("mousedown", (event) => {
        const btn = event.target.closest('button[name="cta"]')
        if (!btn) return
        const btnId = btn.dataset.id

        holdState[btnId] = { isHolding: false, timer: null }
        holdState[btnId].timer = setTimeout(() => {
            holdState[btnId].isHolding = true
            btn.classList.add("selected")
        }, HOLD_DURATION)
    })

    sidebar?.addEventListener("mouseup", (event) => {
        const btn = event.target.closest('button[name="cta"]')
        if (!btn) return
        const btnId = btn.dataset.id
        if (!holdState[btnId]) return

        clearTimeout(holdState[btnId].timer)
        btn.classList.remove("selected")

        // La selección la gestiona UN SOLO evento (click en el botón):
        // dispararla aquí también causaba doble toggle en un tap (bug #1).
        delete holdState[btnId]
    })

    sidebar?.addEventListener("mouseleave", (event) => {
        const btn = event.target.closest('button[name="cta"]')
        if (!btn) return
        const btnId = btn.dataset.id
        if (holdState[btnId]) {
            clearTimeout(holdState[btnId].timer)
            btn.classList.remove("selected")
            delete holdState[btnId]
        }
    })

    sidebar?.addEventListener("dblclick", (event) => {
        const btn = event.target.closest('button[name="cta"]')
        if (!btn) return
        const btnId = btn.dataset.id

        // Abrir el editor directamente, sin togglear la selección
        const cuenta = cuentas.find(c => c.id === btnId)
        if (cuenta) {
            _abrirModalEditarCuenta(cuenta)
        }
    })
}

// ============================================
// MODAL CREAR CUENTA (interno)
// ============================================

const esTipoTarjeta = tipo => tipo === "credito" || tipo === "debito"

const TIPOS_CUENTA_CREACION = [
    { id: "banco", nombre: "Banco", icono: "landmark" },
    { id: "efectivo", nombre: "Efectivo", icono: "banknote" },
    { id: "broker", nombre: "Broker", icono: "trending-up" },
    { id: "exchange", nombre: "Exchange", icono: "arrow-left-right" },
    { id: "credito", nombre: "Tarjeta de crédito", icono: "credit-card" },
    { id: "debito", nombre: "Tarjeta de débito", icono: "credit-card" }
]

function _abrirModalCrearCuentaDosPasos() {
    let tipoSeleccionado = null
    let paso = 1

    const paso1 = `
        <div class="cuenta-pasos">
            <span class="cuenta-paso activo">1. Tipo</span>
            <span class="cuenta-paso">2. Datos</span>
        </div>
        <div class="cuenta-tipos-grid">
            ${TIPOS_CUENTA_CREACION.map(tipo => `
                <button type="button" class="cuenta-tipo-opcion" data-tipo="${tipo.id}">
                    ${icono(tipo.icono, 22)}
                    <span>${tipo.nombre}</span>
                </button>
            `).join("")}
        </div>
    `

    const formulario = tipo => `
        <div class="cuenta-pasos">
            <button type="button" class="cuenta-paso activo" id="cuenta-paso-atras">1. Tipo</button>
            <span class="cuenta-paso activo">2. Datos</span>
        </div>
        <form id="form-crear-cuenta" class="form-movimiento form-movimiento-grid">
            <input type="hidden" id="campo-tipo" value="${tipo}">
            <div class="form-group">
                <label for="campo-nombre">Nombre de la cuenta</label>
                <input type="text" id="campo-nombre" class="form-input" placeholder="Ej: BBVA, BCP..." required>
            </div>
            <div class="form-group">
                <label for="campo-moneda">Moneda</label>
                <select id="campo-moneda" class="form-input" required>
                    <option value="pen">PEN</option>
                    <option value="usd">USD</option>
                    <option value="usdt">USDT</option>
                </select>
            </div>
            <div class="form-group">
                <label for="campo-saldo">Saldo inicial</label>
                <input type="number" id="campo-saldo" class="form-input" step="0.01" min="0" value="0">
            </div>
            <div class="form-group banco-only">
                <label for="campo-num-cuenta">Número de cuenta (opcional)</label>
                <input type="text" id="campo-num-cuenta" class="form-input" placeholder="000-000000000000">
            </div>
            <div class="form-group banco-only">
                <label for="campo-cci">CCI (opcional)</label>
                <input type="text" id="campo-cci" class="form-input" placeholder="000000000000000000000000">
            </div>
            <div class="form-group card-only" hidden>
                <label for="campo-num-tarjeta">Número de tarjeta (opcional)</label>
                <input type="text" id="campo-num-tarjeta" class="form-input" placeholder="0000 0000 0000 0000" maxlength="19">
            </div>
            <div class="form-group card-only" hidden>
                <label for="campo-vence">Fecha de vencimiento (opcional)</label>
                <input type="text" id="campo-vence" class="form-input" placeholder="MM/AA" maxlength="5">
            </div>
            <div class="form-group credit-only" hidden>
                <label for="campo-limite">Límite de crédito</label>
                <input type="number" id="campo-limite" class="form-input" step="0.01" min="0" value="0">
            </div>
            <div class="form-group credit-only" hidden>
                <label for="campo-diaCorte">Día de corte</label>
                <input type="number" id="campo-diaCorte" class="form-input" min="1" max="31" value="10">
            </div>
            <div class="form-group credit-only" hidden>
                <label for="campo-diaPago">Día de pago</label>
                <input type="number" id="campo-diaPago" class="form-input" min="1" max="31" value="6">
            </div>
            <div class="form-group credit-only" hidden>
                <label for="campo-anualidad">Anualidad</label>
                <input type="number" id="campo-anualidad" class="form-input" step="0.01" min="0" value="0">
            </div>
            <div class="form-group credit-only" hidden>
                <label for="campo-anualidad-fecha">Fecha de anualidad (opcional)</label>
                <input type="date" id="campo-anualidad-fecha" class="form-input">
            </div>
            <div class="form-group credit-only" hidden>
                <label for="campo-desgravamen">Desgravamen (%)</label>
                <input type="number" id="campo-desgravamen" class="form-input" step="0.01" min="0" value="0.34">
            </div>
            <div class="form-group credit-only" hidden>
                <label for="campo-umbralAviso">Umbral de advertencia (%)</label>
                <input type="number" id="campo-umbralAviso" class="form-input" min="1" max="99" value="30">
            </div>
            <div class="form-group credit-only" hidden>
                <label for="campo-umbralCritico">Umbral crítico (%)</label>
                <input type="number" id="campo-umbralCritico" class="form-input" min="1" max="100" value="70">
            </div>
        </form>
    `

    const modalEl = abrirModal({
        titulo: "Nueva cuenta · 1. Tipo",
        contenido: paso1,
        variante: "form",
        confirmText: "Continuar",
        cancelText: "Cancelar",
        onCancel: () => true,
        onConfirm: async () => {
            if (paso === 1) {
                if (!tipoSeleccionado) {
                    mostrarNotificacion("warning", "Selecciona un tipo de cuenta")
                    return false
                }
                paso = 2
                modalEl.querySelector(".modal-title").textContent = "Nueva cuenta · 2. Datos"
                modalEl.querySelector(".modal-body").innerHTML = formulario(tipoSeleccionado)
                const confirmar = modalEl.querySelector("#modal-confirm")
                if (confirmar) confirmar.textContent = "Crear cuenta"
                const esCredito = tipoSeleccionado === "credito"
                const esTarjeta = esCredito || tipoSeleccionado === "debito"
                const esCuenta = tipoSeleccionado === "banco" || tipoSeleccionado === "efectivo"
                modalEl.querySelectorAll(".credit-only").forEach(el => { el.hidden = !esCredito })
                modalEl.querySelectorAll(".card-only").forEach(el => { el.hidden = !esTarjeta })
                modalEl.querySelectorAll(".banco-only").forEach(el => { el.hidden = !esCuenta })
                modalEl.querySelector("#cuenta-paso-atras")?.addEventListener("click", () => {
                    paso = 1
                    tipoSeleccionado = null
                    modalEl.querySelector(".modal-title").textContent = "Nueva cuenta · 1. Tipo"
                    modalEl.querySelector(".modal-body").innerHTML = paso1
                    const boton = modalEl.querySelector("#modal-confirm")
                    if (boton) boton.textContent = "Continuar"
                    modalEl.querySelectorAll(".cuenta-tipo-opcion").forEach(opcion => {
                        opcion.addEventListener("click", () => {
                            tipoSeleccionado = opcion.dataset.tipo
                            modalEl.querySelectorAll(".cuenta-tipo-opcion").forEach(otra => {
                                otra.classList.toggle("seleccionada", otra === opcion)
                            })
                        })
                    })
                })
                modalEl.querySelector("#campo-nombre")?.focus()
                return false
            }

            const nombre = modalEl.querySelector("#campo-nombre")?.value.trim()
            const tipo = tipoSeleccionado
            const moneda = modalEl.querySelector("#campo-moneda")?.value || "pen"
            const saldo = parseFloat(modalEl.querySelector("#campo-saldo")?.value) || 0
            if (!nombre) {
                mostrarNotificacion("warning", "El nombre es obligatorio")
                return false
            }

            const datos = {
                nombre,
                tipo,
                moneda,
                saldoInicial: saldo,
                estado: "activa",
                esPatrimonio: true,
                orden: cuentas.length
            }

            if (tipo === "credito") {
                datos.limite = parseFloat(modalEl.querySelector("#campo-limite")?.value) || 0
                datos.deuda = 0
                datos.desgravamen = parseFloat(modalEl.querySelector("#campo-desgravamen")?.value) || 0.34
                datos.diaCorte = parseInt(modalEl.querySelector("#campo-diaCorte")?.value) || 10
                datos.diaPago = parseInt(modalEl.querySelector("#campo-diaPago")?.value) || 6
                datos.umbralAviso = parseInt(modalEl.querySelector("#campo-umbralAviso")?.value) || 30
                datos.umbralCritico = parseInt(modalEl.querySelector("#campo-umbralCritico")?.value) || 70
                datos.anualidad = parseFloat(modalEl.querySelector("#campo-anualidad")?.value) || 0
                const anualidadFecha = modalEl.querySelector("#campo-anualidad-fecha")?.value
                if (datos.anualidad > 0 && anualidadFecha) {
                    const [, mes, dia] = anualidadFecha.split("-").map(Number)
                    datos.anualidadFecha = `${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
                }
                datos.avisoUsoEnviado = false
                datos.avisoCriticoEnviado = false
            }

            if (esTipoTarjeta(tipo)) {
                datos.num = modalEl.querySelector("#campo-num-tarjeta")?.value.trim() || ""
                datos.vence = modalEl.querySelector("#campo-vence")?.value.trim() || ""
            } else if (tipo === "banco" || tipo === "efectivo") {
                datos.num = modalEl.querySelector("#campo-num-cuenta")?.value.trim() || ""
                datos.cci = modalEl.querySelector("#campo-cci")?.value.trim() || ""
            }

            try {
                await crearCuenta(uid, datos)
                await cargarCuentas()
                mostrarNotificacion("exito", "Cuenta creada")
                return true
            } catch (error) {
                console.error("Error creando cuenta:", error)
                mostrarNotificacion("error", `No se pudo crear la cuenta: ${error.message}`)
                return false
            }
        }
    })

    modalEl.querySelectorAll(".cuenta-tipo-opcion").forEach(boton => {
        boton.addEventListener("click", () => {
            tipoSeleccionado = boton.dataset.tipo
            modalEl.querySelectorAll(".cuenta-tipo-opcion").forEach(opcion => {
                opcion.classList.toggle("seleccionada", opcion === boton)
            })
        })
    })
}

function _abrirModalCrearCuentaLegacy() {
    const html = `
        <form id="form-crear-cuenta" class="form-movimiento">
            <div class="form-group">
                <label for="campo-nombre">Nombre de la cuenta</label>
                <input type="text" id="campo-nombre" class="form-input" placeholder="Ej: BBVA, BCP..." required>
            </div>
            <div class="form-group">
                <label for="campo-tipo">Tipo</label>
                <select id="campo-tipo" class="form-input" required>
                    <option value="banco">Banco</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="broker">Broker</option>
                    <option value="exchange">Exchange</option>
                    <option value="credito">Tarjeta de crédito</option>
                    <option value="debito">Tarjeta de débito</option>
                </select>
            </div>
            <div class="form-group">
                <label for="campo-moneda">Moneda</label>
                <select id="campo-moneda" class="form-input" required>
                    <option value="pen">PEN</option>
                    <option value="usd">USD</option>
                    <option value="usdt">USDT</option>
                </select>
            </div>
            <div class="form-group">
                <label for="campo-saldo">Saldo inicial</label>
                <input type="number" id="campo-saldo" class="form-input" step="0.01" placeholder="0.00">
            </div>

            <div class="form-group banco-only" id="campo-num-cuenta-group">
                <label for="campo-num-cuenta">Número de cuenta (opcional)</label>
                <input type="text" id="campo-num-cuenta" class="form-input" placeholder="000-000000000000">
            </div>
            <div class="form-group banco-only" id="campo-cci-group">
                <label for="campo-cci">CCI (opcional)</label>
                <input type="text" id="campo-cci" class="form-input" placeholder="000000000000000000000000">
            </div>

            <div class="form-group card-only" id="campo-num-tarjeta-group" hidden>
                <label for="campo-num-tarjeta">Número de tarjeta (opcional)</label>
                <input type="text" id="campo-num-tarjeta" class="form-input" placeholder="0000 0000 0000 0000" maxlength="19">
            </div>
            <div class="form-group card-only" id="campo-vence-group" hidden>
                <label for="campo-vence">Fecha de vencimiento (opcional)</label>
                <input type="text" id="campo-vence" class="form-input" placeholder="MM/AA" maxlength="5">
            </div>

            <div class="form-group credit-only" id="campo-limite-group" hidden>
                <label for="campo-limite">Límite de crédito</label>
                <input type="number" id="campo-limite" class="form-input" step="0.01" placeholder="0.00">
            </div>
            <div class="form-group credit-only" id="campo-desgravamen-group" hidden>
                <label for="campo-desgravamen">Desgravamen (%)</label>
                <input type="number" id="campo-desgravamen" class="form-input" step="0.01" placeholder="0.34" value="0.34">
            </div>
            <div class="form-group credit-only" id="campo-diaCorte-group" hidden>
                <label for="campo-diaCorte">Día de corte</label>
                <input type="number" id="campo-diaCorte" class="form-input" min="1" max="31" placeholder="10" value="10">
            </div>
            <div class="form-group credit-only" id="campo-diaPago-group" hidden>
                <label for="campo-diaPago">Día de pago</label>
                <input type="number" id="campo-diaPago" class="form-input" min="1" max="31" placeholder="6" value="6">
            </div>
            <span class="form-section-title credit-only" id="campo-manejo-dinero" hidden>Manejo del dinero</span>
            <div class="form-group credit-only" id="campo-umbralAviso-group" hidden>
                <label for="campo-umbralAviso">Umbral de advertencia (%)</label>
                <input type="number" id="campo-umbralAviso" class="form-input" min="1" max="99" step="1" placeholder="30" value="30">
            </div>
            <div class="form-group credit-only" id="campo-umbralCritico-group" hidden>
                <label for="campo-umbralCritico">Umbral crítico (%)</label>
                <input type="number" id="campo-umbralCritico" class="form-input" min="1" max="100" step="1" placeholder="70" value="70">
            </div>
        </form>
    `

    abrirModal({
        titulo: "Nueva cuenta",
        contenido: html,
        variante: "form",
        confirmText: "Crear cuenta",
        onConfirm: async () => {
            const nombre = document.getElementById("campo-nombre")?.value.trim()
            const tipo = document.getElementById("campo-tipo")?.value
            const moneda = document.getElementById("campo-moneda")?.value
            const saldo = parseFloat(document.getElementById("campo-saldo")?.value) || 0

            if (!nombre) {
                mostrarNotificacion("warning", "El nombre es obligatorio")
                return false
            }

            const datos = {
                nombre,
                tipo,
                moneda,
                saldoInicial: saldo,
                estado: "activa",
                esPatrimonio: true,
                orden: cuentas.length
            }

            if (tipo === "credito") {
                datos.limite = parseFloat(document.getElementById("campo-limite")?.value) || 0
                datos.deuda = 0
                datos.desgravamen = parseFloat(document.getElementById("campo-desgravamen")?.value) || 0.34
                datos.diaCorte = parseInt(document.getElementById("campo-diaCorte")?.value) || 10
                datos.diaPago = parseInt(document.getElementById("campo-diaPago")?.value) || 6
                datos.umbralAviso = parseInt(document.getElementById("campo-umbralAviso")?.value) || 30
                datos.umbralCritico = parseInt(document.getElementById("campo-umbralCritico")?.value) || 70
                datos.avisoUsoEnviado = false
                datos.avisoCriticoEnviado = false
            }

            if (tipo === "credito" || tipo === "debito") {
                const numTarjeta = document.getElementById("campo-num-tarjeta")?.value.trim()
                const vence = document.getElementById("campo-vence")?.value.trim()
                if (numTarjeta) datos.num = numTarjeta
                if (vence) datos.vence = vence
            } else if (tipo === "banco" || tipo === "efectivo") {
                const numCuenta = document.getElementById("campo-num-cuenta")?.value.trim()
                const cci = document.getElementById("campo-cci")?.value.trim()
                if (numCuenta) datos.num = numCuenta
                if (cci) datos.cci = cci
            }

            try {
                await crearCuenta(uid, datos)
                await cargarCuentas()
                mostrarNotificacion("exito", "Cuenta creada")
                return true
            } catch (error) {
                console.error("Error creando cuenta:", error)
                mostrarNotificacion("error", `No se pudo crear la cuenta: ${error.message}`)
                return false
            }
        }
    })

    // Toggle campos según el tipo
    document.getElementById("campo-tipo")?.addEventListener("change", (e) => {
        const tipo = e.target.value
        const esCredito = tipo === "credito"
        const esTarjeta = tipo === "credito" || tipo === "debito"
        const esCuenta = tipo === "banco" || tipo === "efectivo"
        document.querySelectorAll(".credit-only").forEach(el => {
            el.hidden = !esCredito
        })
        document.querySelectorAll(".card-only").forEach(el => {
            el.hidden = !esTarjeta
        })
        document.querySelectorAll(".banco-only").forEach(el => {
            el.hidden = !esCuenta
        })
    })
}

// ============================================
// MODAL EDITAR CUENTA (interno)
// ============================================

function _abrirModalEditarCuenta(cuenta) {
    const moneda = (cuenta.moneda || "pen").toLowerCase()
    const permisoMoneda = cuenta.tipo !== "credito"
    const esArchivada = cuenta.estado === "archivada"
    const saldoParaEliminar = saldoParaRegla(cuenta)
    const partesAnualidad = String(cuenta.anualidadFecha || "").split("-").map(Number)
    const anualidadFechaInput = partesAnualidad.length === 2 && partesAnualidad.every(Number.isFinite)
        ? `${new Date().getFullYear()}-${String(partesAnualidad[0]).padStart(2, "0")}-${String(partesAnualidad[1]).padStart(2, "0")}`
        : ""

    const html = `
        <form id="form-editar-cuenta" class="form-movimiento form-movimiento-grid">
            <div class="form-group">
                <label for="edit-nombre">Nombre</label>
                <input type="text" id="edit-nombre" class="form-input" value="${cuenta.nombre || ""}" required>
            </div>
            ${permisoMoneda ? `
                <div class="form-group">
                    <label for="edit-moneda">Moneda</label>
                    <select id="edit-moneda" class="form-input">
                        <option value="pen" ${moneda === "pen" ? "selected" : ""}>PEN</option>
                        <option value="usd" ${moneda === "usd" ? "selected" : ""}>USD</option>
                        <option value="usdt" ${moneda === "usdt" ? "selected" : ""}>USDT</option>
                    </select>
                </div>
            ` : ""}
            ${cuenta.tipo === "credito" ? `
                <div class="form-group">
                    <label for="edit-limite">Límite de crédito</label>
                    <input type="number" id="edit-limite" class="form-input" step="0.01" value="${cuenta.limite || 0}">
                </div>
                <div class="form-group">
                    <label for="edit-desgravamen">Desgravamen (%)</label>
                    <input type="number" id="edit-desgravamen" class="form-input" step="0.01" value="${cuenta.desgravamen || 0.34}">
                </div>
                <div class="form-group">
                    <label for="edit-diaCorte">Día de corte</label>
                    <input type="number" id="edit-diaCorte" class="form-input" min="1" max="31" value="${cuenta.diaCorte || 10}">
                </div>
                <div class="form-group">
                    <label for="edit-diaPago">Día de pago</label>
                    <input type="number" id="edit-diaPago" class="form-input" min="1" max="31" value="${cuenta.diaPago || 6}">
                </div>
                <div class="form-group">
                    <label for="edit-anualidad">Anualidad</label>
                    <input type="number" id="edit-anualidad" class="form-input" min="0" step="0.01" value="${cuenta.anualidad || 0}">
                </div>
                <div class="form-group">
                    <label for="edit-anualidad-fecha">Fecha de anualidad</label>
                    <input type="date" id="edit-anualidad-fecha" class="form-input" value="${anualidadFechaInput}">
                </div>
                <span class="form-section-title">Manejo del dinero</span>
                <div class="form-group">
                    <label for="edit-umbralAviso">Umbral de advertencia (%)</label>
                    <input type="number" id="edit-umbralAviso" class="form-input" min="1" max="99" step="1" value="${cuenta.umbralAviso || 30}">
                </div>
                <div class="form-group">
                    <label for="edit-umbralCritico">Umbral crítico (%)</label>
                    <input type="number" id="edit-umbralCritico" class="form-input" min="1" max="100" step="1" value="${cuenta.umbralCritico || 70}">
                </div>
            ` : ""}
            ${cuenta.tipo === "credito" || cuenta.tipo === "debito" ? `
                <div class="form-group">
                    <label for="edit-num-tarjeta">Número de tarjeta (opcional)</label>
                    <input type="text" id="edit-num-tarjeta" class="form-input" maxlength="19" placeholder="0000 0000 0000 0000" value="${cuenta.num || ""}">
                </div>
                <div class="form-group">
                    <label for="edit-vence">Fecha de vencimiento (opcional)</label>
                    <input type="text" id="edit-vence" class="form-input" maxlength="5" placeholder="MM/AA" value="${cuenta.vence || ""}">
                </div>
            ` : ""}
            ${cuenta.tipo === "banco" || cuenta.tipo === "efectivo" ? `
                <div class="form-group">
                    <label for="edit-num">Número de cuenta</label>
                    <input type="text" id="edit-num" class="form-input" value="${cuenta.num || ""}">
                </div>
                <div class="form-group">
                    <label for="edit-cci">CCI</label>
                    <input type="text" id="edit-cci" class="form-input" value="${cuenta.cci || ""}">
                </div>
            ` : ""}
            <div class="cuenta-acciones-secundarias">
                <button type="button" class="modal-btn modal-btn-secondary" id="btn-editar-estado">
                    ${esArchivada ? "Desarchivar" : "Archivar"}
                </button>
                ${saldoParaEliminar === 0 ? `<button type="button" class="modal-btn modal-btn-secondary modal-btn-danger" id="btn-editar-eliminar">
                    Eliminar
                </button>` : ""}
            </div>
        </form>
    `

    abrirModal({
        titulo: `Editar ${cuenta.nombre}`,
        contenido: html,
        variante: "form",
        confirmText: "Guardar cambios",
        onConfirm: async () => {
            const nombre = document.getElementById("edit-nombre")?.value.trim()

            if (!nombre) {
                mostrarNotificacion("warning", "El nombre es obligatorio")
                return false
            }

            const datos = { nombre }

            if (permisoMoneda) {
                const monedaNueva = document.getElementById("edit-moneda")?.value
                if (monedaNueva && monedaNueva !== moneda) {
                    datos.moneda = monedaNueva
                }
            }

            if (cuenta.tipo === "credito") {
                datos.limite = parseFloat(document.getElementById("edit-limite")?.value) || 0
                datos.desgravamen = parseFloat(document.getElementById("edit-desgravamen")?.value) || 0.34
                datos.diaCorte = parseInt(document.getElementById("edit-diaCorte")?.value) || 10
                datos.diaPago = parseInt(document.getElementById("edit-diaPago")?.value) || 6
                datos.umbralAviso = parseInt(document.getElementById("edit-umbralAviso")?.value) || 30
                datos.umbralCritico = parseInt(document.getElementById("edit-umbralCritico")?.value) || 70
                datos.anualidad = parseFloat(document.getElementById("edit-anualidad")?.value) || 0
                const anualidadFecha = document.getElementById("edit-anualidad-fecha")?.value
                if (datos.anualidad > 0 && anualidadFecha) {
                    const [, mes, dia] = anualidadFecha.split("-").map(Number)
                    datos.anualidadFecha = `${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
                } else {
                    datos.anualidadFecha = ""
                }
            }

            if (cuenta.tipo === "credito" || cuenta.tipo === "debito") {
                datos.num = document.getElementById("edit-num-tarjeta")?.value.trim() || ""
                datos.vence = document.getElementById("edit-vence")?.value.trim() || ""
            }

            if (cuenta.tipo === "banco" || cuenta.tipo === "efectivo") {
                datos.num = document.getElementById("edit-num")?.value.trim() || ""
                datos.cci = document.getElementById("edit-cci")?.value.trim() || ""
            }

            try {
                await actualizarCuenta(uid, cuenta.id, datos)
                await cargarCuentas()
                mostrarNotificacion("exito", "Cuenta actualizada")
                return true
            } catch (error) {
                console.error("Error actualizando cuenta:", error)
                mostrarNotificacion("error", `No se pudo guardar: ${error.message}`)
                return false
            }
        }
    })

    // Acciones secundarias: archivar/desarchivar y eliminar
    document.getElementById("btn-editar-estado")?.addEventListener("click", () => {
        cerrarModal()
        archivarCuentaSeleccionada()
    })
    document.getElementById("btn-editar-eliminar")?.addEventListener("click", () => {
        cerrarModal()
        eliminarCuentaSeleccionada()
    })
}