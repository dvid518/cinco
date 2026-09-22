import { abrirModal, cerrarModal } from "./modal.js"
import { obtenerPendientes, eliminarPendiente, crearPendiente, actualizarPendiente } from "../repositories/PendienteRepositorio.js"
import { restaurarDocumento } from "../../firebase/firestore.js"
import { sesion } from "../core/sesion.js"
import { obtenerTiposCompatibles, consolidarPendienteAMovimiento } from "../services/PendienteServicio.js"
import { generarFormularioMovimiento, recogerDatosFormulario, vincularSimboloDivisa } from "./formularioMovimiento.js"
import { DIVISAS } from "../../constants/divisas.js"
import { mostrarNotificacion } from "./notificaciones.js"
import { ofrecerDeshacer } from "../services/DeshacerServicio.js"
import { icono } from "../core/iconos.js"

// ============================================
// MOSTRAR LISTA DE PENDIENTES
// ============================================

// Card estilo movimiento: monto (precio), concepto (nombre) y fecha de
// vencimiento. El tipo se comunica solo con color/signo (sin "Cobrar/Pagar")
// y no hay borde lateral de color.
function plantillaPendiente(p) {
    const esCobro = p.tipo !== false
    const clase = esCobro ? "positive" : "negative"
    const signo = esCobro ? "+" : "-"
    const divisa = (p.divisa || "pen").toUpperCase()
    const vence = formatearFechaPendiente(p.fechaVencimiento)

    return `
        <div class="card-item pendiente-card" data-id="${p.id}">
            <div class="card-item-main">
                <div class="card-item-info">
                    <span class="card-item-titulo">${p.concepto}</span>
                    <span class="card-item-detalle">
                        ${vence
                            ? `Vence: ${vence}`
                            : '<span class="text-muted">Sin fecha de vencimiento</span>'}
                        ${p.estaVencido ? '<span class="pendiente-vencido"> · VENCIDO</span>' : ""}
                    </span>
                </div>
                <div class="card-item-valor-wrap">
                    <span class="card-item-valor ${clase}">${signo} ${p.monto.toFixed(2)} ${divisa}</span>
                    <div class="card-item-acciones">
                        <button type="button" class="card-action-btn" data-accion="consolidar" title="Consolidar" aria-label="Consolidar">
                            ${icono("circle-check", 16)}
                        </button>
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

function formatearFechaPendiente(valor) {
    if (!valor) return ""
    try {
        const opciones = { day: "2-digit", month: "short", year: "numeric" }
        if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
            const [anio, mes, dia] = valor.split("-").map(Number)
            return new Date(anio, mes - 1, dia).toLocaleDateString("es-PE", opciones)
        }
        if (valor?.toDate) return valor.toDate().toLocaleDateString("es-PE", opciones)
        if (valor?.seconds) return new Date(valor.seconds * 1000).toLocaleDateString("es-PE", opciones)
        return new Date(valor).toLocaleDateString("es-PE", opciones)
    } catch {
        return ""
    }
}

// Gestos táctiles/mouse sobre la lista: clic sostenido → seleccionar,
// swipe ← → revelar acciones (mismo comportamiento que movimientos).
function vincularGestosPendientes(container, acciones) {
    if (!container) return
    const {
        toggleSeleccion,
        marcarSupresorClick,
        mostrarAccionesCard,
        ocultarAccionesCards,
        getCardConAcciones
    } = acciones

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
        if (getCardConAcciones() && getCardConAcciones() !== card) ocultarAccionesCards()

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

// Acciones del botón de la card (revelado por hover/swipe).
function ejecutarAccionPendiente(accion, pendiente, uid) {
    if (accion === "consolidar") {
        cerrarModal()
        abrirConsolidacionPendiente(pendiente, uid)
        return
    }
    if (accion === "editar") {
        cerrarModal()
        abrirFormularioEditarPendiente(pendiente, uid)
        return
    }
    if (accion === "eliminar") {
        confirmarEliminacionPendiente(pendiente, uid)
    }
}

function confirmarEliminacionPendiente(pendiente, uid) {
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
                const snapshot = { id: pendiente.id, ...pendiente.toFirestore() }
                await eliminarPendiente(uid, pendiente.id)
                cerrarModal()
                ofrecerDeshacer({
                    mensaje: `Pendiente "${pendiente.concepto}" eliminado. ¿Deshacer?`,
                    restaurar: () => restaurarDocumento(uid, "pendientes", snapshot.id, snapshot),
                    alRestaurar: () => mostrarPendientes()
                })
                mostrarPendientes()
                return true
            } catch (error) {
                console.error("[ERROR] Error eliminando pendiente:", error)
                mostrarNotificacion("error", `No se pudo eliminar: ${error.message}`)
                return false
            }
        }
    })
}

function confirmarEliminacionLotePendientes(lista, uid) {
    const cantidad = lista.length
    abrirModal({
        titulo: "Eliminar pendientes",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    ¿Eliminar ${cantidad} pendiente${cantidad !== 1 ? 's' : ''} seleccionado${cantidad !== 1 ? 's' : ''}?
                </p>
            </div>
        `,
        variante: "confirm",
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            try {
                const snapshots = lista.map(p => ({ id: p.id, ...p.toFirestore() }))
                for (const pendiente of lista) {
                    await eliminarPendiente(uid, pendiente.id)
                }
                cerrarModal()
                ofrecerDeshacer({
                    mensaje: `${cantidad} pendiente${cantidad !== 1 ? 's' : ''} eliminado${cantidad !== 1 ? 's' : ''}. ¿Deshacer?`,
                    restaurar: async () => {
                        for (const s of snapshots) {
                            await restaurarDocumento(uid, "pendientes", s.id, s)
                        }
                    },
                    alRestaurar: () => mostrarPendientes()
                })
                mostrarPendientes()
                return true
            } catch (error) {
                console.error("[ERROR] Error eliminando pendientes:", error)
                mostrarNotificacion("error", `No se pudieron eliminar: ${error.message}`)
                return false
            }
        }
    })
}

export async function mostrarPendientes() {
    const uid = sesion.uid
    if (!uid) {
        console.error("[ERROR] No hay UID disponible")
        return
    }

    try {
        const pendientes = await obtenerPendientes(uid, true)

        // Selección (reglas de movimientos): dblclick / clic sostenido /
        // clic en modo selección, y con la opción "un click para seleccionar"
        // un click selecciona y Shift+click añade o quita. Escape limpia,
        // Delete quita el último. Alimenta la eliminación en lote.
        const seleccionados = new Set()
        const ordenSeleccion = []
        let cardConAcciones = null
        let supresorClick = false
        let supresorClickTimer = null

        const modoUnClick = () => sesion.getPreferencias()?.accesibilidad?.unClickSeleccion === true

        const actualizarBotonLote = () => {
            const btn = document.getElementById('btn-eliminar-lote')
            if (!btn) return
            const cantidad = seleccionados.size
            btn.disabled = cantidad === 0
            btn.textContent = cantidad > 0
                ? `Eliminar ${cantidad} seleccionado${cantidad !== 1 ? 's' : ''}`
                : 'Eliminar seleccionados'
        }

        const html = `
            <div class="pendientes-cabecera">
                <span class="pendientes-contador">
                    ${pendientes.length} pendiente${pendientes.length !== 1 ? 's' : ''}
                </span>
                <div class="pendientes-cabecera-acciones">
                    <button class="glass pendiente-lote-btn pendiente-eliminar-lote-btn" id="btn-eliminar-lote" disabled>
                        Eliminar seleccionados
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
                ` : pendientes.map(p => plantillaPendiente(p)).join('')}
            </div>
        `

        const modalEl = abrirModal({
            titulo: 'Pendientes',
            contenido: html,
            confirmText: 'Cerrar',
            onConfirm: () => {
                cerrarModal()
            }
        })

        // Listeners anclados al overlay del modal: se limpian solos al cerrar.
        const overlay = modalEl?.closest(".modal-overlay")
        const lista = modalEl?.querySelector(".pendientes-lista")

        const enLista = id => [...(lista?.querySelectorAll(".card-item") || [])]
            .find(card => card.dataset.id === id)

        const actualizarEstadoCard = id => {
            const card = enLista(id)
            card?.classList.toggle("seleccionado", seleccionados.has(id))
        }

        const toggleSeleccion = id => {
            if (seleccionados.has(id)) {
                seleccionados.delete(id)
                const indice = ordenSeleccion.indexOf(id)
                if (indice !== -1) ordenSeleccion.splice(indice, 1)
            } else {
                seleccionados.add(id)
                if (!ordenSeleccion.includes(id)) ordenSeleccion.push(id)
            }
            actualizarEstadoCard(id)
            actualizarBotonLote()
        }

        // Modo "un click para seleccionar": un click (sin modificador) reemplaza
        // la selección con ese pendiente; Shift + click añade o quita.
        const seleccionarPorUnClick = (id, conShift) => {
            if (conShift) {
                toggleSeleccion(id)
                return
            }
            if (seleccionados.size === 1 && seleccionados.has(id)) return
            seleccionados.clear()
            ordenSeleccion.length = 0
            seleccionados.add(id)
            ordenSeleccion.push(id)
            actualizarEstadoCard(id)
            actualizarBotonLote()
        }

        const limpiarSeleccion = () => {
            if (seleccionados.size === 0) return
            seleccionados.clear()
            ordenSeleccion.length = 0
            lista?.querySelectorAll(".card-item").forEach(card => {
                card.classList.remove("seleccionado")
            })
            actualizarBotonLote()
        }

        const deseleccionarUltimo = () => {
            const id = ordenSeleccion.pop()
            if (!id) return
            seleccionados.delete(id)
            actualizarEstadoCard(id)
            actualizarBotonLote()
        }

        const marcarSupresorClick = () => {
            supresorClick = true
            clearTimeout(supresorClickTimer)
            supresorClickTimer = setTimeout(() => { supresorClick = false }, 400)
        }
        const consumirSupresorClick = () => {
            if (!supresorClick) return false
            supresorClick = false
            clearTimeout(supresorClickTimer)
            return true
        }

        const ocultarAccionesCards = () => {
            if (!cardConAcciones) return
            cardConAcciones.classList.remove("acciones-visibles")
            cardConAcciones = null
        }
        const mostrarAccionesCard = card => {
            if (cardConAcciones && cardConAcciones !== card) ocultarAccionesCards()
            cardConAcciones = card
            card.classList.add("acciones-visibles")
        }

        document.getElementById('btn-crear-pendiente')?.addEventListener('click', () => {
            cerrarModal()
            abrirFormularioCrearPendiente()
        })

        document.getElementById('btn-eliminar-lote')?.addEventListener('click', () => {
            const elegidos = pendientes.filter(p => seleccionados.has(p.id))
            if (elegidos.length === 0) {
                mostrarNotificacion("info", "Selecciona al menos un pendiente")
                return
            }
            confirmarEliminacionLotePendientes(elegidos, uid)
        })

        // Click en card: botones de acción ejecutan; con la opción "un click"
        // un click selecciona (Ctrl añade); con selección activa alterna.
        lista?.addEventListener("click", (evento) => {
            const accionBtn = evento.target.closest(".card-action-btn")
            if (accionBtn) {
                evento.stopPropagation()
                const card = accionBtn.closest(".card-item")
                const pendiente = pendientes.find(p => p.id === card?.dataset.id)
                ocultarAccionesCards()
                if (!pendiente) return
                ejecutarAccionPendiente(accionBtn.dataset.accion, pendiente, uid)
                return
            }

            const card = evento.target.closest(".card-item")

            // Un toque con acciones reveladas solo las oculta.
            if (cardConAcciones) {
                const esLaMisma = card === cardConAcciones
                ocultarAccionesCards()
                if (esLaMisma) {
                    consumirSupresorClick()
                    return
                }
            }

            // Click inmediatamente tras selección por clic sostenido/swipe.
            if (consumirSupresorClick()) return
            if (!card) return

            // Modo "un click para seleccionar".
            if (modoUnClick()) {
                seleccionarPorUnClick(card.dataset.id, evento.shiftKey)
                return
            }

            // Clásico: con selección activa, un click alterna la selección.
            if (seleccionados.size > 0) toggleSeleccion(card.dataset.id)
        })

        // Doble clic → alternar selección (en modo "un click" el click ya
        // selecciona y el doble click no hace nada extra en pendientes).
        lista?.addEventListener("dblclick", (evento) => {
            if (evento.target.closest(".card-action-btn")) return
            const card = evento.target.closest(".card-item")
            if (!card) return
            if (modoUnClick()) return
            toggleSeleccion(card.dataset.id)
        })

        vincularGestosPendientes(lista, {
            toggleSeleccion,
            marcarSupresorClick,
            mostrarAccionesCard,
            ocultarAccionesCards,
            getCardConAcciones: () => cardConAcciones
        })

        // Escape con selección activa la limpia (en lugar de cerrar el modal);
        // Delete/Backspace quita el último seleccionado.
        overlay?.addEventListener("keydown", (evento) => {
            if (evento.key === "Escape") {
                if (seleccionados.size === 0) return
                evento.stopPropagation()
                ocultarAccionesCards()
                limpiarSeleccion()
                return
            }
            if (evento.key !== "Delete" && evento.key !== "Backspace") return
            if (evento.target.matches("input, textarea, select")) return
            if (seleccionados.size === 0) return
            evento.preventDefault()
            deseleccionarUltimo()
        })

        // Click fuera de la lista (dentro del modal) limpia la selección.
        overlay?.addEventListener("click", (evento) => {
            if (evento.target.closest(".pendientes-lista")) return
            ocultarAccionesCards()
            limpiarSeleccion()
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
    const html = await generarFormularioMovimiento(tipo, pendiente.divisa)

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