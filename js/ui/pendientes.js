import { abrirModal, cerrarModal } from "./modal.js"
import { obtenerPendientes, eliminarPendiente, crearPendiente, actualizarPendiente } from "../repositories/PendienteRepositorio.js"
import { sesion } from "../core/sesion.js"
import { obtenerTiposCompatibles, consolidarPendienteAMovimiento } from "../services/PendienteServicio.js"
import { generarFormularioMovimiento, recogerDatosFormulario, vincularSimboloDivisa } from "./formularioMovimiento.js"
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
                            <button class="pendiente-editar glass btn-sm" data-id="${p.id}">Editar</button>
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
                    abrirConsolidacionPendiente(pendiente, uid)
                }
            })
        })

        document.querySelectorAll('.pendiente-editar').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id
                const pendiente = pendientes.find(p => p.id === id)
                if (pendiente) {
                    cerrarModal()
                    abrirFormularioEditarPendiente(pendiente, uid)
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

function htmlFormularioPendiente(p) {
    const valor = (campo, porDefecto = "") => {
        const dato = p?.[campo]
        return (dato === null || dato === undefined) ? porDefecto : dato
    }
    const vencimiento = p?.fechaVencimiento
        ? (vencimiento instanceof Date
            ? vencimiento.toISOString().split("T")[0]
            : String(vencimiento).slice(0, 10))
        : ""

    return `
        <form id="form-crear-pendiente" class="form-movimiento">
            <div class="form-group">
                <label for="pendiente-concepto">Concepto *</label>
                <input type="text" id="pendiente-concepto" class="form-input" placeholder="Ej: Venta de celular" value="${valor('concepto')}" required>
            </div>
            <div class="form-group">
                <label for="pendiente-tipo">Tipo *</label>
                <select id="pendiente-tipo" class="form-input" required>
                    <option value="true" ${p?.tipo === true ? 'selected' : ''}>Cobrar (deuda a favor)</option>
                    <option value="false" ${p?.tipo === false ? 'selected' : ''}>Pagar (deuda en contra)</option>
                </select>
            </div>
            <div class="form-group">
                <label for="pendiente-monto">Monto *</label>
                <input type="number" id="pendiente-monto" class="form-input" step="0.01" min="0.01" placeholder="0.00" value="${valor('monto')}" required>
            </div>
            <div class="form-group">
                <label for="pendiente-divisa">Divisa *</label>
                <select id="pendiente-divisa" class="form-input" required>
                    ${[DIVISAS.PEN, DIVISAS.USD, DIVISAS.USDT].map(c =>
                        `<option value="${c}" ${p?.divisa === c ? 'selected' : ''}>${c.toUpperCase()}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="pendiente-vencimiento">Fecha de vencimiento (opcional)</label>
                <div class="campo-fecha">
                    <input type="date" id="pendiente-vencimiento" class="form-input" value="${vencimiento}">
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
            <div class="pendiente-hint">
                * Campos obligatorios
            </div>
        </form>
    `
}

function abrirFormularioCrearPendiente() {
    abrirModal({
        titulo: 'Nuevo pendiente',
        contenido: htmlFormularioPendiente(null),
        confirmText: 'Crear pendiente',
        onConfirm: async () => {
            const datos = recogerDatosFormularioPendiente()
            if (!datos) return false

            try {
                await crearPendiente(uid, datos)
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

function abrirFormularioEditarPendiente(pendiente, uidOrigen = sesion.uid) {
    const uidE = uidOrigen || sesion.uid
    abrirModal({
        titulo: `Editar pendiente`,
        contenido: htmlFormularioPendiente(pendiente),
        confirmText: 'Guardar cambios',
        onConfirm: async () => {
            const datos = recogerDatosFormularioPendiente()
            if (!datos) return false

            try {
                await actualizarPendiente(uidE, pendiente.id, datos)
                mostrarNotificacion("exito", "Pendiente actualizado")
                return true
            } catch (error) {
                console.error('Error actualizando pendiente:', error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        },
        onCancel: () => {
            setTimeout(() => mostrarPendientes(), 100)
        }
    })
}

function recogerDatosFormularioPendiente() {
    const concepto = document.getElementById('pendiente-concepto')?.value.trim()
    const tipo = document.getElementById('pendiente-tipo')?.value === 'true'
    const monto = parseFloat(document.getElementById('pendiente-monto')?.value)
    const divisa = document.getElementById('pendiente-divisa')?.value
    const fechaVencimiento = document.getElementById('pendiente-vencimiento')?.value

    if (!concepto) {
        mostrarNotificacion("error", "El concepto es obligatorio")
        return null
    }

    if (!monto || monto <= 0) {
        mostrarNotificacion("error", "El monto debe ser mayor a 0")
        return null
    }

    if (!divisa) {
        mostrarNotificacion("error", "La divisa es obligatoria")
        return null
    }

    return {
        concepto,
        tipo,
        monto,
        divisa,
        fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null
    }
}

// ============================================
// CONSOLIDAR PENDIENTE
// ============================================

export async function abrirConsolidacionPendiente(pendiente, uidOrigen = sesion.uid) {
    const uid = uidOrigen || sesion.uid
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

    // Prefill con los datos del pendiente
    const campoMonto = document.getElementById('campo-monto')
    const campoCantidad = document.getElementById('campo-cantidad')
    const campoConcepto = document.getElementById('campo-concepto')
    if (campoMonto) campoMonto.value = pendiente.monto
    if (campoCantidad && pendiente.monto) campoCantidad.value = pendiente.monto
    if (campoConcepto) campoConcepto.value = pendiente.concepto

    vincularSimboloDivisa()
}