// ============================================
// MODELO DE META DE AHORRO
// ============================================

export const DIVISAS_META = ["pen", "usd", "usdt"]

export const ICONOS_META = [
    { valor: "target", etiqueta: "Objetivo" },
    { valor: "home", etiqueta: "Casa" },
    { valor: "coins", etiqueta: "Ahorro" },
    { valor: "wallet", etiqueta: "Billetera" },
    { valor: "landmark", etiqueta: "Banco" },
    { valor: "banknote", etiqueta: "Efectivo" },
    { valor: "credit-card", etiqueta: "Tarjeta" },
    { valor: "trending-up", etiqueta: "Inversión" }
]

export class Meta {
    constructor(datos) {
        this.id = datos.id || null
        this.nombre = datos.nombre || ""
        this.montoObjetivo = datos.montoObjetivo || 0
        this.montoActual = datos.montoActual || 0
        this.divisa = (datos.divisa || "pen").toLowerCase()
        this.fechaLimite = datos.fechaLimite || null
        this.activa = datos.activa !== undefined ? datos.activa : true
        this.icono = datos.icono || "target"
        this.fechaCreacion = datos.fechaCreacion || new Date()
    }

    validar() {
        if (!this.nombre || this.nombre.trim() === "") {
            throw new Error("El nombre de la meta es obligatorio")
        }
        if (!this.montoObjetivo || this.montoObjetivo <= 0) {
            throw new Error("El monto objetivo debe ser mayor a 0")
        }
        if (this.montoActual < 0) {
            throw new Error("El monto actual no puede ser negativo")
        }
        if (!DIVISAS_META.includes(this.divisa)) {
            throw new Error("La divisa es inválida")
        }
        return true
    }

    toFirestore() {
        return {
            nombre: this.nombre,
            montoObjetivo: this.montoObjetivo,
            montoActual: this.montoActual,
            divisa: this.divisa,
            fechaLimite: this.fechaLimite,
            activa: this.activa,
            icono: this.icono,
            fechaCreacion: this.fechaCreacion
        }
    }

    static fromFirestore(id, data) {
        return new Meta({
            id,
            nombre: data.nombre,
            montoObjetivo: data.montoObjetivo || 0,
            montoActual: data.montoActual || 0,
            divisa: data.divisa,
            fechaLimite: data.fechaLimite?.toDate?.() || data.fechaLimite || null,
            activa: data.activa,
            icono: data.icono,
            fechaCreacion: data.fechaCreacion?.toDate?.() || data.fechaCreacion
        })
    }

    get porcentaje() {
        if (!this.montoObjetivo || this.montoObjetivo <= 0) return 0
        return Math.min(100, (this.montoActual / this.montoObjetivo) * 100)
    }

    get montoRestante() {
        return Math.max(0, this.montoObjetivo - this.montoActual)
    }

    get completada() {
        return this.montoObjetivo > 0 && this.montoActual >= this.montoObjetivo
    }

    get estadoTexto() {
        if (this.completada) return "Completada"
        return this.activa ? "Activa" : "Pausada"
    }
}
