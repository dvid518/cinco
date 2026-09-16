import { sesion } from "../core/sesion.js"
import { obtenerTradesConFiltros, registrarTrade, finalizarTrade, borrarTrade } from "../services/TradingServicio.js"
import { abrirModal, cerrarModal } from "../ui/modal.js"
import { DIVISAS_SYMBOLS } from "../../constants/divisas.js"

let uid = null
let datosTrades = null
let filtroActual = 'todos'

export function render() {
    return `
        <section id="sidebar">
            <button class="glass act" data-filtro="todos">📊 Todos</button>
            <button class="glass" data-filtro="long">📈 Long</button>
            <button class="glass" data-filtro="short">📉 Short</button>
            <button class="glass" data-filtro="cerrado">✅ Cerrados</button>
        </section>
        <section id="panel" class="glass">
            <div class="panel-header">
                <h2>Trading</h2>
            </div>

            <div class="portfolio-resumen">
                <div class="resumen-card">
                    <div class="resumen-label">P&L Total</div>
                    <div class="resumen-valor" id="pnl-total">0.00</div>
                </div>
                <div class="resumen-card">
                    <div class="resumen-label">Abiertos</div>
                    <div class="resumen-valor" id="total-abiertos">0</div>
                </div>
                <div class="resumen-card">
                    <div class="resumen-label">Cerrados</div>
                    <div class="resumen-valor" id="total-cerrados">0</div>
                </div>
            </div>

            <div id="lista-trades" class="lista-posiciones">
                <p class="lista-vacia">Cargando trades...</p>
            </div>
        </section>
    `
}

export async function init() {
    uid = sesion.uid
    console.log("[INFO] Trading iniciado para UID:", uid)

    await cargarTrades()
    configurarEventos()
}
export async function cargarTrades() {
    try {
        const filtros = {}
        if (filtroActual === 'long' || filtroActual === 'short') {
            filtros.tipo = filtroActual
        } else if (filtroActual === 'cerrado') {
            filtros.estado = 'cerrado'
        }

        datosTrades = await obtenerTradesConFiltros(uid, filtros)
        renderizarTrades()
        actualizarResumen()
    } catch (error) {
        console.error("Error cargando trades:", error)
        const container = document.getElementById('lista-trades')
        if (container) {
            container.innerHTML = `<p class="lista-vacia error">Error al cargar trades</p>`
        }
    }
}

function renderizarTrades() {
    const container = document.getElementById('lista-trades')
    if (!container) return

    if (!datosTrades || datosTrades.trades.length === 0) {
        container.innerHTML = `
            <p class="lista-vacia">
                No hay trades registrados.
                <br><br>
                <span class="lista-vacia-hint">Usa los botones <strong>"Largo"</strong> o <strong>"Corto"</strong> en la barra inferior para registrar tu primer trade.</span>
            </p>
        `
        return
    }

    container.innerHTML = datosTrades.trades.map(t => {
        const pnl = t.pnl
        const pnlPct = t.pnlPorcentaje
        const esGanancia = pnl >= 0
        const simbolo = DIVISAS_SYMBOLS[t.divisa] || '$'

        return `
            <div class="posicion-item trade-item" data-trade-id="${t.id}">
                <div class="posicion-info">
                    <div class="posicion-nombre">
                        ${t.tipoIcono} ${t.activo}
                        <span class="posicion-simbolo">${t.tipoLabel}</span>
                    </div>
                    <div class="posicion-detalle">
                        Entrada: ${simbolo} ${t.entrada.toFixed(2)} · Lotaje: ${t.lotaje}
                        ${t.sl ? ` · SL: ${t.sl.toFixed(2)}` : ''}
                        ${t.tp ? ` · TP: ${t.tp.toFixed(2)}` : ''}
                    </div>
                    ${t.estaCerrado ? `
                        <div class="posicion-detalle">
                            Salida: ${simbolo} ${t.salida.toFixed(2)}
                        </div>
                    ` : ''}
                </div>
                <div class="posicion-valores">
                    ${t.estaCerrado ? `
                        <div class="posicion-valor ${esGanancia ? 'positive' : 'negative'}">
                            ${esGanancia ? '+' : ''}${pnl.toFixed(2)}
                        </div>
                        <div class="posicion-rendimiento ${esGanancia ? 'positive' : 'negative'}">
                            ${esGanancia ? '+' : ''}${pnlPct.toFixed(2)}%
                        </div>
                    ` : `
                        <div class="posicion-valor">Abierto</div>
                    `}
                    <div class="trade-acciones">
                        ${t.estaAbierto ? `
                            <button class="glass-btn trade-cerrar" data-id="${t.id}">Cerrar</button>
                        ` : ''}
                        <button class="glass-btn danger trade-eliminar" data-id="${t.id}">✕</button>
                    </div>
                </div>
            </div>
        `
    }).join('')

    // Eventos
    container.querySelectorAll('.trade-cerrar').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            abrirModalCerrarTrade(btn.dataset.id)
        })
    })

    container.querySelectorAll('.trade-eliminar').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            confirmarEliminarTrade(btn.dataset.id)
        })
    })
}

function actualizarResumen() {
    const pnlTotal = document.getElementById('pnl-total')
    const totalAbiertos = document.getElementById('total-abiertos')
    const totalCerrados = document.getElementById('total-cerrados')

    if (pnlTotal && datosTrades) {
        const pnl = datosTrades.metricas.pnlTotal
        pnlTotal.textContent = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`
        pnlTotal.className = `resumen-valor ${pnl >= 0 ? 'positive' : 'negative'}`
    }

    if (totalAbiertos && datosTrades) {
        totalAbiertos.textContent = datosTrades.metricas.abiertos
    }

    if (totalCerrados && datosTrades) {
        totalCerrados.textContent = datosTrades.metricas.cerrados
    }
}

// ============================================
// EVENTOS DEL SIDEBAR
// ============================================

function configurarEventos() {
    document.querySelectorAll('#sidebar button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#sidebar button').forEach(b => b.classList.remove('act'))
            btn.classList.add('act')

            filtroActual = btn.dataset.filtro
            cargarTrades()
        })
    })
}

// ============================================
// LASTRAR (handlers centralizados en app.js)
// ============================================

export function abrirModalBroker() {
    abrirModal({
        titulo: '🏦 Broker',
        contenido: `<div class="modal-message"><p class="modal-message-desc">Configuración de brokers (en desarrollo)</p></div>`,
        confirmText: 'Cerrar'
    })
}

// ============================================
// ACCIONES EXPORTADAS PARA LASTBAR
// ============================================

export function abrirModalNuevoTrade(tipo) {
    const esLong = tipo === 'long'
    const titulo = esLong ? '📈 Nuevo trade largo' : '📉 Nuevo trade corto'

    const html = `
        <form class="form-movimiento">
            <div class="form-group">
                <label>Dirección</label>
                <span class="form-static">${esLong ? 'Largo (Long)' : 'Corto (Short)'}</span>
            </div>
            <div class="form-group">
                <label for="trade-activo">Activo *</label>
                <input type="text" id="trade-activo" class="form-input" placeholder="Ej: BTC, ETH, AAPL" required>
            </div>
            <div class="form-group">
                <label for="trade-cuenta">Cuenta *</label>
                <select id="trade-cuenta" class="form-input" required>
                    <option value="">Seleccionar cuenta</option>
                </select>
            </div>
            <div class="form-group">
                <label for="trade-entrada">Entrada *</label>
                <input type="number" id="trade-entrada" class="form-input" step="0.01" min="0.01" placeholder="0.00" required>
            </div>
            <div class="form-group">
                <label for="trade-lotaje">Lotaje *</label>
                <input type="number" id="trade-lotaje" class="form-input" step="0.0001" min="0.0001" placeholder="0" required>
            </div>
            <div class="form-group">
                <label for="trade-sl">Stop Loss (opcional)</label>
                <input type="number" id="trade-sl" class="form-input" step="0.01" min="0" placeholder="0.00">
            </div>
            <div class="form-group">
                <label for="trade-tp">Take Profit (opcional)</label>
                <input type="number" id="trade-tp" class="form-input" step="0.01" min="0" placeholder="0.00">
            </div>
            <div class="form-group">
                <label for="trade-divisa">Divisa</label>
                <select id="trade-divisa" class="form-input">
                    <option value="usd" selected>USD</option>
                    <option value="pen">PEN</option>
                    <option value="usdt">USDT</option>
                </select>
            </div>
        </form>
    `

    abrirModal({
        titulo,
        contenido: html,
        confirmText: 'Registrar trade',
        onConfirm: async () => {
            const activo = document.getElementById('trade-activo')?.value.trim().toUpperCase()
            const cuenta = document.getElementById('trade-cuenta')?.value
            const entrada = parseFloat(document.getElementById('trade-entrada')?.value)
            const lotaje = parseFloat(document.getElementById('trade-lotaje')?.value)
            const sl = parseFloat(document.getElementById('trade-sl')?.value) || null
            const tp = parseFloat(document.getElementById('trade-tp')?.value) || null
            const divisa = document.getElementById('trade-divisa')?.value

            if (!activo) { alert('El activo es obligatorio'); return false }
            if (!cuenta) { alert('Selecciona una cuenta'); return false }
            if (!entrada || entrada <= 0) { alert('La entrada debe ser mayor a 0'); return false }
            if (!lotaje || lotaje <= 0) { alert('El lotaje debe ser mayor a 0'); return false }

            try {
                await registrarTrade(uid, {
                    activo,
                    cuenta,
                    entrada,
                    lotaje,
                    sl,
                    tp,
                    divisa,
                    tipo,
                    estado: 'abierto'
                })

                await cargarTrades()
                alert('✅ Trade registrado correctamente')
                return true
            } catch (error) {
                console.error('Error creando trade:', error)
                alert(`❌ Error: ${error.message}`)
                return false
            }
        }
    })

    setTimeout(() => cargarCuentasEnSelect('trade-cuenta'), 200)
}

// ============================================
// MODAL CERRAR TRADE
// ============================================

function abrirModalCerrarTrade(tradeId) {
    const trade = datosTrades?.trades.find(t => t.id === tradeId)
    if (!trade) return

    const html = `
        <form class="form-movimiento">
            <div class="form-group">
                <label>Activo</label>
                <span class="form-static">${trade.tipoIcono} ${trade.activo} (${trade.tipoLabel})</span>
            </div>
            <div class="form-group">
                <label>Entrada</label>
                <span class="form-static">${trade.entrada.toFixed(2)}</span>
            </div>
            <div class="form-group">
                <label>Lotaje</label>
                <span class="form-static">${trade.lotaje}</span>
            </div>
            <div class="form-group">
                <label for="cerrar-salida">Precio de salida *</label>
                <input type="number" id="cerrar-salida" class="form-input" step="0.01" min="0.01" placeholder="0.00" required>
            </div>
        </form>
    `

    abrirModal({
        titulo: `Cerrar ${trade.activo}`,
        contenido: html,
        confirmText: 'Cerrar trade',
        onConfirm: async () => {
            const salida = parseFloat(document.getElementById('cerrar-salida')?.value)

            if (!salida || salida <= 0) {
                alert('La salida debe ser mayor a 0')
                return false
            }

            try {
                await finalizarTrade(uid, tradeId, salida)
                await cargarTrades()
                alert('✅ Trade cerrado correctamente')
                return true
            } catch (error) {
                console.error('Error cerrando trade:', error)
                alert(`❌ Error: ${error.message}`)
                return false
            }
        }
    })
}

// ============================================
// ELIMINAR TRADE
// ============================================

function confirmarEliminarTrade(tradeId) {
    abrirModal({
        titulo: '🗑️ Eliminar trade',
        contenido: `
            <div class="modal-message">
                <div class="modal-message-icon">🗑️</div>
                <p class="modal-message-desc">¿Estás seguro de que quieres eliminar este trade?</p>
            </div>
        `,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            try {
                await borrarTrade(uid, tradeId)
                await cargarTrades()
                return true
            } catch (error) {
                console.error('Error eliminando trade:', error)
                alert(`❌ Error: ${error.message}`)
                return false
            }
        }
    })
}

// ============================================
// UTILIDAD: Cargar cuentas en select
// ============================================

async function cargarCuentasEnSelect(selectId) {
    try {
        const { obtenerCuentas } = await import('../../firebase/firestore.js')
        const cuentas = await obtenerCuentas(uid)
        const select = document.getElementById(selectId)
        if (!select) return

        const activas = cuentas.filter(c => c.estado !== 'archivada' && c.tipo !== 'credito')
        select.innerHTML = `
            <option value="">Seleccionar cuenta</option>
            ${activas.map(c => `
                <option value="${c.id}">${c.nombre} (${c.moneda?.toUpperCase() || 'PEN'})</option>
            `).join('')}
        `
    } catch (error) {
        console.error('Error cargando cuentas:', error)
    }
}