import { sesion } from "../core/sesion.js"
import { obtenerPosicionesConValor } from "../services/PosicionServicio.js"
import {
    buscarActivoPorSimbolo,
    crearActivo
} from "../repositories/ActivoRepositorio.js"
import {
    obtenerHistorialParaGrafico,
    registrarPrecio
} from "../services/HistorialServicio.js"
import { crearGraficoLinea, destruirGrafico } from "../ui/graficos.js"
import { abrirModal } from "../ui/modal.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"
import { obtenerCuentas } from "../../firebase/firestore.js"
import { DIVISAS } from "../../constants/divisas.js"
import { icono } from "../core/iconos.js"

let uid = null
let posicionesData = null

// ============================================
// RENDER
// ============================================

export function render() {
    return `
        <section id="sidebar">
            <button class="glass act" data-filtro="todas">${icono("list", 18)}<span>Todas</span></button>
            <button class="glass" data-filtro="accion">${icono("trending-up", 18)}<span>Acciones</span></button>
            <button class="glass" data-filtro="etf">${icono("layers", 18)}<span>ETFs</span></button>
            <button class="glass" data-filtro="crypto">${icono("bitcoin", 18)}<span>Cripto</span></button>
        </section>
        <section id="panel" class="glass">
            <div class="panel-header">
                <h2>Inversiones</h2>
            </div>
            <div class="portfolio-resumen">
                <div class="resumen-card">
                    <div class="resumen-label">Valor total</div>
                    <div class="resumen-valor" id="valor-total">S/ 0.00</div>
                </div>
                <div class="resumen-card">
                    <div class="resumen-label">Rendimiento</div>
                    <div class="resumen-valor" id="rendimiento-total">+0.00</div>
                </div>
                <div class="resumen-card">
                    <div class="resumen-label">Posiciones</div>
                    <div class="resumen-valor" id="total-posiciones">0</div>
                </div>
            </div>
            <div id="lista-posiciones" class="lista-posiciones">
                <p class="lista-vacia">Cargando posiciones...</p>
            </div>
        </section>
    `
}

// ============================================
// INIT
// ============================================

export async function init() {
    uid = sesion.uid
    console.log("[INFO] Inversiones iniciado para UID:", uid)

    await cargarPosiciones()
    configurarEventos()
}

// ============================================
// CARGAR POSICIONES
// ============================================

export async function cargarPosiciones() {
    try {
        posicionesData = await obtenerPosicionesConValor(uid)
        renderizarPosiciones()
        actualizarResumen()
    } catch (error) {
        console.error("Error cargando posiciones:", error)
        const container = document.getElementById("lista-posiciones")
        if (container) {
            container.innerHTML = `<p class="lista-vacia error">Error al cargar posiciones</p>`
        }
    }
}

// ============================================
// RENDERIZAR POSICIONES
// ============================================

function renderizarPosiciones() {
    const container = document.getElementById("lista-posiciones")
    if (!container) return

    const posiciones = posicionesData?.posiciones || []

    if (posiciones.length === 0) {
        container.innerHTML = plantillaVacio()
        return
    }

    container.innerHTML = posiciones.map(plantillaPosicion).join("")
    enlazarClicksPosiciones(container, posiciones)
}

function plantillaVacio() {
    return `
        <p class="lista-vacia">
            No hay posiciones activas.
            <br><br>
            <span class="lista-vacia-hint">
                Usa el botón <strong>"Comprar"</strong> en la barra inferior
                para agregar tu primera inversión.
            </span>
        </p>
    `
}

function plantillaPosicion(p) {
    const activo = p.activo
    const rendimiento = p.rendimientoPorcentual || 0
    const esGanancia = rendimiento >= 0
    const valor = p.valorTotal || 0

    return `
        <div class="posicion-item" data-posicion-id="${p.id}" data-activo-id="${p.activoId}">
            <div class="posicion-info">
                <div class="posicion-nombre">
                    ${activo?.nombre || p.activoId}
                    <span class="posicion-simbolo">${activo?.simbolo || ""}</span>
                </div>
                <div class="posicion-detalle">
                    ${p.cantidad.toFixed(4)} · Precio: ${activo?.ultimoPrecio?.toFixed(2) || "0.00"} ${p.divisa.toUpperCase()}
                </div>
            </div>
            <div class="posicion-valores">
                <div class="posicion-valor">
                    ${valor.toFixed(2)} ${p.divisa.toUpperCase()}
                </div>
                <div class="posicion-rendimiento ${esGanancia ? "positive" : "negative"}">
                    ${esGanancia ? "+" : ""}${rendimiento.toFixed(2)}%
                </div>
            </div>
        </div>
    `
}

function enlazarClicksPosiciones(container, posiciones) {
    container.querySelectorAll(".posicion-item").forEach(item => {
        item.addEventListener("click", async () => {
            const activoId = item.dataset.activoId
            const posicion = posiciones.find(p => p.activoId === activoId)
            if (posicion) {
                await mostrarGraficoActivo(activoId, posicion.activo)
            }
        })
    })
}

// ============================================
// MOSTRAR GRÁFICO DE ACTIVO
// ============================================

async function mostrarGraficoActivo(activoId, activo) {
    console.log("[INFO] Mostrando gráfico para:", activo?.simbolo || activoId)

    const datos = await obtenerHistorialParaGrafico(uid, activoId, 7)

    const html = `
        <div class="grafico-container">
            <canvas id="grafico-activo"></canvas>
        </div>
        <div class="grafico-info">
            <div class="grafico-nombre">${activo?.nombre || ""} (${activo?.simbolo || ""})</div>
            <div class="grafico-precio">${activo?.ultimoPrecio?.toFixed(2) || "0.00"}</div>
            <div class="grafico-periodo">Últimos 7 días</div>
        </div>
    `

    abrirModal({
        titulo: "Historial de precios",
        contenido: html,
        confirmText: "Cerrar",
        onConfirm: () => {
            destruirGrafico()
            return true
        },
        onCancel: () => {
            destruirGrafico()
        }
    })

    setTimeout(async () => {
        await crearGraficoLinea("grafico-activo", datos, {
            label: activo?.simbolo || "Precio",
            simbolo: activo?.simbolo || ""
        })
    }, 150)
}

// ============================================
// ACTUALIZAR RESUMEN
// ============================================

function actualizarResumen() {
    const valorTotal = document.getElementById("valor-total")
    const rendimientoTotal = document.getElementById("rendimiento-total")
    const totalPosiciones = document.getElementById("total-posiciones")

    if (valorTotal) {
        const divisa = posicionesData?.posiciones?.[0]?.divisa?.toUpperCase() || "USD"
        valorTotal.textContent = `${posicionesData?.valorTotal?.toFixed(2) || "0.00"} ${divisa}`
    }

    if (rendimientoTotal) {
        const ganancia = posicionesData?.gananciaTotal || 0
        rendimientoTotal.textContent = `${ganancia >= 0 ? "+" : ""}${ganancia.toFixed(2)}`
        rendimientoTotal.className = `resumen-valor ${ganancia >= 0 ? "positive" : "negative"}`
    }

    if (totalPosiciones) {
        totalPosiciones.textContent = posicionesData?.cantidad || 0
    }
}

// ============================================
// EVENTOS DEL SIDEBAR
// ============================================

function configurarEventos() {
    document.querySelectorAll("#sidebar button").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#sidebar button").forEach(b => b.classList.remove("act"))
            btn.classList.add("act")

            const filtro = btn.dataset.filtro
            const posiciones = posicionesData?.posiciones || []

            if (filtro === "todas") {
                renderizarPosiciones()
                return
            }

            const filtradas = posiciones.filter(p => p.activo?.tipo === filtro)
            const container = document.getElementById("lista-posiciones")
            if (!container) return

            if (filtradas.length === 0) {
                container.innerHTML = `<p class="lista-vacia">No hay posiciones de este tipo.</p>`
                return
            }

            container.innerHTML = filtradas.map(plantillaPosicion).join("")
            enlazarClicksPosiciones(container, filtradas)
        })
    })
}

// ============================================
// ACCIONES EXPORTADAS PARA LASTBAR
// ============================================
// (Compra, venta, actualizar y broker se invocan desde la
//  delegación central de app.js)

// ============================================
// MODAL COMPRAR ACTIVO
// ============================================

export function abrirModalCompra() {
    const hoy = new Date().toISOString().split("T")[0]

    const html = `
        <form id="form-comprar" class="form-movimiento form-movimiento-grid">
            <div class="form-group">
                <label for="compra-simbolo">Símbolo del activo *</label>
                <input type="text" id="compra-simbolo" class="form-input" placeholder="Ej: VOO, BTC, AAPL" required>
                <span class="form-hint">Busca por símbolo. Si no existe, se creará automáticamente con los datos que completes.</span>
            </div>
            <div class="form-group">
                <label for="compra-nombre">Nombre del activo (solo si es nuevo)</label>
                <input type="text" id="compra-nombre" class="form-input" placeholder="Ej: Vanguard S&P 500 ETF">
            </div>
            <div class="form-group">
                <label for="compra-tipo">Tipo (solo si es nuevo)</label>
                <select id="compra-tipo" class="form-input">
                    <option value="accion">Acción</option>
                    <option value="etf">ETF</option>
                    <option value="crypto">Cripto</option>
                </select>
            </div>
            <div class="form-group">
                <label for="compra-cantidad">Cantidad *</label>
                <input type="number" id="compra-cantidad" class="form-input" step="0.0001" min="0.0001" placeholder="0" required>
            </div>
            <div class="form-group">
                <label for="compra-precio">Precio unitario *</label>
                <input type="number" id="compra-precio" class="form-input" step="0.01" min="0.01" placeholder="0.00" required>
            </div>
            <div class="form-group">
                <label for="compra-comision">Comisión</label>
                <input type="number" id="compra-comision" class="form-input" step="0.01" min="0" placeholder="0.00" value="0">
            </div>
            <div class="form-group">
                <label for="compra-divisa">Divisa</label>
                <select id="compra-divisa" class="form-input">
                    <option value="${DIVISAS.PEN}">PEN</option>
                    <option value="${DIVISAS.USD}" selected>USD</option>
                    <option value="${DIVISAS.USDT}">USDT</option>
                </select>
            </div>
            <div class="form-group">
                <label for="compra-cuenta">Cuenta de origen *</label>
                <select id="compra-cuenta" class="form-input" required>
                    <option value="">Seleccionar cuenta</option>
                </select>
            </div>
            <div class="form-group">
                <label for="compra-fecha">Fecha</label>
                <input type="date" id="compra-fecha" class="form-input" value="${hoy}">
            </div>
        </form>
    `

    abrirModal({
        titulo: "Comprar activo",
        contenido: html,
        confirmText: "Comprar",
        onConfirm: async () => {
            const simbolo = document.getElementById("compra-simbolo")?.value.trim().toUpperCase()
            const nombre = document.getElementById("compra-nombre")?.value.trim()
            const tipo = document.getElementById("compra-tipo")?.value || "accion"
            const cantidad = parseFloat(document.getElementById("compra-cantidad")?.value)
            const precio = parseFloat(document.getElementById("compra-precio")?.value)
            const comision = parseFloat(document.getElementById("compra-comision")?.value) || 0
            const divisa = document.getElementById("compra-divisa")?.value
            const cuentaId = document.getElementById("compra-cuenta")?.value
            const fecha = document.getElementById("compra-fecha")?.value

            if (!simbolo) { mostrarNotificacion("error", "El símbolo del activo es obligatorio"); return false }
            if (!cantidad || cantidad <= 0) { mostrarNotificacion("error", "La cantidad debe ser mayor a 0"); return false }
            if (!precio || precio <= 0) { mostrarNotificacion("error", "El precio debe ser mayor a 0"); return false }
            if (!cuentaId) { mostrarNotificacion("error", "Selecciona una cuenta de origen"); return false }

            try {
                let activo = await buscarActivoPorSimbolo(uid, simbolo)
                if (!activo) {
                    if (!nombre) { mostrarNotificacion("error", "El nombre del activo es obligatorio para activos nuevos"); return false }
                    await crearActivo(uid, {
                        nombre,
                        simbolo,
                        tipo,
                        ultimoPrecio: precio
                    })
                    activo = await buscarActivoPorSimbolo(uid, simbolo)
                }

                const { registrarMovimiento } = await import("../services/MovimientoServicio.js")
                await registrarMovimiento(uid, "compraActivo", {
                    activo: activo.id,
                    cuenta: cuentaId,
                    cantidad,
                    precio,
                    comision,
                    divisa,
                    fechaRealizacion: fecha ? new Date(fecha) : new Date()
                })

                await registrarPrecio(uid, activo.id, precio)
                await cargarPosiciones()
                mostrarNotificacion("exito", "Compra registrada correctamente")
                return true
            } catch (error) {
                console.error("Error en compra:", error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })

    setTimeout(() => cargarCuentasEnSelect("compra-cuenta"), 200)
}

// ============================================
// MODAL VENDER ACTIVO
// ============================================

export function abrirModalVenta() {
    const posiciones = posicionesData?.posiciones || []
    if (posiciones.length === 0) {
        mostrarNotificacion("error", "No hay posiciones para vender")
        return
    }

    const options = posiciones.map(p => {
        const activo = p.activo
        return `<option value="${p.id}">${activo?.nombre || p.activoId} (${p.cantidad.toFixed(4)} disponibles)</option>`
    }).join("")

    const hoy = new Date().toISOString().split("T")[0]

    const html = `
        <form id="form-vender" class="form-movimiento form-movimiento-grid">
            <div class="form-group span-full">
                <label for="venta-posicion">Seleccionar posición *</label>
                <select id="venta-posicion" class="form-input" required>
                    <option value="">Seleccionar...</option>
                    ${options}
                </select>
            </div>
            <div class="form-group">
                <label for="venta-cantidad">Cantidad a vender *</label>
                <input type="number" id="venta-cantidad" class="form-input" step="0.0001" min="0.0001" placeholder="0" required>
            </div>
            <div class="form-group">
                <label for="venta-precio">Precio de venta *</label>
                <input type="number" id="venta-precio" class="form-input" step="0.01" min="0.01" placeholder="0.00" required>
            </div>
            <div class="form-group">
                <label for="venta-comision">Comisión</label>
                <input type="number" id="venta-comision" class="form-input" step="0.01" min="0" placeholder="0.00" value="0">
            </div>
            <div class="form-group">
                <label for="venta-cuenta">Cuenta de destino *</label>
                <select id="venta-cuenta" class="form-input" required>
                    <option value="">Seleccionar cuenta</option>
                </select>
            </div>
            <div class="form-group">
                <label for="venta-fecha">Fecha</label>
                <input type="date" id="venta-fecha" class="form-input" value="${hoy}">
            </div>
        </form>
    `

    abrirModal({
        titulo: "Vender activo",
        contenido: html,
        confirmText: "Vender",
        onConfirm: async () => {
            const posicionId = document.getElementById("venta-posicion")?.value
            const cantidad = parseFloat(document.getElementById("venta-cantidad")?.value)
            const precio = parseFloat(document.getElementById("venta-precio")?.value)
            const comision = parseFloat(document.getElementById("venta-comision")?.value) || 0
            const cuentaId = document.getElementById("venta-cuenta")?.value
            const fecha = document.getElementById("venta-fecha")?.value

            if (!posicionId) { mostrarNotificacion("error", "Selecciona una posición"); return false }
            if (!cantidad || cantidad <= 0) { mostrarNotificacion("error", "La cantidad debe ser mayor a 0"); return false }
            if (!precio || precio <= 0) { mostrarNotificacion("error", "El precio debe ser mayor a 0"); return false }
            if (!cuentaId) { mostrarNotificacion("error", "Selecciona una cuenta de destino"); return false }

            try {
                const posicion = posiciones.find(p => p.id === posicionId)
                if (!posicion) { mostrarNotificacion("error", "Posición no encontrada"); return false }
                if (cantidad > posicion.cantidad) {
                    mostrarNotificacion("error", `No tienes suficientes unidades. Disponibles: ${posicion.cantidad.toFixed(4)}`)
                    return false
                }

                const { registrarMovimiento } = await import("../services/MovimientoServicio.js")
                await registrarMovimiento(uid, "ventaActivo", {
                    activo: posicion.activoId,
                    cuenta: cuentaId,
                    cantidad,
                    precio,
                    comision,
                    divisa: posicion.divisa || "usd",
                    fechaRealizacion: fecha ? new Date(fecha) : new Date()
                })

                await registrarPrecio(uid, posicion.activoId, precio)
                await cargarPosiciones()
                mostrarNotificacion("exito", "Venta registrada correctamente")
                return true
            } catch (error) {
                console.error("Error en venta:", error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })

    setTimeout(() => cargarCuentasEnSelect("venta-cuenta"), 200)
}

// ============================================
// MODAL BROKER
// ============================================

export function abrirModalBroker() {
    abrirModal({
        titulo: "Broker",
        contenido: `<p class="lista-vacia">Configuración de brokers (en desarrollo)</p>`,
        confirmText: "Cerrar"
    })
}

// ============================================
// UTILIDAD: Cargar cuentas en select
// ============================================

async function cargarCuentasEnSelect(selectId) {
    try {
        const cuentas = await obtenerCuentas(uid)
        const select = document.getElementById(selectId)
        if (!select) return

        const activas = cuentas.filter(c => c.estado !== "archivada" && c.tipo !== "credito")
        select.innerHTML = `
            <option value="">Seleccionar cuenta</option>
            ${activas.map(c => `
                <option value="${c.id}">${c.nombre} (${c.moneda?.toUpperCase() || "PEN"})</option>
            `).join("")}
        `
    } catch (error) {
        console.error("Error cargando cuentas:", error)
    }
}