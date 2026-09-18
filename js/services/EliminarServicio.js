import {
    collection,
    getDocs,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { db } from "../../firebase/firestore.js"
import { cacheCapa } from "../core/cache.js"
import { sesion } from "../core/sesion.js"
import { eliminarCuentaFirebase } from "../../firebase/auth.js"
import { exportarDVID } from "./ExportarServicio.js"

// ============================================
// ELIMINAR SERVICIO
// ============================================

/**
 * Elimina todas las colecciones del usuario.
 * NO borra el documento raíz `usuarios/{uid}` (lo borra `deleteUser` de Firebase Auth).
 */
export async function eliminarTodosLosDatos(uid) {
    console.log("[INFO] Eliminando todos los datos del usuario:", uid)

    const colecciones = [
        "cuentas",
        "movimientos",
        "posiciones",
        "pendientes",
        "snapshots",
        "trades",
        "activos" // ← ahora también por usuario
    ]

    const resultado = {}

    for (const coleccionNombre of colecciones) {
        try {
            const eliminados = await vaciarColeccion(uid, coleccionNombre)
            resultado[coleccionNombre] = eliminados
            console.log(`[INFO] ${coleccionNombre}: ${eliminados} eliminados`)
        } catch (error) {
            console.error(`Error eliminando ${coleccionNombre}:`, error)
            resultado[coleccionNombre] = 0
        }
    }

    console.log("[INFO] Datos eliminados:", resultado)

    // Limpiar la caché en memoria del usuario
    cacheCapa.limpiar(uid)

    return resultado
}

/**
 * Vacía una colección entera del usuario.
 * Para `activos`, además vacía sus subcolecciones `historial`.
 */
async function vaciarColeccion(uid, coleccionNombre) {
    const referencia = collection(db, "usuarios", uid, coleccionNombre)
    const snapshot = await getDocs(referencia)

    let eliminados = 0

    for (const documento of snapshot.docs) {
        // Si es `activos`, borrar primero su historial
        if (coleccionNombre === "activos") {
            await vaciarSubcoleccion(uid, "activos", documento.id, "historial")
        }

        await deleteDoc(doc(db, "usuarios", uid, coleccionNombre, documento.id))
        eliminados++
    }

    return eliminados
}

async function vaciarSubcoleccion(uid, coleccionPadre, docId, subcoleccion) {
    const referencia = collection(
        db,
        "usuarios",
        uid,
        coleccionPadre,
        docId,
        subcoleccion
    )
    const snapshot = await getDocs(referencia)

    for (const documento of snapshot.docs) {
        await deleteDoc(
            doc(db, "usuarios", uid, coleccionPadre, docId, subcoleccion, documento.id)
        )
    }
}

// ============================================
// ELIMINAR POR COLECCIÓN
// ============================================

export async function eliminarColeccion(uid, coleccionNombre) {
    try {
        const resultado = await vaciarColeccion(uid, coleccionNombre)
        cacheCapa.limpiar(uid)
        return resultado
    } catch (error) {
        console.error(`Error eliminando ${coleccionNombre}:`, error)
        throw error
    }
}

// ============================================
// ELIMINAR DOCUMENTO RAÍZ DEL USUARIO
// ============================================

export async function eliminarDocUsuario(uid) {
    console.log("[INFO] Eliminando documento raíz de usuario:", uid)
    await deleteDoc(doc(db, "usuarios", uid))
    return true
}

// ============================================
// ELIMINAR CUENTA COMPLETA
// ============================================
// Orden obligatorio:
//   1. Respaldo .dvid (red de seguridad)
//   2. Borrar colecciones + document raíz (con request.auth activo)
//   3. Limpiar estado local (caché, sesión, tema, sidebar)
//   4. deleteUser() de Firebase Auth (lo último: mata request.auth)
// ============================================

export async function eliminarCuenta(uid) {
    console.log("[INFO] Eliminando cuenta completa:", uid)

    // 1. Respaldo de seguridad
    await exportarDVID(uid)

    // 2. Borrar datos (colecciones)
    await eliminarTodosLosDatos(uid)

    // 3. Borrar documento raíz
    await eliminarDocUsuario(uid)

    // 4. Limpiar estado local
    cacheCapa.limpiar(uid)
    sesion.limpiar()
    try {
        localStorage.removeItem("escinco_tema")
        localStorage.removeItem("escinco_sidebar_collapsed")
        localStorage.removeItem("escinco_lastbar_mode")
    } catch (error) {
        // Ignorar errores de storage
    }

    // 5. Eliminar la cuenta de Firebase Auth
    await eliminarCuentaFirebase()

    console.log("[INFO] Cuenta eliminada correctamente")
    return true
}