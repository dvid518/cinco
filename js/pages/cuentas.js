import { sesion } from "../core/sesion.js"
import { icono } from "../core/iconos.js"
import {
    obtenerCuentas,
    crearCuenta,
    actualizarCuenta,
    eliminarCuenta,
    restaurarDocumento
} from "../../firebase/firestore.js"
import { abrirModal, cerrarModal } from "../ui/modal.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"
import { ofrecerDeshacer } from "../services/DeshacerServicio.js"
import { envolverSidebar } from "../ui/colapsoSidebar.js"

let cuentas = []
let cuentaSeleccionada = null
let uid = null

// ============================================
// ÍCONOS POR TIPO DE CUENTA
// ============================================

const ICONOS_POR_TIPO = {
    banco: "landmark",
    efectivo: "banknote",
    broker: "trending-up",
    exchange: "arrow-left-right",
    credito: "credit-card"
}

function iconoPorTipo(tipo) {
    return ICONOS_POR_TIPO[tipo] || "wallet"
}

// ============================================
// RENDER
// ============================================

export function render() {
    return `
        ${envolverSidebar(`
            <section id="sidebar">
                <button name="cta" class="glass act"><span class="loading-spinner"></span></button>
            </section>
        `)}
        <section id="panel" class="glass">
            <div class="lista-vacia"><div class="loading-spinner"></div></div>
        </section>
    `
}

// ============================================
// INIT
// ============================================

export async function init() {
    uid = sesion.uid
    console.log("[INFO] Cuentas iniciado para UID:", uid)

    if (cuentas.length === 0) {
        await cargarCuentas()
    } else {
        renderizarSidebar()
        if (cuentaSeleccionada) {
            mostrarDetalleCuenta()
        } else if (cuentas.length > 0) {
            seleccionarCuenta(cuentas[0].id)
        }
    }

    configurarEventos()
}

// ============================================
// CARGA
// ============================================

async function cargarCuentas() {
    try {
        cuentas = await obtenerCuentas(uid)
        renderizarSidebar()

        // Restaurar selección previa si sigue existiendo
        if (cuentaSeleccionada) {
            const vigente = cuentas.find(c => c.id === cuentaSeleccionada.id)
            if (!vigente) {
                cuentaSeleccionada = null
            }
        }

        if (!cuentaSeleccionada && cuentas.length > 0) {
            seleccionarCuenta(cuentas[0].id)
        } else if (cuentas.length === 0) {
            cuentaSeleccionada = null
            mostrarVacio()
        } else {
            mostrarDetalleCuenta()
        }
    } catch (error) {
        console.error("Error cargando cuentas:", error)
        mostrarNotificacion("error", "No se pudieron cargar las cuentas")
    }
}

// ============================================
// SIDEBAR
// ============================================

function renderizarSidebar() {
    const sidebar = document.getElementById("sidebar")
    if (!sidebar) return

    sidebar.innerHTML = ""

    cuentas.forEach(cuenta => {
        const btn = document.createElement("button")
        btn.className = "glass"
        btn.name = "cta"
        btn.dataset.id = cuenta.id

        // Ícono según el tipo de cuenta
        btn.insertAdjacentHTML("beforeend", icono(iconoPorTipo(cuenta.tipo), 18))

        const texto = document.createElement("span")
        texto.textContent = cuenta.nombre
        btn.appendChild(texto)

        if (cuentaSeleccionada && cuenta.id === cuentaSeleccionada.id) {
            btn.classList.add("act")
        }

        btn.addEventListener("click", () => seleccionarCuenta(cuenta.id))

        sidebar.appendChild(btn)
    })
}

// ============================================
// SELECCIÓN
// ============================================

function seleccionarCuenta(id) {
    if (cuentaSeleccionada && cuentaSeleccionada.id === id) {
        cuentaSeleccionada = null
        document.querySelectorAll("#sidebar button").forEach(btn => {
            btn.classList.remove("act")
        })
        mostrarVacio()
        actualizarLastbar()
        return
    }

    cuentaSeleccionada = cuentas.find(c => c.id === id)
    if (!cuentaSeleccionada) return

    document.querySelectorAll("#sidebar button").forEach(btn => {
        btn.classList.toggle("act", btn.dataset.id === id)
    })

    mostrarDetalleCuenta()
    actualizarLastbar()
}

// ============================================
// DETALLE
// ============================================

function mostrarDetalleCuenta() {
    const panel = document.getElementById("panel")
    if (!panel || !cuentaSeleccionada) return

    if (cuentaSeleccionada.tipo === "credito") {
        mostrarDetalleTarjeta(panel, cuentaSeleccionada)
    } else {
        mostrarDetalleCuentaNormal(panel, cuentaSeleccionada)
    }
}

function mostrarDetalleCuentaNormal(panel, c) {
    const esPositivo = (c.saldoInicial || 0) >= 0

    panel.innerHTML = `
        <div class="cuenta-detalle-header">
        </div>
        <div class="cuenta-detalle">
            <div class="saldo ${esPositivo ? "positive" : "negative"}">
                ${(c.saldoInicial || 0).toFixed(2)}
            </div>
            <div class="field">
                <span class="label">Tipo</span>
                <span class="value">${c.tipo || "No definido"}</span>
            </div>
            <div class="field">
                <span class="label">Moneda</span>
                <span class="value">${(c.moneda || "PEN").toUpperCase()}</span>
            </div>
            <div class="field">
                <span class="label">Estado</span>
                <span class="value">${c.estado || "activa"}</span>
            </div>
            ${c.num ? `<div class="field"><span class="label">Número</span><span class="value">${c.num}</span></div>` : ""}
            ${c.cci ? `<div class="field"><span class="label">CCI</span><span class="value">${c.cci}</span></div>` : ""}
        </div>
    `
}

function mostrarDetalleTarjeta(panel, c) {
    const deuda = c.deuda || 0
    const limite = c.limite || 0
    const disponible = Math.max(0, limite - deuda)
    const porcentaje = limite > 0 ? (deuda / limite) * 100 : 0

    let nivelClase = ""
    let nivelTexto = "Normal"
    if (porcentaje >= 70) {
        nivelClase = "negative"
        nivelTexto = "Crítico"
    } else if (porcentaje >= 30) {
        nivelClase = "positive"
        nivelTexto = "Advertencia"
    }

    const corteInfo = calcularDiasHasta(c.diaCorte)
    const pagoInfo = calcularDiasHasta(c.diaPago)

    panel.innerHTML = `
        <div class="cuenta-detalle-header">
        </div>
        <div class="cuenta-detalle">
            <div class="saldo ${deuda > 0 ? "negative" : "positive"}">
                ${deuda > 0 ? "- " : ""}${deuda.toFixed(2)}
            </div>

            <div class="field">
                <span class="label">Límite</span>
                <span class="value">${limite.toFixed(2)}</span>
            </div>
            <div class="field">
                <span class="label">Disponible</span>
                <span class="value ${disponible > 0 ? "positive" : "negative"}">${disponible.toFixed(2)}</span>
            </div>
            <div class="field">
                <span class="label">Uso</span>
                <span class="value ${nivelClase}">${porcentaje.toFixed(1)}% — ${nivelTexto}</span>
            </div>
            <div class="field">
                <span class="label">Próximo corte</span>
                <span class="value">${corteInfo ? `en ${corteInfo.dias} días (${corteInfo.fecha})` : "No definido"}</span>
            </div>
            <div class="field">
                <span class="label">Próximo pago</span>
                <span class="value">${pagoInfo ? `en ${pagoInfo.dias} días (${pagoInfo.fecha})` : "No definido"}</span>
            </div>
            <div class="field">
                <span class="label">Desgravamen</span>
                <span class="value">${c.desgravamen || "0"}%</span>
            </div>
            <div class="field">
                <span class="label">Estado</span>
                <span class="value">${c.estado || "activa"}</span>
            </div>
        </div>
    `
}

function calcularDiasHasta(diaMes) {
    if (!diaMes || diaMes < 1 || diaMes > 31) return null

    const hoy = new Date()
    const año = hoy.getFullYear()
    const mes = hoy.getMonth()

    let fecha = new Date(año, mes, diaMes)
    if (fecha < hoy) fecha = new Date(año, mes + 1, diaMes)

    const diff = fecha - hoy
    const dias = Math.ceil(diff / (1000 * 60 * 60 * 24))

    return { dias, fecha: fecha.toLocaleDateString() }
}

// ============================================
// LASTRAR
// ============================================

function actualizarLastbar() {
    const editBtn = document.querySelector('.lastbar .item[data-accion="editar-cuenta"]')
    const archBtn = document.querySelector('.lastbar .item[data-accion="archivar-cuenta"]')

    const activo = !!cuentaSeleccionada
    editBtn?.classList.toggle("desact", !activo)
    archBtn?.classList.toggle("desact", !activo)
}

// ============================================
// ACCIONES EXPORTADAS PARA LASTBAR
// ============================================

export function abrirModalCrearCuenta() {
    uid = sesion.uid
    _abrirModalCrearCuenta()
}

export function editarCuentaSeleccionada() {
    if (cuentaSeleccionada) {
        _abrirModalEditarCuenta(cuentaSeleccionada)
    } else {
        mostrarNotificacion("info", "Selecciona una cuenta primero")
    }
}

export function archivarCuentaSeleccionada() {
    if (!cuentaSeleccionada) {
        mostrarNotificacion("info", "Selecciona una cuenta primero")
        return
    }

    const cuenta = cuentaSeleccionada

    if (cuenta.estado === "archivada") {
        abrirModal({
            titulo: "Desarchivar cuenta",
            contenido: `
                <div class="modal-message">
                    <p class="modal-message-desc">
                        ¿Volver a activar la cuenta <strong>${cuenta.nombre}</strong>?
                    </p>
                </div>
            `,
            variante: "confirm",
            confirmText: "Desarchivar",
            cancelText: "Cancelar",
            onConfirm: async () => {
                await cambiarEstadoCuenta(cuenta.id, "activa")
                return true
            }
        })
        return
    }

    const saldo = cuenta.saldoInicial || 0
    if (saldo !== 0) {
        mostrarNotificacion(
            "warning",
            `No se puede archivar una cuenta con saldo diferente de 0 (saldo actual: ${saldo})`
        )
        return
    }

    abrirModal({
        titulo: "Archivar cuenta",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    ¿Archivar la cuenta <strong>${cuenta.nombre}</strong>?
                </p>
            </div>
        `,
        variante: "confirm",
        confirmText: "Archivar",
        cancelText: "Cancelar",
        onConfirm: () => {
            cambiarEstadoCuenta(cuenta.id, "archivada")
            return true
        }
    })
}

async function cambiarEstadoCuenta(id, estado) {
    try {
        await actualizarCuenta(uid, id, { estado })
        await cargarCuentas()
        mostrarNotificacion("exito", estado === "activa" ? "Cuenta desarchivada" : "Cuenta archivada")
    } catch (error) {
        console.error(`Error cambiando estado a "${estado}":`, error)
        mostrarNotificacion("error", `No se pudo cambiar el estado: ${error.message}`)
    }
}

export function eliminarCuentaSeleccionada() {
    if (!cuentaSeleccionada) {
        mostrarNotificacion("info", "Selecciona una cuenta primero")
        return
    }
    const cuenta = cuentaSeleccionada
    const saldo = cuenta.saldoInicial || 0
    if (saldo !== 0) {
        mostrarNotificacion(
            "warning",
            `Solo se puede eliminar una cuenta con saldo 0 (saldo actual: ${saldo})`
        )
        return
    }

    abrirModal({
        titulo: "Eliminar cuenta",
        contenido: `
            <div class="modal-message">
                <p class="modal-message-desc">
                    ¿Eliminar definitivamente la cuenta <strong>${cuenta.nombre}</strong>?
                </p>
            </div>
        `,
        variante: "confirm",
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        onConfirm: async () => {
            try {
                const snapshot = { ...cuenta }
                await eliminarCuenta(uid, cuenta.id)
                await cargarCuentas()
                ofrecerDeshacer({
                    mensaje: `Cuenta "${cuenta.nombre}" eliminada. ¿Deshacer?`,
                    restaurar: () => restaurarDocumento(uid, "cuentas", snapshot.id, snapshot),
                    alRestaurar: () => cargarCuentas()
                })
                return true
            } catch (error) {
                console.error("Error eliminando cuenta:", error)
                mostrarNotificacion("error", `No se pudo eliminar la cuenta: ${error.message}`)
                return false
            }
        }
    })
}

function mostrarVacio() {
    const panel = document.getElementById("panel")
    if (!panel) return
    panel.innerHTML = `
        <h2>No hay cuentas</h2>
        <p class="lista-vacia">
            Crea tu primera cuenta usando el botón <strong>"Cuenta"</strong> en la barra inferior.
        </p>
    `
}

// ============================================
// EVENTOS (hold / dblclick)
// ============================================

function configurarEventos() {
    const sidebar = document.getElementById("sidebar")
    const HOLD_DURATION = 400
    const holdState = {}

    sidebar?.addEventListener("mousedown", (event) => {
        const btn = event.target.closest('button[name="cta"]')
        if (!btn) return
        const btnId = btn.dataset.id

        holdState[btnId] = { isHolding: false, timer: null }
        holdState[btnId].timer = setTimeout(() => {
            holdState[btnId].isHolding = true
            btn.classList.add("selected")
        }, HOLD_DURATION)
    })

    sidebar?.addEventListener("mouseup", (event) => {
        const btn = event.target.closest('button[name="cta"]')
        if (!btn) return
        const btnId = btn.dataset.id
        if (!holdState[btnId]) return

        clearTimeout(holdState[btnId].timer)
        btn.classList.remove("selected")

        // La selección la gestiona UN SOLO evento (click en el botón):
        // dispararla aquí también causaba doble toggle en un tap (bug #1).
        delete holdState[btnId]
    })

    sidebar?.addEventListener("mouseleave", (event) => {
        const btn = event.target.closest('button[name="cta"]')
        if (!btn) return
        const btnId = btn.dataset.id
        if (holdState[btnId]) {
            clearTimeout(holdState[btnId].timer)
            btn.classList.remove("selected")
            delete holdState[btnId]
        }
    })

    sidebar?.addEventListener("dblclick", (event) => {
        const btn = event.target.closest('button[name="cta"]')
        if (!btn) return
        const btnId = btn.dataset.id

        // Abrir el editor directamente, sin togglear la selección
        const cuenta = cuentas.find(c => c.id === btnId)
        if (cuenta) {
            _abrirModalEditarCuenta(cuenta)
        }
    })
}

// ============================================
// MODAL CREAR CUENTA (interno)
// ============================================

function _abrirModalCrearCuenta() {
    const html = `
        <form id="form-crear-cuenta" class="form-movimiento">
            <div class="form-group">
                <label for="campo-nombre">Nombre de la cuenta</label>
                <input type="text" id="campo-nombre" class="form-input" placeholder="Ej: BBVA, BCP..." required>
            </div>
            <div class="form-group">
                <label for="campo-tipo">Tipo</label>
                <select id="campo-tipo" class="form-input" required>
                    <option value="banco">Banco</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="broker">Broker</option>
                    <option value="exchange">Exchange</option>
                    <option value="credito">Tarjeta de crédito</option>
                </select>
            </div>
            <div class="form-group">
                <label for="campo-moneda">Moneda</label>
                <select id="campo-moneda" class="form-input" required>
                    <option value="pen">PEN</option>
                    <option value="usd">USD</option>
                    <option value="usdt">USDT</option>
                </select>
            </div>
            <div class="form-group">
                <label for="campo-saldo">Saldo inicial</label>
                <input type="number" id="campo-saldo" class="form-input" step="0.01" placeholder="0.00">
            </div>

            <div class="form-group credit-only" id="campo-limite-group" hidden>
                <label for="campo-limite">Límite de crédito</label>
                <input type="number" id="campo-limite" class="form-input" step="0.01" placeholder="0.00">
            </div>
            <div class="form-group credit-only" id="campo-desgravamen-group" hidden>
                <label for="campo-desgravamen">Desgravamen (%)</label>
                <input type="number" id="campo-desgravamen" class="form-input" step="0.01" placeholder="0.34" value="0.34">
            </div>
            <div class="form-group credit-only" id="campo-diaCorte-group" hidden>
                <label for="campo-diaCorte">Día de corte</label>
                <input type="number" id="campo-diaCorte" class="form-input" min="1" max="31" placeholder="10" value="10">
            </div>
            <div class="form-group credit-only" id="campo-diaPago-group" hidden>
                <label for="campo-diaPago">Día de pago</label>
                <input type="number" id="campo-diaPago" class="form-input" min="1" max="31" placeholder="6" value="6">
            </div>
        </form>
    `

    abrirModal({
        titulo: "Nueva cuenta",
        contenido: html,
        variante: "form",
        confirmText: "Crear cuenta",
        onConfirm: async () => {
            const nombre = document.getElementById("campo-nombre")?.value.trim()
            const tipo = document.getElementById("campo-tipo")?.value
            const moneda = document.getElementById("campo-moneda")?.value
            const saldo = parseFloat(document.getElementById("campo-saldo")?.value) || 0

            if (!nombre) {
                mostrarNotificacion("warning", "El nombre es obligatorio")
                return false
            }

            const datos = {
                nombre,
                tipo,
                moneda,
                saldoInicial: saldo,
                estado: "activa",
                esPatrimonio: true
            }

            if (tipo === "credito") {
                datos.limite = parseFloat(document.getElementById("campo-limite")?.value) || 0
                datos.deuda = 0
                datos.desgravamen = parseFloat(document.getElementById("campo-desgravamen")?.value) || 0.34
                datos.diaCorte = parseInt(document.getElementById("campo-diaCorte")?.value) || 10
                datos.diaPago = parseInt(document.getElementById("campo-diaPago")?.value) || 6
            }

            try {
                await crearCuenta(uid, datos)
                await cargarCuentas()
                mostrarNotificacion("exito", "Cuenta creada")
                return true
            } catch (error) {
                console.error("Error creando cuenta:", error)
                mostrarNotificacion("error", `No se pudo crear la cuenta: ${error.message}`)
                return false
            }
        }
    })

    // Toggle campos de crédito
    document.getElementById("campo-tipo")?.addEventListener("change", (e) => {
        const esCredito = e.target.value === "credito"
        document.querySelectorAll(".credit-only").forEach(el => {
            el.hidden = !esCredito
        })
    })
}

// ============================================
// MODAL EDITAR CUENTA (interno)
// ============================================

function _abrirModalEditarCuenta(cuenta) {
    const moneda = (cuenta.moneda || "pen").toLowerCase()
    const permisoMoneda = cuenta.tipo !== "credito"
    const esArchivada = cuenta.estado === "archivada"
    const saldo = cuenta.saldoInicial || 0

    const html = `
        <form id="form-editar-cuenta" class="form-movimiento">
            <div class="form-group">
                <label for="edit-nombre">Nombre</label>
                <input type="text" id="edit-nombre" class="form-input" value="${cuenta.nombre || ""}" required>
            </div>
            ${permisoMoneda ? `
                <div class="form-group">
                    <label for="edit-moneda">Moneda</label>
                    <select id="edit-moneda" class="form-input">
                        <option value="pen" ${moneda === "pen" ? "selected" : ""}>PEN</option>
                        <option value="usd" ${moneda === "usd" ? "selected" : ""}>USD</option>
                        <option value="usdt" ${moneda === "usdt" ? "selected" : ""}>USDT</option>
                    </select>
                </div>
            ` : ""}
            ${cuenta.tipo === "credito" ? `
                <div class="form-group">
                    <label for="edit-limite">Límite de crédito</label>
                    <input type="number" id="edit-limite" class="form-input" step="0.01" value="${cuenta.limite || 0}">
                </div>
                <div class="form-group">
                    <label for="edit-desgravamen">Desgravamen (%)</label>
                    <input type="number" id="edit-desgravamen" class="form-input" step="0.01" value="${cuenta.desgravamen || 0.34}">
                </div>
                <div class="form-group">
                    <label for="edit-diaCorte">Día de corte</label>
                    <input type="number" id="edit-diaCorte" class="form-input" min="1" max="31" value="${cuenta.diaCorte || 10}">
                </div>
                <div class="form-group">
                    <label for="edit-diaPago">Día de pago</label>
                    <input type="number" id="edit-diaPago" class="form-input" min="1" max="31" value="${cuenta.diaPago || 6}">
                </div>
            ` : ""}
            ${cuenta.tipo === "banco" || cuenta.tipo === "efectivo" ? `
                <div class="form-group">
                    <label for="edit-num">Número de cuenta</label>
                    <input type="text" id="edit-num" class="form-input" value="${cuenta.num || ""}">
                </div>
                <div class="form-group">
                    <label for="edit-cci">CCI</label>
                    <input type="text" id="edit-cci" class="form-input" value="${cuenta.cci || ""}">
                </div>
            ` : ""}
            <div class="cuenta-acciones-secundarias">
                <button type="button" class="modal-btn modal-btn-secondary" id="btn-editar-estado">
                    ${esArchivada ? "Desarchivar" : "Archivar"}
                </button>
                ${saldo === 0 ? `<button type="button" class="modal-btn modal-btn-secondary modal-btn-danger" id="btn-editar-eliminar">
                    Eliminar
                </button>` : ""}
            </div>
        </form>
    `

    abrirModal({
        titulo: `Editar ${cuenta.nombre}`,
        contenido: html,
        variante: "form",
        confirmText: "Guardar cambios",
        onConfirm: async () => {
            const nombre = document.getElementById("edit-nombre")?.value.trim()

            if (!nombre) {
                mostrarNotificacion("warning", "El nombre es obligatorio")
                return false
            }

            const datos = { nombre }

            if (permisoMoneda) {
                const monedaNueva = document.getElementById("edit-moneda")?.value
                if (monedaNueva && monedaNueva !== moneda) {
                    datos.moneda = monedaNueva
                }
            }

            if (cuenta.tipo === "credito") {
                datos.limite = parseFloat(document.getElementById("edit-limite")?.value) || 0
                datos.desgravamen = parseFloat(document.getElementById("edit-desgravamen")?.value) || 0.34
                datos.diaCorte = parseInt(document.getElementById("edit-diaCorte")?.value) || 10
                datos.diaPago = parseInt(document.getElementById("edit-diaPago")?.value) || 6
            }

            if (cuenta.tipo === "banco" || cuenta.tipo === "efectivo") {
                const num = document.getElementById("edit-num")?.value.trim()
                const cci = document.getElementById("edit-cci")?.value.trim()
                if (num) datos.num = num
                if (cci) datos.cci = cci
            }

            try {
                await actualizarCuenta(uid, cuenta.id, datos)
                await cargarCuentas()
                mostrarNotificacion("exito", "Cuenta actualizada")
                return true
            } catch (error) {
                console.error("Error actualizando cuenta:", error)
                mostrarNotificacion("error", `No se pudo guardar: ${error.message}`)
                return false
            }
        }
    })

    // Acciones secundarias: archivar/desarchivar y eliminar
    document.getElementById("btn-editar-estado")?.addEventListener("click", () => {
        cerrarModal()
        archivarCuentaSeleccionada()
    })
    document.getElementById("btn-editar-eliminar")?.addEventListener("click", () => {
        cerrarModal()
        eliminarCuentaSeleccionada()
    })
}