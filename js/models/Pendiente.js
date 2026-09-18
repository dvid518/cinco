// Modelo de Pendiente
export class Pendiente {
    constructor(datos) {
        this.concepto = datos.concepto || ''
        this.tipo = datos.tipo !== undefined ? datos.tipo : true // true = cobrar, false = pagar
        this.monto = datos.monto || 0
        this.divisa = datos.divisa || 'pen'
        this.fechaRegistro = datos.fechaRegistro || new Date()
        this.fechaVencimiento = datos.fechaVencimiento || null
        this.fechaConsolidacion = datos.fechaConsolidacion || null
        this.pendiente = datos.pendiente !== undefined ? datos.pendiente : true
        this.id = datos.id || null
    }

    validar() {
        if (!this.concepto || this.concepto.trim() === '') {
            throw new Error('El concepto es obligatorio')
        }
        if (this.monto <= 0) {
            throw new Error('El monto debe ser mayor a 0')
        }
        if (!this.divisa) {
            throw new Error('La divisa es obligatoria')
        }
        return true
    }

    toFirestore() {
        return {
            concepto: this.concepto,
            tipo: this.tipo,
            monto: this.monto,
            divisa: this.divisa,
            fechaRegistro: this.fechaRegistro,
            fechaVencimiento: this.fechaVencimiento,
            fechaConsolidacion: this.fechaConsolidacion,
            pendiente: this.pendiente
        }
    }

    static fromFirestore(id, data) {
        return new Pendiente({
            id,
            concepto: data.concepto,
            tipo: data.tipo,
            monto: data.monto,
            divisa: data.divisa,
            fechaRegistro: data.fechaRegistro?.toDate?.() || data.fechaRegistro,
            fechaVencimiento: data.fechaVencimiento?.toDate?.() || data.fechaVencimiento,
            fechaConsolidacion: data.fechaConsolidacion?.toDate?.() || data.fechaConsolidacion,
            pendiente: data.pendiente
        })
    }

    get tipoTexto() {
        return this.tipo ? 'Cobrar' : 'Pagar'
    }

    get tipoClase() {
        return this.tipo ? 'cobrar' : 'pagar'
    }

    get estaVencido() {
        if (!this.fechaVencimiento) return false
        const hoy = new Date()
        const vencimiento = new Date(this.fechaVencimiento)
        return vencimiento < hoy
    }

    get estaConsolidado() {
        return !this.pendiente
    }

    get estaPendiente() {
        return this.pendiente
    }

    get diasHastaVencimiento() {
        if (!this.fechaVencimiento) return null
        const hoy = new Date()
        const vencimiento = new Date(this.fechaVencimiento)
        const diff = vencimiento - hoy
        return Math.ceil(diff / (1000 * 60 * 60 * 24))
    }
}