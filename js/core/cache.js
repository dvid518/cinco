// ============================================
// CACHÉ DE DATOS EN MEMORIA (por usuario)
// ============================================
// Evita repetir lecturas de Firestore en cada
// navegación (dashboard, cuentas, movimientos...).
//
// - TTL por defecto: 5 minutos.
// - Los repositorios invalidan al escribir.
// - Deduplica peticiones concurrentes.
// - Estadísticas integradas (medición + reportes).
//
// Uso:
//   const cuentas = await cacheCapa.obtener(uid, "cuentas", fetchFn)
//   cacheCapa.invalidar(uid, "cuentas")        // tras escribir
//   cacheCapa.invalidarPrefijo(uid, "activos") // varias claves
//   cacheCapa.limpiar(uid)                     // logout / borrado total
//
// Medición:
//   cacheCapa.estadisticas()          // resumen en memoria
//   cacheCapa.reiniciarEstadisticas() // limpiar contadores
//   cacheCapa.guardarReporte()        // descarga JSON en el navegador
// ============================================

const TTL_DEFAULT = 5 * 60 * 1000

const entradas = new Map() // `${uid}::${clave}` -> { datos, expira }
const enVuelo = new Map()  // `${uid}::${clave}` -> Promise (dedupe)

// ---- Estadísticas (aciertos vs lecturas de red) ----
const stats = {
    iniciado: Date.now(),
    solicitadas: 0,      // llamadas a obtener()
    aciertos: 0,         // servidas desde caché válida
    aciertosEnVuelo: 0,  // servidas reutilizando una petición en curso
    red: 0,              // lecturas que realmente tocaron la fuente
    invalidaciones: 0,
    porClave: new Map()  // clave -> { solicitadas, aciertos, aciertosEnVuelo, red }
}

function claveCompuesta(uid, clave) {
    return `${uid}::${clave}`
}

function registrarIngresoClave(clave, campo) {
    const entradaClave = stats.porClave.get(clave) ||
        { solicitadas: 0, aciertos: 0, aciertosEnVuelo: 0, red: 0 }
    entradaClave[campo]++
    stats.porClave.set(clave, entradaClave)
}

export const cacheCapa = {
    async obtener(uid, clave, fn, opciones = {}) {
        if (!uid) {
            stats.solicitadas++
            stats.red++
            return await fn()
        }

        const ttl = opciones.ttl ?? TTL_DEFAULT
        const k = claveCompuesta(uid, clave)
        const ahora = Date.now()

        stats.solicitadas++
        registrarIngresoClave(clave, "solicitadas")

        const entrada = entradas.get(k)
        if (entrada && entrada.expira > ahora) {
            stats.aciertos++
            registrarIngresoClave(clave, "aciertos")
            return entrada.datos
        }

        // Reutilizar la petición si hay una en vuelo
        if (enVuelo.has(k)) {
            stats.aciertosEnVuelo++
            registrarIngresoClave(clave, "aciertosEnVuelo")
            return enVuelo.get(k)
        }

        stats.red++
        registrarIngresoClave(clave, "red")

        const promesa = Promise.resolve()
            .then(fn)
            .then(datos => {
                entradas.set(k, { datos, expira: Date.now() + ttl })
                return datos
            })
            .finally(() => {
                enVuelo.delete(k)
            })

        enVuelo.set(k, promesa)
        return promesa
    },

    invalidar(uid, clave) {
        if (!uid) return
        const k = claveCompuesta(uid, clave)
        if (entradas.has(k)) {
            entradas.delete(k)
            stats.invalidaciones++
        }
    },

    invalidarPrefijo(uid, prefijo) {
        if (!uid) return
        const p = claveCompuesta(uid, prefijo)
        for (const k of entradas.keys()) {
            if (k.startsWith(p)) {
                entradas.delete(k)
                stats.invalidaciones++
            }
        }
    },

    limpiar(uid) {
        if (!uid) return
        const p = `${uid}::`
        for (const k of entradas.keys()) {
            if (k.startsWith(p)) {
                entradas.delete(k)
                stats.invalidaciones++
            }
        }
    },

    // --------------------------------------------
    // MEDICIÓN / REPORTES
    // --------------------------------------------

    estadisticas() {
        const solicitadas = stats.solicitadas
        const red = stats.red
        return {
            generado: new Date().toISOString(),
            iniciado: stats.iniciado,
            solicitadas,
            red,
            aciertos: stats.aciertos,
            aciertosEnVuelo: stats.aciertosEnVuelo,
            invalidaciones: stats.invalidaciones,
            ahorroPorcentual: solicitadas
                ? Math.round(((solicitadas - red) / solicitadas) * 100)
                : 0,
            porClave: [...stats.porClave.entries()]
                .map(([clave, valores]) => ({ clave, ...valores }))
                .sort((a, b) => b.solicitadas - a.solicitadas || b.red - a.red)
        }
    },

    reiniciarEstadisticas() {
        stats.iniciado = Date.now()
        stats.solicitadas = 0
        stats.aciertos = 0
        stats.aciertosEnVuelo = 0
        stats.red = 0
        stats.invalidaciones = 0
        stats.porClave.clear()
    },

    guardarReporte() {
        const reporte = {
            tipo: "reporte-cache",
            navegador: typeof navigator !== "undefined" ? navigator.userAgent : "node",
            cacheCapa: this.estadisticas()
        }

        console.log("[caché] Resumen de estadísticas:")
        console.log(`  solicitadas: ${reporte.cacheCapa.solicitadas}`)
        console.log(`  red:         ${reporte.cacheCapa.red}`)
        console.log(`  ahorro:      ${reporte.cacheCapa.ahorroPorcentual}%`)
        console.table(reporte.cacheCapa.porClave)

        if (typeof document !== "undefined" && document.createElement) {
            const blob = new Blob(
                [JSON.stringify(reporte, null, 2)],
                { type: "application/json" }
            )
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `reporte-cache-${new Date().toISOString().slice(0, 10)}.json`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        }

        return reporte
    }
}