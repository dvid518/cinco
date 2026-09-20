// ============================================
// PRECIO REPOSITORIO
// ============================================
// Punto único de acceso a la información de precios:
//
//  - Precio actual: en el documento del activo (ultimoPrecio)
//    + fecha/hora de la última actualización y fuente.
//  - Historico: subcolección usuarios/{uid}/activos/{activoId}/historial.
//  - Persistencia: actualiza el activo y el snapshot diario en bloque.
//
// Estrategia: "manual" cuando el activo no está marcado como "api";
// "api" cuando el precio se consulta a una fuente externa.

import { actualizarPrecioActivo } from "./ActivoRepositorio.js"
import {
    obtenerHistorial,
    guardarPrecioDelDia,
    guardarPrecioHistorico
} from "./HistorialRepositorio.js"

// --------------------------------------------
// LEER
// --------------------------------------------

export async function obtenerHistorialPrecios(uid, activoId, dias = 7) {
    return obtenerHistorial(uid, activoId, dias)
}

// --------------------------------------------
// ESCRIBIR
// --------------------------------------------

export async function guardarPrecio(uid, activoId, precio, fuente = "manual") {
    await actualizarPrecioActivo(uid, activoId, precio, fuente)
    await guardarPrecioDelDia(uid, activoId, precio)
}

export async function guardarRegistroPrecio(uid, activoId, fecha, precio) {
    await guardarPrecioHistorico(uid, activoId, fecha, precio)
}

// --------------------------------------------
// ELECCIÓN DE ESTRATEGIA
// --------------------------------------------

export function obtenerEstrategia(activo) {
    return activo?.fuente === "api" ? "api" : "manual"
}