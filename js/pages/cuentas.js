import { sesion } from "../core/sesion.js"
import {
    obtenerCuentas,
    crearCuenta,
    actualizarCuenta
} from "../../firebase/firestore.js"
import { abrirModal } from "../ui/modal.js"

let cuentas = []
let cuentaSeleccionada = null
let uid = null

// ============================================
// RENDER
// ============================================

export function render() {
    return `
        <section id="sidebar">
            <button name="cta" class="glass act">Cargando...</button>
        </section>
        <section id="panel" class="glass">
            <h2>Cuentas</h2>
            <p class="lista-vacia">Cargando...</p>
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

        if (cuentas.length > 0) {
            seleccionarCuenta(cuentas[0].id)
        } else {
            mostrarVacio()
        }
    } catch (error) {
        console.error("Error cargando cuentas:", error)
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

        // Punto de color como span, no como style inline
        if (cuenta.color) {
            const punto = document.createElement("span")
            punto.className = "cuenta-color"
            punto.style.setProperty("--cuenta-color", cuenta.color)
            // Se aplica via CSS: .cuenta-color { background: var(--cuenta-color) }
            punto.style.background = cuenta.color  // Fallback seguro, ver nota
            btn.appendChild(punto)
        }

        const label = cuenta.tipo === "credito" ? `${cuenta.nombre} 💳` : cuenta.nombre
        btn.appendChild(document.createTextNode(label))

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
    const color = c.color || "#738391"

    panel.innerHTML = `
        <div class="cuenta-detalle-header">
            <span class="cuenta-color" style="background:${color}"></span>
            <h2>${c.nombre}</h2>
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
    const color = c.color || "#738391"

    let nivelClase = ""
    let nivelTexto = "Normal"
    if (porcentaje >= 70) {
        nivelClase = "negative"
        nivelTexto = "⚠️ Crítico"
    } else if (porcentaje >= 30) {
        nivelClase = "positive"
        nivelTexto = "⚡ Advertencia"
    }

    const corteInfo = calcularDiasHasta(c.diaCorte)
    const pagoInfo = calcularDiasHasta(c.diaPago)

    panel.innerHTML = `
        <div class="cuenta-detalle-header">
            <span class="cuenta-color" style="background:${color}"></span>
            <h2>${c.nombre} 💳</h2>
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
    const editBtn = document.querySelector(".lastbar .item.desact")
    const archBtn = document.querySelectorAll(".lastbar .item.desact")[1]

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
        alert("Selecciona una cuenta primero")
    }
}

export function archivarCuentaSeleccionada() {
    if (!cuentaSeleccionada) {
        alert("Selecciona una cuenta primero")
        return
    }
    const saldo = cuentaSeleccionada.saldoInicial || 0
    if (saldo !== 0) {
        alert(`No se puede archivar una cuenta con saldo diferente de 0 (saldo actual: ${saldo})`)
        return
    }
    if (confirm(`¿Archivar la cuenta "${cuentaSeleccionada.nombre}"?`)) {
        archivarCuenta(cuentaSeleccionada.id)
    }
}

async function archivarCuenta(id) {
    try {
        await actualizarCuenta(uid, id, { estado: "archivada" })
        await cargarCuentas()
    } catch (error) {
        console.error("Error archivando cuenta:", error)
        alert(`❌ Error: ${error.message}`)
    }
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

        if (!holdState[btnId].isHolding) {
            seleccionarCuenta(btnId)
        }
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

        seleccionarCuenta(btnId)
        if (cuentaSeleccionada) {
            _abrirModalEditarCuenta(cuentaSeleccionada)
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
            <div class="form-group">
                <label for="campo-color">Color</label>
                <input type="color" id="campo-color" class="form-input form-input-color" value="#738391">
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
            const color = document.getElementById("campo-color")?.value || "#738391"

            if (!nombre) {
                alert("El nombre es obligatorio")
                return false
            }

            const datos = {
                nombre,
                tipo,
                moneda,
                saldoInicial: saldo,
                color,
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
                return true
            } catch (error) {
                console.error("Error creando cuenta:", error)
                alert(`❌ Error: ${error.message}`)
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
    const html = `
        <form id="form-editar-cuenta" class="form-movimiento">
            <div class="form-group">
                <label for="edit-nombre">Nombre</label>
                <input type="text" id="edit-nombre" class="form-input" value="${cuenta.nombre || ""}" required>
            </div>
            <div class="form-group">
                <label for="edit-color">Color</label>
                <input type="color" id="edit-color" class="form-input form-input-color" value="${cuenta.color || "#738391"}">
            </div>
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
        </form>
    `

    abrirModal({
        titulo: `Editar ${cuenta.nombre}`,
        contenido: html,
        variante: "form",
        confirmText: "Guardar cambios",
        onConfirm: async () => {
            const nombre = document.getElementById("edit-nombre")?.value.trim()
            const color = document.getElementById("edit-color")?.value

            if (!nombre) {
                alert("El nombre es obligatorio")
                return false
            }

            const datos = { nombre, color }

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
                return true
            } catch (error) {
                console.error("Error actualizando cuenta:", error)
                alert(`❌ Error: ${error.message}`)
                return false
            }
        }
    })
}