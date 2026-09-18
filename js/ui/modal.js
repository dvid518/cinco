let modalAbierto = false
let escHandlerActivo = null
let tabHandlerActivo = null
let prevFocus = null
let dragState = null

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
        titulo = "ESCINCO",
        contenido = "",
        variante = "form",
        confirmText = "Confirmar",
        cancelText = "Cancelar",
        onConfirm = null,
        onCancel = null,
        cerrarAlClickFuera = true,
        cerrarConEsc = true
    } = opciones

    // Eliminar modal previo
    cerrarModal({ silencioso: true })

    const overlay = document.createElement("div")
    overlay.className = "modal-overlay"
    overlay.id = "modal-activo"

    const mostrarCancelar = !!onCancel
    const mostrarConfirmar = !!onConfirm

    overlay.innerHTML = `
        <div class="modal modal-${variante}" role="dialog" aria-modal="true">
            <div class="modal-header">
                <h2 class="modal-title">${titulo}</h2>
                <button class="modal-close" id="modal-close-btn" type="button" aria-label="Cerrar">
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
    modalAbierto = true

    prevFocus = document.activeElement

    // --------------------------------------------
    // EVENTOS
    // --------------------------------------------

    const closeBtn = overlay.querySelector("#modal-close-btn")
    const cancelBtn = overlay.querySelector("#modal-cancel")
    const confirmBtn = overlay.querySelector("#modal-confirm")
    const modalEl = overlay.querySelector(".modal")
    let procesando = false

    const cerrar = (motivo = "cancelar") => {
        if (procesando) return
        if (motivo === "cancelar" && typeof onCancel === "function") {
            onCancel()
        }
        cerrarModal()
    }

    const confirmar = async () => {
        if (typeof onConfirm !== "function") {
            cerrarModal()
            return
        }
        if (procesando) return

        // Mientras procesa: blur sobre todo el modal + bloqueo de interacción
        // para evitar doble envío (misma acción ejecutada dos veces).
        procesando = true
        overlay.classList.add("modal-procesando")
        confirmBtn?.setAttribute("disabled", "true")
        cancelBtn?.setAttribute("disabled", "true")
        closeBtn?.setAttribute("disabled", "true")

        const resultado = await onConfirm()

        procesando = false
        overlay.classList.remove("modal-procesando")
        confirmBtn?.removeAttribute("disabled")
        cancelBtn?.removeAttribute("disabled")
        closeBtn?.removeAttribute("disabled")

        if (resultado !== false) {
            cerrarModal()
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

    tabHandlerActivo = (e) => {
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
    document.addEventListener("keydown", tabHandlerActivo)

    // Click fuera del modal
    if (cerrarAlClickFuera) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) cerrar("cancelar")
        })
    }

    // ESC
    if (cerrarConEsc) {
        escHandlerActivo = (e) => {
            if (e.key === "Escape") {
                cerrar("cancelar")
            }
        }
        document.addEventListener("keydown", escHandlerActivo)
    }

    // Drag desde el header
    activarDrag(modalEl, overlay)

    return modalEl
}

// --------------------------------------------
// CERRAR MODAL
// --------------------------------------------

export function cerrarModal({ silencioso = false } = {}) {
    const modal = document.getElementById("modal-activo")
    if (!modal) {
        modalAbierto = false
        return
    }

    modal.remove()
    modalAbierto = false

    if (escHandlerActivo) {
        document.removeEventListener("keydown", escHandlerActivo)
        escHandlerActivo = null
    }

    if (tabHandlerActivo) {
        document.removeEventListener("keydown", tabHandlerActivo)
        tabHandlerActivo = null
    }

    if (dragState) {
        desactivarDrag()
    }

    if (prevFocus && typeof prevFocus.focus === "function" && prevFocus.isConnected) {
        prevFocus.focus()
    }
    prevFocus = null

    if (!silencioso) {
        // Hook para limpieza externa si se necesita
    }
}

export function estaAbierto() {
    return modalAbierto
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
// --------------------------------------------

function activarDrag(modalEl, overlay) {
    if (!modalEl) return

    const header = modalEl.querySelector(".modal-header")
    if (!header) return

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
        startOffsetX = dragState?.offsetX || 0
        startOffsetY = dragState?.offsetY || 0
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

    // Guardamos referencia para poder desactivar si hiciera falta
    dragState = {
        modalEl,
        overlay,
        desactivar: () => {
            header.removeEventListener("mousedown", onDown)
            header.removeEventListener("touchstart", onDown)
            onUp()
        }
    }
}

function desactivarDrag() {
    if (dragState?.desactivar) {
        dragState.desactivar()
    }
    dragState = null
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