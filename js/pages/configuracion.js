import { logout, tienePassword, configurarPassword, cambiarPasswordVerificada, actualizarNombre, reautenticarConPassword, reautenticarConGoogle, esSesionReciente, aplicarPersistenciaSesion, startInactivityTimer } from "../../firebase/auth.js"
import { sesion } from "../core/sesion.js"
import { obtenerPreferencias, actualizarPreferencias } from "../../firebase/firestore.js"
import { abrirModal, cerrarModal } from "../ui/modal.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"
import { VERSION } from "../../constants/version.js"
import { TIPO_CAMBIO_DEFAULT } from "../../constants/divisas.js"
import { getDivisaPrincipal, getTipoCambio, getFormatoDivisa, actualizarTipoCambioAuto, guardarDivisaPrincipal, guardarTipoCambio } from "../services/DivisaServicio.js"
import { aplicarTema, setTemaLocal } from "../core/tema.js"
import { icono, LOGO_ESCINCO_CARGA } from "../core/iconos.js"
import { accionExportar } from "../ui/exportar.js"
import { envolverSidebar } from "../ui/colapsoSidebar.js"
import { skeletonMarkup, skeletonText } from "../ui/skeletons.js"

let uid = null
let hayCambios = false
let temaActual = "dark"
let lastbarModo = "hide"
let nombrePendiente = null
let temaPendiente = false
let lastbarPendiente = false

const CANTIDAD_MOVIMIENTOS_DEFAULT = 5

function normalizarNivelResalte(valor) {
    const nivel = Number(valor)
    return [0, 1, 2].includes(nivel) ? nivel : 0
}

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
        ${envolverSidebar(`
            <section id="sidebar">
            <button class="glass act" data-section="cuenta">${icono("circle-user", 18)}<span>Cuenta</span></button>
                <button class="glass" data-section="apariencia">${icono("palette", 18)}<span>Apariencia</span></button>
                <button class="glass" data-section="moneda">${icono("coins", 18)}<span>Moneda</span></button>
                <button class="glass" data-section="seguridad">${icono("shield", 18)}<span>Seguridad</span></button>
                <button class="glass" data-section="accesibilidad">${icono("accessibility", 18)}<span>Accesibilidad</span></button>
                <button class="glass" data-section="datos">${icono("database", 18)}<span>Datos</span></button>
            </section>
        `)}
        <section id="panel" class="glass" aria-busy="true">
            <div id="configuracion-cargando">
                ${skeletonMarkup({ variant: "settings", rows: 6 })}
            </div>
            <div id="configuracion-contenido" class="configuracion-cargando" hidden>

            <!-- APARIENCIA -->
            <div class="panel-section hidden-section" id="section-apariencia">

                <div class="config-group">
                    <span class="config-label">Tema</span>
                    <div class="toggle-group" id="toggle-tema">
                        <span class="toggle-option" data-tema="dark">Oscuro</span>
                        <span class="toggle-option" data-tema="light">Claro</span>
                        <span class="toggle-option" data-tema="system">Sistema</span>
                    </div>
                </div>

                <div class="config-group">
                    <span class="config-label">Resaltar patrimonio</span>
                    <div class="toggle-group" id="resaltar-patrimonio">
                        <span class="toggle-option active" data-nivel="0">0</span>
                        <span class="toggle-option" data-nivel="1">1</span>
                        <span class="toggle-option" data-nivel="2">2</span>
                    </div>
                    <span class="config-hint">0 sin resalte · 1 resalte tenue · 2 resalte intenso</span>
                </div>

                <div class="config-group">
                    <span class="config-label visible-pages">Páginas visibles</span>
                    <div class="pages-toggle-group">
                        <div class="toggle-row">
                            <span>Dashboard</span>
                            <label class="switch">
                                <input type="checkbox" id="toggle-dashboard" checked>
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
                </div>

                <div class="config-group">
                    <span class="config-label">Últimos movimientos en el dashboard</span>
                    <div class="toggle-group" id="movimientos-recientes" role="group" aria-label="Cantidad de últimos movimientos en el dashboard">
                        ${[2, 3, 4, 5].map(cantidad => `
                            <span class="toggle-option${cantidad === CANTIDAD_MOVIMIENTOS_DEFAULT ? " active" : ""}" data-cantidad="${cantidad}">${cantidad}</span>
                        `).join("")}
                    </div>
                    <span class="config-hint">
                        Cantidad de movimientos a mostrar en la tarjeta
                        "Últimos movimientos" del dashboard.
                    </span>
                </div>

                <div class="config-group">
                    <span class="config-label">Tipos de movimiento en el selector</span>
                    <div class="pages-toggle-group">
                        <div class="toggle-row">
                            <span>Cambio de divisa</span>
                            <label class="switch">
                                <input type="checkbox" id="toggle-tipo-cambio-divisa" checked>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="toggle-row">
                            <span>Compra de activo</span>
                            <label class="switch">
                                <input type="checkbox" id="toggle-tipo-compra-activo">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="toggle-row">
                            <span>Venta de activo</span>
                            <label class="switch">
                                <input type="checkbox" id="toggle-tipo-venta-activo">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="toggle-row">
                            <span>Pago de tarjeta</span>
                            <label class="switch">
                                <input type="checkbox" id="toggle-tipo-pago-tarjeta">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="toggle-row">
                            <span>Compra P2P</span>
                            <label class="switch">
                                <input type="checkbox" id="toggle-tipo-p2p-compra" checked>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="toggle-row">
                            <span>Venta P2P</span>
                            <label class="switch">
                                <input type="checkbox" id="toggle-tipo-p2p-venta" checked>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="toggle-row">
                            <span>Trade</span>
                            <label class="switch">
                                <input type="checkbox" id="toggle-tipo-trade" checked>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    <span class="config-hint">
                        Qué tipos se ofrecen al crear un movimiento nuevo. Compra/venta de activo y pago de
                        tarjeta solo se registran desde sus propias páginas salvo que los actives aquí.
                    </span>
                </div>

                </div>

            <!-- MONEDA -->
            <div class="panel-section hidden-section" id="section-moneda">

                <div class="config-group">
                    <span class="config-label">Divisa principal</span>
                    <select class="select" id="divisa-principal">
                        <option value="pen">PEN (S/)</option>
                        <option value="usd">USD ($)</option>
                        <option value="usdt">USDT (₮)</option>
                    </select>
                </div>

                <div class="config-group">
                    <span class="config-label">Formato de divisa</span>
                    <div class="toggle-group" id="formato-divisa">
                        <span class="toggle-option active" data-formato="simbolo">Símbolo ($)</span>
                        <span class="toggle-option" data-formato="codigo">Código (USD)</span>
                    </div>
                </div>

                <div class="config-group">
                    <span class="config-label">Periodo de evolución patrimonial</span>
                    <div class="toggle-group" id="periodo-evolucion">
                        <span class="toggle-option" data-periodo="7d">7D</span>
                        <span class="toggle-option" data-periodo="30d">30D</span>
                        <span class="toggle-option" data-periodo="90d">90D</span>
                        <span class="toggle-option" data-periodo="1a">1A</span>
                        <span class="toggle-option" data-periodo="todo">Todo</span>
                    </div>
                </div>

                <div class="config-group">
                    <span class="config-label">Tipo de cambio</span>

                    <div class="toggle-group" id="tc-modo">
                        <span class="toggle-option" data-modo="manual">Manual</span>
                        <span class="toggle-option" data-modo="auto">Automático</span>
                    </div>

                    <div class="exchange-rate-inputs" id="tc-input-manual" hidden>
                        <div class="exchange-input">
                            <label>1 USD =</label>
                            <input type="number" id="tc-pen-usd" class="form-input" step="0.01" min="0.01" placeholder="${TIPO_CAMBIO_DEFAULT.pen_usd}">
                            <span>PEN</span>
                        </div>
                    </div>

                    <div class="tc-auto-box" id="tc-input-auto" hidden>
                        <div class="exchange-notes">
                            <p class="exchange-note" id="tc-valor-auto"></p>
                            <p class="exchange-note" id="tc-fecha-auto"></p>
                        </div>
                        <div class="tc-auto-actions">
                            <button class="glass-btn" id="tc-actualizar-btn">
                                <span class="tc-btn-text">Actualizar ahora</span>
                            </button>
                            <span class="tc-status" id="tc-status" hidden></span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- CUENTA -->
            <div class="panel-section" id="section-cuenta">

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
                <div class="config-group danger-zone">
                    <span class="config-label danger">Eliminar cuenta</span>
                    <button class="glass-btn danger" id="delete-account">Eliminar cuenta</button>
                    <span class="config-hint">Se eliminarán todos tus datos permanentemente</span>
                </div>
            </div>

            <!-- SEGURIDAD -->
            <div class="panel-section hidden-section" id="section-seguridad">

                <div class="config-group">
                    <span class="config-label">Cerrar sesión por inactividad</span>
                    <select class="select" id="seg-inactividad">
                        <option value="5">5 minutos</option>
                        <option value="15">15 minutos</option>
                        <option value="30">30 minutos</option>
                        <option value="60">1 hora</option>
                        <option value="0">Nunca</option>
                    </select>
                    <span class="config-hint">
                        Si no hay actividad durante este tiempo, la sesión se cierra automáticamente.
                        Con "Nunca", la sesión permanece abierta hasta que la cierres manualmente.
                    </span>
                </div>

                <div class="config-group">
                    <span class="config-label">Sesión en el navegador</span>
                    <div class="pages-toggle-group">
                        <div class="toggle-row">
                            <span>Cerrar sesión al cerrar la pestaña</span>
                            <label class="switch">
                                <input type="checkbox" id="seg-cerrar-pestana" checked>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    <span class="config-hint">
                        Activado: la sesión se cierra al cerrar la pestaña o ventana (más seguro).
                        Desactivado: la sesión se mantiene hasta que cierres sesión manualmente.
                    </span>
                </div>

                <div class="config-group">
                    <span class="config-label">Operaciones sensibles</span>
                    <span class="config-hint">
                        Eliminar la cuenta, eliminar todos los datos y cambiar la contraseña piden
                        confirmar tu identidad si la sesión tiene más de 5 minutos.
                    </span>
                </div>
            </div>

            <!-- ACCESIBILIDAD -->
            <div class="panel-section hidden-section" id="section-accesibilidad">

                <div class="config-group">
                    <span class="config-label">Modales persistentes</span>
                    <div class="pages-toggle-group">
                        <div class="toggle-row">
                            <span>Habilitar ventanas de modales que no bloquean la app</span>
                            <label class="switch">
                                <input type="checkbox" id="acc-modales-persistentes">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    <span class="config-hint">
                        Desactiva el overlay oscuro de los modales: podrás seguir usando la aplicación
                        mientras están abiertos y abrir varios a la vez, como ventanas.
                    </span>
                </div>

                <div class="config-group">
                    <span class="config-label">Habilitar escinco doodles</span>
                    <div class="pages-toggle-group">
                        <div class="toggle-row">
                            <span>Habilitar doodles</span>
                            <label class="switch">
                                <input type="checkbox" id="acc-doodles">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="config-group">
                    <span class="config-label">Un click para seleccionar</span>
                    <div class="pages-toggle-group">
                        <div class="toggle-row">
                            <span>Seleccionar con un click</span>
                            <label class="switch">
                                <input type="checkbox" id="acc-un-click-seleccion">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    <span class="config-hint">
                        Con la opción activa, el doble click abre el detalle del movimiento en lugar de
                        seleccionarlo. Desactivada, el click abre el detalle como siempre. En móvil se
                        mantiene desactivada por defecto.
                    </span>
                </div>

                <div class="config-group">
                    <span class="config-label">Lateralidad de la información de cuenta</span>
                    <div class="toggle-group toggle-lateralidad-cuenta" id="toggle-lateralidad-cuenta">
                        <span class="toggle-option" data-lateralidad="izquierda">Izquierda</span>
                        <span class="toggle-option active" data-lateralidad="derecha">Derecha</span>
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

                <div class="config-group">
                    <span class="config-label">Resaltar ingreso y gasto</span>
                    <div class="pages-toggle-group">
                        <div class="toggle-row">
                            <span>Mostrar Ingreso y Gasto resaltados en el selector</span>
                            <label class="switch">
                                <input type="checkbox" id="acc-resaltar-ingreso-gasto" checked>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    <span class="config-hint">
                        Con la opción activa, Ingreso y Gasto se muestran como botones destacados en el
                        selector de movimientos. Desactivada, se ven como los demás tipos.
                    </span>
                </div>
            </div>

            <!-- DATOS -->
            <div class="panel-section hidden-section" id="section-datos">
                <div class="config-group">
                    <span class="config-label">Exportar respaldo</span>
                    <button class="glass-btn" id="export-dvid">Exportar .dvid</button>
                    <span class="config-hint">Respaldo completo de todos tus datos</span>
                </div>
                <div class="config-group">
                    <span class="config-label">Importar respaldo</span>
                    <button class="glass-btn" id="import-dvid">Importar .dvid</button>
                    <span class="config-hint">Solo archivos .dvid generados por escinco</span>
                </div>
                <div class="config-group danger-zone">
                    <span class="config-label danger">Eliminar datos</span>
                    <button class="glass-btn danger" id="delete-data">Eliminar todos los datos</button>
                    <span class="config-hint">Esta acción no se puede deshacer</span>
                </div>
            </div>

            <!-- FOOTER -->
            <div class="panel-footer">
                <span class="footer-brand">${VERSION.nombre}</span>
                <span class="footer-version">v${VERSION.numero}</span>
                <span class="footer-copy">© ${VERSION.ano} ${VERSION.nombre}</span>
            </div>
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
    document.getElementById("configuracion-cargando")?.remove()
    document.getElementById("configuracion-contenido")?.removeAttribute("hidden")
    document.getElementById("panel")?.removeAttribute("aria-busy")

    configurarSidebar()
    configurarTema()
    configurarCuenta()
    configurarBotones()
    configurarLastbar()
    configurarDetectorCambios()
    configurarTipoCambio()
    configurarFormatoDivisa()
    configurarLateralidadCuenta()
    configurarPeriodoEvolucion()
    configurarResaltarPatrimonio()
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
        opt.addEventListener("click", () => {
            const tema = opt.dataset.tema
            if (tema === temaActual) return

            opciones.forEach(o => o.classList.remove("active"))
            opt.classList.add("active")

            // Aplicar visualmente sin persistir (se guarda con el botón Guardar)
            temaActual = tema
            temaPendiente = true
            marcarCambioNuevo()
            aplicarTema(tema)
            window.dispatchEvent(new CustomEvent("tema-cambiado", { detail: { tema } }))

            actualizarEstadoGuardar()
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

        nombreInput.addEventListener("input", () => {
            const base = (usuario?.nombre || "Usuario").trim()
            const nuevo = nombreInput.value.trim()

            if (!nuevo) {
                nombreInput.value = usuario?.nombre || "Usuario"
            } else if (nuevo !== base) {
                nombrePendiente = nuevo
                marcarCambioNuevo()
            } else {
                nombrePendiente = null
            }

            actualizarEstadoGuardar()
        })
    }
    if (emailEl) emailEl.textContent = usuario?.email || "—"

    // Cambiar texto del botón según si ya tiene contraseña
    if (botonPassword) {
        botonPassword.textContent = tienePassword()
            ? "Cambiar contraseña"
            : "Configurar contraseña"

        botonPassword.addEventListener("click", () => {
            if (!tienePassword()) {
                abrirModalConfigurarPassword()
                return
            }

            // Operación sensible: si la sesión es vieja, se pide reautenticación
            // antes de abrir el modal de cambio de contraseña.
            conReautenticacion(() => abrirModalCambiarPassword())
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
            const nueva = document.getElementById("nueva-password")?.value
            const confirmar = document.getElementById("confirmar-password")?.value
            const errorEl = document.getElementById("password-error")

            if (!nueva || nueva.length < 6) {
                mostrarErrorPassword(errorEl, "La nueva contraseña debe tener al menos 6 caracteres.")
                return false
            }
            if (nueva !== confirmar) {
                mostrarErrorPassword(errorEl, "Las contraseñas nuevas no coinciden.")
                return false
            }

            try {
                await cambiarPasswordVerificada(nueva)
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

// Ajusta un valor de "cantidad de últimos movimientos" a 2-5 (por defecto 5).
function validarCantidadMovimientos(valor) {
    const n = Number.parseInt(valor, 10)
    if (!Number.isFinite(n)) return CANTIDAD_MOVIMIENTOS_DEFAULT
    return Math.min(5, Math.max(2, n))
}

function leerCantidadMovimientos() {
    const activo = document.querySelector("#movimientos-recientes .toggle-option.active")
    const n = Number.parseInt(activo?.dataset.cantidad, 10)
    return Number.isFinite(n) ? validarCantidadMovimientos(n) : null
}

async function cargarPreferencias() {
    try {
        const prefs = await obtenerPreferencias(uid)

        // Tema
        temaActual = prefs?.tema || "dark"

        // Últimos movimientos en el dashboard
        const cantidadMovimientos = validarCantidadMovimientos(prefs?.movimientosRecientes)
        document.querySelectorAll("#movimientos-recientes .toggle-option").forEach(opcion => {
            opcion.classList.toggle("active", Number(opcion.dataset.cantidad) === cantidadMovimientos)
        })

        // Páginas: los guardados del servidor tienen prioridad; si no hay,
        // se usan los valores por defecto de la sesión (cuentas nuevas).
        const paginas = prefs?.paginas || sesion.getPaginasVisibles() || {}
        document.getElementById("toggle-dashboard").checked = paginas.dashboard !== false
        document.getElementById("toggle-movimientos").checked = paginas.movimientos !== false
        document.getElementById("toggle-inversiones").checked = paginas.inversiones !== false
        document.getElementById("toggle-trading").checked = paginas.trading !== false

        // Seguridad
        const seg = prefs?.seg || sesion.getPreferencias().seg || {}
        const segInactividad = document.getElementById("seg-inactividad")
        if (segInactividad) {
            segInactividad.value = String(seg.inactividadMinutos ?? 15)
        }
        const segCerrarPestana = document.getElementById("seg-cerrar-pestana")
        if (segCerrarPestana) {
            segCerrarPestana.checked = seg.cerrarAlCerrarPestana !== false
        }

        // Accesibilidad
        const acc = prefs?.accesibilidad || {}
        const modalesPersistentes = document.getElementById("acc-modales-persistentes")
        if (modalesPersistentes) {
            modalesPersistentes.checked = acc.modalesPersistentes === true
        }
        const accDoodles = document.getElementById("acc-doodles")
        if (accDoodles) {
            accDoodles.checked = acc.doodles === true
        }
        const accUnClick = document.getElementById("acc-un-click-seleccion")
        const esMovil = window.matchMedia("(max-width: 760px)").matches
        if (accUnClick) {
            accUnClick.checked = !esMovil && acc.unClickSeleccion === true
            accUnClick.disabled = esMovil
        }
        const lateralidad = acc.lateralidadCuentaInfo === "izquierda" ? "izquierda" : "derecha"
        document.querySelectorAll("#toggle-lateralidad-cuenta .toggle-option").forEach(opcion => {
            opcion.classList.toggle("active", opcion.dataset.lateralidad === lateralidad)
        })
        const accResaltar = document.getElementById("acc-resaltar-ingreso-gasto")
        if (accResaltar) {
            accResaltar.checked = acc.resaltarIngresoGasto !== false
        }

        // Tipos de movimiento en el selector (Apariencia)
        const tipos = prefs?.tiposMovimiento || {}
        const marcarTipo = (id, valor) => {
            const el = document.getElementById(id)
            if (el) el.checked = valor !== false
        }
        marcarTipo("toggle-tipo-cambio-divisa", tipos.cambioDivisa)
        marcarTipo("toggle-tipo-compra-activo", tipos.compraActivo)
        marcarTipo("toggle-tipo-venta-activo", tipos.ventaActivo)
        marcarTipo("toggle-tipo-pago-tarjeta", tipos.pagoTarjeta)
        marcarTipo("toggle-tipo-p2p-compra", tipos.p2pCompra)
        marcarTipo("toggle-tipo-p2p-venta", tipos.p2pVenta)
        marcarTipo("toggle-tipo-trade", tipos.trade)

        const periodoEvolucion = prefs?.periodoEvolucion || "30d"
        document.querySelectorAll("#periodo-evolucion .toggle-option").forEach(opcion => {
            opcion.classList.toggle("active", opcion.dataset.periodo === periodoEvolucion)
        })

        const nivelPatrimonio = normalizarNivelResalte(prefs?.resaltarPatrimonio)
        document.querySelectorAll("#resaltar-patrimonio .toggle-option").forEach(opcion => {
            opcion.classList.toggle("active", Number(opcion.dataset.nivel) === nivelPatrimonio)
        })

        actualizarEstadoGuardar()
    } catch (error) {
        console.error("Error cargando preferencias:", error)
    }

    // Divisa
    const divisaSelect = document.getElementById("divisa-principal")
    if (divisaSelect) divisaSelect.value = getDivisaPrincipal()
    const formato = getFormatoDivisa()
    document.querySelectorAll("#formato-divisa .toggle-option").forEach(opcion => {
        opcion.classList.toggle("active", opcion.dataset.formato === formato)
    })

    // Tipo de cambio
    const tc = getTipoCambio()
    refrescarModoTipoCambio(tc.modo === "auto" ? "auto" : "manual")
    const tcUSD = document.getElementById("tc-pen-usd")
    if (tcUSD) {
        tcUSD.value = tc.pen_usd || TIPO_CAMBIO_DEFAULT.pen_usd
    }
}

function hayCambiosEnVivo() {
    const base = sesion.getPreferencias() || {}
    const basePaginas = base.paginas || {}
    const segBase = base.seg || {}
    const accBase = base.accesibilidad || {}
    const tiposBase = base.tiposMovimiento || {}
    const tc = getTipoCambio()
    const modoTCUI = getModoTipoCambioUI()
    const nombreBase = (sesion.getUsuario()?.nombre || "Usuario").trim()

    const segInactividadUI = parseInt(document.getElementById("seg-inactividad")?.value, 10)
    const segCerrarUI = document.getElementById("seg-cerrar-pestana")?.checked
    const accModalesUI = document.getElementById("acc-modales-persistentes")?.checked
    const accDoodlesUI = document.getElementById("acc-doodles")?.checked
    const accUnClickUI = document.getElementById("acc-un-click-seleccion")?.checked
    const accResaltarUI = document.getElementById("acc-resaltar-ingreso-gasto")?.checked
    const movRecientesUI = leerCantidadMovimientos()

    const tipoUI = id => document.getElementById(id)?.checked !== false
    const tiposDifieren = [
        ["toggle-tipo-cambio-divisa", "cambioDivisa"],
        ["toggle-tipo-compra-activo", "compraActivo"],
        ["toggle-tipo-venta-activo", "ventaActivo"],
        ["toggle-tipo-pago-tarjeta", "pagoTarjeta"],
        ["toggle-tipo-p2p-compra", "p2pCompra"],
        ["toggle-tipo-p2p-venta", "p2pVenta"],
        ["toggle-tipo-trade", "trade"]
    ].some(([id, key]) => tipoUI(id) !== (tiposBase[key] !== false))

    return (
        (nombrePendiente !== null && nombrePendiente !== nombreBase) ||
        (Number.isFinite(segInactividadUI) && segInactividadUI !== (segBase.inactividadMinutos ?? 15)) ||
        (segCerrarUI !== undefined && segCerrarUI !== (segBase.cerrarAlCerrarPestana !== false)) ||
        (accModalesUI !== undefined && accModalesUI !== (accBase.modalesPersistentes === true)) ||
        (accDoodlesUI !== undefined && accDoodlesUI !== (accBase.doodles === true)) ||
        (accUnClickUI !== undefined && accUnClickUI !== (accBase.unClickSeleccion === true)) ||
        (getLateralidadCuentaUI() !== (accBase.lateralidadCuentaInfo || "derecha")) ||
        (accResaltarUI !== undefined && accResaltarUI !== (accBase.resaltarIngresoGasto !== false)) ||
        (movRecientesUI !== null && movRecientesUI !== (base.movimientosRecientes ?? CANTIDAD_MOVIMIENTOS_DEFAULT)) ||
        (document.getElementById("toggle-dashboard")?.checked !== (basePaginas.dashboard !== false)) ||
        (document.getElementById("toggle-movimientos")?.checked !== (basePaginas.movimientos !== false)) ||
        (document.getElementById("toggle-inversiones")?.checked !== (basePaginas.inversiones !== false)) ||
        (document.getElementById("toggle-trading")?.checked !== (basePaginas.trading !== false)) ||
        tiposDifieren ||
        (document.getElementById("divisa-principal")?.value !== getDivisaPrincipal()) ||
        (getPeriodoEvolucionUI() !== (base.periodoEvolucion || "30d")) ||
        (getNivelResalteUI() !== normalizarNivelResalte(base.resaltarPatrimonio)) ||
        (getFormatoDivisaUI() !== getFormatoDivisa()) ||
        (modoTCUI !== null && modoTCUI !== (tc.modo === "auto" ? "auto" : "manual")) ||
        (modoTCUI !== "auto" && parseFloat(document.getElementById("tc-pen-usd")?.value) !== tc.pen_usd)
    )
}

function configurarDetectorCambios() {
    const ids = [
        "toggle-dashboard",
        "toggle-movimientos",
        "toggle-inversiones",
        "toggle-trading",
        "toggle-tipo-cambio-divisa",
        "toggle-tipo-compra-activo",
        "toggle-tipo-venta-activo",
        "toggle-tipo-pago-tarjeta",
        "toggle-tipo-p2p-compra",
        "toggle-tipo-p2p-venta",
        "toggle-tipo-trade",
        "divisa-principal",
        "tc-pen-usd",
        "seg-inactividad",
        "seg-cerrar-pestana",
        "acc-modales-persistentes",
        "acc-doodles",
        "acc-un-click-seleccion",
        "acc-resaltar-ingreso-gasto"
    ]

    ids.forEach(id => {
        const el = document.getElementById(id)
        if (el) {
            el.addEventListener("change", () => {
                marcarCambioNuevo()
                actualizarEstadoGuardar()
            })
        }
    })

    const opcionesMovimientos = document.querySelectorAll("#movimientos-recientes .toggle-option")
    opcionesMovimientos.forEach(opcion => {
        opcion.addEventListener("click", () => {
            opcionesMovimientos.forEach(otra => otra.classList.remove("active"))
            opcion.classList.add("active")
            marcarCambioNuevo()
            actualizarEstadoGuardar()
        })
    })
}

function configurarFormatoDivisa() {
    const opciones = document.querySelectorAll("#formato-divisa .toggle-option")
    opciones.forEach(opcion => {
        opcion.addEventListener("click", () => {
            opciones.forEach(otra => otra.classList.remove("active"))
            opcion.classList.add("active")
            marcarCambioNuevo()
            actualizarEstadoGuardar()
        })
    })
}

function configurarLateralidadCuenta() {
    const opciones = document.querySelectorAll("#toggle-lateralidad-cuenta .toggle-option")
    opciones.forEach(opcion => {
        opcion.addEventListener("click", () => {
            opciones.forEach(otra => otra.classList.remove("active"))
            opcion.classList.add("active")
            marcarCambioNuevo()
            actualizarEstadoGuardar()
        })
    })
}

function getLateralidadCuentaUI() {
    return document.querySelector("#toggle-lateralidad-cuenta .toggle-option.active")?.dataset.lateralidad || "derecha"
}

function configurarPeriodoEvolucion() {
    const opciones = document.querySelectorAll("#periodo-evolucion .toggle-option")
    opciones.forEach(opcion => {
        opcion.addEventListener("click", () => {
            opciones.forEach(otra => otra.classList.remove("active"))
            opcion.classList.add("active")
            marcarCambioNuevo()
            actualizarEstadoGuardar()
        })
    })
}

function getPeriodoEvolucionUI() {
    return document.querySelector("#periodo-evolucion .toggle-option.active")?.dataset.periodo || "30d"
}

function configurarResaltarPatrimonio() {
    const opciones = document.querySelectorAll("#resaltar-patrimonio .toggle-option")
    opciones.forEach(opcion => {
        opcion.addEventListener("click", () => {
            opciones.forEach(otra => otra.classList.remove("active"))
            opcion.classList.add("active")
            marcarCambioNuevo()
            actualizarEstadoGuardar()
        })
    })
}

function getNivelResalteUI() {
    return normalizarNivelResalte(document.querySelector("#resaltar-patrimonio .toggle-option.active")?.dataset.nivel)
}

function getFormatoDivisaUI() {
    return document.querySelector("#formato-divisa .toggle-option.active")?.dataset.formato || "simbolo"
}

function getModoTipoCambioUI() {
    const opt = document.querySelector("#tc-modo .toggle-option.active")
    return opt?.dataset.modo || null
}

function refrescarModoTipoCambio(modo = null) {
    const modoActual = modo || (getTipoCambio().modo === "auto" ? "auto" : "manual")
    const opciones = document.querySelectorAll("#tc-modo .toggle-option")

    opciones.forEach(opt => {
        opt.classList.toggle("active", opt.dataset.modo === modoActual)
    })

    const esAuto = modoActual === "auto"
    const inputManual = document.getElementById("tc-input-manual")
    const inputAuto = document.getElementById("tc-input-auto")
    const tcUSD = document.getElementById("tc-pen-usd")

    if (inputManual) inputManual.hidden = esAuto
    if (inputAuto) inputAuto.hidden = !esAuto
    if (tcUSD) tcUSD.disabled = esAuto

    actualizarInfoAuto()
}

function actualizarInfoAuto() {
    const tc = getTipoCambio()
    const penUSD = tc.pen_usd || TIPO_CAMBIO_DEFAULT.pen_usd

    const valorAuto = document.getElementById("tc-valor-auto")
    if (valorAuto) {
        valorAuto.textContent = `1 USD = ${Number(penUSD).toFixed(2)} PEN`
    }

    const fechaAuto = document.getElementById("tc-fecha-auto")
    if (fechaAuto) {
        if (tc.modo === "auto" && tc.actualizacion) {
            const fecha = new Date(tc.actualizacion)
            fechaAuto.textContent = `Última actualización: ${fecha.toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}`
        } else {
            fechaAuto.textContent = "Aún sin actualización automática"
        }
    }
}

function configurarTipoCambio() {
    const opciones = document.querySelectorAll("#tc-modo .toggle-option")

    opciones.forEach(opt => {
        opt.addEventListener("click", () => {
            opciones.forEach(o => o.classList.remove("active"))
            opt.classList.add("active")
            refrescarModoTipoCambio(opt.dataset.modo)
            actualizarEstadoGuardar()
        })
    })

    const btnActualizar = document.getElementById("tc-actualizar-btn")
    if (btnActualizar) {
        btnActualizar.addEventListener("click", actualizarTipoCambioAutomatico)
    }
}

async function actualizarTipoCambioAutomatico() {
    const btn = document.getElementById("tc-actualizar-btn")
    const btnText = btn?.querySelector(".tc-btn-text")
    const status = document.getElementById("tc-status")
    const autoBox = document.getElementById("tc-input-auto")
    const valorAuto = document.getElementById("tc-valor-auto")
    const fechaAuto = document.getElementById("tc-fecha-auto")

    autoBox?.setAttribute("aria-busy", "true")
    if (valorAuto) valorAuto.innerHTML = skeletonMarkup({ rows: 1, className: "skeleton-exchange" })
    if (fechaAuto) fechaAuto.innerHTML = skeletonText()

    if (status) {
        status.hidden = true
        status.textContent = ""
    }

    if (btn) {
        btn.disabled = true
        if (btnText) btnText.textContent = "Actualizando..."
    }

    try {
        const penUSD = await actualizarTipoCambioAuto(uid)

        const tcUSD = document.getElementById("tc-pen-usd")
        if (tcUSD) tcUSD.value = penUSD

        actualizarInfoAuto()
        marcarCambioNuevo()
        actualizarEstadoGuardar()
        mostrarNotificacion("exito", `Tipo de cambio actualizado: 1 USD = ${penUSD.toFixed(2)} PEN`)
    } catch (error) {
        if (status) {
            status.textContent = "No se pudo actualizar; se mantiene el valor actual"
            status.hidden = false
        }
        mostrarNotificacion("error", `No se pudo actualizar el tipo de cambio: ${error.message}`)
    } finally {
        actualizarInfoAuto()
        autoBox?.removeAttribute("aria-busy")
        if (btn) {
            btn.disabled = false
            if (btnText) btnText.textContent = "Actualizar ahora"
        }
    }
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
// AVISO DE CAMBIOS SIN GUARDAR AL NAVEGAR
// ============================================
// Al cambiar de pestaña con cambios sin guardar (router → "pagina-cambiando")
// aparece una notificación persistente con Aceptar (guarda el snapshot) y
// Cancelar (descarta el aviso sin guardar). Se cierra también con la X o
// swipe (tampoco guarda). La navegación nunca se bloquea.
// Si el usuario descarta el aviso (Cancelar/X/swipe), NO se vuelve a mostrar:
// solo reaparece si vuelve a tocar algún control de la página o guarda.

let avisoCambiosActivo = false
let avisoDescartado = false

// El usuario volvió a tocar un control → el aviso descartado se rehabilita.
function marcarCambioNuevo() {
    avisoDescartado = false
}

document.addEventListener("pagina-cambiando", (event) => {
    const desde = event.detail?.desde
    if (desde !== "configuracion") return
    if (!hayCambios || avisoDescartado || avisoCambiosActivo) return

    // Snapshot de las preferencias ANTES de que el router desmonte la página
    const preferenciasPendientes = construirPreferencias()

    avisoCambiosActivo = true

    mostrarNotificacion("warning", "¿Guardar cambios?", 0, [
        {
            texto: "Aceptar",
            primaria: true,
            alClick: () => aplicarPreferencias(preferenciasPendientes)
        },
        {
            texto: "Cancelar",
            clase: "cancel",
            alClick: () => {}
        }
    ], () => {
        avisoCambiosActivo = false
        avisoDescartado = true
    })
})

// ============================================
// ESTADO DEL BOTÓN GUARDAR
// ============================================
// Solo .desact (sin colores especiales ni clase .activo)

function actualizarEstadoGuardar() {
    hayCambios = temaPendiente || lastbarPendiente || hayCambiosEnVivo()

    const guardarItem = document.querySelector('.lastbar .item[data-accion="guardar"]')
    if (guardarItem) {
        guardarItem.classList.toggle("desact", !hayCambios)
    }
}

function construirPreferencias() {
    const divisaPrincipal = document.getElementById("divisa-principal")?.value || "pen"
    const modoTCUI = getModoTipoCambioUI()
    const tcActual = getTipoCambio()

    const penUSD = modoTCUI === "auto"
        ? tcActual.pen_usd || TIPO_CAMBIO_DEFAULT.pen_usd
        : parseFloat(document.getElementById("tc-pen-usd")?.value) || TIPO_CAMBIO_DEFAULT.pen_usd

    const tipoCambio = {
        pen_usd: penUSD,
        modo: modoTCUI,
        actualizacion: modoTCUI === "auto"
            ? tcActual.actualizacion || new Date().toISOString()
            : new Date().toISOString()
    }

    const segInactividadUI = parseInt(document.getElementById("seg-inactividad")?.value, 10)
    const seg = {
        inactividadMinutos: Number.isFinite(segInactividadUI) ? segInactividadUI : 15,
        cerrarAlCerrarPestana: document.getElementById("seg-cerrar-pestana")?.checked !== false
    }

    const accesibilidad = {
        modalesPersistentes: document.getElementById("acc-modales-persistentes")?.checked === true,
        doodles: document.getElementById("acc-doodles")?.checked === true,
        unClickSeleccion: document.getElementById("acc-un-click-seleccion")?.checked === true,
        lateralidadCuentaInfo: getLateralidadCuentaUI(),
        resaltarIngresoGasto: document.getElementById("acc-resaltar-ingreso-gasto")?.checked !== false
    }

    const tiposMovimiento = {
        cambioDivisa: document.getElementById("toggle-tipo-cambio-divisa")?.checked !== false,
        compraActivo: document.getElementById("toggle-tipo-compra-activo")?.checked === true,
        ventaActivo: document.getElementById("toggle-tipo-venta-activo")?.checked === true,
        pagoTarjeta: document.getElementById("toggle-tipo-pago-tarjeta")?.checked === true,
        p2pCompra: document.getElementById("toggle-tipo-p2p-compra")?.checked !== false,
        p2pVenta: document.getElementById("toggle-tipo-p2p-venta")?.checked !== false,
        trade: document.getElementById("toggle-tipo-trade")?.checked !== false
    }

    return {
        tema: temaActual,
        periodoEvolucion: getPeriodoEvolucionUI(),
        resaltarPatrimonio: getNivelResalteUI(),
        movimientosRecientes: leerCantidadMovimientos() ?? (sesion.getPreferencias().movimientosRecientes ?? CANTIDAD_MOVIMIENTOS_DEFAULT),
        paginas: {
            dashboard: document.getElementById("toggle-dashboard").checked,
            cuentas: true,
            movimientos: document.getElementById("toggle-movimientos").checked,
            inversiones: document.getElementById("toggle-inversiones").checked,
            trading: document.getElementById("toggle-trading").checked,
            configuracion: true
        },
        divisaPrincipal,
        formatoDivisa: getFormatoDivisaUI(),
        tipoCambio,
        seg,
        accesibilidad,
        tiposMovimiento
    }
}

async function aplicarPreferencias(preferencias) {
    try {
        // Nombre pendiente → auth + doc de usuario
        if (nombrePendiente && nombrePendiente !== sesion.getUsuario()?.nombre) {
            await actualizarNombre(nombrePendiente)
            sesion.setUsuario({ ...sesion.getUsuario(), nombre: nombrePendiente })
            nombrePendiente = null
        }

        const tc = preferencias.tipoCambio

        // Divisa y tipo de cambio se persisten vía DivisaServicio. En modo
        // "auto" se conserva la actualizacion previa (el TC no cambió).
        await guardarDivisaPrincipal(uid, preferencias.divisaPrincipal)
        await guardarTipoCambio(
            uid,
            tc.pen_usd,
            tc.modo,
            tc.modo === "auto" && tc.actualizacion ? tc.actualizacion : null
        )

        await actualizarPreferencias(uid, {
            tema: preferencias.tema,
            periodoEvolucion: preferencias.periodoEvolucion || "30d",
            resaltarPatrimonio: normalizarNivelResalte(preferencias.resaltarPatrimonio),
            formatoDivisa: preferencias.formatoDivisa,
            movimientosRecientes: preferencias.movimientosRecientes,
            paginas: preferencias.paginas,
            seg: preferencias.seg,
            accesibilidad: preferencias.accesibilidad,
            tiposMovimiento: preferencias.tiposMovimiento
        })
        sesion.setPreferencias(preferencias)

        // Aplicar de inmediato la seguridad configurada
        try {
            await aplicarPersistenciaSesion(preferencias.seg.cerrarAlCerrarPestana)
        } catch (error) {
            console.warn("[WARN] No se pudo aplicar la persistencia de sesión:", error)
        }
        startInactivityTimer()

        // Persistir tema y modo de lastbar en localStorage
        setTemaLocal(temaActual)
        localStorage.setItem("escinco_lastbar_mode", lastbarModo)

        actualizarNavegacion(preferencias.paginas)

        temaPendiente = false
        lastbarPendiente = false
        nombrePendiente = null
        hayCambios = false
        avisoDescartado = false
        actualizarEstadoGuardar()

        mostrarNotificacion("exito", "Cambios guardados")
    } catch (error) {
        console.error("Error guardando preferencias:", error)
        mostrarNotificacion("error", "No se pudieron guardar las preferencias")
    }
}

async function guardarPreferencias() {
    await aplicarPreferencias(construirPreferencias())
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
    lastbarModo = localStorage.getItem("escinco_lastbar_mode") || "hide"
    const opciones = document.querySelectorAll("#toggle-lastbar .toggle-option")

    opciones.forEach(opt => {
        opt.classList.toggle("active", opt.dataset.lastbar === lastbarModo)
    })

    aplicarModoLastbar(lastbarModo)

    opciones.forEach(opt => {
        opt.addEventListener("click", () => {
            opciones.forEach(o => o.classList.remove("active"))
            opt.classList.add("active")

            // Aplicar visualmente sin persistir (se guarda con el botón Guardar)
            lastbarModo = opt.dataset.lastbar
            lastbarPendiente = true
            marcarCambioNuevo()
            aplicarModoLastbar(lastbarModo)

            actualizarEstadoGuardar()
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
    input.accept = ".dvid,application/x-escinco-backup"

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
                            Asegúrate de que sea un archivo .dvid generado por escinco.
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
                    <span class="preview-label">Versión mínima</span>
                    <span class="preview-value">v${preview.versionMinima || "2.0.0"}</span>
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
                        <span>Inversiones</span>
                        <span class="preview-number">${preview.resumen.posiciones || 0}</span>
                    </div>
                    <div class="preview-item">
                        <span>Historial precios</span>
                        <span class="preview-number">${preview.resumen.historial || 0}</span>
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
                            ${LOGO_ESCINCO_CARGA}
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
                    <span>Inversiones</span>
                    <span class="preview-number">${resultado.posiciones || 0}</span>
                </div>
                <div class="preview-item">
                    <span>Historial precios</span>
                    <span class="preview-number">${resultado.historial || 0}</span>
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
                <p class="modal-message-desc">Se eliminarán <strong>todos</strong> tus datos de escinco:</p>
                <div class="modal-list">
                    • Cuentas<br>
                    • Movimientos<br>
                    • Inversiones<br>
                    • Pendientes<br>
                    • Snapshots<br>
                    • Trades
                </div>
            </div>
        `,
        variante: "confirm",
        confirmText: "Continuar",
        cancelText: "Cancelar",
        onConfirm: () => {
            cerrarModal()
            setTimeout(() => conReautenticacion(confirmarEliminacionFinal), 100)
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
                        ${LOGO_ESCINCO_CARGA}
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
                    Se eliminará tu <strong>cuenta</strong> y <strong>todos tus datos</strong> de escinco permanentemente:
                </p>
                <div class="modal-list">
                    • Cuentas<br>
                    • Movimientos<br>
                    • Inversiones<br>
                    • Pendientes<br>
                    • Snapshots<br>
                    • Trades
                </div>
                <p class="modal-message-desc">
                    Antes de borrar se descargará automáticamente un respaldo <strong>.dvid</strong>.
                </p>
                <p class="modal-message-error">Esta acción no se puede deshacer.</p>
            </div>
        `,
        variante: "confirm",
        confirmText: "Continuar",
        cancelText: "Cancelar",
        onConfirm: () => {
            cerrarModal()
            setTimeout(() => conReautenticacion(abrirModalConfirmacionFinal), 100)
            return false
        }
    })
}

/**
 * Ejecuta `alContinuar` cuando la sesión es reciente. Si no lo es, pide
 * reautenticación (contraseña o Google). Si el usuario cancela, no continúa.
 */
function conReautenticacion(alContinuar) {
    if (esSesionReciente()) {
        alContinuar()
        return
    }

    if (tienePassword()) {
        abrirModalReauthPassword(alContinuar)
    } else {
        abrirModalReauthGoogle(alContinuar)
    }
}

function abrirModalReauthPassword(alContinuar) {
    abrirModal({
        titulo: "Reautenticación requerida",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    Por seguridad, confirma tu contraseña antes de continuar:
                </p>
                <input type="password" id="reauth-password"
                       class="form-input modal-input-confirm"
                       placeholder="Tu contraseña"
                       autocomplete="current-password">
                <p class="modal-message-error" id="reauth-error" hidden></p>
            </div>
        `,
        variante: "confirm",
        confirmText: "Verificar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            const input = document.getElementById("reauth-password")
            const password = input?.value || ""

            if (!password) {
                input.classList.add("input-error")
                input.focus()
                return false
            }

            try {
                await reautenticarConPassword(password)
            } catch (error) {
                const msg = document.getElementById("reauth-error")
                input.classList.add("input-error")
                if (msg) {
                    msg.textContent = error.message || "Contraseña incorrecta"
                    msg.hidden = false
                }
                input.focus()
                return false
            }

            cerrarModal()
            setTimeout(() => alContinuar(), 100)
            return false
        }
    })
}

function abrirModalReauthGoogle(alContinuar) {
    abrirModal({
        titulo: "Reautenticación requerida",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    Por seguridad, vuelve a iniciar sesión con Google para continuar.
                </p>
            </div>
        `,
        variante: "confirm",
        confirmText: "Continuar con Google",
        cancelText: "Cancelar",
        onConfirm: async () => {
            // El popup se dispara aquí, en contexto de clic (onConfirm se
            // ejecuta de forma síncrona desde el botón), para que el
            // navegador no lo bloquee.
            try {
                await reautenticarConGoogle()
            } catch (error) {
                cerrarModal()
                await new Promise(resolve => setTimeout(resolve, 100))
                abrirModalErrorEliminar(error)
                return false
            }

            cerrarModal()
            setTimeout(() => alContinuar(), 100)
            return false
        }
    })
}

function abrirModalConfirmacionFinal() {
    abrirModal({
        titulo: "Confirmación final",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-title-danger">Última oportunidad</p>
                <p class="modal-message-desc">
                    Para confirmar, escribe <strong class="text-danger">ELIMINAR</strong> a continuación:
                </p>
                <input type="text" id="confirmar-eliminar-cuenta"
                       class="form-input modal-input-confirm"
                       placeholder="Escribe ELIMINAR"
                       autocomplete="off">
            </div>
        `,
        variante: "confirm",
        confirmText: "Eliminar cuenta",
        cancelText: "Cancelar",
        onConfirm: async () => {
            const input = document.getElementById("confirmar-eliminar-cuenta")
            const valor = input?.value.trim().toUpperCase()

            if (valor !== "ELIMINAR") {
                input.classList.add("input-error")
                input.focus()
                return false
            }

            cerrarModal()
            await new Promise(resolve => setTimeout(resolve, 100))

            abrirModal({
                titulo: "Eliminando cuenta",
                contenido: `
                    <div class="modal-loading">
                        ${LOGO_ESCINCO_CARGA}
                        <p class="modal-loading-text" id="eliminar-cuenta-status">Descargando respaldo...</p>
                    </div>
                `,
                variante: "narrow",
                confirmText: null,
                cancelText: null
            })

            try {
                const status = document.getElementById("eliminar-cuenta-status")

                const { eliminarCuenta } = await import("../services/EliminarServicio.js")
                await eliminarCuenta(uid)

                if (status) status.textContent = "Cuenta eliminada. Redirigiendo..."

                await new Promise(resolve => setTimeout(resolve, 600))
                window.location.replace("/login")
            } catch (error) {
                console.error("Error eliminando cuenta:", error)
                cerrarModal()
                await new Promise(resolve => setTimeout(resolve, 100))
                abrirModalErrorEliminar(error)
            }

            return false
        }
    })
}

function abrirModalErrorEliminar(error) {
    abrirModal({
        titulo: "Error al eliminar la cuenta",
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