import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { db } from "../../firebase/firestore.js"
import { Posicion } from "../models/Posicion.js"
import { obtenerActivo } from "./ActivoRepositorio.js"
import { cacheCapa } from "../core/cache.js"

// ============================================
// POSICION REPOSITORIO (por usuario)
// ============================================

export async function crearPosicion(uid, datos) {
    const posicion = new Posicion(datos)
    posicion.validar()
    
    const referencia = collection(db, "usuarios", uid, "posiciones")
    const resultado = await addDoc(referencia, {
        ...posicion.toFirestore(),
        ultimaActualizacion: serverTimestamp()
    })
    cacheCapa.invalidar(uid, "posiciones")
    
    return resultado.id
}

export async function obtenerPosiciones(uid) {
    return cacheCapa.obtener(uid, "posiciones", async () => {
        const referencia = collection(db, "usuarios", uid, "posiciones")
        const resultado = await getDocs(referencia)
        
        const posiciones = await Promise.all(resultado.docs.map(async doc => {
            const pos = Posicion.fromFirestore(doc.id, doc.data())
            try {
                const activo = await obtenerActivo(uid, pos.activoId)
                pos.activo = activo
            } catch (error) {
                console.warn(`Activo no encontrado para posición ${pos.id}:`, error)
            }
            return pos
        }))
        
        return posiciones
    })
}

export async function obtenerPosicion(uid, posicionId) {
    const referencia = doc(db, "usuarios", uid, "posiciones", posicionId)
    const resultado = await getDoc(referencia)
    
    if (!resultado.exists()) {
        return null
    }
    
    const pos = Posicion.fromFirestore(resultado.id, resultado.data())
    
    try {
        const activo = await obtenerActivo(uid, pos.activoId)
        pos.activo = activo
    } catch (error) {
        console.warn(`Activo no encontrado para posición ${pos.id}`)
    }
    
    return pos
}

export async function obtenerPosicionPorActivo(uid, activoId) {
    const referencia = collection(db, "usuarios", uid, "posiciones")
    const q = query(referencia, where("activoId", "==", activoId))
    const resultado = await getDocs(q)
    
    if (resultado.empty) {
        return null
    }
    
    const doc = resultado.docs[0]
    const pos = Posicion.fromFirestore(doc.id, doc.data())
    
    try {
        const activo = await obtenerActivo(uid, pos.activoId)
        pos.activo = activo
    } catch (error) {
        console.warn(`Activo no encontrado para posición ${pos.id}`)
    }
    
    return pos
}

export async function actualizarPosicion(uid, posicionId, datos) {
    const referencia = doc(db, "usuarios", uid, "posiciones", posicionId)
    const resultado = await updateDoc(referencia, {
        ...datos,
        ultimaActualizacion: serverTimestamp()
    })
    cacheCapa.invalidar(uid, "posiciones")
    return resultado
}

export async function eliminarPosicion(uid, posicionId) {
    const referencia = doc(db, "usuarios", uid, "posiciones", posicionId)
    const resultado = await deleteDoc(referencia)
    cacheCapa.invalidar(uid, "posiciones")
    return resultado
}

// ============================================
// ✅ CREAR O ACTUALIZAR POSICIÓN
// ============================================

export async function crearOActualizarPosicion(uid, activoId, cantidad, precio, divisa = 'usd') {
    const posicionExistente = await obtenerPosicionPorActivo(uid, activoId)
    
    if (posicionExistente) {
        const cantidadActual = posicionExistente.cantidad
        const precioPromedioActual = posicionExistente.precioPromedio
        
        let nuevaCantidad = cantidadActual + cantidad
        let nuevoPrecioPromedio = precioPromedioActual
        
        if (cantidad > 0) {
            // COMPRA: recalcular precio promedio ponderado
            // ✅ El precio ya incluye la comisión (viene de PosicionServicio)
            const valorTotalActual = cantidadActual * precioPromedioActual
            const valorNuevo = cantidad * precio
            nuevoPrecioPromedio = (valorTotalActual + valorNuevo) / nuevaCantidad
        } else {
            // VENTA: mantener precio promedio
            // El precio promedio NO cambia al vender
            nuevoPrecioPromedio = precioPromedioActual
        }
        
        if (nuevaCantidad <= 0) {
            await eliminarPosicion(uid, posicionExistente.id)
            return null
        }
        
        await actualizarPosicion(uid, posicionExistente.id, {
            cantidad: nuevaCantidad,
            precioPromedio: nuevoPrecioPromedio,
            divisa: divisa
        })
        
        return posicionExistente.id
    } else {
        if (cantidad <= 0) {
            throw new Error('No tienes posición en este activo')
        }
        
        const id = await crearPosicion(uid, {
            activoId,
            cantidad,
            divisa,
            precioPromedio: precio
        })
        
        return id
    }
}