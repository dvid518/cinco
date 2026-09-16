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
let navId = 0  // ✅ Token de navegación
let navReady = false  // ✅ Evita duplicar listeners del menú
let fallosPorPagina = {}  // ✅ Contador de fallos por página (evita bucles)

export async function loadPage(page) {
    const id = ++navId  // ✅ Capturar token al inicio
    console.log("[INFO] Cargando página:", page)

    const paginasVisibles = sesion.getPaginasVisibles()
    console.log("[INFO] Páginas visibles:", paginasVisibles)
    console.log(`[INFO] ¿"${page}" está visible?`, paginasVisibles[page] !== false)

    if (page !== 'dashboard' && paginasVisibles[page] === false) {
        console.warn(`[WARN] Página "${page}" desactivada por el usuario → redirigiendo a dashboard`)
        navigateTo('/')
        return
    }

    if (pageModules[page]) {
        renderPage(page)
        if (pageModules[page].init) {
            await pageModules[page].init()
            // ✅ Abortar si otra navegación ganó
            if (id !== navId) {
                console.log(`[INFO] Navegación ${id} abortada (ganó ${navId})`)
                return
            }
        }
        return
    }

    try {
        const module = await import(`../pages/${page}.js`)
        // ✅ Abortar si otra navegación ganó mientras importábamos
        if (id !== navId) {
            console.log(`[INFO] Import ${id} abortado (ganó ${navId})`)
            return
        }

        console.log(`[INFO] Módulo "${page}" cargado correctamente`)
        pageModules[page] = module
        delete fallosPorPagina[page]  // ✅ Éxito → reiniciar contador
        renderPage(page)

        if (module.init) {
            await module.init()
            // ✅ Abortar si otra navegación ganó después del init
            if (id !== navId) {
                console.log(`[INFO] Init ${id} abortado (ganó ${navId})`)
                return
            }
        }
    } catch (error) {
        console.error(`[ERROR] Error cargando página ${page}:`, error)
        manejarErrorPagina(page, error)
    }
}

// ============================================
// ERRORES DE PÁGINA
// ============================================
// - SyntaxError (módulo roto) → NO se reintenta jamás.
// - Otros fallos → se muestra el mensaje en #app-content.
// - No hay redirección automática en bucle:
//   se eliminó el `navigateTo('/')` automático tras un fallo.
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
        ? "El módulo tiene un error de sintaxis. Corrige el archivo y recarga."
        : (error?.message || "Error desconocido al cargar la página.")

    container.innerHTML = `
        <div class="lista-vacia error">
            <span class="lista-vacia-icon">⚠️</span>
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

    if (module.render) {
        container.innerHTML = module.render()
    } else {
        container.innerHTML = `<p>Cargando ${page}...</p>`
    }

    const footer = document.getElementById('app-footer')
    if (footer) {
        footer.innerHTML = getLastbar(page)
    }

    currentPage = page
    updateActiveNav(page)

    const path = page === 'dashboard' ? '/' : `/${page}`
    if (window.location.pathname !== path) {
        window.history.pushState({ page }, '', path)
    }
}

export function navigateTo(path) {
    console.log('[INFO] Navegando a:', path)
    const cleanPath = path.replace(/\/+/g, '/')
    const page = routes[cleanPath] || 'dashboard'
    console.log('[INFO] Página:', page)
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