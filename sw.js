import { VERSION } from "./constants/version.js"

const VERSION_APP = `escinco-v${VERSION.numero}`
const CACHE_SHELL = `${VERSION_APP}-shell`
const CACHE_RUNTIME = `${VERSION_APP}-runtime`

// Assets que se precargan al instalar el SW
const SHELL_ASSETS = [
    "/",
    "/dashboard.html",
    "/login.html",
    "/register.html",
    "/manifest.webmanifest",

    // CSS
    "/css/style.css",
    "/css/index.css",
    "/css/dashboard.css",
    "/css/navegacion.css",
    "/css/cuentas.css",
    "/css/movimientos.css",
    "/css/inversiones.css",
    "/css/trading.css",
    "/css/configuracion.css",
    "/css/pendientes.css",
    "/css/modal.css",
    "/css/register.css",
    "/css/componentes.css",
    "/css/iconos.css",

    // JS core
    "/js/core/app.js",
    "/js/core/router.js",
    "/js/core/sesion.js",
    "/js/core/tema.js",
    "/js/core/lastbar.js",
    "/js/core/pwa.js",
    "/js/core/iconos.js",
    "/js/core/cache.js",
    "/js/core/fechas.js",

    // JS pages
    "/js/pages/index.js",
    "/js/pages/register.js",
    "/js/pages/dashboard.js",
    "/js/pages/cuentas.js",
    "/js/pages/movimientos.js",
    "/js/pages/inversiones.js",
    "/js/pages/trading.js",
    "/js/pages/configuracion.js",

    // JS UI
    "/js/ui/modal.js",
    "/js/ui/formularioMovimiento.js",
    "/js/ui/pendientes.js",
    "/js/ui/metas.js",
    "/js/ui/graficos.js",
    "/js/ui/notificaciones.js",
    "/js/ui/exportar.js",
    "/js/ui/colapsoSidebar.js",

    // JS models
    "/js/models/Activo.js",
    "/js/models/Posicion.js",
    "/js/models/Pendiente.js",
    "/js/models/Trade.js",
    "/js/models/Orden.js",
    "/js/models/Meta.js",
    "/js/models/Estrategia.js",

    // JS repositories
    "/js/repositories/ActivoRepositorio.js",
    "/js/repositories/PosicionRepositorio.js",
    "/js/repositories/PendienteRepositorio.js",
    "/js/repositories/TradeRepositorio.js",
    "/js/repositories/SnapshotRepositorio.js",
    "/js/repositories/HistorialRepositorio.js",
    "/js/repositories/OrdenRepositorio.js",
    "/js/repositories/MetaRepositorio.js",
    "/js/repositories/EstrategiaRepositorio.js",
    "/js/repositories/PrecioRepositorio.js",

    // JS services
    "/js/services/ActivoServicio.js",
    "/js/services/PosicionServicio.js",
    "/js/services/PendienteServicio.js",
    "/js/services/TradingServicio.js",
    "/js/services/MovimientoServicio.js",
    "/js/services/DeshacerServicio.js",
    "/js/services/SnapshotServicio.js",
    "/js/services/HistorialServicio.js",
    "/js/services/DivisaServicio.js",
    "/js/services/ExportarServicio.js",
    "/js/services/ImportarServicio.js",
    "/js/services/EliminarServicio.js",
    "/js/services/OrdenServicio.js",
    "/js/services/MetaServicio.js",
    "/js/services/EstrategiaServicio.js",
    "/js/services/PrecioServicio.js",

    // JS firebase
    "/firebase/firebaseClient.js",
    "/firebase/config.js",
    "/firebase/auth.js",
    "/firebase/firestore.js",

    // JS constants
    "/constants/version.js",
    "/constants/tiposMovimiento.js",
    "/constants/divisas.js",

    // JS strategies
    "/js/strategies/ManualPrecioStrategy.js",
    "/js/strategies/PrecioAutomaticoStrategy.js",

    // JS libs
    "/js/lib/chart.umd.min.js",

    // Iconos
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-maskable-512.png",
    "/icons/favicon-dark.svg",
    "/icons/favicon-light.svg"
]

// ============================================
// INSTALL
// ============================================

self.addEventListener("install", (event) => {
    console.log("[SW] Install")

    event.waitUntil(
        caches.open(CACHE_SHELL)
            .then(cache => cache.addAll(SHELL_ASSETS))
            .then(() => self.skipWaiting())
            .catch(error => {
                console.error("[SW] Error precacheando:", error)
            })
    )
})

// ============================================
// ACTIVATE
// ============================================

self.addEventListener("activate", (event) => {
    console.log("[SW] Activate")

    event.waitUntil(
        caches.keys()
            .then(keys => {
                return Promise.all(
                    keys
                        .filter(key => key !== CACHE_SHELL && key !== CACHE_RUNTIME)
                        .map(key => {
                            console.log("[SW] Eliminando cache antigua:", key)
                            return caches.delete(key)
                        })
                )
            })
            .then(() => self.clients.claim())
    )
})

// ============================================
// FETCH
// ============================================

self.addEventListener("fetch", (event) => {
    const { request } = event
    const url = new URL(request.url)

    // Ignorar métodos que no sean GET
    if (request.method !== "GET") return

    // Ignorar chrome-extension, etc.
    if (!url.protocol.startsWith("http")) return

    // 1. Firebase / Firestore → siempre red (nunca cache)
    if (esFirebaseOGoogle(url)) {
        return
    }

    // 2. Fuentes (.ttf, .woff, .woff2) → stale-while-revalidate
    if (esFuente(url)) {
        event.respondWith(staleWhileRevalidate(request, CACHE_RUNTIME))
        return
    }

    // 3. Navegación (documentos HTML) → network-first
    if (request.mode === "navigate") {
        event.respondWith(networkFirst(request, CACHE_RUNTIME, "/dashboard.html"))
        return
    }

    // 4. Mismo origen (CSS, JS, iconos, etc.) → network-first
    //    Prioriza la red para que los cambios de código lleguen de inmediato;
    //    la caché solo se usa como respaldo offline.
    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(request, CACHE_RUNTIME))
        return
    }

    // 5. Resto (CDNs externos, etc.) → network-first
    event.respondWith(networkFirst(request, CACHE_RUNTIME))
})

// ============================================
// FILTROS
// ============================================

function esFirebaseOGoogle(url) {
    return (
        url.hostname.includes("firebase") ||
        url.hostname.includes("firestore") ||
        url.hostname.includes("googleapis.com") ||
        url.hostname.includes("gstatic.com") ||
        url.hostname.includes("google.com")
    )
}

function esFuente(url) {
    return /\.(ttf|otf|woff|woff2)$/i.test(url.pathname)
}

// ============================================
// ESTRATEGIAS
// ============================================

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName)
    const cached = await cache.match(request)

    const networkPromise = fetch(request)
        .then(response => {
            if (response && response.status === 200) {
                cache.put(request, response.clone())
            }
            return response
        })
        .catch(() => cached)

    return cached || networkPromise
}

async function networkFirst(request, cacheName, fallbackHtml) {
    try {
        // cache: "no-cache" fuerza revalidación con el servidor y evita que el
        // HTTP cache del navegador devuelva módulos JS obsoletos.
        const response = await fetch(request, { cache: "no-cache" })
        if (response && response.status === 200) {
            const cache = await caches.open(cacheName)
            cache.put(request, response.clone())
        }
        return response
    } catch (error) {
        const cached = await caches.match(request)
        if (cached) return cached

        // Fallback offline: servir dashboard.html
        if (fallbackHtml) {
            const fallback = await caches.match(fallbackHtml)
            if (fallback) return fallback
        }
        throw error
    }
}

// ============================================
// MENSAJES (para forzar actualización desde la app)
// ============================================

self.addEventListener("message", (event) => {
    if (event.data?.tipo === "SKIP_WAITING") {
        self.skipWaiting()
    }
})