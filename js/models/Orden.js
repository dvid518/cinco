// ============================================
// MODELO DE ORDEN (LÍMITE / STOP)
// ============================================
// Una orden vigila el precio de un activo y, al dispararse,
// abre un trade nuevo (long = compra, short = venta).
//
// Reglas de disparo:
//   limite + long  → precioActual <= precioDisparo (compra por debajo)
//   limite + short → precioActual >= precioDisparo (venta por encima)
//   stop   + long  → precioActual >= precioDisparo (compra por encima)
//   stop   + short → precioActual <= precioDisparo (venta por debajo)
// ============================================

export const TIPOS_ORDEN = {
    LIMITE: "limite",
    STOP: "stop"
}

export const DIRECCIONES_ORDEN = {
    LONG: "long",
    SHORT: "short"
}

export const ESTADOS_ORDEN = {
    PENDIENTE: "pendiente",
    EJECUTADA: "ejecutada",
    CANCELADA: "cancelada"
}

export class Orden {
    constructor(datos) {
        this.id = datos.id || null
        this.activo = (datos.activo || "").toUpperCase()
        this.cuenta = datos.cuenta || ""
        this.tipoOrden = datos.tipoOrden || TIPOS_ORDEN.LIMITE
        this.direccion = datos.direccion || DIRECCIONES_ORDEN.LONG
        this.precioDisparo = datos.precioDisparo || 0
        this.lotaje = datos.lotaje || 0
        this.sl = datos.sl ?? null
        this.tp = datos.tp ?? null
        this.divisa = (datos.divisa || "usd").toLowerCase()
        this.nota = datos.nota || ""
        this.estado = datos.estado || ESTADOS_ORDEN.PENDIENTE
        this.tradeId = datos.tradeId || null
        this.precioEjecucion = datos.precioEjecucion ?? null
        this.fechaCreacion = datos.fechaCreacion || new Date()
        this.fechaEjecucion = datos.fechaEjecucion || null
    }

    validar() {
        if (!this.activo || this.activo.trim() === "") {
            throw new Error("El activo es obligatorio")
        }
        if (!this.cuenta) {
            throw new Error("La cuenta es obligatoria")
        }
        if (!Object.values(TIPOS_ORDEN).includes(this.tipoOrden)) {
            throw new Error("El tipo de orden es inválido")
        }
        if (!Object.values(DIRECCIONES_ORDEN).includes(this.direccion)) {
            throw new Error("La dirección es inválida")
        }
        if (!this.precioDisparo || this.precioDisparo <= 0) {
            throw new Error("El precio de disparo debe ser mayor a 0")
        }
        if (!this.lotaje || this.lotaje <= 0) {
            throw new Error("El lotaje debe ser mayor a 0")
        }
        return true
    }

    toFirestore() {
        return {
            activo: this.activo,
            cuenta: this.cuenta,
            tipoOrden: this.tipoOrden,
            direccion: this.direccion,
            precioDisparo: this.precioDisparo,
            lotaje: this.lotaje,
            sl: this.sl,
            tp: this.tp,
            divisa: this.divisa,
            nota: this.nota,
            estado: this.estado,
            tradeId: this.tradeId,
            precioEjecucion: this.precioEjecucion,
            fechaCreacion: this.fechaCreacion,
            fechaEjecucion: this.fechaEjecucion
        }
    }

    static fromFirestore(id, data) {
        return new Orden({
            id,
            activo: data.activo,
            cuenta: data.cuenta,
            tipoOrden: data.tipoOrden,
            direccion: data.direccion,
            precioDisparo: data.precioDisparo || 0,
            lotaje: data.lotaje || 0,
            sl: data.sl ?? null,
            tp: data.tp ?? null,
            divisa: data.divisa,
            nota: data.nota,
            estado: data.estado,
            tradeId: data.tradeId || null,
            precioEjecucion: data.precioEjecucion ?? null,
            fechaCreacion: data.fechaCreacion?.toDate?.() || data.fechaCreacion,
            fechaEjecucion: data.fechaEjecucion?.toDate?.() || data.fechaEjecucion
        })
    }

    /**
     * ¿El precio dado cumple la condición de disparo de esta orden?
     *
     * @param {number} precioActual
     * @returns {boolean}
     */
    debeDisparar(precioActual) {
        if (!precioActual || precioActual <= 0) return false

        const esLimite = this.tipoOrden === TIPOS_ORDEN.LIMITE
        const esLong = this.direccion === DIRECCIONES_ORDEN.LONG

        if (esLimite) {
            return esLong
                ? precioActual <= this.precioDisparo
                : precioActual >= this.precioDisparo
        }

        return esLong
            ? precioActual >= this.precioDisparo
            : precioActual <= this.precioDisparo
    }

    get estaPendiente() {
        return this.estado === ESTADOS_ORDEN.PENDIENTE
    }

    get fueEjecutada() {
        return this.estado === ESTADOS_ORDEN.EJECUTADA
    }

    get tipoLabel() {
        return this.tipoOrden === TIPOS_ORDEN.STOP ? "Stop" : "Límite"
    }

    get direccionLabel() {
        return this.direccion === DIRECCIONES_ORDEN.SHORT ? "Venta" : "Compra"
    }

    get estadoTexto() {
        if (this.estado === ESTADOS_ORDEN.EJECUTADA) return "Ejecutada"
        if (this.estado === ESTADOS_ORDEN.CANCELADA) return "Cancelada"
        return "Pendiente"
    }
}
