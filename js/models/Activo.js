// Modelo de Activo (por usuario)
export class Activo {
    constructor(datos) {
        this.id = datos.id || null
        this.nombre = datos.nombre || ""
        this.simbolo = datos.simbolo || ""
        this.tipo = datos.tipo || "accion" // accion, etf, crypto, bono
        this.ultimoPrecio = datos.ultimoPrecio || 0
        this.favorito = datos.favorito !== undefined ? datos.favorito : false
        // Fuente del precio: "manual" | "api" | "broker"
        this.fuente = datos.fuente || "manual"
        // Símbolo usado en la API externa (null si es manual)
        this.apiSimbolo = datos.apiSimbolo !== undefined && datos.apiSimbolo !== null ? datos.apiSimbolo : null
        this.ultimaActualizacion = datos.ultimaActualizacion || new Date()
        this.fechaCreacion = datos.fechaCreacion || new Date()
    }

    validar() {
        if (!this.nombre || this.nombre.trim() === "") {
            throw new Error("El nombre del activo es obligatorio")
        }
        if (!this.simbolo || this.simbolo.trim() === "") {
            throw new Error("El símbolo del activo es obligatorio")
        }
        if (this.ultimoPrecio < 0) {
            throw new Error("El precio no puede ser negativo")
        }
        return true
    }

    toFirestore() {
        return {
            nombre: this.nombre,
            simbolo: this.simbolo.toUpperCase(),
            tipo: this.tipo,
            ultimoPrecio: this.ultimoPrecio,
            favorito: this.favorito,
            fuente: this.fuente,
            apiSimbolo: this.apiSimbolo,
            ultimaActualizacion: this.ultimaActualizacion,
            fechaCreacion: this.fechaCreacion
        }
    }

    static fromFirestore(id, data) {
        return new Activo({
            id,
            nombre: data.nombre,
            simbolo: data.simbolo,
            tipo: data.tipo,
            ultimoPrecio: data.ultimoPrecio || 0,
            favorito: data.favorito === true,
            fuente: data.fuente || "manual",
            apiSimbolo: data.apiSimbolo ?? null,
            ultimaActualizacion: data.ultimaActualizacion?.toDate?.() || data.ultimaActualizacion,
            fechaCreacion: data.fechaCreacion?.toDate?.() || data.fechaCreacion
        })
    }

    get precioFormateado() {
        return this.ultimoPrecio.toFixed(2)
    }

    get simboloUpper() {
        return this.simbolo.toUpperCase()
    }

    get esAutomatico() {
        return this.fuente === "api"
    }
}