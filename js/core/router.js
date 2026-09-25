import { getLastbar, activarTooltipsLastbar } from "./lastbar.js"
import { sesion } from "./sesion.js"

const routes = {
    '/': 'dashboard',
    '/dashboard': 'dashboard',
    '/cuentas': 'cuentas',
    '/movimientos': 'movimientos',
    '/inversiones': 'inversiones',
    '/trading': 'trading',
    '/configuracion': 'configuracion'
}

let pageModules = {}
let currentPage = 'dashboard'
let navId = 0
let navReady = false
let fallosPorPagina = {}
let scrollPendiente = null
let focoPendiente = null
const modulosPrecargados = new Set()

// ============================================
// INDICADOR DE CARGA · LOGO DEL NAVBAR
// ============================================
// Mientras se carga información, el logo del navbar
// gira en su propio espacio (sin overlay ni copias).
// ============================================

function logoNavbar() {
    return document.querySelector(".logo-container #logo") ||
        document.querySelector(".nav-section #logo") ||
        document.querySelector("#logo")
}

export function activarSpinLogo() {
    const logo = logoNavbar()
    if (logo) logo.classList.add("spin")
}

export function desactivarSpinLogo() {
    const logo = logoNavbar()
    if (logo) logo.classList.remove("spin")
}

function finalizarCargaNavegacion(id) {
    if (id !== navId) return
    document.getElementById("app-content")?.removeAttribute("aria-busy")
    desactivarSpinLogo()
}

function contenedorScrollActual() {
    if (currentPage === 'dashboard') {
        return document.querySelector("#app-content") || window
    }
    return document.querySelector("#panel") || document.querySelector("#app-content") || window
}

function estadoScrollActual() {
    const contenedor = contenedorScrollActual()
    if (contenedor === window) {
        return { id: null, top: window.scrollY, left: window.scrollX }
    }
    return {
        id: contenedor.id || null,
        top: contenedor.scrollTop,
        left: contenedor.scrollLeft
    }
}

function guardarEstadoNavegacion() {
    if (!window.history.state || window.history.state.page !== currentPage) return
    window.history.replaceState({
        ...window.history.state,
        scroll: estadoScrollActual()
    }, "", window.location.href)
}

function restaurarScroll(estado) {
    if (!estado) {
        const contenedor = contenedorScrollActual()
        if (contenedor !== window) {
            contenedor.scrollTop = 0
            contenedor.scrollLeft = 0
        } else {
            window.scrollTo(0, 0)
        }
        return
    }

    requestAnimationFrame(() => {
        const contenedor = estado.id
            ? document.getElementById(estado.id)
            : contenedorScrollActual()
        if (!contenedor) return
        if (contenedor === window) {
            window.scrollTo(estado.left || 0, estado.top || 0)
        } else {
            contenedor.scrollTop = estado.top || 0
            contenedor.scrollLeft = contenedor.id === "app-content" ? 0 : (estado.left || 0)
        }
    })
}

function transicionPagina(callback) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof document.startViewTransition !== "function") {
        callback()
        return Promise.resolve()
    }
    return document.startViewTransition(callback).updateCallbackDone.catch(() => {})
}

function precargarPagina(page) {
    if (!page || page === "dashboard" || pageModules[page] || modulosPrecargados.has(page)) return
    modulosPrecargados.add(page)
    import(`../pages/${page}.js`)
        .then(module => { pageModules[page] = module })
        .catch(() => { modulosPrecargados.delete(page) })
}

function restaurarFoco() {
    if (focoPendiente?.isConnected && focoPendiente.matches('a[data-page]')) {
        focoPendiente.focus({ preventScroll: true })
    } else {
        document.getElementById("app-content")?.focus({ preventScroll: true })
    }
    focoPendiente = null
}

export async function loadPage(page) {
    const id = ++navId  // Token capturado al inicio
    document.getElementById("app-content")?.setAttribute("aria-busy", "true")
    activarSpinLogo()
    console.log("[INFO] Cargando página:", page)

    const paginasVisibles = sesion.getPaginasVisibles()
    console.log("[INFO] Páginas visibles:", paginasVisibles)
    console.log(`[INFO] ¿"${page}" está visible?`, paginasVisibles[page] !== false)

    if (page !== 'dashboard' && paginasVisibles[page] === false) {
        console.warn(`[WARN] Página "${page}" desactivada por el usuario → redirigiendo a dashboard`)
        finalizarCargaNavegacion(id)
        navigateTo('/')
        return
    }

    if (pageModules[page]) {
        await renderPage(page)
        if (pageModules[page].init) {
            await pageModules[page].init()
            // Abortar si otra navegación ganó
            if (id !== navId) {
                console.log(`[INFO] Navegación ${id} abortada (ganó ${navId})`)
                finalizarCargaNavegacion(id)
                return
            }
        }
        restaurarScroll(scrollPendiente)
        restaurarFoco()
        finalizarCargaNavegacion(id)
        return
    }

    try {
        const module = await import(`../pages/${page}.js`)
        // Abortar si otra navegación ganó mientras importábamos
        if (id !== navId) {
            console.log(`[INFO] Import ${id} abortado (ganó ${navId})`)
            finalizarCargaNavegacion(id)
            return
        }

        console.log(`[INFO] Módulo "${page}" cargado correctamente`)
        pageModules[page] = module
        delete fallosPorPagina[page]  // Éxito → reiniciar contador
        await renderPage(page)

        if (module.init) {
            await module.init()
            if (id !== navId) {
                console.log(`[INFO] Init ${id} abortado (ganó ${navId})`)
                finalizarCargaNavegacion(id)
                return
            }
        }

        restaurarScroll(scrollPendiente)
        restaurarFoco()
        finalizarCargaNavegacion(id)
    } catch (error) {
        if (id !== navId) {
            finalizarCargaNavegacion(id)
            return
        }
        console.error(`[ERROR] Error cargando página ${page}:`, error)
        manejarErrorPagina(page, error)
        finalizarCargaNavegacion(id)
    }
}

// ============================================
// ERRORES DE PÁGINA
// ============================================
// - SyntaxError (módulo roto) → NO se reintenta jamás.
// - Otros fallos → se muestra el mensaje en #app-content.
// - No hay redirección automática en bucle.
// ============================================

function manejarErrorPagina(page, error) {
    // 1) Error de sintaxis del módulo → parar y mostrar
    if (error instanceof SyntaxError) {
        console.error(`[ERROR] "${page}" tiene un error de módulo (SyntaxError). No se reintenta.`)
        mostrarErrorPagina(page, error)
        return
    }

    // 2) Contador de reintentos
    const fallos = (fallosPorPagina[page] || 0) + 1
    fallosPorPagina[page] = fallos
    console.warn(`[WARN] "${page}" falló ${fallos} vez/veces`)

    if (fallos > 1) {
        console.error(`[ERROR] "${page}" falló repetidamente. Se detiene la navegación.`)
        mostrarErrorPagina(page, error)
        return
    }

    // 3) Primer fallo → mostrar error en #app-content en lugar de bucle
    mostrarErrorPagina(page, error)
}

function mostrarErrorPagina(page, error) {
    const container = document.getElementById("app-content")
    if (!container) {
        console.error('[ERROR] Contenedor #app-content no encontrado')
        return
    }

    const esSyntaxError = error instanceof SyntaxError
    const detalle = esSyntaxError
        ? "Error en la sintaxis."
        : (error?.message || "Error desconocido al cargar la página.")

    container.innerHTML = `
        <div class="lista-vacia error">
            <p>No se pudo cargar la página "${page}".</p>
            <p class="lista-vacia-hint">${detalle}</p>
            <button class="btn-sm" id="btn-reintentar-pagina" type="button">Reintentar</button>
        </div>
    `

    // Quitar la pantalla de carga para que el error sea visible
    document.body.classList.remove("loading")

    document.getElementById("btn-reintentar-pagina")?.addEventListener("click", () => {
        delete fallosPorPagina[page]
        loadPage(page)
    })
}

// ============================================
// LASTRAR · MODO PERSISTIDO (bug de recarga)
// ============================================
// Se aplica en cada render para que sobreviva a la recarga:
// localStorage "escinco_lastbar_mode" → clase .lastbar-always-visible.

function aplicarModoLastbarPersistido() {
    const modo = localStorage.getItem("escinco_lastbar_mode") || "hide"
    const lastbar = document.querySelector(".lastbar")
    if (lastbar) {
        lastbar.classList.toggle("lastbar-always-visible", modo === "show")
    }
}

async function renderPage(page) {
    const module = pageModules[page]
    if (!module) {
        console.error(`[ERROR] Módulo no encontrado para: ${page}`)
        return
    }

    const container = document.getElementById('app-content')
    if (!container) {
        console.error('[ERROR] Contenedor #app-content no encontrado')
        return
    }

    const renderContenido = () => {
        document.querySelector("#dashboard-edicion-bar")?.remove()
        const activo = document.activeElement
        focoPendiente = activo?.closest?.('a[data-page], #app-content') || null

        if (currentPage && currentPage !== page) {
            try {
                pageModules[currentPage]?.destroy?.()
            } catch (error) {
                console.warn(`[WARN] Error destruyendo ${currentPage}:`, error)
            }
        }

        container.setAttribute("tabindex", "-1")
        const html = module.render ? module.render() : `<div></div>`
        container.innerHTML = html

        const footer = document.getElementById('app-footer')
        if (footer) {
            footer.innerHTML = getLastbar(page)
            activarTooltipsLastbar()
            aplicarModoLastbarPersistido()
        }

        currentPage = page
        updateActiveNav(page)

        const path = page === 'dashboard' ? '/' : `/${page}`
        if (window.location.pathname !== path) {
            window.history.pushState({ page }, '', path)
        }
    }

    const estadoHistorial = window.history.state
    scrollPendiente = estadoHistorial?.page === page ? estadoHistorial.scroll || null : null
    await transicionPagina(renderContenido)
}

// Avisa a las páginas de que se está saliendo de la actual (antes del render).
// Permite capturar estado (p. ej. cambios sin guardar) mientras el DOM
// todavía está montado. La navegación no se bloquea.
function avisarCambioDePagina(hacia) {
    if (hacia === currentPage) return false
    const evento = new CustomEvent("pagina-cambiando", {
        detail: { desde: currentPage, hacia },
        cancelable: true
    })
    document.dispatchEvent(evento)
    return evento.defaultPrevented
}

export function navigateTo(path) {
    console.log('[INFO] Navegando a:', path)
    const cleanPath = path.replace(/\/+/g, '/')
    const page = routes[cleanPath] || 'dashboard'
    console.log('[INFO] Página:', page)
    if (avisarCambioDePagina(page)) return
    guardarEstadoNavegacion()
    loadPage(page)
}

export function getPaginaActual() {
    return currentPage
}

function updateActiveNav(page) {
    document.querySelectorAll('.nav-container a, .user-container a').forEach(link => {
        const linkPage = link.dataset.page || 'dashboard'
        const activo = linkPage === page
        link.classList.toggle('act', activo)
        if (activo) link.setAttribute('aria-current', 'page')
        else link.removeAttribute('aria-current')
    })
}

function setupNavigation() {
    if (navReady) return
    navReady = true

    document.addEventListener('click', (evento) => {
        const link = evento.target.closest?.('a[data-page]')
        if (!link) return
        if (evento.defaultPrevented || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return
        const page = link.dataset.page || 'dashboard'
        evento.preventDefault()
        console.log("[INFO] Link clickeado:", page)
        navigateTo(page === 'dashboard' ? '/' : `/${page}`)
    })

    const preloadLink = link => precargarPagina(link?.dataset?.page || 'dashboard')
    document.addEventListener('pointerover', evento => {
        const link = evento.target.closest?.('a[data-page]')
        if (link && !link.contains(evento.relatedTarget)) preloadLink(link)
    })
    document.addEventListener('focusin', evento => {
        const link = evento.target.closest?.('a[data-page]')
        if (link) preloadLink(link)
    })
}

window.addEventListener('popstate', (event) => {
    const page = event.state?.page || 'dashboard'
    if (avisarCambioDePagina(page)) {
        const path = currentPage === 'dashboard' ? '/' : `/${currentPage}`
        window.history.replaceState({ page: currentPage }, '', path)
        return
    }
    loadPage(page)
})

export function initRouter(initialPage = 'dashboard') {
    console.log("[INFO] Iniciando router...")
    setupNavigation()

    const path = window.location.pathname
    const page = routes[path] || initialPage
    console.log(`[INFO] Router inicializado con: "${path}" → "${page}"`)
    loadPage(page)
}