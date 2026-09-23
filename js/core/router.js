import { getLastbar } from "./lastbar.js"
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

function mostrarOverlayCarga() {
    const container = document.getElementById("app-content")
    if (!container) return null

    const overlay = document.createElement("div")
    overlay.className = "loading-overlay"

    // Indicador de carga: el logo del navbar gira en su sitio
    activarSpinLogo()

    container.appendChild(overlay)
    return overlay
}

function ocultarOverlayCarga(overlay) {
    desactivarSpinLogo()
    if (!overlay || !overlay.isConnected) return
    overlay.classList.add("loading")
    setTimeout(() => {
        if (overlay.parentNode) overlay.remove()
    }, 300)
}

export async function loadPage(page) {
    const id = ++navId  // Token capturado al inicio
    console.log("[INFO] Cargando página:", page)

    // Mostrar overlay con logo girando mientras se carga
    const overlay = mostrarOverlayCarga()

    const paginasVisibles = sesion.getPaginasVisibles()
    console.log("[INFO] Páginas visibles:", paginasVisibles)
    console.log(`[INFO] ¿"${page}" está visible?`, paginasVisibles[page] !== false)

    if (page !== 'dashboard' && paginasVisibles[page] === false) {
        console.warn(`[WARN] Página "${page}" desactivada por el usuario → redirigiendo a dashboard`)
        ocultarOverlayCarga(overlay)
        navigateTo('/')
        return
    }

    if (pageModules[page]) {
        renderPage(page)
        if (pageModules[page].init) {
            await pageModules[page].init()
            // Abortar si otra navegación ganó
            if (id !== navId) {
                console.log(`[INFO] Navegación ${id} abortada (ganó ${navId})`)
                ocultarOverlayCarga(overlay)
                return
            }
        }
        ocultarOverlayCarga(overlay)
        return 
    }

    try {
        const module = await import(`../pages/${page}.js`)
        // Abortar si otra navegación ganó mientras importábamos
        if (id !== navId) {
            console.log(`[INFO] Import ${id} abortado (ganó ${navId})`)
            ocultarOverlayCarga(overlay)
            return
        }

        console.log(`[INFO] Módulo "${page}" cargado correctamente`)
        pageModules[page] = module
        delete fallosPorPagina[page]  // Éxito → reiniciar contador
        renderPage(page)

        if (module.init) {
            await module.init()
            if (id !== navId) {
                console.log(`[INFO] Init ${id} abortado (ganó ${navId})`)
                ocultarOverlayCarga(overlay)
                return
            }
        }

        ocultarOverlayCarga(overlay)
    } catch (error) {
        console.error(`[ERROR] Error cargando página ${page}:`, error)
        manejarErrorPagina(page, error)
        ocultarOverlayCarga(overlay)
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

function renderPage(page) {
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

    // Preservar el overlay de carga a través del innerHTML (sigue visible
    // durante el render y el init del módulo, hasta ocultarOverlayCarga).
    const overlay = container.querySelector(".loading-overlay")
    const html = module.render ? module.render() : `<div></div>`
    container.innerHTML = html
    if (overlay) container.appendChild(overlay)

    const footer = document.getElementById('app-footer')
    if (footer) {
        footer.innerHTML = getLastbar(page)
        aplicarModoLastbarPersistido()
    }

    currentPage = page
    updateActiveNav(page)

    const path = page === 'dashboard' ? '/' : `/${page}`
    if (window.location.pathname !== path) {
        window.history.pushState({ page }, '', path)
    }
}

// Avisa a las páginas de que se está saliendo de la actual (antes del render).
// Permite capturar estado (p. ej. cambios sin guardar) mientras el DOM
// todavía está montado. La navegación no se bloquea.
function avisarCambioDePagina(hacia) {
    if (hacia === currentPage) return
    document.dispatchEvent(new CustomEvent("pagina-cambiando", {
        detail: { desde: currentPage, hacia }
    }))
}

export function navigateTo(path) {
    console.log('[INFO] Navegando a:', path)
    const cleanPath = path.replace(/\/+/g, '/')
    const page = routes[cleanPath] || 'dashboard'
    console.log('[INFO] Página:', page)
    avisarCambioDePagina(page)
    loadPage(page)
}

export function getPaginaActual() {
    return currentPage
}

function updateActiveNav(page) {
    document.querySelectorAll('.nav-container a, .user-container a').forEach(link => {
        const linkPage = link.dataset.page || 'dashboard'
        link.classList.toggle('act', linkPage === page)
    })
}

function setupNavigation() {
    if (navReady) return
    navReady = true

    document.querySelectorAll('.nav-container a, .user-container a, .logo-container a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault()
            const page = link.dataset.page || 'dashboard'
            console.log("[INFO] Link clickeado:", page)
            navigateTo(page === 'dashboard' ? '/' : `/${page}`)
        })
    })
}

window.addEventListener('popstate', (event) => {
    const page = event.state?.page || 'dashboard'
    avisarCambioDePagina(page)
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