import { obtenerMovimientos, obtenerCuentas } from "../../firebase/firestore.js"
import { sesion } from "../core/sesion.js"
import { getFechaHoy } from "../core/fechas.js"
import { icono } from "../core/iconos.js"
import { CONFIG_MOVIMIENTOS, TIPOS_MOVIMIENTO } from "../../constants/tiposMovimiento.js"
import { abrirModal, cerrarModal } from "../ui/modal.js"
import {
    generarFormularioMovimiento,
    recogerDatosFormulario,
    vincularSimboloDivisa
} from "../ui/formularioMovimiento.js"
import { registrarMovimiento, actualizarMovimiento, eliminarMovimiento } from "../services/MovimientoServicio.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"
import { envolverSidebar } from "../ui/colapsoSidebar.js"

let movimientos = []
let cuentas = []
let uid = null
let filtroActual = "todos"

// ============================================
// RENDER
// ============================================

// Agrupa los 11 tipos en filtros: tarjetas incluye compra Y pago.
const FILTROS_DISPONIBLES = [
    { filtro: "todos", label: "Todos", icono: "list", tipos: null },
    { filtro: "ingreso", label: "Ingresos", icono: "arrow-down-left", tipos: ["ingreso"] },
    { filtro: "gasto", label: "Gastos", icono: "arrow-up-right", tipos: ["gasto"] },
    { filtro: "transferencia", label: "Transferencias", icono: "arrow-left-right", tipos: ["transferencia"] },
    { filtro: "cambioDivisa", label: "Cambio divisa", icono: "refresh-cw", tipos: ["cambioDivisa"] },
    { filtro: "inversiones", label: "Inversiones", icono: "chart-candlestick", tipos: ["compraActivo", "ventaActivo"] },
    { filtro: "p2p", label: "P2P", icono: "coins", tipos: ["p2pCompra", "p2pVenta"] },
    { filtro: "tarjetas", label: "Tarjetas", icono: "credit-card", tipos: ["compraTarjeta", "pagoTarjeta"] },
    { filtro: "error", label: "Errores", icono: "alert-triangle", tipos: ["error"] }
]

export function render() {
    const botones = FILTROS_DISPONIBLES
        .map(f => `
            <button class="glass${f.filtro === "todos" ? " act" : ""}" data-filtro="${f.filtro}">
                ${icono(f.icono, 18)}<span>${f.label}</span>
            </button>
        `)
        .join("")

    return `
        ${envolverSidebar(`
            <section id="sidebar">
                ${botones}
            </section>
        `)}
        <section id="panel" class="glass">
            <div class="panel-header">
                <h2>Movimientos</h2>
            </div>
            <div class="filtros">
                <div class="campo-fecha">
                    <input type="date" id="filtro-desde" aria-label="Desde">
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
                <div class="campo-fecha">
                    <input type="date" id="filtro-hasta" aria-label="Hasta">
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
                <select id="filtro-cuenta" class="filtro-select" aria-label="Cuenta">
                    <option value="">Todas las cuentas</option>
                </select>
                <select id="filtro-divisa" class="filtro-select" aria-label="Divisa">
                    <option value="">Todas las divisas</option>
                    <option value="PEN">PEN</option>
                    <option value="USD">USD</option>
                    <option value="USDT">USDT</option>
                </select>
                <input type="search" id="filtro-buscar" class="filtro-buscar" placeholder="Buscar..." aria-label="Buscar">
                <button type="button" class="btn-sm" id="filtro-limpiar">Limpiar</button>
            </div>
            <div id="totales-movimientos" class="totales"></div>
            <div id="lista-movimientos" class="lista-cards">
                <div class="lista-vacia"><div class="loading-spinner"></div></div>
            </div>
        </section>
    `
}

// ============================================
// INIT
// ============================================

export async function init() {
    uid = sesion.uid
    console.log("[INFO] Movimientos iniciado para UID:", uid)

    await new Promise(resolve => setTimeout(resolve, 50))
    await cargarCuentas()
    await cargarMovimientos()
    configurarEventos()
}

// ============================================
// CARGA
// ============================================

async function cargarCuentas() {
    try {
        cuentas = await obtenerCuentas(uid)
        const select = document.getElementById("filtro-cuenta")
        if (select) {
            select.innerHTML = `<option value="">Todas las cuentas</option>` +
                cuentas
                    .map(c => `<option value="${c.id}">${c.nombre}</option>`)
                    .join("")
        }
    } catch (error) {
        console.error("Error cargando cuentas:", error)
    }
}

async function cargarMovimientos() {
    try {
        movimientos = await obtenerMovimientos(uid)
        movimientos.sort((a, b) => {
            const fa = (fechaDeMovimiento(a)?.getTime?.()) || 0
            const fb = (fechaDeMovimiento(b)?.getTime?.()) || 0
            return fb - fa
        })
        renderizarMovimientos()
    } catch (error) {
        console.error("Error cargando movimientos:", error)
        mostrarError()
    }
}

function mostrarError() {
    const container = document.getElementById("lista-movimientos")
    if (!container) return
    container.innerHTML = `<p class="lista-vacia error">Error al cargar movimientos</p>`
}

// ============================================
// RENDERIZADO
// ============================================

function renderizarMovimientos() {
    const container = document.getElementById("lista-movimientos")
    if (!container) return

    if (!movimientos || movimientos.length === 0) {
        container.innerHTML = plantillaVacio()
        return
    }

    container.innerHTML = movimientos.map(plantillaMovimiento).join("")
}

function plantillaVacio() {
    return `
        <p class="lista-vacia">
            No hay movimientos registrados.
            <br><br>
            <span class="lista-vacia-hint">
                Usa el botón <strong>"Movimiento"</strong> en la barra inferior
                para registrar el primero.
            </span>
        </p>
    `
}

function plantillaMovimiento(m) {
    const monto = montoDeMovimiento(m)
    const esPositivo = esMovimientoPositivo(m.tipo)
    const signo = esPositivo ? "+" : (m.tipo === "error" ? "" : "-")
    const clase = esMovimientoPositivo(m.tipo) ? "positive" : (m.tipo === "error" ? "" : "negative")
    const tipoNombre = CONFIG_MOVIMIENTOS[m.tipo]?.nombre || m.tipo || "Desconocido"
    const fecha = formatearFecha(m.fechaRealizacion)

    return `
        <div class="card-item" data-id="${m.id}">
            <div class="card-item-info">
                <span class="card-item-titulo">${m.concepto || m.activo || m.tipo || "Sin concepto"}</span>
                <span class="card-item-detalle">${fecha} · ${tipoNombre}</span>
            </div>
            <span class="card-item-valor ${clase}">
                ${signo} ${Math.abs(monto).toFixed(2)} ${(m.divisa || "PEN").toUpperCase()}
            </span>
            <div class="card-item-acciones">
                <button class="card-action-btn" data-accion="editar" data-id="${m.id}" title="Editar" type="button">${icono("pencil", 15)}</button>
                <button class="card-action-btn" data-accion="eliminar" data-id="${m.id}" title="Eliminar" type="button">${icono("trash", 15)}</button>
            </div>
        </div>
    `
}

function esMovimientoPositivo(tipo) {
    return (
        tipo === "ingreso" ||
        tipo === "ventaActivo" ||
        tipo === "p2pVenta"
    )
}

function montoDeMovimiento(m) {
    if (m.monto !== undefined && m.monto !== null && m.monto !== "") {
        return Number(m.monto) || 0
    }
    if (m.cantidad && m.precio) {
        const total = Number(m.cantidad) * Number(m.precio)
        const comision = Number(m.comision) || 0
        return esMovimientoPositivo(m.tipo) ? (total - comision) : (total + comision)
    }
    if (m.montoOrigen) return Number(m.montoOrigen) || 0
    if (m.montoDestino) return Number(m.montoDestino) || 0
    return 0
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

// ============================================
// FILTROS
// ============================================

function configurarEventos() {
    document.querySelectorAll("#sidebar button").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#sidebar button").forEach(b => b.classList.remove("act"))
            btn.classList.add("act")

            filtroActual = btn.dataset.filtro
            aplicarFiltro()
        })
    })

    const desde = document.getElementById("filtro-desde")
    const hasta = document.getElementById("filtro-hasta")
    const cuenta = document.getElementById("filtro-cuenta")
    const divisa = document.getElementById("filtro-divisa")
    const buscar = document.getElementById("filtro-buscar")
    const limpiar = document.getElementById("filtro-limpiar")

    desde?.addEventListener("change", aplicarFiltro)
    hasta?.addEventListener("change", aplicarFiltro)
    cuenta?.addEventListener("change", aplicarFiltro)
    divisa?.addEventListener("change", aplicarFiltro)
    buscar?.addEventListener("input", aplicarFiltro)
    limpiar?.addEventListener("click", () => {
        if (desde) desde.value = ""
        if (hasta) hasta.value = ""
        if (cuenta) cuenta.value = ""
        if (divisa) divisa.value = ""
        if (buscar) buscar.value = ""
        aplicarFiltro()
    })

    // Acciones de editar/eliminar por delegación
    const container = document.getElementById("lista-movimientos")
    container?.addEventListener("click", manejarAccionCard)
}

function manejarAccionCard(evento) {
    const boton = evento.target.closest(".card-action-btn")
    if (!boton) return

    const id = boton.dataset.id
    const movimiento = movimientos.find(m => m.id === id)
    if (!movimiento) return

    if (boton.dataset.accion === "editar") {
        abrirFormularioMovimiento(movimiento.tipo, movimiento)
    } else if (boton.dataset.accion === "eliminar") {
        abrirModalEliminarMovimiento(movimiento)
    }
}

function aplicarFiltro() {
    const container = document.getElementById("lista-movimientos")
    if (!container) return

    const filtro = FILTROS_DISPONIBLES.find(f => f.filtro === filtroActual)

    const desde = document.getElementById("filtro-desde")?.value
    const hasta = document.getElementById("filtro-hasta")?.value
    const cuentaId = document.getElementById("filtro-cuenta")?.value
    const divisa = document.getElementById("filtro-divisa")?.value
    const busqueda = document.getElementById("filtro-buscar")?.value

    let filtrados = movimientos

    if (filtro?.tipos) {
        filtrados = filtrados.filter(m => filtro.tipos.includes(m.tipo))
    }

    if (desde) {
        const d = parseFechaLocal(desde)
        filtrados = filtrados.filter(m => {
            const f = fechaDeMovimiento(m)
            return f && f >= d
        })
    }

    if (hasta) {
        const h = parseFechaLocal(hasta)
        h.setHours(23, 59, 59, 999)
        filtrados = filtrados.filter(m => {
            const f = fechaDeMovimiento(m)
            return f && f <= h
        })
    }

    if (cuentaId) {
        filtrados = filtrados.filter(m => (
            m.cuenta === cuentaId ||
            m.cuentaOrigen === cuentaId ||
            m.cuentaDestino === cuentaId ||
            m.tarjeta === cuentaId
        ))
    }

    if (divisa) {
        const divisaUpper = divisa.toUpperCase()
        filtrados = filtrados.filter(m => (m.divisa || "").toUpperCase() === divisaUpper)
    }

    if (busqueda) {
        const q = busqueda.trim().toLowerCase()
        filtrados = filtrados.filter(m => {
            return [
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
                .includes(q)
        })
    }

    renderizarTotales(filtrados)

    if (filtrados.length === 0) {
        container.innerHTML = `<p class="lista-vacia">No hay movimientos que coincidan con el filtro.</p>`
        return
    }

    container.innerHTML = filtrados.map(plantillaMovimiento).join("")
}

// ============================================
// TOTALES DEL FILTRO
// ============================================

function renderizarTotales(filtrados) {
    const contenedor = document.getElementById("totales-movimientos")
    if (!contenedor) return

    const porDivisa = {}

    filtrados.forEach(m => {
        const divisa = (m.divisa || "PEN").toUpperCase()
        if (!porDivisa[divisa]) {
            porDivisa[divisa] = { positivo: 0, negativo: 0 }
        }
        const monto = montoDeMovimiento(m)
        if (esMovimientoPositivo(m.tipo)) {
            porDivisa[divisa].positivo += monto
        } else {
            porDivisa[divisa].negativo += monto
        }
    })

    const lineas = Object.entries(porDivisa)
        .map(([divisa, totales]) => `
            <span class="totales-item">
                <span class="totales-positivo">+${totales.positivo.toFixed(2)}</span>
                <span class="totales-sep">/</span>
                <span class="totales-negativo">−${totales.negativo.toFixed(2)}</span>
                <span class="totales-divisa">${divisa}</span>
            </span>
        `)
        .join("")

    const totalMovimientos = filtrados.length
    contenedor.innerHTML = `
        <span class="totales-count">${totalMovimientos} movimientos</span>
        ${lineas}
    `
}

function parseFechaLocal(valor) {
    if (!valor) return null
    const [anio, mes, dia] = valor.split("-").map(Number)
    if (!anio || !mes || !dia) return new Date(valor)
    return new Date(anio, mes - 1, dia)
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

// ============================================
// LASTBAR (handlers centralizados en app.js)
// ============================================

export function abrirSelectorTipoMovimiento() {
    // Garantizar uid actual para quien invoque desde otra página
    uid = sesion.uid
    const tipos = Object.values(TIPOS_MOVIMIENTO)
    const opciones = tipos
        .map(t => {
            const nombre = CONFIG_MOVIMIENTOS[t]?.nombre || t
            return `<button class="tipo-movimiento-btn" data-tipo="${t}" type="button">${nombre}</button>`
        })
        .join("")

    abrirModal({
        titulo: "Seleccionar tipo",
        contenido: `<div class="selector-tipos">${opciones}</div>`,
        variante: "narrow",
        confirmText: null,
        cancelText: null,
        cerrarAlClickFuera: true
    })

    document.querySelectorAll(".tipo-movimiento-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const tipo = btn.dataset.tipo
            cerrarModal()
            abrirFormularioMovimiento(tipo, null)
        })
    })
}

async function abrirFormularioMovimiento(tipo, movimiento = null) {
    uid = sesion.uid
    const esEdicion = !!movimiento
    const html = await generarFormularioMovimiento(tipo)

    const config = CONFIG_MOVIMIENTOS[tipo]

    const modalEl = abrirModal({
        titulo: esEdicion
            ? `Editar ${config?.nombre || tipo}`
            : `Nuevo ${config?.nombre || tipo}`,
        contenido: html,
        variante: "form",
        confirmText: esEdicion ? "Guardar cambios" : "Registrar movimiento",
        onConfirm: async () => {
            const datos = recogerDatosFormulario(tipo)
            if (!datos) return false

            if (!datos.fechaRealizacion) {
                datos.fechaRealizacion = getFechaHoy()
            }

            try {
                if (esEdicion) {
                    await actualizarMovimiento(uid, movimiento.id, movimiento, tipo, datos)
                    mostrarNotificacion("exito", "Movimiento actualizado")
                } else {
                    await registrarMovimiento(uid, tipo, datos)
                    mostrarNotificacion("exito", "Movimiento registrado")
                }
                await cargarMovimientos()
                return true
            } catch (error) {
                console.error("Error guardando movimiento:", error)
                mostrarNotificacion("error", `No se pudo guardar el movimiento: ${error.message || "error desconocido"}`)
                return false
            }
        }
    })

    if (esEdicion) {
        rellenarFormulario(tipo, movimiento)
    }

    vincularSimboloDivisa()
}

function rellenarFormulario(tipo, m) {
    const config = CONFIG_MOVIMIENTOS[tipo]
    const campos = [...new Set([
        ...(config.camposObligatorios || []),
        ...(config.camposOpcionales || [])
    ])]

    for (const campo of campos) {
        const input = document.getElementById(`campo-${campo}`)
        if (!input) continue
        const valor = m[campo]
        if (valor === undefined || valor === null) continue
        if (campo === "fechaRealizacion") {
            input.value = formatearParaInput(valor)
        } else {
            input.value = valor
        }
    }

    const comisionInput = document.getElementById("campo-comision")
    if (comisionInput && m.comision !== undefined && m.comision !== null) {
        comisionInput.value = m.comision
    }
}

function formatearParaInput(valor) {
    if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) return valor
    if (valor?.toDate) {
        const d = valor.toDate()
        const anio = d.getFullYear()
        const mes = String(d.getMonth() + 1).padStart(2, "0")
        const dia = String(d.getDate()).padStart(2, "0")
        return `${anio}-${mes}-${dia}`
    }
    return String(valor)
}

// ============================================
// ELIMINAR MOVIMIENTO
// ============================================

function abrirModalEliminarMovimiento(m) {
    abrirModal({
        titulo: "Eliminar movimiento",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-title-danger">¿Eliminar este movimiento?</p>
                <p class="modal-message-desc">
                    <strong>${m.concepto || m.activo || CONFIG_MOVIMIENTOS[m.tipo]?.nombre || "Sin concepto"}</strong>
                    · ${formatearFecha(m.fechaRealizacion)}
                </p>
                <p class="modal-message-warning">
                    Se revertirá su efecto en los saldos de tus cuentas.
                </p>
                <p class="modal-message-error">Esta acción no se puede deshacer.</p>
            </div>
        `,
        variante: "confirm",
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            try {
                await eliminarMovimiento(uid, m)
                await cargarMovimientos()
                aplicarFiltro()
                mostrarNotificacion("exito", "Movimiento eliminado")
                return true
            } catch (error) {
                console.error("Error eliminando movimiento:", error)
                mostrarNotificacion("error", `No se pudo eliminar: ${error.message || "error desconocido"}`)
                return false
            }
        }
    })
}