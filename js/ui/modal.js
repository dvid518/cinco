import { mostrarNotificacion } from "./notificaciones.js"
import { sesion } from "../core/sesion.js"
import { LOGO_ESCINCO } from "../core/iconos.js"

// ============================================
// ESTADO
// ============================================
// Pila de modales abiertos. En modo estándar siempre hay 0 o 1;
// con "modales persistentes" pueden apilarse varias ventanas.
const modales = []
let zContador = 0

function modoPersistenteActivo() {
    try {
        return sesion.getPreferencias()?.accesibilidad?.modalesPersistentes === true
    } catch {
        return false
    }
}

function esFrente(overlay) {
    const ultimo = modales[modales.length - 1]
    return !!ultimo && ultimo.overlay === overlay
}

function sobreponer(overlay) {
    const idx = modales.findIndex(m => m.overlay === overlay)
    if (idx === -1) return
    const [registro] = modales.splice(idx, 1)
    modales.push(registro)
    overlay.style.setProperty("--z-modal", ++zContador)
}

/**
 * @param {Object} opciones
 * @param {string} [opciones.titulo]
 * @param {string} [opciones.contenido]       HTML del cuerpo
 * @param {string} [opciones.variante]        'info' | 'form' | 'confirm' | 'wide' | 'narrow'
 * @param {string} [opciones.confirmText]
 * @param {string} [opciones.cancelText]
 * @param {Function} [opciones.onConfirm]     Puede devolver false para NO cerrar
 * @param {Function} [opciones.onCancel]      Se llama al cerrar sin confirmar
 * @param {boolean} [opciones.cerrarAlClickFuera=true]
 * @param {boolean} [opciones.cerrarConEsc=true]
 */
export function abrirModal(opciones) {
    const {
        titulo = "escinco",
        contenido = "",
        variante = "form",
        confirmText = "Confirmar",
        cancelText = "Cancelar",
        onConfirm = null,
        onCancel = null,
        cerrarAlClickFuera = true,
        cerrarConEsc = true
    } = opciones

    const persistente = modoPersistenteActivo()

    // Modo estándar: un solo modal a la vez. Eliminar el previo.
    if (!persistente) {
        cerrarModal({ silencioso: true })
    }

    const overlay = document.createElement("div")
    overlay.className = "modal-overlay" + (persistente ? " modal-overlay-ventana" : "")
    overlay.style.setProperty("--z-modal", ++zContador)

    const mostrarCancelar = !!onCancel
    const mostrarConfirmar = !!onConfirm

    overlay.innerHTML = `
        <div class="modal modal-${variante}" role="dialog" aria-modal="true" tabindex="-1">
            <div class="modal-header">
                <h2 class="modal-title">${titulo}</h2>
                <button class="modal-close" type="button" aria-label="Cerrar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x preview-icon">
                        <path d="M18 6 6 18"/>
                        <path d="m6 6 12 12"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                ${contenido}
            </div>
            ${(mostrarCancelar || mostrarConfirmar) ? `
            <div class="modal-footer">
                ${mostrarCancelar ? `<button class="modal-btn modal-btn-secondary" id="modal-cancel"
                    type="button">${cancelText}</button>` : ""}
                ${mostrarConfirmar ? `<button class="modal-btn modal-btn-primary" id="modal-confirm"
                    type="button">${confirmText}</button>` : ""}
            </div>
            ` : ""}
        </div>
    `

    document.body.appendChild(overlay)

    // En modo persistente, cada nueva ventana baja un poco de la anterior
    // para que se aprecien varias a la vez (como ventanas en cascada).
    if (persistente) {
        const n = modales.length
        aplicarOffset(overlay.querySelector(".modal"), n * 28, n * 28)
    }

    const modalEl = overlay.querySelector(".modal")
    const prevFocus = document.activeElement

    // --------------------------------------------
    // EVENTOS
    // --------------------------------------------

    const closeBtn = overlay.querySelector(".modal-close")
    const cancelBtn = overlay.querySelector("#modal-cancel")
    const confirmBtn = overlay.querySelector("#modal-confirm")
    let procesando = false

    const cerrar = (motivo = "cancelar") => {
        if (procesando) return
        try {
            if (motivo === "cancelar" && typeof onCancel === "function") {
                onCancel()
            }
        } catch (error) {
            // Un fallo en onCancel no debe impedir que el modal se cierre.
            console.error("Error en onCancel:", error)
        } finally {
            cerrarModal({ overlay })
        }
    }

    const confirmar = async () => {
        if (typeof onConfirm !== "function") {
            cerrarModal({ overlay })
            return
        }
        if (procesando) return

        // Mientras procesa: blur del modal + escinco girando, pero sin bloquear
        // la interfaz de fondo (el usuario puede seguir navegando). El modal
        // queda sin interacción (procesando=true + botones desactivados).
        procesando = true
        overlay.classList.add("modal-procesando")
        confirmBtn?.setAttribute("disabled", "true")
        cancelBtn?.setAttribute("disabled", "true")
        closeBtn?.setAttribute("disabled", "true")

        // Logo escinco con la animación del router (spin) centrado en el modal.
        const logoProcesando = document.createElement("div")
        logoProcesando.className = "modal-procesando-logo"
        logoProcesando.setAttribute("aria-hidden", "true")
        logoProcesando.innerHTML = LOGO_ESCINCO
        modalEl.appendChild(logoProcesando)

        let resultado
        try {
            resultado = await onConfirm()
        } catch (error) {
            // Un error inesperado en onConfirm no debe dejar el modal
            // congelado (blur + botones desactivados para siempre).
            console.error("Error en onConfirm:", error)
            mostrarNotificacion("error", error.message || "Error inesperado al procesar la acción")
            cerrarModal({ overlay })
            return
        } finally {
            procesando = false
            overlay.classList.remove("modal-procesando")
            logoProcesando.remove()
            confirmBtn?.removeAttribute("disabled")
            cancelBtn?.removeAttribute("disabled")
            closeBtn?.removeAttribute("disabled")
        }

        if (resultado !== false) {
            cerrarModal({ overlay })
        }
    }

    closeBtn?.addEventListener("click", () => cerrar("cancelar"))
    cancelBtn?.addEventListener("click", () => cerrar("cancelar"))
    confirmBtn?.addEventListener("click", confirmar)

    // --------------------------------------------
    // FOCO INICIAL Y TRAP DE FOCUS
    // --------------------------------------------

    const obtenerEnfocables = () =>
        [...modalEl.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
        )].filter(el => el.offsetParent !== null)
    const enfocables = obtenerEnfocables()
    ;(enfocables[0] || modalEl).focus?.()

    // En modo persistente no se atrapa el foco: el usuario interactúa con
    // la aplicación mientras las ventanas están abiertas.
    let tabHandler = null
    if (!persistente) {
        tabHandler = (e) => {
            if (e.key !== "Tab") return

            const lista = obtenerEnfocables()
            if (lista.length === 0) return

            const primero = lista[0]
            const ultimo = lista[lista.length - 1]
            const activo = document.activeElement

            if (e.shiftKey) {
                if (activo === primero || !modalEl.contains(activo)) {
                    e.preventDefault()
                    ultimo.focus()
                }
            } else if (activo === ultimo || !modalEl.contains(activo)) {
                e.preventDefault()
                primero.focus()
            }
        }
        document.addEventListener("keydown", tabHandler)
    }

    // Click fuera del modal (solo en modo estándar; en persistente el
    // usuario sigue interactuando con la app y las ventanas se cierran
    // con ESC o con la X).
    if (cerrarAlClickFuera && !persistente) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) cerrar("cancelar")
        })
    }

    // ESC: en modo persistente cierra únicamente la ventana en primer plano.
    let escHandler = null
    if (cerrarConEsc) {
        escHandler = (e) => {
            if (e.key === "Escape" && (!persistente || esFrente(overlay))) {
                cerrar("cancelar")
            }
        }
        document.addEventListener("keydown", escHandler)
    }

    // Traer al frente al hacer clic en la ventana (modo persistente).
    if (persistente) {
        overlay.addEventListener("pointerdown", () => sobreponer(overlay), true)
    }

    // Drag desde el header
    const limpiarDrag = activarDrag(modalEl, overlay)

    const registro = {
        overlay,
        modalEl,
        escHandler,
        tabHandler,
        prevFocus,
        limpiarDrag
    }
    modales.push(registro)

    return modalEl
}

// --------------------------------------------
// CERRAR MODAL
// --------------------------------------------

// Cierra una ventana concreta (`overlay`) o la que está en primer plano.
export function cerrarModal({ silencioso = false, overlay = null } = {}) {
    const idx = overlay
        ? modales.findIndex(m => m.overlay === overlay)
        : modales.length - 1

    if (idx === -1) {
        return
    }

    const [registro] = modales.splice(idx, 1)
    const modal = registro.overlay

    if (registro.escHandler) {
        document.removeEventListener("keydown", registro.escHandler)
    }

    if (registro.tabHandler) {
        document.removeEventListener("keydown", registro.tabHandler)
    }

    registro.limpiarDrag?.()

    // Animación de salida: se espera a que termine antes de quitar el nodo.
    // En silencioso (p.ej. reemplazo al abrir otro) el nodo se elimina al instante.
    if (silencioso || modal.classList.contains("cerrando")) {
        modal.remove()
    } else {
        let cerrado = false
        const terminar = () => {
            if (cerrado) return
            cerrado = true
            clearTimeout(fallback)
            modal.remove()
        }
        modal.classList.add("cerrando")
        modal.addEventListener("animationend", terminar, { once: true })
        modal.addEventListener("animationcancel", terminar, { once: true })
        // Red de seguridad por si el navegador no dispara animationend
        const fallback = setTimeout(terminar, 400)
    }

    // Foco: si quedan ventanas, devolver el foco a la nueva primera plana;
    // si no, al elemento que tenía el foco antes de abrir.
    const siguiente = modales[modales.length - 1]
    if (siguiente) {
        const enfocables = siguiente.modalEl?.querySelector(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
        )
        ;(enfocables || siguiente.modalEl)?.focus?.()
    } else if (registro.prevFocus && typeof registro.prevFocus.focus === "function" && registro.prevFocus.isConnected) {
        registro.prevFocus.focus()
    }

    if (!silencioso) {
        // Hook para limpieza externa si se necesita
    }
}

export function estaAbierto() {
    return modales.length > 0
}

// --------------------------------------------
// BOTÓN DE CALENDARIO (inputs type="date")
// --------------------------------------------
// Delegación global (se instala al cargar el módulo): cualquier
// ".btn-calendario" abre el date picker del input de fecha que le
// acompaña, esté dentro de un modal o en la página.

function vincularBotonesCalendario() {
    document.addEventListener("click", (e) => {
        const boton = e.target.closest(".btn-calendario")
        if (!boton) return

        const input = boton.parentElement?.querySelector('input[type="date"]')
        if (!input) return

        if (typeof input.showPicker === "function") {
            try {
                input.showPicker()
                return
            } catch {
                // Si el navegador no permite abrirlo aquí, fallback a foco
            }
        }
        input.focus()
    })
}

vincularBotonesCalendario()

// --------------------------------------------
// DRAG DEL MODAL
// --------------------------------------------
// Usa CSS variables --modal-x y --modal-y
// para no romper la regla "sin style inline".
// El CSS aplica: transform: translate(var(--modal-x, 0), var(--modal-y, 0))
// Devuelve una función para limpiar sus listeners.
// --------------------------------------------

function activarDrag(modalEl, overlay) {
    if (!modalEl) return null

    const header = modalEl.querySelector(".modal-header")
    if (!header) return null

    let startX = 0
    let startY = 0
    let startOffsetX = 0
    let startOffsetY = 0
    let arrastrando = false

    const onDown = (e) => {
        // Ignorar si el click fue en el botón ✕
        if (e.target.closest(".modal-close")) return

        const punto = obtenerPunto(e)
        startX = punto.x
        startY = punto.y
        startOffsetX = leerOffset(modalEl, "--modal-x")
        startOffsetY = leerOffset(modalEl, "--modal-y")
        arrastrando = true

        header.classList.add("dragging")
        document.addEventListener("mousemove", onMove)
        document.addEventListener("mouseup", onUp)
        document.addEventListener("touchmove", onMove, { passive: false })
        document.addEventListener("touchend", onUp)
        document.addEventListener("touchcancel", onUp)
    }

    const onMove = (e) => {
        if (!arrastrando) return
        if (e.cancelable) e.preventDefault()

        const punto = obtenerPunto(e)
        const dx = punto.x - startX
        const dy = punto.y - startY

        aplicarOffset(modalEl, startOffsetX + dx, startOffsetY + dy)
    }

    const onUp = () => {
        arrastrando = false
        header.classList.remove("dragging")
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.removeEventListener("touchmove", onMove)
        document.removeEventListener("touchend", onUp)
        document.removeEventListener("touchcancel", onUp)
    }

    header.addEventListener("mousedown", onDown)
    header.addEventListener("touchstart", onDown, { passive: true })

    return () => {
        header.removeEventListener("mousedown", onDown)
        header.removeEventListener("touchstart", onDown)
        onUp()
    }
}

function obtenerPunto(evento) {
    if (evento.touches && evento.touches.length > 0) {
        return { x: evento.touches[0].clientX, y: evento.touches[0].clientY }
    }
    return { x: evento.clientX, y: evento.clientY }
}

function aplicarOffset(modalEl, x, y) {
    // Escribimos las CSS variables en el elemento, no style inline de propiedades
    modalEl.style.setProperty("--modal-x", `${x}px`)
    modalEl.style.setProperty("--modal-y", `${y}px`)
}

function leerOffset(modalEl, propiedad) {
    const valor = modalEl.style.getPropertyValue(propiedad)
    return valor ? parseFloat(valor) || 0 : 0
}