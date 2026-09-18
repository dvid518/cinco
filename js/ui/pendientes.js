import { abrirModal, cerrarModal } from "./modal.js"
import { obtenerPendientes, eliminarPendiente, crearPendiente } from "../repositories/PendienteRepositorio.js"
import { sesion } from "../core/sesion.js"
import { obtenerTiposCompatibles, consolidarPendienteAMovimiento } from "../services/PendienteServicio.js"
import { generarFormularioMovimiento, recogerDatosFormulario } from "./formularioMovimiento.js"
import { DIVISAS } from "../../constants/divisas.js"
import { mostrarNotificacion } from "./notificaciones.js"

// ============================================
// MOSTRAR LISTA DE PENDIENTES
// ============================================

export async function mostrarPendientes() {
    const uid = sesion.uid
    if (!uid) {
        console.error("[ERROR] No hay UID disponible")
        return
    }

    try {
        const pendientes = await obtenerPendientes(uid, true)

        const html = `
            <div class="pendientes-cabecera">
                <span class="pendientes-contador">
                    ${pendientes.length} pendiente${pendientes.length !== 1 ? 's' : ''}
                </span>
                <button class="glass pendiente-crear-btn" id="btn-crear-pendiente">
                    + Nuevo pendiente
                </button>
            </div>
            <div class="pendientes-lista">
                ${pendientes.length === 0 ? `
                    <p class="pendiente-vacio">
                        No hay pendientes registrados.
                    </p>
                ` : pendientes.map(p => `
                    <div class="pendiente-item ${p.tipoClase || (p.tipo ? 'cobrar' : 'pagar')}" data-id="${p.id}">
                        <div class="pendiente-info">
                            <div class="pendiente-concepto">${p.concepto}</div>
                            <div class="pendiente-detalle">
                                ${p.tipoTexto} · ${p.monto.toFixed(2)} ${p.divisa.toUpperCase()}
                                ${p.fechaVencimiento ? ` · Vence: ${new Date(p.fechaVencimiento).toLocaleDateString()}` : ''}
                                ${p.estaVencido ? '<span class="pendiente-vencido"> VENCIDO</span>' : ''}
                            </div>
                        </div>
                        <div class="pendiente-acciones">
                            <button class="pendiente-consolidar glass btn-sm" data-id="${p.id}">Consolidar</button>
                            <button class="pendiente-eliminar glass btn-sm btn-danger" data-id="${p.id}" aria-label="Eliminar">Eliminar</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `

        abrirModal({
            titulo: 'Pendientes',
            contenido: html,
            confirmText: 'Cerrar',
            onConfirm: () => {
                cerrarModal()
            }
        })

        document.getElementById('btn-crear-pendiente')?.addEventListener('click', () => {
            cerrarModal()
            abrirFormularioCrearPendiente()
        })

        document.querySelectorAll('.pendiente-consolidar').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id
                const pendiente = pendientes.find(p => p.id === id)
                if (pendiente) {
                    cerrarModal()
                    abrirConsolidacionPendiente(pendiente)
                }
            })
        })

        document.querySelectorAll('.pendiente-eliminar').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id
                const pendiente = pendientes.find(p => p.id === id)
                if (!pendiente) return

                abrirModal({
                    titulo: "Eliminar pendiente",
                    contenido: `
                        <div class="modal-message">
                            <p class="modal-message-desc">
                                ¿Eliminar el pendiente "${pendiente.concepto}"?
                            </p>
                        </div>
                    `,
                    variante: "confirm",
                    confirmText: "Eliminar",
                    cancelText: "Cancelar",
                    onConfirm: async () => {
                        try {
                            await eliminarPendiente(uid, id)
                            cerrarModal()
                            mostrarNotificacion("exito", "Pendiente eliminado")
                            mostrarPendientes()
                            return true
                        } catch (error) {
                            console.error("[ERROR] Error eliminando pendiente:", error)
                            mostrarNotificacion("error", `No se pudo eliminar: ${error.message}`)
                            return false
                        }
                    }
                })
            })
        })

    } catch (error) {
        console.error('[ERROR] Error mostrando pendientes:', error)
        mostrarNotificacion("error", "Error al cargar pendientes")
    }
}

// ============================================
// CREAR PENDIENTE - FORMULARIO
// ============================================

function opcionDivisa(codigo) {
    const DIVISAS_LABELS_OPTIONS = {
        [DIVISAS.PEN]: 'PEN',
        [DIVISAS.USD]: 'USD',
        [DIVISAS.USDT]: 'USDT'
    }
    const superior = codigo.toUpperCase()
    return `<option value="${codigo}" ${codigo === DIVISAS.USD ? 'selected' : ''}>${DIVISAS_LABELS_OPTIONS[codigo] || superior}</option>`
}

function abrirFormularioCrearPendiente() {
    const html = `
        <form id="form-crear-pendiente" class="form-movimiento">
            <div class="form-group">
                <label for="pendiente-concepto">Concepto *</label>
                <input type="text" id="pendiente-concepto" class="form-input" placeholder="Ej: Venta de celular" required>
            </div>
            <div class="form-group">
                <label for="pendiente-tipo">Tipo *</label>
                <select id="pendiente-tipo" class="form-input" required>
                    <option value="true">Cobrar (deuda a favor)</option>
                    <option value="false">Pagar (deuda en contra)</option>
                </select>
            </div>
            <div class="form-group">
                <label for="pendiente-monto">Monto *</label>
                <input type="number" id="pendiente-monto" class="form-input" step="0.01" min="0.01" placeholder="0.00" required>
            </div>
            <div class="form-group">
                <label for="pendiente-divisa">Divisa *</label>
                <select id="pendiente-divisa" class="form-input" required>
                    ${opcionDivisa(DIVISAS.PEN)}
                    ${opcionDivisa(DIVISAS.USD)}
                    ${opcionDivisa(DIVISAS.USDT)}
                </select>
            </div>
            <div class="form-group">
                <label for="pendiente-vencimiento">Fecha de vencimiento (opcional)</label>
                <input type="date" id="pendiente-vencimiento" class="form-input">
            </div>
            <div class="pendiente-hint">
                * Campos obligatorios
            </div>
        </form>
    `

    abrirModal({
        titulo: 'Nuevo pendiente',
        contenido: html,
        confirmText: 'Crear pendiente',
        onConfirm: async () => {
            const concepto = document.getElementById('pendiente-concepto')?.value.trim()
            const tipo = document.getElementById('pendiente-tipo')?.value === 'true'
            const monto = parseFloat(document.getElementById('pendiente-monto')?.value)
            const divisa = document.getElementById('pendiente-divisa')?.value
            const fechaVencimiento = document.getElementById('pendiente-vencimiento')?.value

            if (!concepto) {
                mostrarNotificacion("error", "El concepto es obligatorio")
                return false
            }

            if (!monto || monto <= 0) {
                mostrarNotificacion("error", "El monto debe ser mayor a 0")
                return false
            }

            if (!divisa) {
                mostrarNotificacion("error", "La divisa es obligatoria")
                return false
            }

            try {
                await crearPendiente(uid, {
                    concepto,
                    tipo,
                    monto,
                    divisa,
                    fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
                    pendiente: true
                })
                mostrarNotificacion("exito", "Pendiente creado correctamente")
                return true
            } catch (error) {
                console.error('Error creando pendiente:', error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        },
        onCancel: () => {
            setTimeout(() => mostrarPendientes(), 100)
        }
    })
}

// ============================================
// CONSOLIDAR PENDIENTE
// ============================================

async function abrirConsolidacionPendiente(pendiente) {
    const tiposCompatibles = obtenerTiposCompatibles(pendiente.tipo)

    if (tiposCompatibles.length === 0) {
        mostrarNotificacion("error", "No hay tipos de movimiento compatibles para este pendiente")
        return
    }

    const tipo = tiposCompatibles[0]
    const html = await generarFormularioMovimiento(tipo)

    abrirModal({
        titulo: `Consolidar: ${pendiente.concepto}`,
        contenido: html,
        confirmText: 'Consolidar',
        onConfirm: async () => {
            const datos = recogerDatosFormulario(tipo)
            if (!datos) {
                return false
            }

            try {
                await consolidarPendienteAMovimiento(uid, pendiente.id, tipo, datos)
                mostrarNotificacion("exito", "Pendiente consolidado correctamente")
                return true
            } catch (error) {
                console.error('[ERROR] Error consolidando:', error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        },
        onCancel: () => {
            setTimeout(() => mostrarPendientes(), 100)
        }
    })
}