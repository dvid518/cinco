// Modelo de Trade
export class Trade {
    constructor(datos) {
        this.id = datos.id || null
        this.activo = datos.activo || ''
        this.cuenta = datos.cuenta || ''
        this.entrada = datos.entrada || 0
        this.salida = datos.salida || null
        this.lotaje = datos.lotaje || 0
        this.sl = datos.sl || null
        this.tp = datos.tp || null
        this.tipo = datos.tipo || 'long' // long | short
        this.estado = datos.estado || 'abierto' // abierto | cerrado
        this.divisa = datos.divisa || 'usd'
        this.nota = datos.nota || ''
        this.fechaRegistro = datos.fechaRegistro || new Date()
        this.fechaCierre = datos.fechaCierre || null
    }

    validar() {
        if (!this.activo || this.activo.trim() === '') {
            throw new Error('El activo es obligatorio')
        }
        if (!this.entrada || this.entrada <= 0) {
            throw new Error('La entrada debe ser mayor a 0')
        }
        if (!this.lotaje || this.lotaje <= 0) {
            throw new Error('El lotaje debe ser mayor a 0')
        }
        if (this.tipo !== 'long' && this.tipo !== 'short') {
            throw new Error('El tipo debe ser long o short')
        }
        return true
    }

    toFirestore() {
        return {
            activo: this.activo,
            cuenta: this.cuenta,
            entrada: this.entrada,
            salida: this.salida,
            lotaje: this.lotaje,
            sl: this.sl,
            tp: this.tp,
            tipo: this.tipo,
            estado: this.estado,
            divisa: this.divisa,
            nota: this.nota,
            fechaCierre: this.fechaCierre
        }
    }

    static fromFirestore(id, data) {
        return new Trade({
            id,
            activo: data.activo,
            cuenta: data.cuenta,
            entrada: data.entrada,
            salida: data.salida,
            lotaje: data.lotaje,
            sl: data.sl,
            tp: data.tp,
            tipo: data.tipo,
            estado: data.estado,
            divisa: data.divisa,
            nota: data.nota,
            fechaRegistro: data.fechaRegistro?.toDate?.() || data.fechaRegistro,
            fechaCierre: data.fechaCierre?.toDate?.() || data.fechaCierre
        })
    }

    // P&L (Profit & Loss)
    get pnl() {
        if (this.estado !== 'cerrado' || !this.salida) return 0
        if (this.tipo === 'long') {
            return (this.salida - this.entrada) * this.lotaje
        } else {
            return (this.entrada - this.salida) * this.lotaje
        }
    }

    // P&L en porcentaje
    get pnlPorcentaje() {
        if (this.estado !== 'cerrado' || !this.salida || this.entrada === 0) return 0
        if (this.tipo === 'long') {
            return ((this.salida - this.entrada) / this.entrada) * 100
        } else {
            return ((this.entrada - this.salida) / this.entrada) * 100
        }
    }

    get esGanancia() {
        return this.pnl > 0
    }

    get esPerdida() {
        return this.pnl < 0
    }

    get estaAbierto() {
        return this.estado === 'abierto'
    }

    get estaCerrado() {
        return this.estado === 'cerrado'
    }

    get tipoIcono() {
        return ''
    }

    get tipoLabel() {
        return this.tipo === 'long' ? 'Largo' : 'Corto'
    }
}