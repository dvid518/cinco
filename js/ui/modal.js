// ============================================
// SISTEMA DE MODALES
// ============================================
// - Soporta variantes: info | form | confirm | wide | narrow
// - Drag con ratón y touch desde .modal-header
// - Cierre por botón ✕, click fuera o ESC
// - Sin style inline (usa CSS variables --modal-x / --modal-y)
// ============================================

let modalAbierto = false
let escHandlerActivo = null
let dragState = null

// --------------------------------------------
// ABRIR MODAL
// --------------------------------------------

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
        titulo = "CINCO",
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
                <button class="modal-close" id="modal-close-btn" type="button" aria-label="Cerrar">✕</button>
            </div>
            <div class="modal-body">
                ${contenido}
            </div>
            ${(mostrarCancelar || mostrarConfirmar) ? `
                <div class="modal-footer">
                    ${mostrarCancelar ? `<button class="modal-btn modal-btn-secondary" id="modal-cancel" type="button">${cancelText}</button>` : ""}
                    ${mostrarConfirmar ? `<button class="modal-btn modal-btn-primary" id="modal-confirm" type="button">${confirmText}</button>` : ""}
                </div>
            ` : ""}
        </div>
    `

    document.body.appendChild(overlay)
    modalAbierto = true

    // --------------------------------------------
    // EVENTOS
    // --------------------------------------------

    const closeBtn = overlay.querySelector("#modal-close-btn")
    const cancelBtn = overlay.querySelector("#modal-cancel")
    const confirmBtn = overlay.querySelector("#modal-confirm")
    const modalEl = overlay.querySelector(".modal")

    const cerrar = (motivo = "cancelar") => {
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

        const resultado = await onConfirm()
        if (resultado !== false) {
            cerrarModal()
        }
    }

    closeBtn?.addEventListener("click", () => cerrar("cancelar"))
    cancelBtn?.addEventListener("click", () => cerrar("cancelar"))
    confirmBtn?.addEventListener("click", confirmar)

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

    if (dragState) {
        desactivarDrag()
    }

    if (!silencioso) {
        // Hook para limpieza externa si se necesita
    }
}

export function estaAbierto() {
    return modalAbierto
}

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