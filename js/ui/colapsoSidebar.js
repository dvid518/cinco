// ============================================
// COLAPSO DEL SIDEBAR (riel de solo íconos)
// ============================================
// El estado se persiste en localStorage y se aplica a todos los
// sidebars del sistema (cuentas, movimientos, inversiones, trading,
// configuración).

const STORAGE_KEY = "escinco_sidebar_collapsed"

const CHEVRON_IZQ = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m15 18-6-6 6-6"/>
    </svg>
`

export function estadoColapso() {
    try {
        return localStorage.getItem(STORAGE_KEY) === "1"
    } catch (e) {
        return false
    }
}

function setEstadoColapso(colapsado) {
    try {
        localStorage.setItem(STORAGE_KEY, colapsado ? "1" : "0")
    } catch (e) {
        // Ignorar errores de storage
    }
}

export function envolverSidebar(contenido) {
    const colapsado = estadoColapso()
    return `
        <div class="sidebar-wrap${colapsado ? " sidebar-colapsado" : ""}">
            ${contenido}
            <button type="button" class="sidebar-toggle glass${colapsado ? " colapsado" : ""}" aria-label="${colapsado ? "Expandir sidebar" : "Colapsar sidebar"}">
                ${CHEVRON_IZQ}
            </button>
        </div>
    `
}

// Delega los clics de todos los botones .sidebar-toggle (un único
// listener global, sobrevive a los re-renders de cada página).
export function configurarColapsoSidebar() {
    document.addEventListener("click", (e) => {
        const toggle = e.target.closest(".sidebar-toggle")
        if (!toggle) return

        const wrap = toggle.closest(".sidebar-wrap")
        if (!wrap) return

        const colapsado = wrap.classList.toggle("sidebar-colapsado")
        toggle.classList.toggle("colapsado", colapsado)
        toggle.setAttribute("aria-label", colapsado ? "Expandir sidebar" : "Colapsar sidebar")
        setEstadoColapso(colapsado)
    })
}