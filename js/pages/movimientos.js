import { obtenerMovimientos, obtenerCuentas } from "../../firebase/firestore.js"
import { sesion } from "../core/sesion.js"
import { getFechaHoy } from "../core/fechas.js"
import { icono, LOGO_ESCINCO_CARGA } from "../core/iconos.js"
import { CONFIG_MOVIMIENTOS, TIPOS_MOVIMIENTO } from "../../constants/tiposMovimiento.js"
import { abrirModal, cerrarModal, estaAbierto } from "../ui/modal.js"
import {
    generarFormularioMovimiento,
    recogerDatosFormulario,
    vincularSimboloDivisa
} from "../ui/formularioMovimiento.js"
import { registrarMovimiento, actualizarMovimiento, eliminarMovimiento, restaurarMovimiento } from "../services/MovimientoServicio.js"
import { ofrecerDeshacer } from "../services/DeshacerServicio.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"
import { envolverSidebar } from "../ui/colapsoSidebar.js"

let movimientos = []
let cuentas = []
let uid = null
let filtroActual = "todos"
const seleccionados = new Set()
const ordenSeleccion = []
let clickTimer = null
let supresorClick = false
let supresorClickTimer = null
let cardConAcciones = null
let eventosGlobalesListos = false

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
    { filtro: "inversiones", label: "Inversiones", icono: "chart-candlestick", tipos: ["compraActivo", "ventaActivo"], pagina: "inversiones" },
    { filtro: "p2p", label: "P2P", icono: "coins", tipos: ["p2pCompra", "p2pVenta"], pagina: "trading" },
    { filtro: "tarjetas", label: "Tarjetas", icono: "credit-card", tipos: ["compraTarjeta", "pagoTarjeta"] },
    { filtro: "error", label: "Errores", icono: "alert-triangle", tipos: ["error"] }
]

// Filtros visibles según las páginas habilitadas: sin inversiones ni
// trading, se ocultan sus filtros (sus movimientos se ven en "Todos").
function filtrosVisibles() {
    const paginas = sesion.getPaginasVisibles()
    return FILTROS_DISPONIBLES.filter(f => !f.pagina || paginas[f.pagina] !== false)
}

export function render() {
    const botones = filtrosVisibles()
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
            <div class="filtros">
                <div class="campo-buscar">
                    <input type="text" id="filtro-buscar" class="filtro-buscar" placeholder="Buscar..." aria-label="Buscar">
                    <button type="button" class="campo-buscar-limpiar" id="filtro-buscar-limpiar" title="Limpiar búsqueda" aria-label="Limpiar búsqueda" hidden>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x preview-icon">
                            <path d="M18 6 6 18"/>
                            <path d="m6 6 12 12"/>
                        </svg>
                    </button>
                </div>
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
                <button type="button" class="btn-icon filtro-limpiar" id="filtro-limpiar" title="Limpiar filtros" aria-label="Limpiar filtros">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-broom preview-icon">
                        <path d="M13.5 10.5 22 2"/>
                        <path d="M14.734 13.841a2 2 0 00-.314-2.42L12.58 9.58a2 2 0 00-2.421-.314l-7.657 4.461A1 1 0 002.3 15.3l6.403 6.403a1 1 0 001.571-.204z"/>
                        <path d="m5 18 2-2"/>
                        <path d="m7.699 10.7 5.602 5.601"/>
                    </svg>
                </button>
            </div>
            <div id="totales-movimientos" class="totales"></div>
            <div id="lista-movimientos" class="lista-cards">
                <div class="lista-vacia">${LOGO_ESCINCO_CARGA}</div>
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
        limpiarSeleccion()
        aplicarFiltro()
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
    const esPositivo = esMovimientoPositivo(m)
    const signo = esPositivo ? "+" : "-"
    const clase = esPositivo ? "positive" : "negative"
    const tipoNombre = CONFIG_MOVIMIENTOS[m.tipo]?.nombre || m.tipo || "Desconocido"
    const fecha = formatearFecha(m.fechaRealizacion)
    const seleccionada = seleccionados.has(m.id) ? " seleccionado" : ""

    return `
        <div class="card-item${seleccionada}" data-id="${m.id}">
            <div class="card-item-main">
                <div class="card-item-info">
                    <span class="card-item-titulo">${m.concepto || m.activo || m.tipo || "Sin concepto"}</span>
                    <span class="card-item-detalle">${fecha} · ${tipoNombre}</span>
                </div>
                <div class="card-item-valor-wrap">
                    <span class="card-item-valor ${clase}">
                        ${signo} ${Math.abs(monto).toFixed(2)} ${(m.divisa || "PEN").toUpperCase()}
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

function esMovimientoPositivo(m) {
    if (m?.tipo === TIPOS_MOVIMIENTO.ERROR) {
        return m.operacion === "sumar"
    }
    return (
        m?.tipo === "ingreso" ||
        m?.tipo === "ventaActivo" ||
        m?.tipo === "p2pVenta"
    )
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
    const buscarLimpiar = document.getElementById("filtro-buscar-limpiar")
    const limpiar = document.getElementById("filtro-limpiar")

    desde?.addEventListener("change", aplicarFiltro)
    hasta?.addEventListener("change", aplicarFiltro)
    cuenta?.addEventListener("change", aplicarFiltro)
    divisa?.addEventListener("change", aplicarFiltro)

    buscar?.addEventListener("input", () => {
        if (buscarLimpiar) buscarLimpiar.hidden = !buscar.value.trim()
        aplicarFiltro()
    })
    buscarLimpiar?.addEventListener("click", () => {
        if (buscar) buscar.value = ""
        if (buscarLimpiar) buscarLimpiar.hidden = true
        aplicarFiltro()
        buscar?.focus()
    })
    limpiar?.addEventListener("click", () => {
        if (desde) desde.value = ""
        if (hasta) hasta.value = ""
        if (cuenta) cuenta.value = ""
        if (divisa) divisa.value = ""
        if (buscar) buscar.value = ""
        if (buscarLimpiar) buscarLimpiar.hidden = true
        aplicarFiltro()
    })

    // Interacción con las cards:
    //   click     → abrir detalle (o seleccionar si ya hay selección activa)
    //   dblclick  → seleccionar / deseleccionar
    //   mantén    → seleccionar (clic sostenido)
    //   swipe ←   → revelar acciones (editar / eliminar)
    const container = document.getElementById("lista-movimientos")
    container?.addEventListener("click", manejarClickCard)
    container?.addEventListener("dblclick", manejarDobleClickCard)
    vincularGestosCard(container)
    configurarEventosGlobales()
}

function configurarEventosGlobales() {
    if (eventosGlobalesListos) return
    eventosGlobalesListos = true
    document.addEventListener("click", manejarClickFueraCards)
    document.addEventListener("keydown", manejarTecladoSeleccion)
}

function marcarSupresorClick() {
    supresorClick = true
    clearTimeout(supresorClickTimer)
    supresorClickTimer = setTimeout(() => { supresorClick = false }, 400)
}

function consumirSupresorClick() {
    if (!supresorClick) return false
    supresorClick = false
    clearTimeout(supresorClickTimer)
    return true
}

// Preferencia "un click para seleccionar" (Configuración → Accesibilidad).
function modoUnClickSeleccion() {
    return sesion.getPreferencias()?.accesibilidad?.unClickSeleccion === true
}

// Modo "un click para seleccionar": un click (sin modificador) reemplaza la
// selección con ese movimiento; Shift + click añade o quita de la selección.
function seleccionarPorUnClick(id, conShift) {
    if (conShift) {
        toggleSeleccion(id)
        return
    }
    if (seleccionados.size === 1 && seleccionados.has(id)) return
    seleccionados.clear()
    ordenSeleccion.length = 0
    seleccionados.add(id)
    ordenSeleccion.push(id)
    actualizarSeleccionEnDOM()
    actualizarEstadoLastbar()
}

function manejarClickCard(evento) {
    // Botones de acción revelados por hover/swipe
    const accionBtn = evento.target.closest(".card-action-btn")
    if (accionBtn) {
        evento.stopPropagation()
        const card = accionBtn.closest(".card-item")
        const m = movimientos.find(x => x.id === card?.dataset.id)
        ocultarAccionesCards()
        if (!m) return
        if (accionBtn.dataset.accion === "editar") abrirFormularioMovimiento(m.tipo, m)
        else abrirModalEliminarMovimiento(m)
        return
    }

    const card = evento.target.closest(".card-item")

    // Un toque sobre la card con acciones reveladas solo las oculta.
    if (cardConAcciones) {
        const esLaMisma = card === cardConAcciones
        ocultarAccionesCards()
        if (esLaMisma) {
            consumirSupresorClick()
            return
        }
    }

    // Click inmediatamente después de una selección por clic sostenido o swipe
    if (consumirSupresorClick()) return

    if (!card) return

    const id = card.dataset.id

    // Modo "un click para seleccionar": el click selecciona de inmediato.
    if (modoUnClickSeleccion()) {
        seleccionarPorUnClick(id, evento.shiftKey)
        return
    }

    // Comportamiento clásico: con selección activa, un click la alterna;
    // si no, un click simple abre el detalle del movimiento.
    if (seleccionados.size > 0) {
        toggleSeleccion(id)
        return
    }

    if (clickTimer) {
        clearTimeout(clickTimer)
        clickTimer = null
    }

    clickTimer = setTimeout(() => {
        clickTimer = null
        if (seleccionados.size === 0) abrirDetalleMovimiento(id)
    }, 280)
}

function manejarDobleClickCard(evento) {
    if (evento.target.closest(".card-action-btn")) return
    const card = evento.target.closest(".card-item")
    if (!card) return
    if (clickTimer) {
        clearTimeout(clickTimer)
        clickTimer = null
    }
    // Con la opción activa el click ya selecciona; el doble click abre el detalle.
    if (modoUnClickSeleccion()) {
        limpiarSeleccion()
        abrirDetalleMovimiento(card.dataset.id)
        return
    }
    toggleSeleccion(card.dataset.id)
}

function manejarClickFueraCards(evento) {
    if (!document.getElementById("lista-movimientos")) return
    if (evento.target.closest(".card-item")) return
    if (evento.target.closest("#app-footer")) return
    if (evento.target.closest(".modal-overlay")) return
    ocultarAccionesCards()
    limpiarSeleccion()
}

function manejarTecladoSeleccion(evento) {
    if (!document.getElementById("lista-movimientos")) return
    if (estaAbierto()) return

    if (evento.key === "Escape") {
        if (seleccionados.size > 0) {
            ocultarAccionesCards()
            limpiarSeleccion()
        }
        return
    }

    if (evento.key !== "Delete" && evento.key !== "Backspace") return
    if (evento.target.matches("input, textarea, select")) return
    if (seleccionados.size === 0) return
    evento.preventDefault()
    deseleccionarUltimo()
}

function vincularGestosCard(container) {
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
        if (cardConAcciones && cardConAcciones !== card) ocultarAccionesCards()

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
            toggleSeleccion(card.dataset.id)
            marcarSupresorClick()
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
            if (dx < 0) mostrarAccionesCard(gesto.card)
            else ocultarAccionesCards()
        }
    })

    const finalizar = (evento) => {
        if (!gesto || evento.pointerId !== gesto.pointerId) return
        if (gesto.swipeRevelado) marcarSupresorClick()
        cancelar()
    }

    container.addEventListener("pointerup", finalizar)
    container.addEventListener("pointercancel", finalizar)
}

function mostrarAccionesCard(card) {
    if (cardConAcciones && cardConAcciones !== card) {
        cardConAcciones.classList.remove("acciones-visibles")
    }
    cardConAcciones = card
    card.classList.add("acciones-visibles")
}

function ocultarAccionesCards() {
    if (!cardConAcciones) return
    cardConAcciones.classList.remove("acciones-visibles")
    cardConAcciones = null
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
    cardConAcciones = null

    if (filtrados.length === 0) {
        container.innerHTML = movimientos.length === 0
            ? plantillaVacio()
            : `<p class="lista-vacia">No hay movimientos que coincidan con el filtro.</p>`
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
        if (esMovimientoPositivo(m)) {
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
        <div class="totales-acciones">
            <button type="button" class="totales-btn" id="btn-nuevo-movimiento" title="Nuevo movimiento" aria-label="Nuevo movimiento">${icono("plus-circle", 16)}</button>
        </div>
    `

    document.getElementById("btn-nuevo-movimiento")?.addEventListener("click", () => {
        abrirSelectorTipoMovimiento()
    })
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

// Tipos que se pueden crear según las preferencias y las páginas visibles:
//  · activos & pago de tarjeta → ocultos por defecto; si se activan en
//    configuración (Apariencia → Tipos de movimiento en el selector) vuelven.
//  · p2p y trades → requieren la página "trading".
//  · error → siempre el último.
//  · compraTarjeta NO aparece: comprar con tarjeta es un gasto desde la
//    cuenta de la tarjeta (aumenta su deuda), no un tipo aparte.
const TIPO_TRADE = "trade"

function tiposDisponiblesParaCrear() {
    const paginas = sesion.getPaginasVisibles()
    const tiposPref = sesion.getPreferencias()?.tiposMovimiento || {}

    const tipos = [
        TIPOS_MOVIMIENTO.INGRESO,
        TIPOS_MOVIMIENTO.GASTO,
        TIPOS_MOVIMIENTO.TRANSFERENCIA
    ]

    if (tiposPref.cambioDivisa !== false) {
        tipos.push(TIPOS_MOVIMIENTO.CAMBIO_DIVISA)
    }

    if (paginas.inversiones !== false && tiposPref.compraActivo !== false) {
        tipos.push(TIPOS_MOVIMIENTO.COMPRA_ACTIVO)
    }
    if (paginas.inversiones !== false && tiposPref.ventaActivo !== false) {
        tipos.push(TIPOS_MOVIMIENTO.VENTA_ACTIVO)
    }

    if (paginas.trading !== false && tiposPref.p2pCompra !== false) {
        tipos.push(TIPOS_MOVIMIENTO.P2P_COMPRA)
    }
    if (paginas.trading !== false && tiposPref.p2pVenta !== false) {
        tipos.push(TIPOS_MOVIMIENTO.P2P_VENTA)
    }

    if (tiposPref.pagoTarjeta !== false) {
        tipos.push(TIPOS_MOVIMIENTO.PAGO_TARJETA)
    }

    if (paginas.trading !== false && tiposPref.trade !== false) {
        tipos.push(TIPO_TRADE)
    }

    tipos.push(TIPOS_MOVIMIENTO.ERROR)

    return tipos
}

// Tipos destacados (grandes, con círculo e ícono) frente a los secundarios.
// Se pueden quitar desde Accesibilidad (resaltarIngresoGasto).
const TIPOS_DESTACADOS = [
    TIPOS_MOVIMIENTO.INGRESO,
    TIPOS_MOVIMIENTO.GASTO
]

const NOMBRES_ADICIONALES = {
    [TIPO_TRADE]: "Trade"
}

const ICONO_TIPO_MOVIMIENTO = {
    [TIPOS_MOVIMIENTO.INGRESO]: "arrow-down-left",
    [TIPOS_MOVIMIENTO.GASTO]: "arrow-up-right"
}

export function abrirSelectorTipoMovimiento(cuentaId = null) {
    // Garantizar uid actual para quien invoque desde otra página
    uid = sesion.uid

    const disponibles = tiposDisponiblesParaCrear()

    // Accesibilidad: resaltar ingreso/gasto (destacados) o verlos igual que el resto
    const resaltar = sesion.getPreferencias()?.accesibilidad?.resaltarIngresoGasto !== false
    const destacados = resaltar
        ? TIPOS_DESTACADOS.filter(t => disponibles.includes(t))
        : []
    const secundarios = disponibles.filter(t => !destacados.includes(t))

    const botonDestacado = t => {
        const nombre = CONFIG_MOVIMIENTOS[t]?.nombre || NOMBRES_ADICIONALES[t] || t
        return `
        <div class="tipo-movimiento-btn tipo-principal" data-tipo="${t}">
            <button type="button" class="tipo-icono" aria-label="Crear ${nombre}">
                ${icono(ICONO_TIPO_MOVIMIENTO[t] || "plus-circle", 24)}
            </button>
            <span class="tipo-texto">${nombre}</span>
        </div>
    `
    }
    // Si la cantidad de secundarios es impar, el último (error) ocupa ambas columnas.
    const impar = secundarios.length % 2 === 1
    const botonSecundario = (t, i) => {
        const nombre = CONFIG_MOVIMIENTOS[t]?.nombre || NOMBRES_ADICIONALES[t] || t
        const spanFull = impar && i === secundarios.length - 1 ? " span-full" : ""
        return `<button class="tipo-movimiento-btn tipo-secundario${spanFull}" data-tipo="${t}" type="button">${nombre}</button>`
    }

    abrirModal({
        titulo: "Seleccionar tipo",
        contenido: `
            <div class="selector-tipos selector-tipos-destacados">
                ${destacados.map(botonDestacado).join("")}
            </div>
            ${secundarios.length > 0 ? `
            <div class="selector-tipos selector-tipos-secundarios">
                ${secundarios.map(botonSecundario).join("")}
            </div>` : ""}
        `,
        variante: "narrow",
        confirmText: null,
        cancelText: null,
        cerrarAlClickFuera: true
    })

    const abrirFormularioPorTipo = tipo => {
        cerrarModal()
        if (tipo === TIPO_TRADE) {
            abrirSelectorDireccionTrade()
            return
        }
        const opciones = cuentaId
            ? { valores: { cuenta: cuentaId, cuentaOrigen: cuentaId } }
            : undefined
        abrirFormularioMovimiento(tipo, null, opciones)
    }

    document.querySelectorAll(".tipo-principal").forEach(cont => {
        const tipo = cont.dataset.tipo
        const iconoBtn = cont.querySelector(".tipo-icono")
        iconoBtn?.addEventListener("click", () => abrirFormularioPorTipo(tipo))
    })

    document.querySelectorAll(".tipo-secundario").forEach(btn => {
        btn.addEventListener("click", () => abrirFormularioPorTipo(btn.dataset.tipo))
    })
}

// El tipo "Trade" abre una dirección (Largo/Corto) antes del formulario.
function abrirSelectorDireccionTrade() {
    abrirModal({
        titulo: "Nuevo trade",
        contenido: `
            <div class="selector-tipos selector-tipos-secundarios">
                <button class="tipo-movimiento-btn tipo-secundario" data-direccion="long" type="button">Largo (Long)</button>
                <button class="tipo-movimiento-btn tipo-secundario" data-direccion="short" type="button">Corto (Short)</button>
            </div>
        `,
        variante: "narrow",
        confirmText: null,
        cancelText: null,
        cerrarAlClickFuera: true
    })

    document.querySelectorAll("[data-direccion]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const direccion = btn.dataset.direccion
            cerrarModal()
            try {
                const { abrirModalNuevoTrade } = await import("./trading.js")
                abrirModalNuevoTrade(direccion)
            } catch (error) {
                console.error("Error abriendo trade:", error)
                mostrarNotificacion("error", "No se pudo abrir el registro de trade")
            }
        })
    })
}

export async function abrirFormularioMovimiento(tipo, movimiento = null, opciones = {}) {
    uid = sesion.uid
    const esEdicion = !!movimiento
    const alGuardar = opciones.alGuardar || null
    const valoresIniciales = opciones.valores || null
    const html = await generarFormularioMovimiento(tipo, valoresIniciales?.divisa || null)

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
                if (alGuardar) {
                    await alGuardar()
                } else {
                    await cargarMovimientos()
                }
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
    } else if (valoresIniciales) {
        for (const [campo, valor] of Object.entries(valoresIniciales)) {
            const input = document.getElementById(`campo-${campo}`)
            if (input) input.value = valor
        }
    }

    if (tipo === TIPOS_MOVIMIENTO.PAGO_TARJETA) {
        filtrarCuentasPagoTarjeta()
    }
    vincularSimboloDivisa()
}

function filtrarCuentasPagoTarjeta() {
    const tarjeta = document.getElementById("campo-tarjeta")
    const origen = document.getElementById("campo-cuentaOrigen")
    if (!tarjeta || !origen) return

    const actualizar = () => {
        const moneda = tarjeta.selectedOptions?.[0]?.dataset?.moneda
        Array.from(origen.options).forEach((opcion, indice) => {
            if (indice === 0) return
            const tipo = opcion.dataset.tipo
            const compatible = tipo !== "credito" && (!moneda || opcion.dataset.moneda === moneda)
            opcion.hidden = !compatible
            opcion.disabled = !compatible
        })
        if (origen.selectedOptions[0]?.disabled) origen.value = ""
    }

    tarjeta.addEventListener("change", actualizar)
    actualizar()
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
            </div>
        `,
        variante: "confirm",
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            try {
                const snapshot = { ...m }
                await eliminarMovimiento(uid, m)
                await cargarMovimientos()
                ofrecerDeshacer({
                    mensaje: "Movimiento eliminado. ¿Deshacer?",
                    restaurar: () => restaurarMovimiento(uid, snapshot),
                    alRestaurar: () => cargarMovimientos()
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

// ============================================
// MODAL DE DETALLE
// ============================================
// Un clic abre el mismo formulario que "Editar" pero con los campos
// bloqueados. Desde ahí se puede habilitar la edición o eliminar.

function abrirDetalleMovimiento(id) {
    const m = movimientos.find(x => x.id === id)
    if (!m) return
    abrirFormularioDetalle(m)
}

export async function abrirFormularioDetalle(m) {
    uid = sesion.uid
    const html = await generarFormularioMovimiento(m.tipo)
    const config = CONFIG_MOVIMIENTOS[m.tipo]
    const tipoNombre = config?.nombre || m.tipo || "Desconocido"

    const modalEl = abrirModal({
        titulo: `${tipoNombre} · ${formatearFecha(m.fechaRealizacion)}`,
        contenido: `
            ${html}
            <div class="movimiento-detalle-acciones" id="detalle-acciones"></div>
        `,
        variante: "form",
        confirmText: null,
        cancelText: null,
        cerrarAlClickFuera: true
    })

    rellenarFormulario(m.tipo, m)
    if (tipo === TIPOS_MOVIMIENTO.PAGO_TARJETA) {
        filtrarCuentasPagoTarjeta()
    }
    vincularSimboloDivisa()
    bloquearFormulario(true)
    renderizarAccionesDetalle(modalEl, true)

    const body = modalEl.querySelector(".modal-body")
    body?.addEventListener("click", (evento) => {
        const boton = evento.target.closest("[data-detalle-accion]")
        if (!boton) return
        manejarAccionDetalle(boton.dataset.detalleAccion, m, modalEl)
    })
}

function renderizarAccionesDetalle(modalEl, bloqueado) {
    const contenedor = modalEl.querySelector("#detalle-acciones")
    if (!contenedor) return

    contenedor.innerHTML = bloqueado
        ? `
            <button type="button" class="glass-btn" data-detalle-accion="editar">
                ${icono("pencil", 15)} Editar
            </button>
            <button type="button" class="glass-btn danger" data-detalle-accion="eliminar">
                ${icono("trash", 15)} Eliminar
            </button>
        `
        : `
            <button type="button" class="modal-btn modal-btn-primary" data-detalle-accion="guardar">Guardar cambios</button>
            <button type="button" class="glass-btn cancel" data-detalle-accion="cancelar">Cancelar</button>
        `
}

function bloquearFormulario(bloquear) {
    const form = document.getElementById("form-movimiento")
    if (!form) return
    form.querySelectorAll("input, select, textarea, button").forEach(el => {
        el.disabled = bloquear
    })
    form.classList.toggle("form-bloqueado", bloquear)
}

async function manejarAccionDetalle(accion, m, modalEl) {
    if (accion === "editar") {
        bloquearFormulario(false)
        renderizarAccionesDetalle(modalEl, false)
        document.getElementById("campo-concepto")?.focus()
        return
    }

    if (accion === "cancelar") {
        abrirFormularioDetalle(m)
        return
    }

    if (accion === "eliminar") {
        cerrarModal()
        abrirModalEliminarMovimiento(m)
        return
    }

    if (accion === "guardar") {
        const datos = recogerDatosFormulario(m.tipo)
        if (!datos) return

        if (!datos.fechaRealizacion) datos.fechaRealizacion = getFechaHoy()

        // Mientras el servidor procesa: blur en toda la pantalla + desactivar
        // botones del detalle para evitar doble envío.
        const overlay = modalEl.closest(".modal-overlay")
        overlay?.classList.add("modal-procesando")
        modalEl.querySelectorAll("button").forEach(boton => boton.setAttribute("disabled", "true"))

        try {
            await actualizarMovimiento(uid, m.id, m, m.tipo, datos)
            await cargarMovimientos()
            mostrarNotificacion("exito", "Movimiento actualizado")
            cerrarModal()
        } catch (error) {
            console.error("Error actualizando movimiento:", error)
            mostrarNotificacion("error", `No se pudo actualizar: ${error.message || "error desconocido"}`)
            overlay?.classList.remove("modal-procesando")
            modalEl.querySelectorAll("button").forEach(boton => boton.removeAttribute("disabled"))
        }
    }
}

// ============================================
// SELECCIÓN (dblclick / clic sostenido / click en modo selección)
// ============================================
// La selección habilita los botones Editar (uno solo) / Eliminar del lastbar.
// Escape o un click fuera de la lista limpian la selección.
// Suprimir/Delete quita el último movimiento seleccionado.

function toggleSeleccion(id) {
    if (seleccionados.has(id)) {
        seleccionados.delete(id)
        const indice = ordenSeleccion.indexOf(id)
        if (indice !== -1) ordenSeleccion.splice(indice, 1)
    } else {
        seleccionados.add(id)
        if (!ordenSeleccion.includes(id)) ordenSeleccion.push(id)
    }
    actualizarSeleccionEnDOM()
    actualizarEstadoLastbar()
}

function deseleccionarUltimo() {
    const id = ordenSeleccion.pop()
    if (!id) return
    seleccionados.delete(id)
    actualizarSeleccionEnDOM()
    actualizarEstadoLastbar()
}

function limpiarSeleccion() {
    if (seleccionados.size === 0) {
        actualizarEstadoLastbar()
        return
    }
    seleccionados.clear()
    ordenSeleccion.length = 0
    actualizarSeleccionEnDOM()
    actualizarEstadoLastbar()
}

function actualizarSeleccionEnDOM() {
    document.querySelectorAll(".card-item").forEach(card => {
        card.classList.toggle("seleccionado", seleccionados.has(card.dataset.id))
    })
}

function actualizarEstadoLastbar() {
    const puedeEditar = seleccionados.size === 1
    const puedeEliminar = seleccionados.size > 0

    document.querySelectorAll('[data-accion="editar-movimiento"]').forEach(item => {
        item.classList.toggle("desact", !puedeEditar)
    })
    document.querySelectorAll('[data-accion="eliminar-movimiento"]').forEach(item => {
        item.classList.toggle("desact", !puedeEliminar)
    })
}

export async function editarSeleccionados() {
    if (seleccionados.size !== 1) return

    const id = [...seleccionados][0]
    const movimiento = movimientos.find(m => m.id === id)
    if (!movimiento) return

    limpiarSeleccion()
    abrirFormularioMovimiento(movimiento.tipo, movimiento)
}

export async function eliminarSeleccionados() {
    if (seleccionados.size === 0) return

    const lista = [...seleccionados]
        .map(id => movimientos.find(m => m.id === id))
        .filter(Boolean)

    limpiarSeleccion()
    abrirModalEliminarVarios(lista)
}

function abrirModalEliminarVarios(lista) {
    abrirModal({
        titulo: "Eliminar movimientos",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-title-danger">¿Eliminar ${lista.length} movimiento(s)?</p>
            </div>
        `,
        variante: "confirm",
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            try {
                const snapshots = lista.map(x => ({ ...x }))
                for (const m of lista) {
                    await eliminarMovimiento(uid, m)
                }
                await cargarMovimientos()
                ofrecerDeshacer({
                    mensaje: `${lista.length} movimiento(s) eliminado(s). ¿Deshacer?`,
                    restaurar: async () => {
                        for (const s of snapshots) {
                            await restaurarMovimiento(uid, s)
                        }
                    },
                    alRestaurar: () => cargarMovimientos()
                })
                return true
            } catch (error) {
                console.error("Error eliminando movimientos:", error)
                mostrarNotificacion("error", `No se pudieron eliminar: ${error.message || "error desconocido"}`)
                return false
            }
        }
    })
}

// ============================================
// EXTRACTO CSV (solo movimientos)
// ============================================

export async function exportarExtractoCSV() {
    uid = sesion.uid
    if (!uid) {
        mostrarNotificacion("error", "No hay sesión activa")
        return
    }

    try {
        movimientos = await obtenerMovimientos(uid)
        if (!movimientos || movimientos.length === 0) {
            mostrarNotificacion("info", "No hay movimientos para exportar")
            return
        }

        const nombrePorId = new Map(cuentas.map(c => [c.id, c.nombre]))

        const filas = movimientos
            .slice()
            .sort((a, b) => {
                const fa = (fechaDeMovimiento(a)?.getTime?.()) || 0
                const fb = (fechaDeMovimiento(b)?.getTime?.()) || 0
                return fb - fa
            })
            .map(m => [
                formatearFecha(m.fechaRealizacion),
                CONFIG_MOVIMIENTOS[m.tipo]?.nombre || m.tipo || "Desconocido",
                m.concepto || m.activo || CONFIG_MOVIMIENTOS[m.tipo]?.nombre || "Sin concepto",
                nombrePorId.get(m.cuenta || m.cuentaOrigen || m.tarjeta) || m.cuenta || m.cuentaOrigen || m.tarjeta || "",
                `${esMovimientoPositivo(m) ? "+" : "-"}${Math.abs(montoDeMovimiento(m)).toFixed(2)}`,
                (m.divisa || "PEN").toUpperCase()
            ])

        const cabecera = ["Fecha", "Tipo", "Concepto", "Cuenta", "Monto", "Divisa"]
        const csv = [cabecera, ...filas]
            .map(fila => fila.map(valor => escaparCSV(valor)).join(","))
            .join("\r\n")

        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        descargarArchivo(url, `escinco_movimientos_${getFechaHoy()}.csv`)
        // Revoke diferido: revocar aquí cancelaba la descarga antes de arrancar (bug #9)
        setTimeout(() => URL.revokeObjectURL(url), 0)

        mostrarNotificacion("exito", `Extracto exportado (${movimientos.length} movimientos)`)
    } catch (error) {
        console.error("Error exportando CSV de movimientos:", error)
        mostrarNotificacion("error", `No se pudo exportar el extracto: ${error.message || "error desconocido"}`)
    }
}

function escaparCSV(valor) {
    const texto = String(valor ?? "")
    if (/[",\r\n]/.test(texto)) {
        return `"${texto.replaceAll('"', '""')}"`
    }
    return texto
}

// Un movimiento es de aporte a meta si guarda el vínculo explícito (metaId)
// o si su concepto coincide con el generado por los aportes automáticos.
function esMovimientoDeMeta(m) {
    if (!!m?.metaId) return true
    return /^aporte a meta:/i.test(String(m?.concepto || "").trim())
}

function descargarArchivo(url, nombre) {
    const link = document.createElement("a")
    link.href = url
    link.download = nombre
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}