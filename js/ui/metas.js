import { abrirModal, cerrarModal } from "./modal.js"
import { obtenerMetas, crearMeta, actualizarMeta, eliminarMeta } from "../repositories/MetaRepositorio.js"
import { sesion } from "../core/sesion.js"
import { aportarMeta } from "../services/MetaServicio.js"
import { obtenerCuentas, restaurarDocumento } from "../../firebase/firestore.js"
import { getDivisaPrincipal, formatearMontoConDivisa } from "../services/DivisaServicio.js"
import { expandirSeleccion } from "./seleccion.js"
import { parseFechaLocal, fechaLocalISO } from "../core/fechas.js"
import { icono } from "../core/iconos.js"
import { mostrarNotificacion } from "./notificaciones.js"
import { ofrecerDeshacer } from "../services/DeshacerServicio.js"

// ============================================
// UTILIDADES
// ============================================

async function cargarMetas() {
    const uid = sesion.uid
    if (!uid) return []
    try {
        return await obtenerMetas(uid)
    } catch (error) {
        console.error("[ERROR] Error cargando metas:", error)
        return []
    }
}

function diasHasta(fecha) {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const objetivo = new Date(fecha)
    objetivo.setHours(0, 0, 0, 0)
    const diff = objetivo - hoy
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function textoDias(dias) {
    if (dias < 0) return "vencido"
    if (dias === 0) return "hoy"
    if (dias === 1) return "mañana"
    return `en ${dias} días`
}

function formatearFecha(fecha) {
    if (!fecha) return "—"
    const d = new Date(fecha)
    if (isNaN(d.getTime())) return "—"
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function textoFechaLimite(fecha) {
    if (!fecha) return "sin fecha límite"
    const dias = diasHasta(fecha)
    return `límite ${formatearFecha(fecha)} (${textoDias(dias)})`
}

// Avisa a la página (dashboard) para que refresque su sección de metas.
function notificarCambioMetas() {
    window.dispatchEvent(new CustomEvent("metas-actualizadas"))
}

async function cargarCuentasEnSelect(selectId, divisa = null) {
    const select = document.getElementById(selectId)
    if (!select) return

    try {
        const lista = await obtenerCuentas(sesion.uid)
        const divisaObjetivo = divisa ? String(divisa).toLowerCase() : null
        const disponibles = lista.filter(c =>
            c.estado !== "archivada" &&
            c.tipo !== "credito" &&
            (!divisaObjetivo || (c.moneda || "pen").toLowerCase() === divisaObjetivo)
        )

        const placeholder = divisaObjetivo && disponibles.length === 0
            ? `Sin cuentas en ${divisaObjetivo.toUpperCase()}`
            : "Seleccionar cuenta"

        select.innerHTML = `<option value="">${placeholder}</option>` +
            disponibles.map(c => {
                const moneda = (c.moneda || "pen").toUpperCase()
                return `<option value="${c.id}" data-moneda="${(c.moneda || "pen").toLowerCase()}">${c.nombre} (${moneda})</option>`
            }).join("")
    } catch (error) {
        console.error("Error cargando cuentas en select:", error)
    }
}

// ============================================
// MOSTRAR LISTA DE METAS
// ============================================

// Card estilo movimiento/pendientes: monto (actual / objetivo), nombre y
// estado con la fecha límite. Las acciones (aportar/editar/eliminar) se
// revelan con hover, foco o tocando la card.
function plantillaMetaCard(meta) {
    const simbolo = formatearMontoConDivisa(0, meta.divisa)
    const estado = meta.completada
        ? '<span class="pendiente-vencido"> · Completada</span>'
        : (meta.activa ? "" : '<span class="pendiente-vencido"> · Pausada</span>')

    return `
        <div class="card-item meta-card" data-id="${meta.id}">
            <div class="card-item-main">
                <div class="card-item-info">
                    <span class="card-item-titulo">${meta.nombre}${estado}</span>
                    <span class="card-item-detalle">
                        Faltan ${formatearMontoConDivisa(meta.montoRestante, meta.divisa)}
                    </span>
                </div>
                <div class="card-item-valor-wrap">
                    <span class="card-item-valor">
                        ${simbolo} ${meta.porcentaje.toFixed(2)}%
                    </span>
                    <div class="card-item-acciones">
                        <button type="button" class="card-action-btn" data-accion="aportar" title="Aportar" aria-label="Aportar">
                            ${icono("plus-circle", 16)}
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

export async function mostrarMetas() {
    const uid = sesion.uid
    if (!uid) {
        console.error("[ERROR] No hay UID disponible")
        return
    }

    try {
        const metas = await cargarMetas()

        // Selección (mismas reglas que pendientes): dblclick o clic sostenido
        // alternan, modo "un click" selecciona con un toque y al repetir
        // deselecciona (Shift añade/quita), Escape limpia y Delete/Backspace
        // quita la última. Alimenta la eliminación en lote.
        const seleccionadas = new Set()
        const ordenSeleccion = []
        let supresorClick = false
        let supresorClickTimer = null

        const modoUnClick = () => sesion.getPreferencias()?.accesibilidad?.unClickSeleccion === true

        const actualizarBotones = () => {
            const btn = modalEl.querySelector('#btn-eliminar-metas-lote')
            const contador = modalEl.querySelector('#metas-contador')
            const cantidad = seleccionadas.size

            if (btn) {
                btn.disabled = cantidad === 0
                btn.textContent = cantidad > 0
                    ? `Eliminar ${cantidad} seleccionada${cantidad !== 1 ? 's' : ''}`
                    : 'Eliminar seleccionadas'
            }

            if (contador) {
                contador.textContent = cantidad > 0
                    ? `${cantidad} seleccionada${cantidad !== 1 ? 's' : ''}`
                    : `${metas.length} meta${metas.length !== 1 ? 's' : ''}`
            }
        }

        const html = `
            <div class="pendientes-cabecera">
                <span class="pendientes-contador" id="metas-contador">
                    ${metas.length} meta${metas.length !== 1 ? 's' : ''}
                </span>
                <div class="pendientes-cabecera-acciones">
                    <button class="glass pendiente-lote-btn pendiente-eliminar-lote-btn" id="btn-eliminar-metas-lote" disabled>
                        Eliminar seleccionadas
                    </button>
                    <button class="glass pendiente-crear-btn" id="btn-crear-meta">
                        + Nueva meta
                    </button>
                </div>
            </div>
            <div class="pendientes-lista">
                ${metas.length === 0 ? `
                    <p class="pendiente-vacio">
                        No hay metas registradas.
                    </p>
                ` : metas.map(plantillaMetaCard).join('')}
            </div>
        `

        const modalEl = abrirModal({
            titulo: 'Metas',
            contenido: html,
            confirmText: 'Cerrar',
            onConfirm: () => {
                cerrarModal()
            }
        })

        // Listeners anclados al overlay del modal: se limpian al cerrar.
        const overlay = modalEl?.closest(".modal-overlay")
        const lista = modalEl?.querySelector(".pendientes-lista")

        const enLista = id => [...(lista?.querySelectorAll(".card-item") || [])]
            .find(card => card.dataset.id === id)

        const sincronizarEstadoCards = () => {
            lista?.querySelectorAll(".card-item").forEach(card => {
                card.classList.toggle("seleccionado", seleccionadas.has(card.dataset.id))
            })
        }

        const toggleSeleccion = id => {
            if (seleccionadas.has(id)) {
                seleccionadas.delete(id)
                const indice = ordenSeleccion.indexOf(id)
                if (indice !== -1) ordenSeleccion.splice(indice, 1)
            } else {
                seleccionadas.add(id)
                if (!ordenSeleccion.includes(id)) ordenSeleccion.push(id)
            }
            enLista(id)?.classList.toggle("seleccionado", seleccionadas.has(id))
            actualizarBotones()
        }

        // Modo "un click para seleccionar": un click (sin modificador)
        // selecciona esa meta y deselecciona las demás; repetir el click
        // sobre la única seleccionada la deselecciona. Shift + click añade/quita.
        const seleccionarPorUnClick = (id, conShift) => {
            if (conShift) {
                toggleSeleccion(id)
                return
            }
            if (seleccionadas.size === 1 && seleccionadas.has(id)) {
                seleccionadas.clear()
                ordenSeleccion.length = 0
                sincronizarEstadoCards()
                actualizarBotones()
                return
            }
            seleccionadas.clear()
            ordenSeleccion.length = 0
            seleccionadas.add(id)
            ordenSeleccion.push(id)
            sincronizarEstadoCards()
            actualizarBotones()
        }

        const limpiarSeleccion = () => {
            if (seleccionadas.size === 0) return
            seleccionadas.clear()
            ordenSeleccion.length = 0
            sincronizarEstadoCards()
            actualizarBotones()
        }

        const deseleccionarUltima = () => {
            const id = ordenSeleccion.pop()
            if (!id) return
            seleccionadas.delete(id)
            enLista(id)?.classList.remove("seleccionado")
            actualizarBotones()
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
            lista?.querySelectorAll(".card-item.acciones-visibles")
                .forEach(c => c.classList.remove("acciones-visibles"))
        }

        modalEl?.querySelector('#btn-crear-meta')?.addEventListener('click', () => {
            cerrarModal()
            abrirModalMeta()
        })

        modalEl?.querySelector('#btn-eliminar-metas-lote')?.addEventListener('click', () => {
            const elegidas = metas.filter(m => seleccionadas.has(m.id))
            if (elegidas.length === 0) {
                mostrarNotificacion("info", "Selecciona al menos una meta")
                return
            }
            confirmarEliminacionLoteMetas(elegidas, uid)
        })

        // Click en card: botones de acción ejecutan; con selección activa (o
        // en modo "un click") un click alterna la selección; sin selección,
        // un toque revela u oculta las acciones de la card.
        lista?.addEventListener("click", (evento) => {
            const accionBtn = evento.target.closest(".card-action-btn")
            if (accionBtn) {
                evento.stopPropagation()
                const card = accionBtn.closest(".card-item")
                const meta = metas.find(m => m.id === card?.dataset.id)
                if (!meta) return
                ejecutarAccionMeta(accionBtn.dataset.accion, meta)
                return
            }

            const card = evento.target.closest(".card-item")
            if (!card) return

            // Click inmediatamente tras selección por clic sostenido.
            if (consumirSupresorClick()) return

            if (evento.shiftKey && expandirSeleccion(metas.map(meta => meta.id), card.dataset.id, seleccionadas, ordenSeleccion)) {
                sincronizarEstadoCards()
                actualizarBotones()
                return
            }

            if (modoUnClick()) {
                seleccionarPorUnClick(card.dataset.id, evento.shiftKey)
                return
            }

            if (seleccionadas.size > 0) {
                toggleSeleccion(card.dataset.id)
                return
            }

            ocultarAccionesCards()
            const yaVisible = card.classList.contains("acciones-visibles")
            if (!yaVisible) card.classList.add("acciones-visibles")
        })

        // Doble clic alterna la selección (en modo "un click" el click ya
        // selecciona y el doble no hace nada extra en metas).
        lista?.addEventListener("dblclick", (evento) => {
            if (evento.target.closest(".card-action-btn")) return
            const card = evento.target.closest(".card-item")
            if (!card) return
            if (modoUnClick()) return
            toggleSeleccion(card.dataset.id)
        })

        vincularGestosMetas(lista, {
            toggleSeleccion,
            marcarSupresorClick
        })

        // Escape limpia la selección activa (en lugar de cerrar el modal);
        // Delete/Backspace quita la última seleccionada.
        overlay?.addEventListener("keydown", (evento) => {
            if (evento.key === "Escape") {
                if (seleccionadas.size === 0) return
                evento.stopPropagation()
                ocultarAccionesCards()
                limpiarSeleccion()
                return
            }
            if (evento.key !== "Delete" && evento.key !== "Backspace") return
            if (evento.target.matches("input, textarea, select")) return
            if (seleccionadas.size === 0) return
            evento.preventDefault()
            deseleccionarUltima()
        })

        // Click fuera de la lista (dentro del modal) limpia la selección.
        overlay?.addEventListener("click", (evento) => {
            if (evento.target.closest(".pendientes-lista")) return
            ocultarAccionesCards()
            limpiarSeleccion()
        })

    } catch (error) {
        console.error('[ERROR] Error mostrando metas:', error)
        mostrarNotificacion("error", "Error al cargar metas")
    }
}

// Clic sostenido sobre una card → seleccionar (mismo comportamiento que
// movimientos/pendientes). El clic sostenido en móvil no estorba al toque
// simple que revela las acciones.
function vincularGestosMetas(container, acciones) {
    if (!container) return
    const { toggleSeleccion, marcarSupresorClick } = acciones

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

        gesto = {
            card,
            pointerId: evento.pointerId,
            pointerType: evento.pointerType,
            startX: evento.clientX,
            startY: evento.clientY,
            movido: false,
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
    })

    const finalizar = (evento) => {
        if (!gesto || evento.pointerId !== gesto.pointerId) return
        cancelar()
    }

    container.addEventListener("pointerup", finalizar)
    container.addEventListener("pointercancel", finalizar)
}

function ejecutarAccionMeta(accion, meta) {
    if (accion === "aportar") {
        cerrarModal()
        abrirModalAporteMeta(meta)
    } else if (accion === "editar") {
        cerrarModal()
        abrirModalMeta(meta)
    } else if (accion === "eliminar") {
        cerrarModal()
        confirmarEliminarMeta(meta)
    }
}

// ============================================
// CREAR / EDITAR META
// ============================================

export function abrirModalMeta(meta = null) {
    const esEdicion = !!meta
    const valorDivisa = meta?.divisa || getDivisaPrincipal()
    const valorFecha = meta?.fechaLimite ? fechaLocalISO(new Date(meta.fechaLimite)) : ""

    // Al crear, el monto inicial siempre es 0: los aportes van desde una cuenta.
    const bloqueadoInicial = !esEdicion ? " disabled" : ""

    const contenido = `
        <form id="form-meta" class="form-movimiento">
            <div class="form-group">
                <label for="meta-nombre">Nombre *</label>
                <input type="text" id="meta-nombre" class="form-input" placeholder="Ej: Fondo de emergencia" value="${meta?.nombre || ""}" required>
            </div>
            <div class="form-grupo-doble">
                <div class="form-group">
                    <label for="meta-objetivo">Monto objetivo *</label>
                    <input type="number" id="meta-objetivo" class="form-input" step="0.01" min="0.01" placeholder="0.00" value="${meta?.montoObjetivo ?? ""}" required>
                </div>
                <div class="form-group">
                    <label for="meta-actual">Monto actual</label>
                    <input type="number" id="meta-actual" class="form-input" step="0.01" min="0" placeholder="0.00" value="${esEdicion ? (meta?.montoActual ?? 0) : 0}"${bloqueadoInicial}>
                </div>
            </div>
            <div class="form-fila-fecha-divisa">
                <div class="form-group form-fecha-flex">
                    <label for="meta-fecha">Fecha límite</label>
                    <div class="campo-fecha">
                        <input type="date" id="meta-fecha" class="form-input" value="${valorFecha}">
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
                <div class="form-group form-divisa-auto">
                    <label for="meta-divisa">Divisa *</label>
                    <select id="meta-divisa" class="form-input">
                        ${["pen", "usd", "usdt"].map(d => `<option value="${d}" ${d === valorDivisa ? "selected" : ""}>${d.toUpperCase()}</option>`).join("")}
                    </select>
                </div>
            </div>
        </form>
    `

    abrirModal({
        titulo: esEdicion ? "Editar meta" : "Nueva meta",
        contenido,
        confirmText: esEdicion ? "Guardar" : "Crear meta",
        cancelText: "Cancelar",
        onConfirm: async () => {
            const nombre = document.getElementById("meta-nombre")?.value.trim()
            const montoObjetivo = parseFloat(document.getElementById("meta-objetivo")?.value)
            const montoActual = parseFloat(document.getElementById("meta-actual")?.value) || 0
            const divisa = document.getElementById("meta-divisa")?.value
            const fechaValor = document.getElementById("meta-fecha")?.value

            if (!nombre) {
                mostrarNotificacion("error", "El nombre es obligatorio")
                return false
            }
            if (!montoObjetivo || montoObjetivo <= 0) {
                mostrarNotificacion("error", "El monto objetivo debe ser mayor a 0")
                return false
            }

            const datos = {
                nombre,
                montoObjetivo,
                montoActual,
                divisa,
                fechaLimite: fechaValor ? parseFechaLocal(fechaValor) : null
            }

            try {
                if (esEdicion) {
                    await actualizarMeta(sesion.uid, meta.id, datos)
                } else {
                    await crearMeta(sesion.uid, datos)
                }
                notificarCambioMetas()
                mostrarNotificacion("exito", esEdicion ? "Meta actualizada" : "Meta creada")
                setTimeout(() => mostrarMetas(), 100)
                return true
            } catch (error) {
                console.error("Error guardando meta:", error)
                mostrarNotificacion("error", error.message || "No se pudo guardar la meta")
                return false
            }
        }
    })
}

// ============================================
// APORTAR A META
// ============================================

export function abrirModalAporteMeta(meta) {
    const total = meta.montoObjetivo || 0
    const actual = meta.montoActual || 0
    const pctActual = total > 0 ? Math.min(100, (actual / total) * 100) : 0

    const contenido = `
        <form id="form-aporte-meta" class="form-movimiento">
            <div class="aporte-progreso-wrap">
                <div class="aporte-progreso">
                    <div class="aporte-progreso-barra" id="aporte-progreso-barra"></div>
                </div>
                <span class="aporte-progreso-badge" id="aporte-progreso-badge">${pctActual.toFixed(0)}%</span>
            </div>
            <div class="aporte-valores">
                <div class="aporte-valor">
                    <span class="aporte-valor-label">Total</span>
                    <span class="aporte-valor-fuerte">${formatearMontoConDivisa(total, meta.divisa)}</span>
                </div>
                <div class="aporte-valor">
                    <span class="aporte-valor-label">Aportado</span>
                    <span class="aporte-valor-fuerte">${formatearMontoConDivisa(actual, meta.divisa)}</span>
                </div>
                <div class="aporte-valor">
                    <span class="aporte-valor-label">Fecha límite</span>
                    <span class="aporte-valor-fuerte">${formatearFecha(meta.fechaLimite)}</span>
                </div>
            </div>
            <div class="aporte-fila">
                <div class="form-group aporte-monto-flex">
                    <label for="aporte-monto">Monto del aporte *</label>
                    <input type="number" id="aporte-monto" class="form-input" step="0.01" min="0.01" placeholder="0.00" value="" required>
                </div>
                <div class="form-group aporte-cuenta-flex">
                    <label for="aporte-cuenta">Cuenta de origen *</label>
                    <select id="aporte-cuenta" class="form-input" required>
                        <option value="">Seleccionar cuenta</option>
                    </select>
                </div>
            </div>
        </form>
    `

    const modalEl = abrirModal({
        titulo: `Aportar a ${meta.nombre}`,
        contenido,
        confirmText: "Aportar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            const monto = parseFloat(document.getElementById("aporte-monto")?.value)
            const cuentaId = document.getElementById("aporte-cuenta")?.value

            if (!monto || monto <= 0) {
                mostrarNotificacion("error", "El monto debe ser mayor a 0")
                return false
            }
            if (!cuentaId) {
                mostrarNotificacion("error", "Selecciona una cuenta de origen")
                return false
            }

            try {
                await aportarMeta(sesion.uid, meta, { monto, cuentaId })
                notificarCambioMetas()
                mostrarNotificacion("exito", `Aporte de ${formatearMontoConDivisa(monto, meta.divisa)} registrado`)
                return true
            } catch (error) {
                console.error("Error registrando aporte:", error)
                mostrarNotificacion("error", error.message || "No se pudo registrar el aporte")
                return false
            }
        }
    })

    setTimeout(() => cargarCuentasEnSelect("aporte-cuenta", meta.divisa), 200)

    // Proyección en vivo: la barra avanza, el badge muestra el % y el texto
    // comunica cómo quedaría el ahorro si se aportara el monto escrito.
    const inputMonto = modalEl?.querySelector("#aporte-monto")
    const barra = modalEl?.querySelector("#aporte-progreso-barra")
    const badge = modalEl?.querySelector("#aporte-progreso-badge")
    const textoProyeccion = modalEl?.querySelector("#aporte-proyeccion")

    barra?.style.setProperty("--progreso", `${pctActual}%`)

    const actualizarProyeccion = () => {
        if (!barra || !badge) return

        const ingresado = parseFloat(inputMonto?.value) || 0
        const nuevoActual = actual + ingresado
        const pctNuevo = total > 0 ? Math.min(100, (nuevoActual / total) * 100) : 0

        if (ingresado > 0) {
            barra.style.setProperty("--progreso", `${pctNuevo}%`)
            badge.textContent = pctNuevo >= 100 ? "¡Completada!" : `${pctNuevo.toFixed(0)}%`
        } else {
            barra.style.setProperty("--progreso", `${pctActual}%`)
            badge.textContent = `${pctActual.toFixed(0)}%`
            if (textoProyeccion) textoProyeccion.textContent = ""
        }
    }

    inputMonto?.addEventListener("input", actualizarProyeccion)
}

// ============================================
// ELIMINAR META
// ============================================

function confirmarEliminacionLoteMetas(lista, uid) {
    const cantidad = lista.length
    abrirModal({
        titulo: "Eliminar metas",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    ¿Eliminar ${cantidad} meta${cantidad !== 1 ? 's' : ''} seleccionada${cantidad !== 1 ? 's' : ''}?
                </p>
            </div>
        `,
        variante: "peligro",
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            try {
                const snapshots = lista.map(m => ({ id: m.id, ...m.toFirestore() }))
                for (const meta of lista) {
                    await eliminarMeta(uid, meta.id)
                }
                notificarCambioMetas()
                setTimeout(() => mostrarMetas(), 100)
                ofrecerDeshacer({
                    mensaje: `${cantidad} meta${cantidad !== 1 ? 's' : ''} eliminada${cantidad !== 1 ? 's' : ''}. ¿Deshacer?`,
                    restaurar: async () => {
                        for (const s of snapshots) {
                            await restaurarDocumento(uid, "metas", s.id, s)
                        }
                    },
                    alRestaurar: () => {
                        notificarCambioMetas()
                        return mostrarMetas()
                    }
                })
                return true
            } catch (error) {
                console.error("Error eliminando metas:", error)
                mostrarNotificacion("error", "No se pudieron eliminar las metas")
                return false
            }
        }
    })
}

export function confirmarEliminarMeta(meta) {
    abrirModal({
        titulo: "Eliminar meta",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    ¿Eliminar la meta <strong>${meta.nombre}</strong>?}
                </p>
            </div>
        `,
        variante: "peligro",
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            try {
                const snapshot = { id: meta.id, ...meta.toFirestore() }
                await eliminarMeta(sesion.uid, meta.id)
                notificarCambioMetas()
                setTimeout(() => mostrarMetas(), 100)
                ofrecerDeshacer({
                    mensaje: `Meta "${meta.nombre}" eliminada. ¿Deshacer?`,
                    restaurar: () => restaurarDocumento(sesion.uid, "metas", snapshot.id, snapshot),
                    alRestaurar: () => {
                        notificarCambioMetas()
                        return mostrarMetas()
                    }
                })
                return true
            } catch (error) {
                console.error("Error eliminando meta:", error)
                mostrarNotificacion("error", "No se pudo eliminar la meta")
                return false
            }
        }
    })
}