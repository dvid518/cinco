class Sesion {
    constructor() {
        this.usuario = null
        this.cache = new Map()
        this.preferencias = {
            paginas: {
                dashboard: true,
                cuentas: true,
                movimientos: true,
                inversiones: false,
                trading: false,
                configuracion: true
            }
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
                inversiones: false,
                trading: false,
                configuracion: true
            }
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