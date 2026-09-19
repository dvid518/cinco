// ============================================
// MODELO DE ESTRATEGIA (COMPRA PROGRAMADA / DCA)
// ============================================

export const FRECUENCIAS = {
    DIARIA: "diaria",
    SEMANAL: "semanal",
    MENSUAL: "mensual"
}

export const DIAS_SEMANA = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado"
]

export const DIVISAS_ESTRATEGIA = ["pen", "usd", "usdt"]

export class Estrategia {
    constructor(datos) {
        this.id = datos.id || null
        this.nombre = datos.nombre || ""
        this.activoSimbolo = (datos.activoSimbolo || "").toUpperCase()
        this.cuentaId = datos.cuentaId || ""
        this.montoFijo = datos.montoFijo || 0
        this.divisa = (datos.divisa || "pen").toLowerCase()
        this.frecuencia = datos.frecuencia || FRECUENCIAS.MENSUAL
        this.diaPreferido = datos.diaPreferido ?? null
        this.proximaEjecucion = datos.proximaEjecucion || null
        this.ultimaEjecucion = datos.ultimaEjecucion || null
        this.activa = datos.activa !== undefined ? datos.activa : true
        this.fechaCreacion = datos.fechaCreacion || new Date()
    }

    validar() {
        if (!this.nombre || this.nombre.trim() === "") {
            throw new Error("El nombre de la estrategia es obligatorio")
        }
        if (!this.activoSimbolo || this.activoSimbolo.trim() === "") {
            throw new Error("El símbolo del activo es obligatorio")
        }
        if (!this.cuentaId) {
            throw new Error("La cuenta de origen es obligatoria")
        }
        if (!this.montoFijo || this.montoFijo <= 0) {
            throw new Error("El monto fijo debe ser mayor a 0")
        }
        if (!DIVISAS_ESTRATEGIA.includes(this.divisa)) {
            throw new Error("La divisa es inválida")
        }
        if (!Object.values(FRECUENCIAS).includes(this.frecuencia)) {
            throw new Error("La frecuencia es inválida")
        }
        return true
    }

    toFirestore() {
        return {
            nombre: this.nombre,
            activoSimbolo: this.activoSimbolo,
            cuentaId: this.cuentaId,
            montoFijo: this.montoFijo,
            divisa: this.divisa,
            frecuencia: this.frecuencia,
            diaPreferido: this.diaPreferido,
            proximaEjecucion: this.proximaEjecucion,
            ultimaEjecucion: this.ultimaEjecucion,
            activa: this.activa,
            fechaCreacion: this.fechaCreacion
        }
    }

    static fromFirestore(id, data) {
        return new Estrategia({
            id,
            nombre: data.nombre,
            activoSimbolo: data.activoSimbolo,
            cuentaId: data.cuentaId,
            montoFijo: data.montoFijo || 0,
            divisa: data.divisa,
            frecuencia: data.frecuencia,
            diaPreferido: data.diaPreferido ?? null,
            proximaEjecucion: data.proximaEjecucion?.toDate?.() || data.proximaEjecucion,
            ultimaEjecucion: data.ultimaEjecucion?.toDate?.() || data.ultimaEjecucion,
            activa: data.activa,
            fechaCreacion: data.fechaCreacion?.toDate?.() || data.fechaCreacion
        })
    }

    get montoFormateado() {
        return this.montoFijo.toFixed(2)
    }

    get frecuenciaTexto() {
        const base = this.frecuencia.charAt(0).toUpperCase() + this.frecuencia.slice(1)

        if (this.frecuencia === FRECUENCIAS.SEMANAL && this.diaPreferido !== null) {
            return `${base} (${DIAS_SEMANA[Number(this.diaPreferido)] || ""})`
        }
        if (this.frecuencia === FRECUENCIAS.MENSUAL && this.diaPreferido) {
            return `${base} (día ${this.diaPreferido})`
        }
        return base
    }

    get estadoTexto() {
        return this.activa ? "Activa" : "Pausada"
    }
}
