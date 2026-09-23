import {
    addDoc,
    collection,
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import {
    db,
    actualizarPreferencias
} from "../../firebase/firestore.js"
import { buscarActivoPorSimbolo } from "../repositories/ActivoRepositorio.js"
import { cacheCapa } from "../core/cache.js"

// ============================================
// IMPORTAR SERVICIO
// ============================================

// Versión mínima del formato aceptado (compatible hacia atrás con la 2.x).
// La 3.x agrega posiciones, trades, historial y preferencias; la 4.x agrega
// ordenes, estrategias y metas. Los respaldos antiguos se importan sin esos
// datos (los importadores son no-op cuando la sección falta).
const VERSION_MINIMA = [2, 0, 0]

/**
 * Convierte de vuelta a Date los campos que fueron exportados como
 * ISO string (ver ExportarServicio.serializarFechas).
 */
function deserializarFechas(valor, camposFecha = []) {
    if (Array.isArray(valor)) {
        return valor.map(v => deserializarFechas(v, camposFecha))
    }
    if (valor === null || typeof valor !== "object") {
        return valor
    }

    const resultado = {}
    for (const [clave, item] of Object.entries(valor)) {
        if (camposFecha.includes(clave) && typeof item === "string" && !isNaN(Date.parse(item))) {
            resultado[clave] = new Date(item)
        } else {
            resultado[clave] = item
        }
    }
    return resultado
}

/**
 * Importa un archivo .dvid en la cuenta del usuario.
 * Los datos se AGREGAN a los existentes (no se borra nada).
 *
 * @param {string} uid
 * @param {File} archivo
 * @returns {Promise<Object>} resumen con contadores y errores
 */
export async function importarDVID(uid, archivo) {
    try {
        console.log("[INFO] Importando .dvid...")

        const texto = await leerArchivo(archivo)
        const datos = JSON.parse(texto)

        if (datos.formato?.toLowerCase() !== "escinco") {
            throw new Error("El archivo no es un respaldo válido de escinco")
        }

        validarVersion(datos.version)

        console.log("[INFO] Datos a importar:", {
            formato: datos.formato,
            version: datos.version,
            cuentas: datos.cuentas?.length || 0,
            movimientos: datos.movimientos?.length || 0,
            activos: datos.activos?.length || 0,
            pendientes: datos.pendientes?.length || 0,
            posiciones: datos.posiciones?.length || 0,
            trades: datos.trades?.length || 0,
            ordenes: datos.ordenes?.length || 0,
            estrategias: datos.estrategias?.length || 0,
            metas: datos.metas?.length || 0,
            historial: datos.historial?.length || 0,
            snapshots: datos.snapshots?.length || 0
        })

        const resultado = {
            cuentas: 0,
            movimientos: 0,
            activos: 0,
            pendientes: 0,
            posiciones: 0,
            trades: 0,
            ordenes: 0,
            estrategias: 0,
            metas: 0,
            historial: 0,
            snapshots: 0,
            errores: []
        }

        // --------------------------------------
        // 1. ACTIVOS (las posiciones/historial los referencian)
        // --------------------------------------
        await importarActivos(uid, datos.activos, resultado)

        // --------------------------------------
        // 2. CUENTAS
        // --------------------------------------
        await importarCuentas(uid, datos.cuentas, resultado)

        // --------------------------------------
        // 3. MOVIMIENTOS
        // --------------------------------------
        await importarMovimientos(uid, datos.movimientos, resultado)

        // --------------------------------------
        // 4. PENDIENTES
        // --------------------------------------
        await importarPendientes(uid, datos.pendientes, resultado)

        // --------------------------------------
        // 5. POSICIONES (necesita activos ya importados)
        // --------------------------------------
        await importarPosiciones(uid, datos.posiciones, resultado)

        // --------------------------------------
        // 6. TRADES
        // --------------------------------------
        await importarTrades(uid, datos.trades, resultado)

        // --------------------------------------
        // 7. ÓRDENES
        // --------------------------------------
        await importarOrdenes(uid, datos.ordenes, resultado)

        // --------------------------------------
        // 8. ESTRATEGIAS
        // --------------------------------------
        await importarEstrategias(uid, datos.estrategias, resultado)

        // --------------------------------------
        // 9. METAS
        // --------------------------------------
        await importarMetas(uid, datos.metas, resultado)

        // --------------------------------------
        // 10. HISTORIAL DE PRECIOS (por símbolo)
        // --------------------------------------
        await importarHistorial(uid, datos.historial, resultado)

        // --------------------------------------
        // 11. SNAPSHOTS
        // --------------------------------------
        await importarSnapshots(uid, datos.snapshots, resultado)

        // --------------------------------------
        // 12. PREFERENCIAS
        // --------------------------------------
        await importarPreferencias(uid, datos.preferencias, resultado)

        invalidarCaches(uid)

        console.log("[INFO] Importación completada:", resultado)
        return resultado
    } catch (error) {
        console.error("[ERROR] Error importando:", error)
        throw error
    }
}

// ============================================
// VALIDAR VERSIÓN
// ============================================

function validarVersion(version) {
    const partes = String(version || "").split(".").map(n => parseInt(n, 10) || 0)

    if (partes.length < 2) {
        throw new Error("Versión de respaldo inválida o ausente")
    }

    for (let i = 0; i < VERSION_MINIMA.length; i++) {
        const requerida = VERSION_MINIMA[i]
        const actual = partes[i]
        if (actual > requerida) return
        if (actual < requerida) {
            throw new Error(`Versión de respaldo no compatible (${version}). Exporta de nuevo desde escinco.`)
        }
    }
}

// ============================================
// IMPORTADORES POR COLECCIÓN
// ============================================

async function importarActivos(uid, activos, resultado) {
    if (!activos || activos.length === 0) return

    const CAMPOS_FECHA = ["fechaCreacion", "ultimaActualizacion"]

    for (const activo of activos) {
        try {
            const existente = await buscarActivoPorSimbolo(uid, activo.simbolo)

            if (!existente) {
                const { id, ...datosLimpios } = activo
                await crearActivo(uid, deserializarFechas(datosLimpios, CAMPOS_FECHA))
                resultado.activos++
            }
        } catch (error) {
            resultado.errores.push(`Activo ${activo.simbolo}: ${error.message}`)
        }
    }
}

async function crearActivo(uid, datos) {
    const referencia = collection(db, "usuarios", uid, "activos")
    const resultado = await addDoc(referencia, {
        ...datos,
        fechaCreacion: datos.fechaCreacion || serverTimestamp()
    })
    cacheCapa.invalidar(uid, "activos")
    return resultado.id
}

/**
 * Importa una colección aplanada: quita el id, deserializa fechas y agrega
 * cada doc con addDoc. El primer campo de `camposFecha` es el que, de
 * faltar, se rellena con serverTimestamp (igual que los importadores a los
 * que reemplaza).
 */
async function importarColeccion(uid, elementos, resultado, config) {
    const { coleccion: nombreColeccion, camposFecha, contador, etiqueta, transformar } = config

    if (!elementos || elementos.length === 0) return

    for (const elemento of elementos) {
        try {
            const { id, ...datosLimpios } = elemento
            const datos = transformar
                ? transformar(datosLimpios, elemento)
                : deserializarFechas(datosLimpios, camposFecha)
            const campoFecha = camposFecha[0]
            const referencia = collection(db, "usuarios", uid, nombreColeccion)
            await addDoc(referencia, {
                ...datos,
                [campoFecha]: datos[campoFecha] || serverTimestamp()
            })
            resultado[contador]++
        } catch (error) {
            const detalle = elemento.nombre ? ` ${elemento.nombre}` : ""
            resultado.errores.push(`${etiqueta}${detalle}: ${error.message}`)
        }
    }
}

async function importarCuentas(uid, cuentas, resultado) {
    await importarColeccion(uid, cuentas, resultado, {
        coleccion: "cuentas",
        camposFecha: ["fechaCreacion"],
        contador: "cuentas",
        etiqueta: "Cuenta",
        transformar: datos => ({
            ...deserializarFechas(datos, ["fechaCreacion"]),
            saldoInicial: Number(datos.saldoInicial) || 0,
            estado: datos.estado || "activa",
            esPatrimonio: datos.esPatrimonio !== false,
            orden: Number.isFinite(Number(datos.orden)) ? Number(datos.orden) : resultado.cuentas
        })
    })
}

async function importarMovimientos(uid, movimientos, resultado) {
    await importarColeccion(uid, movimientos, resultado, {
        coleccion: "movimientos",
        camposFecha: ["fechaRegistro"],
        contador: "movimientos",
        etiqueta: "Movimiento"
    })
}

async function importarPendientes(uid, pendientes, resultado) {
    await importarColeccion(uid, pendientes, resultado, {
        coleccion: "pendientes",
        camposFecha: ["fechaRegistro", "fechaVencimiento", "fechaConsolidacion"],
        contador: "pendientes",
        etiqueta: "Pendiente"
    })
}

async function importarPosiciones(uid, posiciones, resultado) {
    if (!posiciones || posiciones.length === 0) return

    for (const posicion of posiciones) {
        try {
            if (!posicion.activoSimbolo) {
                resultado.errores.push("Posición sin símbolo de activo, omitida")
                continue
            }

            const activo = await buscarActivoPorSimbolo(uid, posicion.activoSimbolo)

            if (!activo) {
                resultado.errores.push(
                    `Posición de ${posicion.activoSimbolo}: activo no encontrado, omitida`
                )
                continue
            }

            const { id, activoSimbolo, ...datosPosicion } = posicion
            const datos = deserializarFechas(datosPosicion, ["ultimaActualizacion"])

            const referencia = collection(db, "usuarios", uid, "posiciones")
            await addDoc(referencia, {
                ...datos,
                activoId: activo.id
            })
            resultado.posiciones++
        } catch (error) {
            resultado.errores.push(`Posición: ${error.message}`)
        }
    }
}

async function importarTrades(uid, trades, resultado) {
    await importarColeccion(uid, trades, resultado, {
        coleccion: "trades",
        camposFecha: ["fechaRegistro", "fechaCierre"],
        contador: "trades",
        etiqueta: "Trade"
    })
}

async function importarOrdenes(uid, ordenes, resultado) {
    await importarColeccion(uid, ordenes, resultado, {
        coleccion: "ordenes",
        camposFecha: ["fechaCreacion", "fechaEjecucion"],
        contador: "ordenes",
        etiqueta: "Orden"
    })
}

async function importarEstrategias(uid, estrategias, resultado) {
    await importarColeccion(uid, estrategias, resultado, {
        coleccion: "estrategias",
        camposFecha: ["fechaCreacion", "proximaEjecucion", "ultimaEjecucion"],
        contador: "estrategias",
        etiqueta: "Estrategia"
    })
}

async function importarMetas(uid, metas, resultado) {
    await importarColeccion(uid, metas, resultado, {
        coleccion: "metas",
        camposFecha: ["fechaCreacion", "fechaLimite"],
        contador: "metas",
        etiqueta: "Meta"
    })
}

async function importarHistorial(uid, historial, resultado) {
    if (!historial || historial.length === 0) return

    const activosImportados = new Map()

    for (const grupo of historial) {
        try {
            if (!grupo.activoSimbolo || !grupo.registros?.length) {
                resultado.errores.push("Grupo de historial sin símbolo o sin registros, omitido")
                continue
            }

            let activo = activosImportados.get(grupo.activoSimbolo)
            if (!activo) {
                activo = await buscarActivoPorSimbolo(uid, grupo.activoSimbolo)
                if (!activo) {
                    resultado.errores.push(
                        `Historial de ${grupo.activoSimbolo}: activo no encontrado, omitido`
                    )
                    continue
                }
                activosImportados.set(grupo.activoSimbolo, activo)
            }

            for (const registro of grupo.registros) {
                const fecha = registro.fecha || registro.id
                if (!fecha) continue

                const datos = deserializarFechas(registro, ["actualizacion"])
                const referencia = doc(db, "usuarios", uid, "activos", activo.id, "historial", fecha)
                await setDoc(referencia, {
                    ...datos,
                    fecha: fecha,
                    actualizacion: datos.actualizacion || serverTimestamp()
                }, { merge: true })
                resultado.historial++
            }
        } catch (error) {
            resultado.errores.push(`Historial: ${error.message}`)
        }
    }
}

async function importarSnapshots(uid, snapshots, resultado) {
    if (!snapshots || snapshots.length === 0) return

    for (const snapshot of snapshots) {
        try {
            const { fecha, id, ...datosLimpios } = snapshot
            const fechaFinal = fecha || id

            if (!fechaFinal) {
                resultado.errores.push("Snapshot sin fecha, omitido")
                continue
            }

            const referencia = doc(db, "usuarios", uid, "snapshots", fechaFinal)
            await setDoc(referencia, {
                ...datosLimpios,
                actualizacion: serverTimestamp()
            }, { merge: true })
            resultado.snapshots++
        } catch (error) {
            resultado.errores.push(`Snapshot ${snapshot.fecha}: ${error.message}`)
        }
    }
}

async function importarPreferencias(uid, preferencias, resultado) {
    if (!preferencias || typeof preferencias !== "object") return

    // Merge por dot-notation: nunca se borran preferencias existentes.
    try {
        await actualizarPreferencias(uid, preferencias)
    } catch (error) {
        resultado.errores.push(`Preferencias: ${error.message}`)
    }
}

// ============================================
// CACHES
// ============================================

function invalidarCaches(uid) {
    for (const prefijo of [
        "cuentas", "movimientos", "activos", "posiciones",
        "trades", "ordenes", "estrategias", "metas",
        "pendientes", "snapshots", "historial"
    ]) {
        try {
            if (prefijo === "historial") {
                cacheCapa.invalidarPrefijo(uid, "historial")
            } else {
                cacheCapa.invalidar(uid, prefijo)
            }
        } catch (error) {
            console.warn("[WARN] No se pudo invalidar caché:", prefijo, error)
        }
    }
}

// ============================================
// LEER ARCHIVO
// ============================================

function leerArchivo(archivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target.result)
        reader.onerror = () => reject(new Error("Error leyendo archivo"))
        reader.readAsText(archivo)
    })
}

// ============================================
// PREVISUALIZAR IMPORTACIÓN
// ============================================

export async function previsualizarImportacion(archivo) {
    const texto = await leerArchivo(archivo)
    const datos = JSON.parse(texto)

    if (datos.formato?.toLowerCase() !== "escinco") {
        throw new Error("El archivo no es un respaldo válido de escinco")
    }

    validarVersion(datos.version)

    return {
        formato: datos.formato,
        version: datos.version,
        versionMinima: VERSION_MINIMA.join("."),
        fechaExportacion: datos.fechaExportacion,
        resumen: {
            cuentas: datos.cuentas?.length || 0,
            movimientos: datos.movimientos?.length || 0,
            activos: datos.activos?.length || 0,
            pendientes: datos.pendientes?.length || 0,
            posiciones: datos.posiciones?.length || 0,
            trades: datos.trades?.length || 0,
            ordenes: datos.ordenes?.length || 0,
            estrategias: datos.estrategias?.length || 0,
            metas: datos.metas?.length || 0,
            historial: datos.historial?.length || 0,
            snapshots: datos.snapshots?.length || 0
        }
    }
}