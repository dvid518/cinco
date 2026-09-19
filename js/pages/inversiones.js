import { sesion } from "../core/sesion.js"
import { getFechaHoy, parseFechaLocal } from "../core/fechas.js"
import { obtenerPosicionesConValor } from "../services/PosicionServicio.js"
import {
    buscarActivoPorSimbolo,
    crearActivo,
    actualizarPrecioActivo,
    marcarFavoritoActivo
} from "../repositories/ActivoRepositorio.js"
import { eliminarPosicion } from "../repositories/PosicionRepositorio.js"
import {
    obtenerEstrategias,
    crearEstrategia,
    actualizarEstrategia,
    eliminarEstrategia
} from "../repositories/EstrategiaRepositorio.js"
import {
    calcularProximaEjecucion,
    ejecutarEstrategia
} from "../services/EstrategiaServicio.js"
import { DIAS_SEMANA } from "../models/Estrategia.js"
import {
    obtenerHistorialParaGrafico,
    registrarPrecio
} from "../services/HistorialServicio.js"
import { crearGraficoLinea, destruirGrafico } from "../ui/graficos.js"
import { abrirModal } from "../ui/modal.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"
import { obtenerCuentas } from "../../firebase/firestore.js"
import { icono } from "../core/iconos.js"
import { envolverSidebar } from "../ui/colapsoSidebar.js"

let uid = null
let posicionesData = null
let estrategiasData = []
let vistaActual = "posiciones"

// ============================================
// RENDER
// ============================================

export function render() {
    return `
        ${envolverSidebar(`
        <section id="sidebar">
            <button class="glass act" data-filtro="todas">${icono("list", 18)}<span>Todas</span></button>
            <button class="glass" data-filtro="accion">${icono("trending-up", 18)}<span>Acciones</span></button>
            <button class="glass" data-filtro="etf">${icono("layers", 18)}<span>ETFs</span></button>
            <button class="glass" data-filtro="crypto">${icono("bitcoin", 18)}<span>Cripto</span></button>
        </section>
    `)}
        <section id="panel" class="glass">
            <div class="panel-header">
                <h2>Inversiones</h2>
                <div class="toggle-group" id="toggle-vista-inversiones">
                    <span class="toggle-option active" data-vista="posiciones">Posiciones</span>
                    <span class="toggle-option" data-vista="estrategias">Estrategias</span>
                </div>
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
            <div class="estrategias-acciones" id="estrategias-acciones" hidden>
                <button type="button" class="glass-btn" id="btn-nueva-estrategia">
                    ${icono("plus-circle", 16)} Nueva estrategia
                </button>
            </div>
            <div id="lista-posiciones" class="lista-posiciones">
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
    vistaActual = "posiciones"
    console.log("[INFO] Inversiones iniciado para UID:", uid)

    configurarEventos()
    configurarToggleVista()

    await Promise.all([cargarPosiciones(), cargarEstrategias()])
}

// ============================================
// CARGAR POSICIONES
// ============================================

export async function cargarPosiciones() {
    try {
        posicionesData = await obtenerPosicionesConValor(uid)
        actualizarResumen()
        if (vistaActual === "posiciones") {
            renderizarPosiciones()
        }
    } catch (error) {
        console.error("Error cargando posiciones:", error)
        if (vistaActual !== "posiciones") return
        const container = document.getElementById("lista-posiciones")
        if (container) {
            container.innerHTML = `<p class="lista-vacia error">Error al cargar posiciones</p>`
        }
    }
}

// ============================================
// CARGAR ESTRATEGIAS
// ============================================

async function cargarEstrategias() {
    try {
        estrategiasData = await obtenerEstrategias(uid)
        if (vistaActual === "estrategias") {
            renderizarEstrategias()
        }
    } catch (error) {
        console.error("Error cargando estrategias:", error)
        if (vistaActual !== "estrategias") return
        const container = document.getElementById("lista-posiciones")
        if (container) {
            container.innerHTML = `<p class="lista-vacia error">Error al cargar estrategias</p>`
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
    const esFavorito = activo?.favorito === true

    return `
        <div class="posicion-item" data-posicion-id="${p.id}" data-activo-id="${p.activoId}">
            <button
                type="button"
                class="posicion-favorito ${esFavorito ? "es-favorito" : ""}"
                data-activo-id="${p.activoId}"
                aria-label="${esFavorito ? "Quitar de favoritos" : "Marcar como favorito"}"
                title="${esFavorito ? "Quitar de favoritos" : "Marcar como favorito"}"
            >${icono("star", 16)}</button>
            <div class="posicion-info">
                <div class="posicion-nombre">
                    ${activo?.nombre || p.activoId}
                    <span class="posicion-simbolo">${activo?.simbolo || ""}</span>
                </div>
                <div class="posicion-detalle">
                    ${p.cantidad.toFixed(4)} · Precio: ${activo?.ultimoPrecio?.toFixed(2) || "0.00"} ${p.divisa.toUpperCase()}
                </div>
                <div class="posicion-detalle posicion-acciones-hint">
                    ${icono("refresh-cw", 12)} Toca para ver gráfico, actualizar precio o eliminar
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
                await mostrarGraficoActivo(activoId, posicion.activo, posicion)
            }
        })
    })

    container.querySelectorAll(".posicion-favorito").forEach(boton => {
        boton.addEventListener("click", async (evento) => {
            evento.stopPropagation()
            await alternarFavorito(boton.dataset.activoId)
        })
    })
}

// ============================================
// FAVORITO DE ACTIVO
// ============================================

async function alternarFavorito(activoId) {
    const posicion = (posicionesData?.posiciones || []).find(p => p.activoId === activoId)
    const activo = posicion?.activo
    if (!activo) return

    const nuevoEstado = !(activo.favorito === true)

    try {
        await marcarFavoritoActivo(uid, activoId, nuevoEstado)
        activo.favorito = nuevoEstado
        const boton = document.querySelector(`.posicion-favorito[data-activo-id="${activoId}"]`)
        if (boton) {
            boton.classList.toggle("es-favorito", nuevoEstado)
            const etiqueta = nuevoEstado ? "Quitar de favoritos" : "Marcar como favorito"
            boton.setAttribute("aria-label", etiqueta)
            boton.setAttribute("title", etiqueta)
        }
        mostrarNotificacion("exito", nuevoEstado ? "Agregado a favoritos" : "Quitado de favoritos")
    } catch (error) {
        console.error("Error actualizando favorito:", error)
        mostrarNotificacion("error", "No se pudo actualizar el favorito")
    }
}

// ============================================
// VISTA: POSICIONES / ESTRATEGIAS
// ============================================

function configurarToggleVista() {
    const contenedor = document.getElementById("toggle-vista-inversiones")
    if (!contenedor) return

    contenedor.querySelectorAll(".toggle-option").forEach(opcion => {
        opcion.addEventListener("click", () => cambiarVista(opcion.dataset.vista))
    })

    actualizarBotonesVista()
}

function actualizarBotonesVista() {
    const contenedor = document.getElementById("toggle-vista-inversiones")
    contenedor?.querySelectorAll(".toggle-option").forEach(opcion => {
        opcion.classList.toggle("active", opcion.dataset.vista === vistaActual)
    })

    const acciones = document.getElementById("estrategias-acciones")
    if (acciones) acciones.hidden = vistaActual !== "estrategias"
}

function cambiarVista(vista) {
    vistaActual = vista === "estrategias" ? "estrategias" : "posiciones"
    actualizarBotonesVista()

    if (vistaActual === "estrategias") {
        renderizarEstrategias()
    } else {
        renderizarPosiciones()
    }
}

// ============================================
// RENDERIZAR ESTRATEGIAS
// ============================================

function renderizarEstrategias() {
    const container = document.getElementById("lista-posiciones")
    if (!container) return

    if (estrategiasData.length === 0) {
        container.innerHTML = `
            <p class="lista-vacia">
                No hay estrategias de compra programada.
                <br><br>
                <span class="lista-vacia-hint">
                    Usa <strong>"Nueva estrategia"</strong> para programar
                    compras automáticas (DCA) de tus activos.
                </span>
            </p>
        `
        return
    }

    container.innerHTML = estrategiasData.map(plantillaEstrategia).join("")
    enlazarAccionesEstrategias(container)
}

function plantillaEstrategia(estrategia) {
    return `
        <div class="estrategia-item ${estrategia.activa ? "" : "pausada"}" data-id="${estrategia.id}">
            <div class="estrategia-info">
                <div class="estrategia-nombre">
                    ${estrategia.nombre}
                    <span class="estrategia-simbolo">${estrategia.activoSimbolo}</span>
                </div>
                <div class="estrategia-detalle">
                    ${estrategia.montoFormateado} ${estrategia.divisa.toUpperCase()} · ${estrategia.frecuenciaTexto}
                </div>
                <div class="estrategia-detalle">
                    Próxima ejecución: ${formatearFechaEstrategia(estrategia.proximaEjecucion)} · ${estrategia.estadoTexto}
                </div>
            </div>
            <div class="estrategia-acciones">
                <button type="button" class="glass btn-sm estrategia-ejecutar" data-id="${estrategia.id}">Ejecutar ahora</button>
                <button type="button" class="glass btn-sm estrategia-editar" data-id="${estrategia.id}">Editar</button>
                <button type="button" class="glass btn-sm estrategia-pausar" data-id="${estrategia.id}">${estrategia.activa ? "Pausar" : "Reanudar"}</button>
                <button type="button" class="glass btn-sm btn-danger estrategia-eliminar" data-id="${estrategia.id}">Eliminar</button>
            </div>
        </div>
    `
}

function enlazarAccionesEstrategias(container) {
    container.querySelectorAll(".estrategia-ejecutar").forEach(btn => {
        btn.addEventListener("click", async () => {
            const estrategia = estrategiasData.find(e => e.id === btn.dataset.id)
            if (estrategia) await ejecutarEstrategiaDesdeUI(estrategia)
        })
    })

    container.querySelectorAll(".estrategia-editar").forEach(btn => {
        btn.addEventListener("click", () => {
            const estrategia = estrategiasData.find(e => e.id === btn.dataset.id)
            if (estrategia) abrirModalEstrategia(estrategia)
        })
    })

    container.querySelectorAll(".estrategia-pausar").forEach(btn => {
        btn.addEventListener("click", async () => {
            const estrategia = estrategiasData.find(e => e.id === btn.dataset.id)
            if (estrategia) await cambiarEstadoEstrategiaUI(estrategia)
        })
    })

    container.querySelectorAll(".estrategia-eliminar").forEach(btn => {
        btn.addEventListener("click", () => {
            const estrategia = estrategiasData.find(e => e.id === btn.dataset.id)
            if (estrategia) confirmarEliminarEstrategia(estrategia)
        })
    })
}

// ============================================
// ACCIONES DE ESTRATEGIAS
// ============================================

async function ejecutarEstrategiaDesdeUI(estrategia) {
    try {
        const resultado = await ejecutarEstrategia(uid, estrategia)
        await Promise.all([cargarPosiciones(), cargarEstrategias()])
        mostrarNotificacion(
            "exito",
            `Compra ejecutada: ${resultado.cantidad.toFixed(4)} ${estrategia.activoSimbolo}`
        )
    } catch (error) {
        console.error("Error ejecutando estrategia:", error)
        mostrarNotificacion("error", `Error: ${error.message}`)
    }
}

async function cambiarEstadoEstrategiaUI(estrategia) {
    try {
        await actualizarEstrategia(uid, estrategia.id, { activa: !estrategia.activa })
        await cargarEstrategias()
        mostrarNotificacion("exito", estrategia.activa ? "Estrategia pausada" : "Estrategia reanudada")
    } catch (error) {
        console.error("Error cambiando estado de estrategia:", error)
        mostrarNotificacion("error", `Error: ${error.message}`)
    }
}

function confirmarEliminarEstrategia(estrategia) {
    abrirModal({
        titulo: "Eliminar estrategia",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    ¿Eliminar la estrategia <strong>${estrategia.nombre}</strong>
                    (${estrategia.activoSimbolo})?
                </p>
                <p class="modal-message-warning">
                    Las compras ya ejecutadas se conservan en tu historial.
                </p>
            </div>
        `,
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            try {
                await eliminarEstrategia(uid, estrategia.id)
                await cargarEstrategias()
                mostrarNotificacion("exito", "Estrategia eliminada")
                return true
            } catch (error) {
                console.error("Error eliminando estrategia:", error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })
}

// ============================================
// MODAL ESTRATEGIA (CREAR / EDITAR)
// ============================================

function abrirModalEstrategia(estrategia = null) {
    const esEdicion = !!estrategia
    const frecuencia = estrategia?.frecuencia || "mensual"
    const divisa = estrategia?.divisa || "pen"

    const html = `
        <form id="form-estrategia" class="form-movimiento estrategia-form">
            <div class="form-group">
                <label for="estrategia-nombre">Nombre de la estrategia *</label>
                <input type="text" id="estrategia-nombre" class="form-input"
                    placeholder="Ej: DCA mensual VOO" value="${estrategia?.nombre || ""}" required>
            </div>
            <div class="form-group">
                <label for="estrategia-simbolo">Símbolo del activo *</label>
                <input type="text" id="estrategia-simbolo" class="form-input"
                    placeholder="Ej: VOO, BTC, AAPL" value="${estrategia?.activoSimbolo || ""}" required>
                <span class="form-hint">Debe existir un activo registrado con ese símbolo.</span>
            </div>
            <div class="form-group">
                <label for="estrategia-cuenta">Cuenta de origen *</label>
                <select id="estrategia-cuenta" class="form-input" required>
                    <option value="">Seleccionar cuenta</option>
                </select>
            </div>
            <div class="form-group">
                <label for="estrategia-monto">Monto fijo por compra *</label>
                <input type="number" id="estrategia-monto" class="form-input" step="0.01" min="0.01"
                    placeholder="0.00" value="${estrategia?.montoFijo ?? ""}" required>
            </div>
            <div class="form-group">
                <label for="estrategia-divisa">Divisa *</label>
                <select id="estrategia-divisa" class="form-input" required>
                    <option value="pen" ${divisa === "pen" ? "selected" : ""}>PEN</option>
                    <option value="usd" ${divisa === "usd" ? "selected" : ""}>USD</option>
                    <option value="usdt" ${divisa === "usdt" ? "selected" : ""}>USDT</option>
                </select>
            </div>
            <div class="form-group">
                <label for="estrategia-frecuencia">Frecuencia *</label>
                <select id="estrategia-frecuencia" class="form-input">
                    <option value="diaria" ${frecuencia === "diaria" ? "selected" : ""}>Diaria</option>
                    <option value="semanal" ${frecuencia === "semanal" ? "selected" : ""}>Semanal</option>
                    <option value="mensual" ${frecuencia === "mensual" ? "selected" : ""}>Mensual</option>
                </select>
            </div>
            <div class="form-group" id="estrategia-dia-semana-group" hidden>
                <label for="estrategia-dia-semana">Día de la semana</label>
                <select id="estrategia-dia-semana" class="form-input">
                    ${DIAS_SEMANA.map((dia, indice) => `
                        <option value="${indice}">${dia}</option>
                    `).join("")}
                </select>
            </div>
            <div class="form-group" id="estrategia-dia-mes-group" hidden>
                <label for="estrategia-dia-mes">Día del mes</label>
                <input type="number" id="estrategia-dia-mes" class="form-input" min="1" max="31" value="1">
            </div>
            <div class="form-group">
                <label>Próxima ejecución</label>
                <div class="form-static" id="estrategia-proxima-preview">—</div>
            </div>
        </form>
    `

    abrirModal({
        titulo: esEdicion ? "Editar estrategia" : "Nueva estrategia",
        contenido: html,
        confirmText: esEdicion ? "Guardar" : "Crear",
        cancelText: "Cancelar",
        onConfirm: async () => {
            const nombre = document.getElementById("estrategia-nombre")?.value.trim()
            const activoSimbolo = document.getElementById("estrategia-simbolo")?.value.trim().toUpperCase()
            const cuentaId = document.getElementById("estrategia-cuenta")?.value
            const montoFijo = parseFloat(document.getElementById("estrategia-monto")?.value)
            const divisaValor = document.getElementById("estrategia-divisa")?.value || "pen"
            const frecuenciaValor = document.getElementById("estrategia-frecuencia")?.value || "mensual"
            const diaPreferido = obtenerDiaPreferidoEstrategia()

            if (!nombre) { mostrarNotificacion("error", "El nombre de la estrategia es obligatorio"); return false }
            if (!activoSimbolo) { mostrarNotificacion("error", "El símbolo del activo es obligatorio"); return false }
            if (!cuentaId) { mostrarNotificacion("error", "Selecciona una cuenta de origen"); return false }
            if (!montoFijo || montoFijo <= 0) { mostrarNotificacion("error", "El monto debe ser mayor a 0"); return false }
            if (frecuenciaValor === "mensual" && (!diaPreferido || diaPreferido < 1 || diaPreferido > 31)) {
                mostrarNotificacion("error", "El día del mes debe estar entre 1 y 31")
                return false
            }

            try {
                const activo = await buscarActivoPorSimbolo(uid, activoSimbolo)
                if (!activo) {
                    mostrarNotificacion(
                        "error",
                        `No existe un activo con el símbolo ${activoSimbolo}. Regístralo primero con una compra.`
                    )
                    return false
                }

                const datos = {
                    nombre,
                    activoSimbolo,
                    cuentaId,
                    montoFijo,
                    divisa: divisaValor,
                    frecuencia: frecuenciaValor,
                    diaPreferido,
                    proximaEjecucion: calcularProximaEjecucion(frecuenciaValor, diaPreferido, new Date()),
                    activa: esEdicion ? estrategia.activa : true
                }

                if (esEdicion) {
                    await actualizarEstrategia(uid, estrategia.id, datos)
                } else {
                    await crearEstrategia(uid, datos)
                }

                await cargarEstrategias()
                mostrarNotificacion("exito", esEdicion ? "Estrategia actualizada" : "Estrategia creada")
                return true
            } catch (error) {
                console.error("Error guardando estrategia:", error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })

    setTimeout(async () => {
        await cargarCuentasEnSelect("estrategia-cuenta")

        const cuentaSelect = document.getElementById("estrategia-cuenta")
        if (cuentaSelect && estrategia?.cuentaId) {
            cuentaSelect.value = estrategia.cuentaId
        }

        const divisaSelect = document.getElementById("estrategia-divisa")
        if (divisaSelect) divisaSelect.value = divisa

        const frecuenciaSelect = document.getElementById("estrategia-frecuencia")
        if (frecuenciaSelect) {
            frecuenciaSelect.value = frecuencia
            frecuenciaSelect.addEventListener("change", actualizarCamposEstrategia)
        }

        const diaSemana = document.getElementById("estrategia-dia-semana")
        if (diaSemana) {
            diaSemana.value = String(
                esEdicion && frecuencia === "semanal" && estrategia.diaPreferido !== null
                    ? estrategia.diaPreferido
                    : 1
            )
            diaSemana.addEventListener("change", actualizarPreviewProxima)
        }

        const diaMes = document.getElementById("estrategia-dia-mes")
        if (diaMes) {
            diaMes.value = String(
                esEdicion && frecuencia === "mensual" && estrategia.diaPreferido
                    ? estrategia.diaPreferido
                    : 1
            )
            diaMes.addEventListener("input", actualizarPreviewProxima)
        }

        cuentaSelect?.addEventListener("change", () => {
            const moneda = cuentaSelect.selectedOptions?.[0]?.dataset?.moneda
            if (moneda && divisaSelect && !esEdicion) divisaSelect.value = moneda
        })

        actualizarCamposEstrategia()
    }, 200)
}

function obtenerDiaPreferidoEstrategia() {
    const frecuencia = document.getElementById("estrategia-frecuencia")?.value

    if (frecuencia === "semanal") {
        const valor = parseInt(document.getElementById("estrategia-dia-semana")?.value ?? "0", 10)
        return Number.isNaN(valor) ? null : valor
    }
    if (frecuencia === "mensual") {
        const valor = parseInt(document.getElementById("estrategia-dia-mes")?.value ?? "1", 10)
        return Number.isNaN(valor) ? null : valor
    }
    return null
}

function actualizarCamposEstrategia() {
    const frecuencia = document.getElementById("estrategia-frecuencia")?.value

    const grupoSemana = document.getElementById("estrategia-dia-semana-group")
    const grupoMes = document.getElementById("estrategia-dia-mes-group")

    if (grupoSemana) grupoSemana.hidden = frecuencia !== "semanal"
    if (grupoMes) grupoMes.hidden = frecuencia !== "mensual"

    actualizarPreviewProxima()
}

function actualizarPreviewProxima() {
    const preview = document.getElementById("estrategia-proxima-preview")
    if (!preview) return

    const frecuencia = document.getElementById("estrategia-frecuencia")?.value
    const diaPreferido = obtenerDiaPreferidoEstrategia()
    const proxima = calcularProximaEjecucion(frecuencia, diaPreferido, new Date())

    preview.textContent = formatearFechaEstrategia(proxima)
}

function formatearFechaEstrategia(fecha) {
    if (!fecha) return "Sin programar"

    const valor = fecha instanceof Date ? fecha : new Date(fecha)
    if (Number.isNaN(valor.getTime())) return "Sin programar"

    return valor.toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    })
}

// ============================================
// MOSTRAR GRÁFICO DE ACTIVO
// ============================================

async function mostrarGraficoActivo(activoId, activo, posicion) {
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
        <div class="grafico-acciones">
            <button type="button" class="glass-btn btn-actualizar-precio">${icono("refresh-cw", 14)} Actualizar precio</button>
            <button type="button" class="glass-btn danger btn-eliminar-posicion">${icono("trash-2", 14)} Eliminar posición</button>
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

        document.querySelector(".btn-actualizar-precio")?.addEventListener("click", () => {
            abrirModalActualizarPrecio(activo, posicion)
        })

        document.querySelector(".btn-eliminar-posicion")?.addEventListener("click", () => {
            confirmarEliminarPosicion(posicion)
        })
    }, 150)
}

// ============================================
// ACTUALIZAR PRECIO MANUAL
// ============================================

function abrirModalActualizarPrecio(activo, posicion) {
    const nombre = activo?.nombre || "activo"
    const precioActual = activo?.ultimoPrecio || posicion?.precioPromedio || ""

    const html = `
        <form class="form-movimiento">
            <div class="form-group">
                <label for="precio-manual">Nuevo precio (${nombre})</label>
                <input type="number" id="precio-manual" class="form-input" step="0.01" min="0.01" value="${precioActual}" placeholder="0.00" required>
                <span class="form-hint">Actualiza el último precio conocido del activo.</span>
            </div>
        </form>
    `

    abrirModal({
        titulo: "Actualizar precio",
        contenido: html,
        confirmText: "Guardar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            const precio = parseFloat(document.getElementById("precio-manual")?.value)

            if (!precio || precio <= 0) {
                mostrarNotificacion("error", "El precio debe ser mayor a 0")
                return false
            }

            try {
                await actualizarPrecioActivo(uid, activo.id, precio)
                await registrarPrecio(uid, activo.id, precio)
                await cargarPosiciones()
                mostrarNotificacion("exito", "Precio actualizado correctamente")
                return true
            } catch (error) {
                console.error("Error actualizando precio:", error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })
}

// ============================================
// ELIMINAR POSICIÓN
// ============================================

function confirmarEliminarPosicion(posicion) {
    if (!posicion?.id) {
        mostrarNotificacion("error", "Posición no encontrada")
        return
    }

    abrirModal({
        titulo: "Eliminar posición",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    ¿Eliminar la posición de <strong>${posicion.activo?.nombre || posicion.activoId}</strong>
                    (${posicion.cantidad.toFixed(4)})?
                </p>
                <p class="modal-message-warning">
                    Solo se elimina la posición. Los movimientos de compra/venta
                    se conservan en tu historial.
                </p>
            </div>
        `,
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            try {
                await eliminarPosicion(uid, posicion.id)
                await cargarPosiciones()
                mostrarNotificacion("exito", "Posición eliminada")
                return true
            } catch (error) {
                console.error("Error eliminando posición:", error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        }
    })
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

            if (vistaActual === "estrategias") {
                cambiarVista("posiciones")
            }

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

    document.getElementById("btn-nueva-estrategia")?.addEventListener("click", () => {
        abrirModalEstrategia()
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
    const hoy = getFechaHoy()

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
                <label for="compra-cuenta">Cuenta de origen *</label>
                <select id="compra-cuenta" class="form-input" required>
                    <option value="">Seleccionar cuenta</option>
                </select>
            </div>
            <div class="form-group">
                <label for="compra-fecha">Fecha</label>
                <div class="campo-fecha">
                    <input type="date" id="compra-fecha" class="form-input" value="${hoy}">
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
            const cuentaEl = document.getElementById("compra-cuenta")
            const cuentaId = cuentaEl?.value
            const divisa = cuentaEl?.selectedOptions?.[0]?.dataset?.moneda || "usd"
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
                    fechaRealizacion: fecha ? parseFechaLocal(fecha) : new Date()
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

    const hoy = getFechaHoy()

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
                <div class="campo-fecha">
                    <input type="date" id="venta-fecha" class="form-input" value="${hoy}">
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
                    fechaRealizacion: fecha ? parseFechaLocal(fecha) : new Date()
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
                <option value="${c.id}" data-moneda="${(c.moneda || "pen").toLowerCase()}">${c.nombre} (${c.moneda?.toUpperCase() || "PEN"})</option>
            `).join("")}
        `
    } catch (error) {
        console.error("Error cargando cuentas:", error)
    }
}