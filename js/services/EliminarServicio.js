import {
    collection,
    getDocs,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { db } from "../../firebase/firestore.js"

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
        return await vaciarColeccion(uid, coleccionNombre)
    } catch (error) {
        console.error(`Error eliminando ${coleccionNombre}:`, error)
        throw error
    }
}