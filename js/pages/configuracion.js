import { logout, tienePassword, configurarPassword, cambiarPassword, actualizarNombre } from "../../firebase/auth.js"
import { sesion } from "../core/sesion.js"
import { obtenerPreferencias, actualizarPreferencias } from "../../firebase/firestore.js"
import { abrirModal, cerrarModal } from "../ui/modal.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"
import { VERSION } from "../../constants/version.js"
import { getDivisaPrincipal, getTipoCambio } from "../services/DivisaServicio.js"
import { cambiarTema, nombreModoTema } from "../core/tema.js"
import { icono } from "../core/iconos.js"
import { accionExportar } from "../ui/exportar.js"

let uid = null
let hayCambios = false
let temaActual = "dark"

// Sincroniza el panel de tema cuando el tema cambia desde el lastbar
// (u otra fuente), sin recargar la página.
window.addEventListener("tema-cambiado", (event) => {
    const tema = event.detail?.tema
    if (!tema) return

    temaActual = tema
    document.querySelectorAll("#toggle-tema .toggle-option").forEach(opt => {
        opt.classList.toggle("active", opt.dataset.tema === tema)
    })
})

// ============================================
// RENDER
// ============================================

export function render() {
    return `
        <section id="sidebar">
            <button class="glass act" data-section="apariencia">${icono("palette", 18)}<span>Apariencia</span></button>
            <button class="glass" data-section="moneda">${icono("coins", 18)}<span>Moneda</span></button>
            <button class="glass" data-section="cuenta">${icono("circle-user", 18)}<span>Cuenta</span></button>
            <button class="glass" data-section="datos">${icono("database", 18)}<span>Datos</span></button>
            <button class="glass" data-section="peligrosa">${icono("triangle-alert", 18)}<span>Peligrosa</span></button>
        </section>
        <section id="panel" class="glass">

            <!-- APARIENCIA -->
            <div class="panel-section" id="section-apariencia">
                <h2>Apariencia</h2>

                <div class="config-group">
                    <span class="config-label">Tema</span>
                    <div class="toggle-group" id="toggle-tema">
                        <span class="toggle-option" data-tema="dark">Oscuro</span>
                        <span class="toggle-option" data-tema="light">Claro</span>
                        <span class="toggle-option" data-tema="system">Sistema</span>
                    </div>
                </div>

                <div class="config-group">
                    <span class="config-label">Páginas visibles</span>
                    <p class="config-descripcion">
                        Selecciona qué páginas quieres ver en el menú de navegación.
                    </p>
                    <div class="toggle-row">
                        <span>Cuentas</span>
                        <label class="switch">
                            <input type="checkbox" id="toggle-cuentas" checked disabled>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="toggle-row">
                        <span>Movimientos</span>
                        <label class="switch">
                            <input type="checkbox" id="toggle-movimientos" checked>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="toggle-row">
                        <span>Inversiones</span>
                        <label class="switch">
                            <input type="checkbox" id="toggle-inversiones" checked>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="toggle-row">
                        <span>Trading</span>
                        <label class="switch">
                            <input type="checkbox" id="toggle-trading" checked>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>

                <div class="config-group">
                    <span class="config-label">Lastbar auto-hide</span>
                    <div class="toggle-group" id="toggle-lastbar">
                        <span class="toggle-option" data-lastbar="hide">Ocultar</span>
                        <span class="toggle-option" data-lastbar="show">Siempre visible</span>
                    </div>
                    <span class="config-hint">
                        Ocultar: los botones aparecen al pasar el mouse. Siempre visible: los botones se muestran siempre.
                    </span>
                </div>
            </div>

            <!-- MONEDA -->
            <div class="panel-section hidden-section" id="section-moneda">
                <h2>Moneda</h2>

                <div class="config-group">
                    <span class="config-label">Divisa principal</span>
                    <select class="glass-select" id="divisa-principal">
                        <option value="pen">PEN (S/)</option>
                        <option value="usd">USD ($)</option>
                        <option value="usdt">USDT (₮)</option>
                    </select>
                </div>

                <div class="config-group">
                    <span class="config-label">Tipo de cambio</span>
                    <div class="exchange-rate-inputs">
                        <div class="exchange-input">
                            <label>1 USD =</label>
                            <input type="number" id="tc-pen-usd" class="form-input" step="0.01" min="0.01" placeholder="3.75">
                            <span>PEN</span>
                        </div>
                    </div>
                    <span class="config-hint">1 USDT = 1 USD (siempre)</span>
                </div>
            </div>

            <!-- CUENTA -->
            <div class="panel-section hidden-section" id="section-cuenta">
                <h2>Cuenta</h2>

                <div class="config-group">
                    <span class="config-label">Usuario</span>
                    <input type="text" id="cuenta-nombre" class="form-input" placeholder="Tu nombre" maxlength="50">
                </div>
                <div class="config-group">
                    <span class="config-label">Correo</span>
                    <span class="config-value" id="cuenta-email">—</span>
                </div>

                <div class="config-group">
                    <span class="config-label">Contraseña</span>
                    <button class="glass-btn" id="password-btn">Configurar contraseña</button>
                </div>
                <div class="config-group">
                    <span class="config-label">Sesión</span>
                    <button class="glass-btn danger" id="logout-btn">Cerrar sesión</button>
                </div>
            </div>

            <!-- DATOS -->
            <div class="panel-section hidden-section" id="section-datos">
                <h2>Datos</h2>
                <div class="config-group">
                    <span class="config-label">Exportar respaldo</span>
                    <button class="glass-btn" id="export-dvid">Exportar .dvid</button>
                    <span class="config-hint">Respaldo completo de todos tus datos</span>
                </div>
                <div class="config-group">
                    <span class="config-label">Importar respaldo</span>
                    <button class="glass-btn" id="import-dvid">Importar .dvid</button>
                    <span class="config-hint">Solo archivos .dvid generados por cinco</span>
                </div>
            </div>

            <!-- PELIGROSA -->
            <div class="panel-section hidden-section" id="section-peligrosa">
                <h2>Peligrosa</h2>
                <div class="config-group danger-zone">
                    <span class="config-label danger">Eliminar datos</span>
                    <button class="glass-btn danger" id="delete-data">Eliminar todos los datos</button>
                    <span class="config-hint">Esta acción no se puede deshacer</span>
                </div>
                <div class="config-group danger-zone">
                    <span class="config-label danger">Eliminar cuenta</span>
                    <button class="glass-btn danger" id="delete-account">Eliminar cuenta</button>
                    <span class="config-hint">Se eliminarán todos tus datos permanentemente</span>
                </div>
            </div>

            <!-- FOOTER -->
            <div class="panel-footer">
                <span class="footer-brand">${VERSION.nombre}</span>
                <span class="footer-version">v${VERSION.numero}</span>
                <span class="footer-copy">© ${VERSION.ano} ${VERSION.nombre}</span>
            </div>
        </section>
    `
}

// ============================================
// INIT
// ============================================

export async function init() {
    uid = sesion.uid
    console.log("[INFO] Configuración iniciado para UID:", uid)

    await cargarPreferencias()

    configurarSidebar()
    configurarTema()
    configurarCuenta()
    configurarBotones()
    configurarLastbar()
    configurarDetectorCambios()
}

// ============================================
// SIDEBAR
// ============================================

function configurarSidebar() {
    const botones = document.querySelectorAll("#sidebar button")
    botones.forEach(btn => {
        btn.addEventListener("click", () => {
            botones.forEach(b => b.classList.remove("act"))
            btn.classList.add("act")

            document.querySelectorAll(".panel-section").forEach(s => {
                s.classList.add("hidden-section")
            })

            const section = btn.dataset.section
            const target = document.getElementById(`section-${section}`)
            if (target) target.classList.remove("hidden-section")
        })
    })
}

// ============================================
// TEMA
// ============================================

function configurarTema() {
    const opciones = document.querySelectorAll("#toggle-tema .toggle-option")

    // Marcar la activa según el tema actual
    opciones.forEach(opt => {
        opt.classList.toggle("active", opt.dataset.tema === temaActual)
    })

    opciones.forEach(opt => {
        opt.addEventListener("click", async () => {
            const tema = opt.dataset.tema
            if (tema === temaActual) return

            opciones.forEach(o => o.classList.remove("active"))
            opt.classList.add("active")

            try {
                await cambiarTema(uid, tema)
                temaActual = tema
                mostrarNotificacion("exito", nombreModoTema(tema))
            } catch (error) {
                console.error("Error guardando tema:", error)
                mostrarNotificacion("error", "No se pudo guardar el tema")
            }
        })
    })
}

// ============================================
// CUENTA
// ============================================

function configurarCuenta() {
    const usuario = sesion.getUsuario()
    const nombreInput = document.getElementById("cuenta-nombre")
    const emailEl = document.getElementById("cuenta-email")
    const botonPassword = document.getElementById("password-btn")

    if (nombreInput) {
        nombreInput.value = usuario?.nombre || "Usuario"

        let guardando = false
        nombreInput.addEventListener("change", async () => {
            if (guardando) return
            const nuevo = nombreInput.value.trim()
            if (!nuevo) {
                nombreInput.value = usuario?.nombre || "Usuario"
                return
            }
            if (nuevo === usuario?.nombre) return

            guardando = true
            try {
                await actualizarNombre(nuevo)
                const actualizado = { ...sesion.getUsuario(), nombre: nuevo }
                sesion.setUsuario(actualizado)
                mostrarNotificacion("exito", "Nombre actualizado")
            } catch (error) {
                console.error("Error actualizando nombre:", error)
                nombreInput.value = usuario?.nombre || "Usuario"
                mostrarNotificacion("error", `No se pudo actualizar el nombre: ${error.message}`)
            } finally {
                guardando = false
            }
        })
    }
    if (emailEl) emailEl.textContent = usuario?.email || "—"

    // Cambiar texto del botón según si ya tiene contraseña
    if (botonPassword) {
        botonPassword.textContent = tienePassword()
            ? "Cambiar contraseña"
            : "Configurar contraseña"

        botonPassword.addEventListener("click", () => {
            if (tienePassword()) {
                abrirModalCambiarPassword()
            } else {
                abrirModalConfigurarPassword()
            }
        })
    }
}

// ============================================
// MODAL: CONFIGURAR CONTRASEÑA (primera vez)
// ============================================

function abrirModalConfigurarPassword() {
    const html = `
        <form class="form-movimiento" id="form-config-password">
            <div class="form-group">
                <label for="nueva-password">Nueva contraseña</label>
                <input type="password" id="nueva-password" class="form-input" autocomplete="new-password" required>
                <span class="form-hint">Mínimo 6 caracteres</span>
            </div>
            <div class="form-group">
                <label for="confirmar-password">Confirmar contraseña</label>
                <input type="password" id="confirmar-password" class="form-input" autocomplete="new-password" required>
            </div>
            <div id="password-error" class="modal-message-error" hidden></div>
        </form>
    `

    abrirModal({
        titulo: "Configurar contraseña",
        contenido: html,
        variante: "narrow",
        confirmText: "Guardar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            const nueva = document.getElementById("nueva-password")?.value
            const confirmar = document.getElementById("confirmar-password")?.value
            const errorEl = document.getElementById("password-error")

            if (!nueva || nueva.length < 6) {
                mostrarErrorPassword(errorEl, "La contraseña debe tener al menos 6 caracteres.")
                return false
            }
            if (nueva !== confirmar) {
                mostrarErrorPassword(errorEl, "Las contraseñas no coinciden.")
                return false
            }

            try {
                await configurarPassword(nueva)
                await cerrarSesionConAviso(
                    "Contraseña configurada",
                    "Ya puedes iniciar sesión con tu correo y contraseña."
                )
                return true
            } catch (error) {
                console.error("Error configurando contraseña:", error)
                mostrarErrorPassword(errorEl, mensajeErrorPassword(error))
                return false
            }
        }
    })
}

// ============================================
// MODAL: CAMBIAR CONTRASEÑA (ya tiene)
// ============================================

function abrirModalCambiarPassword() {
    const html = `
        <form class="form-movimiento" id="form-cambiar-password">
            <div class="form-group">
                <label for="actual-password">Contraseña actual</label>
                <input type="password" id="actual-password" class="form-input" autocomplete="current-password" required>
            </div>
            <div class="form-group">
                <label for="nueva-password">Nueva contraseña</label>
                <input type="password" id="nueva-password" class="form-input" autocomplete="new-password" required>
                <span class="form-hint">Mínimo 6 caracteres</span>
            </div>
            <div class="form-group">
                <label for="confirmar-password">Confirmar nueva contraseña</label>
                <input type="password" id="confirmar-password" class="form-input" autocomplete="new-password" required>
            </div>
            <div id="password-error" class="modal-message-error" hidden></div>
        </form>
    `

    abrirModal({
        titulo: "Cambiar contraseña",
        contenido: html,
        variante: "narrow",
        confirmText: "Cambiar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            const actual = document.getElementById("actual-password")?.value
            const nueva = document.getElementById("nueva-password")?.value
            const confirmar = document.getElementById("confirmar-password")?.value
            const errorEl = document.getElementById("password-error")

            if (!actual) {
                mostrarErrorPassword(errorEl, "Introduce tu contraseña actual.")
                return false
            }
            if (!nueva || nueva.length < 6) {
                mostrarErrorPassword(errorEl, "La nueva contraseña debe tener al menos 6 caracteres.")
                return false
            }
            if (nueva !== confirmar) {
                mostrarErrorPassword(errorEl, "Las contraseñas nuevas no coinciden.")
                return false
            }
            if (nueva === actual) {
                mostrarErrorPassword(errorEl, "La nueva contraseña debe ser distinta a la actual.")
                return false
            }

            try {
                await cambiarPassword(actual, nueva)
                await cerrarSesionConAviso(
                    "Contraseña actualizada",
                    "Inicia sesión de nuevo con tu nueva contraseña."
                )
                return true
            } catch (error) {
                console.error("Error cambiando contraseña:", error)
                mostrarErrorPassword(errorEl, mensajeErrorPassword(error))
                return false
            }
        }
    })
}

function mostrarErrorPassword(el, mensaje) {
    if (!el) return
    el.textContent = mensaje
    el.hidden = false
}

function mensajeErrorPassword(error) {
    switch (error.code) {
        case "auth/wrong-password":
        case "auth/invalid-credential":
            return "La contraseña actual es incorrecta."
        case "auth/weak-password":
            return "La contraseña es demasiado débil."
        case "auth/requires-recent-login":
            return "Debes iniciar sesión de nuevo para cambiar la contraseña."
        case "auth/provider-already-linked":
            return "Esta cuenta ya tiene contraseña configurada."
        case "auth/credential-already-in-use":
            return "Ese correo ya está vinculado a otra cuenta."
        default:
            return "No se pudo actualizar la contraseña. Inténtalo de nuevo."
    }
}

// ============================================
// LOGOUT CON AVISO
// ============================================

function cerrarSesionConAviso(titulo, mensaje) {
    return new Promise((resolve) => {
        // Cerrar cualquier modal existente primero
        cerrarModal()

        setTimeout(() => {
            abrirModal({
                titulo,
                contenido: `
                    <div class="modal-message">
                        <p class="modal-message-desc">${mensaje}</p>
                    </div>
                `,
                variante: "narrow",
                confirmText: "Ir al login",
                cerrarAlClickFuera: false,
                cerrarConEsc: false,
                onConfirm: async () => {
                    await logout()
                    window.location.replace("/login")
                    return true
                },
                onCancel: async () => {
                    await logout()
                    window.location.replace("/login")
                    resolve()
                }
            })
        }, 100)
    })
}

// ============================================
// PREFERENCIAS
// ============================================

async function cargarPreferencias() {
    try {
        const prefs = await obtenerPreferencias(uid)

        // Tema
        temaActual = prefs?.tema || "dark"

        // Páginas
        if (prefs?.paginas) {
            document.getElementById("toggle-movimientos").checked = prefs.paginas.movimientos !== false
            document.getElementById("toggle-inversiones").checked = prefs.paginas.inversiones !== false
            document.getElementById("toggle-trading").checked = prefs.paginas.trading !== false
        }

        actualizarEstadoGuardar()
    } catch (error) {
        console.error("Error cargando preferencias:", error)
    }

    // Divisa
    const divisaSelect = document.getElementById("divisa-principal")
    if (divisaSelect) divisaSelect.value = getDivisaPrincipal()

    // Tipo de cambio
    const tcUSD = document.getElementById("tc-pen-usd")
    if (tcUSD) {
        const tc = getTipoCambio()
        tcUSD.value = tc.pen_usd || 3.75
    }
}

function configurarDetectorCambios() {
    const ids = [
        "toggle-movimientos",
        "toggle-inversiones",
        "toggle-trading",
        "divisa-principal",
        "tc-pen-usd"
    ]

    ids.forEach(id => {
        const el = document.getElementById(id)
        if (el) {
            el.addEventListener("change", () => {
                hayCambios = true
                actualizarEstadoGuardar()
            })
        }
    })
}

// ============================================
// LASTRAR · ACCIONES EXPORTADAS (delegación en lastbar.js)
// ============================================

export function guardarDesdeLastbar() {
    if (hayCambios) {
        guardarPreferencias()
    }
}

// ============================================
// ESTADO DEL BOTÓN GUARDAR
// ============================================
// Solo .desact (sin colores especiales ni clase .activo)

function actualizarEstadoGuardar() {
    const guardarItem = document.querySelector('.lastbar .item[data-accion="guardar"]')
    if (guardarItem) {
        guardarItem.classList.toggle("desact", !hayCambios)
    }
}

async function guardarPreferencias() {
    const divisaPrincipal = document.getElementById("divisa-principal")?.value || "pen"
    const penUSD = parseFloat(document.getElementById("tc-pen-usd")?.value) || 3.75

    const preferencias = {
        tema: temaActual,
        paginas: {
            dashboard: true,
            cuentas: true,
            movimientos: document.getElementById("toggle-movimientos").checked,
            inversiones: document.getElementById("toggle-inversiones").checked,
            trading: document.getElementById("toggle-trading").checked,
            configuracion: true
        },
        divisaPrincipal,
        tipoCambio: {
            pen_usd: penUSD,
            modo: "manual",
            actualizacion: new Date().toISOString()
        }
    }

    try {
        await actualizarPreferencias(uid, preferencias)
        sesion.setPreferencias(preferencias)

        actualizarNavegacion(preferencias.paginas)

        hayCambios = false
        actualizarEstadoGuardar()

        mostrarNotificacion("exito", "Preferencias guardadas")
    } catch (error) {
        console.error("Error guardando preferencias:", error)
        mostrarNotificacion("error", "No se pudieron guardar las preferencias")
    }
}

function actualizarNavegacion(paginas) {
    document.querySelectorAll(".nav-container a").forEach(link => {
        const page = link.dataset.page
        if (page && paginas[page] === false) {
            link.classList.add("nav-oculto")
        } else {
            link.classList.remove("nav-oculto")
        }
    })
}

// ============================================
// LASTRAR · AUTO-HIDE
// ============================================

function configurarLastbar() {
    const modo = localStorage.getItem("cinco_lastbar_mode") || "hide"
    const opciones = document.querySelectorAll("#toggle-lastbar .toggle-option")

    opciones.forEach(opt => {
        opt.classList.toggle("active", opt.dataset.lastbar === modo)
    })

    aplicarModoLastbar(modo)

    opciones.forEach(opt => {
        opt.addEventListener("click", () => {
            opciones.forEach(o => o.classList.remove("active"))
            opt.classList.add("active")

            const nuevoModo = opt.dataset.lastbar
            localStorage.setItem("cinco_lastbar_mode", nuevoModo)
            aplicarModoLastbar(nuevoModo)
        })
    })
}

function aplicarModoLastbar(modo) {
    const lastbar = document.querySelector(".lastbar")
    if (!lastbar) return

    lastbar.classList.toggle("lastbar-always-visible", modo === "show")
}

// ============================================
// BOTONES · LOGOUT, EXPORT, IMPORT, DELETE
// ============================================

function configurarBotones() {
    document.getElementById("logout-btn")?.addEventListener("click", abrirModalLogout)
    document.getElementById("export-dvid")?.addEventListener("click", exportarDVID)
    document.getElementById("import-dvid")?.addEventListener("click", importarDVID)
    document.getElementById("delete-data")?.addEventListener("click", eliminarTodosLosDatos)
    document.getElementById("delete-account")?.addEventListener("click", abrirModalEliminarCuenta)
}

export function abrirModalLogout() {
    abrirModal({
        titulo: "Cerrar sesión",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    ¿Estás seguro de que quieres cerrar sesión?
                </p>
            </div>
        `,
        variante: "confirm",
        confirmText: "Cerrar sesión",
        cancelText: "Cancelar",
        onConfirm: async () => {
            await logout()
            window.location.replace("/login")
            return true
        }
    })
}

// ============================================
// EXPORTAR (reutiliza js/ui/exportar.js)
// ============================================

async function exportarDVID() {
    await accionExportar()
}

// ============================================
// IMPORTAR
// ============================================

async function importarDVID() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".dvid,application/x-cinco-backup"

    input.onchange = async (e) => {
        const archivo = e.target.files[0]
        if (!archivo) return

        try {
            const { previsualizarImportacion } = await import("../services/ImportarServicio.js")
            const preview = await previsualizarImportacion(archivo)

            abrirModalPreviewImportacion(archivo, preview)
        } catch (error) {
            console.error("Error previsualizando:", error)
            abrirModal({
                titulo: "Archivo inválido",
                contenido: `
                    <div class="modal-message">
                        <p class="modal-message-error">${error.message}</p>
                        <p class="modal-message-desc">
                            Asegúrate de que sea un archivo .dvid generado por cinco.
                        </p>
                    </div>
                `,
                variante: "info",
                confirmText: "Cerrar",
                onConfirm: () => true
            })
        }
    }

    input.click()
}

function abrirModalPreviewImportacion(archivo, preview) {
    abrirModal({
        titulo: "Previsualización",
        contenido: `
            <div class="modal-preview">
                <div class="preview-row">
                    <span class="preview-label">Formato</span>
                    <span class="preview-value">${preview.formato} v${preview.version}</span>
                </div>
                <div class="preview-row">
                    <span class="preview-label">Exportado</span>
                    <span class="preview-value">${new Date(preview.fechaExportacion).toLocaleString()}</span>
                </div>

                <div class="preview-content">
                    <div class="preview-content-title">CONTENIDO</div>
                    <div class="preview-item">
                        <span>Cuentas</span>
                        <span class="preview-number">${preview.resumen.cuentas}</span>
                    </div>
                    <div class="preview-item">
                        <span>Movimientos</span>
                        <span class="preview-number">${preview.resumen.movimientos}</span>
                    </div>
                    <div class="preview-item">
                        <span>Activos</span>
                        <span class="preview-number">${preview.resumen.activos}</span>
                    </div>
                    <div class="preview-item">
                        <span>Pendientes</span>
                        <span class="preview-number">${preview.resumen.pendientes}</span>
                    </div>
                    <div class="preview-item">
                        <span>Snapshots</span>
                        <span class="preview-number">${preview.resumen.snapshots}</span>
                    </div>
                </div>

                <div class="modal-warning">
                    Los datos se <strong>agregarán</strong> a los existentes. No se eliminará nada.
                </div>
            </div>
        `,
        variante: "form",
        confirmText: "Importar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            cerrarModal()

            setTimeout(() => {
                abrirModal({
                    titulo: "Importando...",
                    contenido: `
                        <div class="modal-loading">
                            <div class="loading-spinner"></div>
                            <p class="modal-loading-text">Importando datos...</p>
                        </div>
                    `,
                    variante: "narrow",
                    confirmText: null,
                    cancelText: null
                })
            }, 100)

            try {
                const { importarDVID: importar } = await import("../services/ImportarServicio.js")
                const resultado = await importar(uid, archivo)

                cerrarModal()

                setTimeout(() => {
                    abrirModal({
                        titulo: "Importación completada",
                        contenido: plantillaResultadoImportacion(resultado),
                        variante: "info",
                        confirmText: "Recargar",
                        onConfirm: () => {
                            window.location.reload()
                            return true
                        }
                    })
                }, 100)
            } catch (error) {
                console.error("Error importando:", error)
                cerrarModal()
                setTimeout(() => {
                    abrirModal({
                        titulo: "Error al importar",
                        contenido: `
                            <div class="modal-message">
                                <p class="modal-message-error">${error.message}</p>
                            </div>
                        `,
                        variante: "info",
                        confirmText: "Cerrar",
                        onConfirm: () => true
                    })
                }, 100)
            }

            return false
        }
    })
}

function plantillaResultadoImportacion(resultado) {
    const errores = resultado.errores?.length || 0
    return `
        <div class="modal-message">
            <div class="modal-resultado">
                <div class="preview-item">
                    <span>Cuentas</span>
                    <span class="preview-number">${resultado.cuentas}</span>
                </div>
                <div class="preview-item">
                    <span>Movimientos</span>
                    <span class="preview-number">${resultado.movimientos}</span>
                </div>
                <div class="preview-item">
                    <span>Activos</span>
                    <span class="preview-number">${resultado.activos}</span>
                </div>
                <div class="preview-item">
                    <span>Pendientes</span>
                    <span class="preview-number">${resultado.pendientes}</span>
                </div>
                <div class="preview-item">
                    <span>Snapshots</span>
                    <span class="preview-number">${resultado.snapshots}</span>
                </div>
            </div>
            ${errores > 0 ? `
                <p class="modal-message-warning">
                    ${errores} errores menores
                </p>
            ` : ""}
        </div>
    `
}

// ============================================
// ELIMINAR DATOS
// ============================================

function eliminarTodosLosDatos() {
    abrirModal({
        titulo: "Eliminar todos los datos",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-title-danger">¿Estás seguro?</p>
                <p class="modal-message-desc">Se eliminarán <strong>todos</strong> tus datos de cinco:</p>
                <div class="modal-list">
                    • Cuentas<br>
                    • Movimientos<br>
                    • Inversiones<br>
                    • Pendientes<br>
                    • Snapshots<br>
                    • Trades
                </div>
                <p class="modal-message-error">Esta acción no se puede deshacer.</p>
            </div>
        `,
        variante: "confirm",
        confirmText: "Continuar",
        cancelText: "Cancelar",
        onConfirm: () => {
            cerrarModal()
            setTimeout(confirmarEliminacionFinal, 100)
            return false
        }
    })
}

function confirmarEliminacionFinal() {
    abrirModal({
        titulo: "Confirmación final",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-title-danger">Última oportunidad</p>
                <p class="modal-message-desc">
                    Para confirmar, escribe <strong class="text-danger">ELIMINAR</strong> a continuación:
                </p>
                <input type="text" id="confirmar-eliminar"
                       class="form-input modal-input-confirm"
                       placeholder="Escribe ELIMINAR"
                       autocomplete="off">
            </div>
        `,
        variante: "confirm",
        confirmText: "Eliminar todo",
        cancelText: "Cancelar",
        onConfirm: async () => {
            const input = document.getElementById("confirmar-eliminar")
            const valor = input?.value.trim().toUpperCase()

            if (valor !== "ELIMINAR") {
                input.classList.add("input-error")
                input.focus()
                return false
            }

            cerrarModal()
            await new Promise(resolve => setTimeout(resolve, 100))

            abrirModal({
                titulo: "Eliminando datos",
                contenido: `
                    <div class="modal-loading">
                        <div class="loading-spinner"></div>
                        <p class="modal-loading-text" id="eliminar-status">Descargando respaldo...</p>
                    </div>
                `,
                variante: "narrow",
                confirmText: null,
                cancelText: null
            })

            try {
                const status = document.getElementById("eliminar-status")

                const { exportarDVID } = await import("../services/ExportarServicio.js")
                await exportarDVID(uid)

                if (status) status.textContent = "Eliminando datos..."

                const { eliminarTodosLosDatos: eliminar } = await import("../services/EliminarServicio.js")
                const resultado = await eliminar(uid)

                cerrarModal()
                await new Promise(resolve => setTimeout(resolve, 100))

                const total = Object.values(resultado).reduce((a, b) => a + b, 0)

                abrirModal({
                    titulo: "Datos eliminados",
                    contenido: `
                        <div class="modal-message">
                            <p class="modal-message-desc">Todos los datos han sido eliminados.</p>
                            <div class="modal-resultado">
                                <div class="preview-item">
                                    <span>Total eliminados</span>
                                    <span class="preview-number">${total}</span>
                                </div>
                            </div>
                        </div>
                    `,
                    variante: "info",
                    confirmText: "Recargar",
                    onConfirm: () => {
                        window.location.reload()
                        return true
                    }
                })
            } catch (error) {
                console.error("Error eliminando:", error)
                cerrarModal()
                await new Promise(resolve => setTimeout(resolve, 100))

                abrirModal({
                    titulo: "Error al eliminar",
                    contenido: `
                        <div class="modal-message">
                            <p class="modal-message-error">${error.message}</p>
                        </div>
                    `,
                    variante: "info",
                    confirmText: "Cerrar",
                    onConfirm: () => true
                })
            }

            return false
        }
    })
}

// ============================================
// ELIMINAR CUENTA
// ============================================

function abrirModalEliminarCuenta() {
    abrirModal({
        titulo: "Eliminar cuenta",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-title-danger">¿Estás seguro?</p>
                <p class="modal-message-desc">
                    Se eliminará tu cuenta y todos tus datos permanentemente.
                </p>
                <p class="modal-message-warning">
                    Esta función aún está en desarrollo y se activará próximamente.
                </p>
            </div>
        `,
        variante: "confirm",
        confirmText: "Eliminar cuenta",
        cancelText: "Cancelar",
        onConfirm: () => {
            mostrarNotificacion("info", "La eliminación de cuenta estará disponible pronto")
            return false
        }
    })
}