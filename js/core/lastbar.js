import { icono } from "./iconos.js"
import { getTemaLocal } from "./tema.js"

// ============================================
// ITEMS REUTILIZABLES
// ============================================

const ICONO_POR_MODO = {
    dark: "moon",
    light: "sun",
    system: "monitor"
}

// Marcador resuelto en getLastbar() para que el ícono del tema se
// genere SIEMPRE con el modo actual (no se congela al construir LASTBARS).
const PLACEHOLDER_TEMA = "<!--item-tema-->"

function itemTema() {
    const modo = getTemaLocal()
    const iconoTema = ICONO_POR_MODO[modo] || "sun"
    return `
        <div class="item glass" data-accion="tema" id="lastbar-item-tema" role="button" tabindex="0">
            <span class="glass">Tema</span>
            ${icono(iconoTema, 20)}
        </div>
    `
}

/** Actualiza el ícono del botón de tema según el modo actual (mantiene el DOM). */
export function actualizarIconoTema(tema = getTemaLocal()) {
    const item = document.getElementById("lastbar-item-tema")
    if (!item) return

    const iconoTema = ICONO_POR_MODO[tema] || "sun"
    const svg = item.querySelector("svg")
    if (svg) {
        svg.outerHTML = icono(iconoTema, 20)
    }
}

// Sincroniza el ícono cuando el tema cambia desde cualquier lugar
// (configuración, lastbar, etc.) sin recargar la página.
window.addEventListener("tema-cambiado", (event) => {
    actualizarIconoTema(event.detail?.tema)
})

const ITEM_PENDIENTES = `
    <div class="item glass" data-accion="pendientes" role="button" tabindex="0">
        <span class="glass">Pendientes</span>
        <svg id="icon-pen" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>
        </svg>
    </div>
`

const ITEM_CERRAR_SESION = `
    <div class="item glass" data-accion="cerrar-sesion" role="button" tabindex="0">
        <span class="glass">Cerrar sesión</span>
        <svg id="icon-logout" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <path d="M16 17l5-5-5-5" class="arrow"/>
            <line x1="21" y1="12" x2="9" y2="12" class="arrow"/>
        </svg>
    </div>
`

// ============================================
// MAPAS DE ACCIONES (barra y pendientes)
// ============================================

const PENDIENTES_BLOCK = `<div class="pendientes">${ITEM_PENDIENTES}</div>`

// Mapa de lastbars por página.
// El botón de tema SOLO aparece en dashboard y configuración.
const LASTBARS = {
    dashboard: `
        <div class="lastbar">
            <div class="bar">
                <div class="item glass" data-accion="mov">
                    <span class="glass">Movimiento</span>
                    <svg id="icon-mov" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M8 12h8"/>
                        <path d="M12 8v8"/>
                    </svg>
                </div>
                <div class="item glass" data-accion="actualizar">
                    <span class="glass">Actualizar</span>
                    <svg id="icon-act" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                        <path d="M3 3v5h5"/>
                    </svg>
                </div>
                <div class="item glass" data-accion="extracto">
                    <span class="glass">Extracto</span>
                    <svg id="icon-ext" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path class="arrow" d="M12 15V3"/>
                        <path class="arrow" d="m7 10 5 5 5-5"/>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    </svg>
                </div>
                ${PLACEHOLDER_TEMA}
                ${ITEM_CERRAR_SESION}
            </div>
            ${PENDIENTES_BLOCK}
        </div>
    `,
    cuentas: `
        <div class="lastbar">
            <div class="bar">
                <div class="item glass" data-accion="cuenta">
                    <span class="glass">Cuenta</span>
                    <svg id="icon-mov" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M8 12h8"/>
                        <path d="M12 8v8"/>
                    </svg>
                </div>
                <div class="item glass desact" data-accion="editar-cuenta">
                    <span class="glass">Editar</span>
                    <svg id="icon-edit" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
                        <path d="m15 5 4 4"/>
                    </svg>
                </div>
                <div class="item glass desact" data-accion="archivar-cuenta">
                    <span class="glass">Archivar</span>
                    <svg id="icon-arch" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="20" height="5" x="2" y="3" rx="1"/>
                        <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/>
                        <path d="M10 12h4"/>
                    </svg>
                </div>
            </div>
            ${PENDIENTES_BLOCK}
        </div>
    `,
    movimientos: `
        <div class="lastbar">
            <div class="bar">
                <div class="item glass" data-accion="mov">
                    <span class="glass">Movimiento</span>
                    <svg id="icon-mov" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M8 12h8"/>
                        <path d="M12 8v8"/>
                    </svg>
                </div>
                <div class="item glass desact" data-accion="editar-movimiento">
                    <span class="glass">Editar</span>
                    <svg id="icon-edit" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
                        <path d="m15 5 4 4"/>
                    </svg>
                </div>
                <div class="item glass desact" data-accion="eliminar-movimiento">
                    <span class="glass">Eliminar</span>
                    <svg id="icon-trash" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10 11v6"/>
                        <path d="M14 11v6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                        <path class="cover" d="M3 6h18"/>
                        <path class="cover" d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </div>
                <div class="item glass" data-accion="extracto">
                    <span class="glass">Extracto</span>
                    <svg id="icon-ext" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path class="arrow" d="M12 15V3"/>
                        <path class="arrow" d="m7 10 5 5 5-5"/>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    </svg>
                </div>
            </div>
            ${PENDIENTES_BLOCK}
        </div>
    `,
    inversiones: `
        <div class="lastbar">
            <div class="bar">
                <div class="item glass" data-accion="comprar">
                    <span class="glass">Comprar</span>
                    <svg id="icon-up" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m5 12 7-7 7 7"/>
                        <path d="M12 19V5"/>
                    </svg>
                </div>
                <div class="item glass" data-accion="vender">
                    <span class="glass">Vender</span>
                    <svg id="icon-down" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 5v14"/>
                        <path d="m19 12-7 7-7-7"/>
                    </svg>
                </div>
                <div class="item glass" data-accion="actualizar">
                    <span class="glass">Actualizar</span>
                    <svg id="icon-act" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                        <path d="M3 3v5h5"/>
                    </svg>
                </div>
                <div class="item glass" data-accion="broker">
                    <span class="glass">Broker</span>
                    <svg id="icon-mov" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M8 12h8"/>
                        <path d="M12 8v8"/>
                    </svg>
                </div>
                <div class="item glass" data-accion="exportar">
                    <span class="glass">Exportar</span>
                    <svg id="icon-ext" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path class="arrow" d="M12 15V3"/>
                        <path class="arrow" d="m7 10 5 5 5-5"/>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    </svg>
                </div>
            </div>
            ${PENDIENTES_BLOCK}
        </div>
    `,
    trading: `
        <div class="lastbar">
            <div class="bar">
                <div class="item glass" data-accion="largo">
                    <span class="glass">Largo</span>
                    <svg id="icon-trend-up" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M16 7h6v6"/>
                        <path d="m22 7-8.5 8.5-5-5L2 17"/>
                    </svg>
                </div>
                <div class="item glass" data-accion="corto">
                    <span class="glass">Corto</span>
                    <svg id="icon-trend-down" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M16 17h6v-6"/>
                        <path d="m22 17-8.5-8.5-5 5L2 7"/>
                    </svg>
                </div>
                <div class="item glass" data-accion="actualizar">
                    <span class="glass">Actualizar</span>
                    <svg id="icon-act" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                        <path d="M3 3v5h5"/>
                    </svg>
                </div>
                <div class="item glass" data-accion="broker">
                    <span class="glass">Broker</span>
                    <svg id="icon-mov" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M8 12h8"/>
                        <path d="M12 8v8"/>
                    </svg>
                </div>
                <div class="item glass" data-accion="exportar">
                    <span class="glass">Exportar</span>
                    <svg id="icon-ext" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path class="arrow" d="M12 15V3"/>
                        <path class="arrow" d="m7 10 5 5 5-5"/>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    </svg>
                </div>
            </div>
            ${PENDIENTES_BLOCK}
        </div>
    `,
    configuracion: `
        <div class="lastbar">
            <div class="bar">
                <div class="item glass desact" data-accion="guardar">
                    <span class="glass">Guardar</span>
                    <svg id="icon-save" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                    </svg>
                </div>
                ${ITEM_CERRAR_SESION}
                ${PLACEHOLDER_TEMA}
            </div>
            ${PENDIENTES_BLOCK}
        </div>
    `
}

export function getLastbar(page) {
    const plantilla = LASTBARS[page] || LASTBARS.dashboard
    return plantilla.replaceAll(PLACEHOLDER_TEMA, itemTema())
}

// ============================================
// DELEGACIÓN CENTRAL DE CLICKS
// ============================================
// Un único listener delegado en #app-footer que sobrevive a los
// re-renders (el footer es permanente). Usa `data-accion` para
// identificar el botón y la página actual.

const MAPA_ACCIONES = {
    // ── GLOBAL ──
    "pendientes": async () => {
        const { mostrarPendientes } = await import("../ui/pendientes.js")
        await mostrarPendientes()
    },

    "cerrar-sesion": async () => {
        const { abrirModalLogout } = await import("../pages/configuracion.js")
        abrirModalLogout()
    },

    "tema": async () => {
        const { ciclarTema, nombreModoTema } = await import("./tema.js")
        const { sesion } = await import("./sesion.js")
        const { mostrarNotificacion } = await import("../ui/notificaciones.js")

        try {
            const tema = await ciclarTema(sesion.uid)
            actualizarIconoTema()
            mostrarNotificacion("exito", nombreModoTema(tema))
        } catch (error) {
            console.error("[ERROR] No se pudo cambiar el tema:", error)
            mostrarNotificacion("error", "No se pudo cambiar el tema")
        }
    },

    // ── MOVIMIENTO / EXTRACTO ──
    "mov": async () => {
        const { abrirSelectorTipoMovimiento } = await import("../pages/movimientos.js")
        abrirSelectorTipoMovimiento()
    },

    "extracto": async (pagina) => {
        if (pagina === "movimientos") {
            const { exportarExtractoCSV } = await import("../pages/movimientos.js")
            await exportarExtractoCSV()
        } else {
            const { accionExportar } = await import("../ui/exportar.js")
            await accionExportar()
        }
    },

    "editar-movimiento": async () => {
        const { editarSeleccionados } = await import("../pages/movimientos.js")
        await editarSeleccionados()
    },

    "eliminar-movimiento": async () => {
        const { eliminarSeleccionados } = await import("../pages/movimientos.js")
        await eliminarSeleccionados()
    },

    "actualizar": async (pagina) => {
        switch (pagina) {
            case "dashboard": {
                const m = await import("../pages/dashboard.js")
                await m.recargarDatos()
                break
            }
            case "inversiones": {
                const m = await import("../pages/inversiones.js")
                if (typeof m.actualizarPrecios === "function") {
                    await m.actualizarPrecios()
                } else {
                    await m.cargarPosiciones()
                }
                break
            }
            default:
                console.warn(`"Actualizar" no implementado para la página "${pagina}"`)
        }
    },

    "exportar": async () => {
        const { accionExportar } = await import("../ui/exportar.js")
        await accionExportar()
    },

    // ── CUENTAS ──
    "cuenta": async () => {
        const { abrirModalCrearCuenta } = await import("../pages/cuentas.js")
        abrirModalCrearCuenta()
    },

    "editar-cuenta": async () => {
        const { editarCuentaSeleccionada } = await import("../pages/cuentas.js")
        editarCuentaSeleccionada()
    },

    "archivar-cuenta": async () => {
        const { archivarCuentaSeleccionada } = await import("../pages/cuentas.js")
        archivarCuentaSeleccionada()
    },

    // ── INVERSIONES ──
    "comprar": async () => {
        const { abrirModalCompra } = await import("../pages/inversiones.js")
        abrirModalCompra()
    },

    "vender": async () => {
        const { abrirModalVenta } = await import("../pages/inversiones.js")
        abrirModalVenta()
    },

    "broker": async (pagina) => {
        const modulo = await import(
            pagina === "trading"
                ? "../pages/trading.js"
                : "../pages/inversiones.js"
        )
        modulo.abrirModalBroker()
    },

    // ── TRADING ──
    "largo": async () => {
        const { abrirModalNuevoTrade } = await import("../pages/trading.js")
        abrirModalNuevoTrade("long")
    },

    "corto": async () => {
        const { abrirModalNuevoTrade } = await import("../pages/trading.js")
        abrirModalNuevoTrade("short")
    },

    // ── CONFIGURACIÓN ──
    "guardar": async () => {
        const { guardarDesdeLastbar } = await import("../pages/configuracion.js")
        guardarDesdeLastbar()
    }
}

export function configurarDelegacionLastbar() {
    const footer = document.getElementById("app-footer")
    if (!footer) return

    footer.addEventListener("click", async (e) => {
        const item = e.target.closest(".lastbar .item")
        if (!item) return

        const accion = item.dataset.accion
        if (!accion) {
            console.warn(`[WARN] Sin acción para lastbar: "${item.querySelector("span")?.textContent?.trim() || "?"}"`)
            return
        }

        const manejador = MAPA_ACCIONES[accion]
        if (!manejador) {
            console.warn(`[WARN] Sin manejador para acción: "${accion}"`)
            return
        }

        const { getPaginaActual } = await import("./router.js")

        try {
            await manejador(getPaginaActual())
        } catch (error) {
            console.error(`[ERROR] Error en lastbar "${accion}":`, error)
        }
    })
}