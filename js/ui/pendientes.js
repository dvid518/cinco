import { abrirModal, cerrarModal } from "./modal.js"
import { obtenerPendientes, eliminarPendiente, crearPendiente, actualizarPendiente } from "../repositories/PendienteRepositorio.js"
import { sesion } from "../core/sesion.js"
import { obtenerTiposCompatibles, consolidarPendienteAMovimiento, consolidarPendientesEnLote } from "../services/PendienteServicio.js"
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
                <div class="pendientes-cabecera-acciones">
                    <button class="glass pendiente-lote-btn" id="btn-consolidar-lote" disabled>
                        Consolidar seleccionados
                    </button>
                    <button class="glass pendiente-crear-btn" id="btn-crear-pendiente">
                        + Nuevo pendiente
                    </button>
                </div>
            </div>
            <div class="pendientes-lista">
                ${pendientes.length === 0 ? `
                    <p class="pendiente-vacio">
                        No hay pendientes registrados.
                    </p>
                ` : pendientes.map(p => `
                    <div class="pendiente-item ${p.tipoClase || (p.tipo ? 'cobrar' : 'pagar')}" data-id="${p.id}">
                        <label class="pendiente-check">
                            <input type="checkbox" class="pendiente-select" data-id="${p.id}" aria-label="Seleccionar ${p.concepto}">
                        </label>
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

        const seleccionados = new Set()

        const actualizarBotonLote = () => {
            const btn = document.getElementById('btn-consolidar-lote')
            if (!btn) return
            const cantidad = seleccionados.size
            btn.disabled = cantidad === 0
            btn.textContent = cantidad > 0
                ? `Consolidar ${cantidad} seleccionado${cantidad !== 1 ? 's' : ''}`
                : 'Consolidar seleccionados'
        }

        document.querySelectorAll('.pendiente-select').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    seleccionados.add(checkbox.dataset.id)
                } else {
                    seleccionados.delete(checkbox.dataset.id)
                }
                actualizarBotonLote()
            })
        })

        document.getElementById('btn-consolidar-lote')?.addEventListener('click', () => {
            const elegidos = pendientes.filter(p => seleccionados.has(p.id))
            if (elegidos.length === 0) {
                mostrarNotificacion("info", "Selecciona al menos un pendiente")
                return
            }
            cerrarModal()
            abrirConsolidacionEnLote(elegidos, uid)
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
                await crearPendiente(sesion.uid, datos)
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

/**
 * Pre-rellena el formulario de movimiento con los datos del pendiente
 * (concepto, monto, divisa y vencimiento), dejándolo modificable.
 * La divisa se refleja preseleccionando la cuenta de esa moneda, para que
 * el símbolo del label y el movimiento guardado coincidan con el pendiente.
 */
function prellenarFormularioConPendiente({ concepto = "", monto, divisa, fechaVencimiento }) {
    const campoMonto = document.getElementById('campo-monto')
    const campoCantidad = document.getElementById('campo-cantidad')
    const campoConcepto = document.getElementById('campo-concepto')
    const campoFecha = document.getElementById('campo-fecha')

    if (monto != null && !Number.isNaN(monto)) {
        if (campoMonto) campoMonto.value = monto
        if (campoCantidad) campoCantidad.value = monto
    }
    if (campoConcepto) campoConcepto.value = concepto

    // Preseleccionar la cuenta que use la divisa del pendiente (si existe).
    if (divisa) {
        const campoCuenta = document.getElementById('campo-cuenta') || document.getElementById('campo-cuentaOrigen')
        if (campoCuenta) {
            const moneda = String(divisa).toLowerCase()
            const opcion = [...campoCuenta.options].find(o => (o.dataset.moneda || "").toLowerCase() === moneda)
            if (opcion) campoCuenta.value = opcion.value
        }
    }

    // El vencimiento es una buena sugerencia, pero solo si no quedó en el
    // pasado respecto al límite "máximo: hoy" del campo fecha.
    if (fechaVencimiento && campoFecha && !campoFecha.disabled) {
        const fecha = fechaVencimiento instanceof Date
            ? fechaVencimiento.toISOString().split("T")[0]
            : String(fechaVencimiento).slice(0, 10)
        if (fecha && campoFecha.max && fecha <= campoFecha.max) {
            campoFecha.value = fecha
        }
    }
}

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

    // Prefill con los datos del pendiente (modificables)
    prellenarFormularioConPendiente({
        concepto: pendiente.concepto,
        monto: pendiente.monto,
        divisa: pendiente.divisa,
        fechaVencimiento: pendiente.fechaVencimiento
    })

    vincularSimboloDivisa()
}

// ============================================
// CONSOLIDACIÓN EN LOTE
// ============================================

/**
 * Agrupa los pendientes por tipo (cobrar/pagar) y divisa, para que el monto
 * agregado siempre sume importes de la misma moneda.
 */
function agruparPendientesSeleccionados(pendientes) {
    const grupos = new Map()

    for (const pendiente of pendientes) {
        const clave = `${pendiente.tipo ? "cobrar" : "pagar"}|${pendiente.divisa}`

        if (!grupos.has(clave)) {
            grupos.set(clave, {
                tipo: pendiente.tipo,
                divisa: pendiente.divisa,
                lista: []
            })
        }

        grupos.get(clave).lista.push(pendiente)
    }

    return [...grupos.values()]
}

export async function abrirConsolidacionEnLote(pendientes, uidOrigen = sesion.uid) {
    const uid = uidOrigen || sesion.uid

    if (!pendientes || pendientes.length === 0) {
        mostrarNotificacion("error", "No hay pendientes seleccionados")
        return
    }

    const grupos = agruparPendientesSeleccionados(pendientes)
    await procesarGrupoConsolidacion(grupos, 0, uid)
}

async function procesarGrupoConsolidacion(grupos, indice, uid) {
    if (indice >= grupos.length) {
        mostrarNotificacion("exito", "Pendientes consolidados correctamente")
        setTimeout(() => mostrarPendientes(), 100)
        return
    }

    const grupo = grupos[indice]
    const tiposCompatibles = obtenerTiposCompatibles(grupo.tipo)

    if (tiposCompatibles.length === 0) {
        mostrarNotificacion("error", "No hay tipos de movimiento compatibles para este grupo")
        await procesarGrupoConsolidacion(grupos, indice + 1, uid)
        return
    }

    const tipo = tiposCompatibles[0]
    const cantidad = grupo.lista.length
    const total = grupo.lista.reduce((suma, p) => suma + (p.monto || 0), 0)
    const html = await generarFormularioMovimiento(tipo)

    const contenido = `
        <p class="pendiente-lote-info">
            Se consolidarán ${cantidad} pendiente${cantidad !== 1 ? 's' : ''}
            de ${grupo.divisa.toUpperCase()} por un total de ${total.toFixed(2)}.
        </p>
        ${html}
    `

    abrirModal({
        titulo: `Consolidar ${cantidad} pendiente${cantidad !== 1 ? 's' : ''}`,
        contenido,
        confirmText: 'Consolidar',
        onConfirm: async () => {
            const datos = recogerDatosFormulario(tipo)
            if (!datos) {
                return false
            }

            try {
                await consolidarPendientesEnLote(uid, grupo.lista.map(p => p.id), tipo, datos)
                setTimeout(() => procesarGrupoConsolidacion(grupos, indice + 1, uid), 150)
                return true
            } catch (error) {
                console.error('[ERROR] Error consolidando en lote:', error)
                mostrarNotificacion("error", `Error: ${error.message}`)
                return false
            }
        },
        onCancel: () => {
            setTimeout(() => mostrarPendientes(), 100)
        }
    })

    prellenarFormularioConPendiente({
        concepto: cantidad === 1 ? grupo.lista[0].concepto : `Consolidación de ${cantidad} pendientes`,
        monto: total,
        divisa: grupo.divisa,
        fechaVencimiento: cantidad === 1 ? grupo.lista[0].fechaVencimiento : null
    })

    vincularSimboloDivisa()
}