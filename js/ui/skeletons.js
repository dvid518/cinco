const maxFilas = valor => Math.max(1, Math.min(Number(valor) || 1, 8))

const texto = clase => `<span class="skeleton ${clase}" aria-hidden="true"></span>`

const itemLista = () => `
    <div class="skeleton-item">
        ${texto("skeleton-circle")}
        <div class="skeleton-lines">
            ${texto("skeleton-line skeleton-line-wide")}
            ${texto("skeleton-line")}
        </div>
        ${texto("skeleton-line skeleton-line-value")}
    </div>
`

const varianteLista = filas => Array.from({ length: maxFilas(filas) }, itemLista).join("")

const variantePanel = filas => `
    <div class="skeleton-panel">
        <div class="skeleton-panel-info">
            ${texto("skeleton-circle skeleton-circle-large")}
            ${texto("skeleton-line skeleton-line-wide")}
            ${texto("skeleton-line")}
            ${texto("skeleton-line skeleton-line-short")}
        </div>
        <div class="skeleton-panel-list">${varianteLista(filas)}</div>
    </div>
`

const varianteAjustes = filas => Array.from({ length: maxFilas(filas) }, () => `
    <div class="skeleton-setting">
        <div class="skeleton-lines">
            ${texto("skeleton-line skeleton-line-medium")}
            ${texto("skeleton-line skeleton-line-short")}
        </div>
        ${texto("skeleton-pill")}
    </div>
`).join("")

const varianteSidebar = filas => Array.from({ length: maxFilas(filas) }, () => `
    <div class="cuenta-sidebar-item">
        <button type="button" class="glass cuenta-sidebar-btn" disabled aria-hidden="true">
            ${texto("skeleton-sidebar-icon")}
            ${texto("skeleton-line skeleton-sidebar-line")}
        </button>
    </div>
`).join("")

const varianteGrafico = () => texto("skeleton-grafico-bloque")

export function skeletonText(className = "") {
    return `<span class="skeleton skeleton-text ${className}" aria-hidden="true"></span>`
}

export function skeletonMarkup({
    variant = "list",
    rows = 4,
    className = "",
    label = "Cargando datos"
} = {}) {
    let content = varianteLista(rows)
    if (variant === "panel") content = variantePanel(rows)
    if (variant === "settings") content = varianteAjustes(rows)
    if (variant === "sidebar") content = varianteSidebar(rows)
    if (variant === "chart") content = varianteGrafico()

    return `
        <div class="skeleton skeleton-${variant} ${className}" role="status" aria-label="${label}" aria-busy="true">
            ${content}
        </div>
    `
}
