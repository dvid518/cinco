// Modelo de Posición (por usuario)
export class Posicion {
    constructor(datos) {
        this.id = datos.id || null
        this.activoId = datos.activoId || ''
        this.cantidad = datos.cantidad || 0
        this.divisa = datos.divisa || 'usd'
        this.precioPromedio = datos.precioPromedio || 0
        this.ultimaActualizacion = datos.ultimaActualizacion || new Date()
        this.activo = datos.activo || null // Datos del activo (populate)
    }

    validar() {
        if (!this.activoId) {
            throw new Error('El ID del activo es obligatorio')
        }
        if (this.cantidad < 0) {
            throw new Error('La cantidad no puede ser negativa')
        }
        if (this.precioPromedio < 0) {
            throw new Error('El precio promedio no puede ser negativo')
        }
        return true
    }

    toFirestore() {
        return {
            activoId: this.activoId,
            cantidad: this.cantidad,
            divisa: this.divisa,
            precioPromedio: this.precioPromedio,
            ultimaActualizacion: this.ultimaActualizacion
        }
    }

    static fromFirestore(id, data) {
        return new Posicion({
            id,
            activoId: data.activoId,
            cantidad: data.cantidad || 0,
            divisa: data.divisa || 'usd',
            precioPromedio: data.precioPromedio || 0,
            ultimaActualizacion: data.ultimaActualizacion?.toDate?.() || data.ultimaActualizacion
        })
    }

    // Calcular valor total de la posición
    get valorTotal() {
        if (!this.activo) return 0
        return this.cantidad * this.activo.ultimoPrecio
    }

    // Calcular ganancia/pérdida
    get ganancia() {
        if (!this.activo || this.precioPromedio === 0) return 0
        return (this.activo.ultimoPrecio - this.precioPromedio) * this.cantidad
    }

    // Calcular rendimiento porcentual
    get rendimientoPorcentual() {
        if (this.precioPromedio === 0) return 0
        return ((this.activo?.ultimoPrecio || 0) / this.precioPromedio - 1) * 100
    }

    get tieneGanancia() {
        return this.ganancia > 0
    }

    get tienePerdida() {
        return this.ganancia < 0
    }
}