class Sesion {
    constructor() {
        this.usuario = null
        this.cache = new Map()
        this.preferencias = {
            paginas: {
                dashboard: true,
                cuentas: true,
                movimientos: true,
                inversiones: true,
                trading: true,
                configuracion: true
            },
            seg: {
                inactividadMinutos: 15,
                cerrarAlCerrarPestana: true
            },
            accesibilidad: {
                modalesPersistentes: false,
                doodles: false,
                unClickSeleccion: false,
                resaltarIngresoGasto: true
            },
            tiposMovimiento: {
                cambioDivisa: true,
                compraActivo: false,
                ventaActivo: false,
                pagoTarjeta: false,
                p2pCompra: true,
                p2pVenta: true,
                trade: true
            },
            movimientosRecientes: 5,
            formatoDivisa: "simbolo"
        }
        // Intentar cargar preferencias guardadas al instanciar
        this.recargarPreferencias()
    }

    // ============================================
    // USUARIO
    // ============================================

    setUsuario(usuario) {
        this.usuario = usuario
        try {
            sessionStorage.setItem('escinco_usuario', JSON.stringify(usuario))
        } catch (e) {
            // Ignorar errores de storage
        }
    }

    getUsuario() {
        if (!this.usuario) {
            try {
                const saved = sessionStorage.getItem('escinco_usuario')
                if (saved) {
                    this.usuario = JSON.parse(saved)
                }
            } catch (e) {
                // Ignorar errores de storage
            }
        }
        return this.usuario
    }

    get uid() {
        return this.usuario?.uid || null
    }

    get nombre() {
        return this.usuario?.nombre || null
    }

    // ============================================
    // PREFERENCIAS
    // ============================================

    setPreferencias(preferencias) {
        if (preferencias?.paginas) {
            this.preferencias.paginas = {
                ...this.preferencias.paginas,
                ...preferencias.paginas
            }
        }
        if (preferencias?.divisaPrincipal) {
            this.preferencias.divisaPrincipal = preferencias.divisaPrincipal
        }
        if (preferencias?.tipoCambio) {
            this.preferencias.tipoCambio = preferencias.tipoCambio
        }
        if (preferencias?.tema) {
            this.preferencias.tema = preferencias.tema
        }
        if (preferencias?.seg) {
            this.preferencias.seg = {
                ...this.preferencias.seg,
                ...preferencias.seg
            }
        }
        if (preferencias?.accesibilidad) {
            this.preferencias.accesibilidad = {
                ...this.preferencias.accesibilidad,
                ...preferencias.accesibilidad
            }
        }
        if (preferencias?.tiposMovimiento) {
            this.preferencias.tiposMovimiento = {
                ...this.preferencias.tiposMovimiento,
                ...preferencias.tiposMovimiento
            }
        }
        if (preferencias?.movimientosRecientes !== undefined) {
            this.preferencias.movimientosRecientes = preferencias.movimientosRecientes
        }
        if (preferencias?.formatoDivisa) {
            this.preferencias.formatoDivisa = preferencias.formatoDivisa
        }
        try {
            sessionStorage.setItem('escinco_preferencias', JSON.stringify(this.preferencias))
        } catch (e) {}
    }

    getPreferencias() {
        try {
            const saved = sessionStorage.getItem('escinco_preferencias')
            if (saved) {
                const parsed = JSON.parse(saved)
                this.preferencias = { ...this.preferencias, ...parsed }
            }
        } catch (e) {}
        return this.preferencias
    }

    recargarPreferencias() {
        try {
            const saved = sessionStorage.getItem('escinco_preferencias')
            if (saved) {
                const parsed = JSON.parse(saved)
                this.preferencias = { ...this.preferencias, ...parsed }
                return true
            }
        } catch (e) {
            // Ignorar errores de storage
        }
        return false
    }

    getPaginasVisibles() {
        const prefs = this.getPreferencias()
        return prefs.paginas || {}
    }

    isPaginaVisible(page) {
        const paginas = this.getPaginasVisibles()
        return paginas[page] !== false
    }

    // ============================================
    // CACHE
    // ============================================

    setCache(key, data, maxAge = 30000) {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            maxAge
        })
    }

    getCache(key) {
        const cached = this.cache.get(key)
        if (!cached) return null
        if (Date.now() - cached.timestamp > cached.maxAge) {
            this.cache.delete(key)
            return null
        }
        return cached.data
    }

    clearCache() {
        this.cache.clear()
    }

    // ============================================
    // LIMPIEZA
    // ============================================

    limpiar() {
        this.usuario = null
        this.cache.clear()
        this.preferencias = {
            paginas: {
                dashboard: true,
                cuentas: true,
                movimientos: true,
                inversiones: true,
                trading: true,
                configuracion: true
            },
            seg: {
                inactividadMinutos: 15,
                cerrarAlCerrarPestana: true
            },
            accesibilidad: {
                modalesPersistentes: false,
                doodles: false,
                unClickSeleccion: false,
                resaltarIngresoGasto: true
            },
            tiposMovimiento: {
                cambioDivisa: true,
                compraActivo: false,
                ventaActivo: false,
                pagoTarjeta: false,
                p2pCompra: true,
                p2pVenta: true,
                trade: true
            },
            movimientosRecientes: 5,
            formatoDivisa: "simbolo"
        }
        try {
            sessionStorage.removeItem('escinco_usuario')
            sessionStorage.removeItem('escinco_preferencias')
        } catch (e) {
            // Ignorar errores de storage
        }
    }
}

export const sesion = new Sesion()