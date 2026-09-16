import { obtenerMovimientos } from "../../firebase/firestore.js"
import { sesion } from "../core/sesion.js"
import { CONFIG_MOVIMIENTOS, TIPOS_MOVIMIENTO } from "../../constants/tiposMovimiento.js"
import { abrirModal, cerrarModal } from "../ui/modal.js"
import {
    generarFormularioMovimiento,
    recogerDatosFormulario
} from "../ui/formularioMovimiento.js"
import { registrarMovimiento } from "../services/MovimientoServicio.js"

let movimientos = []
let uid = null
let filtroActual = "todos"

// ============================================
// RENDER
// ============================================

export function render() {
    return `
        <section id="sidebar">
            <button class="glass act" data-filtro="todos">📋 Todos</button>
            <button class="glass" data-filtro="ingreso">📥 Ingresos</button>
            <button class="glass" data-filtro="gasto">📤 Gastos</button>
            <button class="glass" data-filtro="transferencia">🔄 Transferencias</button>
            <button class="glass" data-filtro="compraTarjeta">💳 Tarjetas</button>
        </section>
        <section id="panel" class="glass">
            <div class="panel-header">
                <h2>Movimientos</h2>
            </div>
            <div class="filtros">
                <input type="date" id="filtro-desde" class="glass">
                <input type="date" id="filtro-hasta" class="glass">
            </div>
            <div id="lista-movimientos" class="lista-movimientos">
                <p class="lista-vacia">Cargando movimientos...</p>
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
    await cargarMovimientos()
    configurarEventos()
}

// ============================================
// CARGA
// ============================================

async function cargarMovimientos() {
    try {
        movimientos = await obtenerMovimientos(uid)
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
    const monto = m.monto || m.montoOrigen || 0
    const esPositivo = esMovimientoPositivo(m.tipo)
    const signo = esPositivo ? "+" : "-"
    const clase = esPositivo ? "positive" : "negative"
    const tipoNombre = CONFIG_MOVIMIENTOS[m.tipo]?.nombre || m.tipo || "Desconocido"
    const fecha = formatearFecha(m.fechaRegistro || m.fechaRealizacion)

    return `
        <div class="movimiento-item" data-id="${m.id}">
            <div class="info">
                <span class="concepto">${m.concepto || m.tipo || "Sin concepto"}</span>
                <span class="fecha">${fecha}</span>
                <span class="tipo">${tipoNombre}</span>
            </div>
            <span class="monto ${clase}">
                ${signo} ${Math.abs(monto).toFixed(2)} ${(m.divisa || "PEN").toUpperCase()}
            </span>
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

function formatearFecha(valor) {
    if (!valor) return "—"
    try {
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

    desde?.addEventListener("change", aplicarFiltro)
    hasta?.addEventListener("change", aplicarFiltro)
}

function aplicarFiltro() {
    const container = document.getElementById("lista-movimientos")
    if (!container) return

    const desde = document.getElementById("filtro-desde")?.value
    const hasta = document.getElementById("filtro-hasta")?.value

    let filtrados = movimientos

    if (filtroActual !== "todos") {
        filtrados = filtrados.filter(m => m.tipo === filtroActual)
    }

    if (desde) {
        const d = new Date(desde)
        filtrados = filtrados.filter(m => {
            const f = fechaDeMovimiento(m)
            return f && f >= d
        })
    }

    if (hasta) {
        const h = new Date(hasta)
        h.setHours(23, 59, 59)
        filtrados = filtrados.filter(m => {
            const f = fechaDeMovimiento(m)
            return f && f <= h
        })
    }

    if (filtrados.length === 0) {
        container.innerHTML = `<p class="lista-vacia">No hay movimientos que coincidan con el filtro.</p>`
        return
    }

    container.innerHTML = filtrados.map(plantillaMovimiento).join("")
}

function fechaDeMovimiento(m) {
    const valor = m.fechaRealizacion || m.fechaRegistro
    if (!valor) return null
    if (valor?.toDate) return valor.toDate()
    if (valor?.seconds) return new Date(valor.seconds * 1000)
    return new Date(valor)
}

// ============================================
// LASTRAR (handlers centralizados en app.js)
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
            abrirFormularioMovimiento(tipo)
        })
    })
}

async function abrirFormularioMovimiento(tipo) {
    const html = await generarFormularioMovimiento(tipo)

    abrirModal({
        titulo: `Nuevo ${CONFIG_MOVIMIENTOS[tipo]?.nombre || tipo}`,
        contenido: html,
        variante: "form",
        confirmText: "Registrar movimiento",
        onConfirm: async () => {
            const datos = recogerDatosFormulario(tipo)
            if (!datos) return false

            if (!datos.fechaRealizacion) {
                datos.fechaRealizacion = new Date().toISOString().split("T")[0]
            }

            try {
                await registrarMovimiento(uid, tipo, datos)
                await cargarMovimientos()
                return true
            } catch (error) {
                console.error("Error creando movimiento:", error)
                alert(`❌ Error: ${error.message}`)
                return false
            }
        }
    })
}