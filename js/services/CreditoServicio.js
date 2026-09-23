import { obtenerCuentas, actualizarCuenta } from "../../firebase/firestore.js"
import { DIVISAS_SYMBOLS } from "../../constants/divisas.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"
import { abrirModal } from "../ui/modal.js"
import { icono } from "../core/iconos.js"

// ============================================
// MANEJO DEL DINERO · USO DEL CRÉDITO
// ============================================
// Reglas de uso de la línea de crédito configurables por tarjeta:
//   - < umbralAviso   (por defecto 30): uso saludable
//   - >= umbralAviso  : uso elevado; puede afectar el historial crediticio (ámbar)
//   - >= umbralCritico(por defecto 70): uso excesivo / peligroso (rojo)
// Cada tarjeta guarda `umbralAviso`, `umbralCritico` y los flags
// `avisoUsoEnviado` / `avisoCriticoEnviado`, para que la notificación
// se dispare UNA sola vez, en el momento en que se cruza el umbral.
// ============================================

export const UMBRAL_AVISO_DEFECTO = 30
export const UMBRAL_CRITICO_DEFECTO = 70

export function umbralesDe(tarjeta) {
    let aviso = Math.round(Number(tarjeta?.umbralAviso))
    let critico = Math.round(Number(tarjeta?.umbralCritico))
    if (!Number.isFinite(aviso) || aviso <= 0) aviso = UMBRAL_AVISO_DEFECTO
    if (!Number.isFinite(critico) || critico <= 0) critico = UMBRAL_CRITICO_DEFECTO
    if (critico < aviso) critico = aviso
    return { aviso, critico }
}

export function usoDe(tarjeta) {
    const limite = Number(tarjeta?.limite) || 0
    const deuda = Number(tarjeta?.deuda) || 0
    return {
        limite,
        deuda,
        porcentaje: limite > 0 ? (deuda / limite) * 100 : 0
    }
}

// Nivel de uso: "normal" | "aviso" | "critico"
export function nivelUsoDe(tarjeta) {
    const { limite, deuda, porcentaje } = usoDe(tarjeta)
    const { aviso, critico } = umbralesDe(tarjeta)
    const nivel =
        limite > 0 && porcentaje >= critico
            ? "critico"
            : limite > 0 && porcentaje >= aviso
                ? "aviso"
                : "normal"
    return { nivel, porcentaje, aviso, critico, limite, deuda }
}

export function nivelEstadoCuenta(tarjeta, consumos) {
    const limite = Number(tarjeta?.limite) || 0
    const gastos = Math.max(0, Number(consumos) || 0)
    const porcentaje = limite > 0 ? (gastos / limite) * 100 : 0
    const { aviso, critico } = umbralesDe(tarjeta)
    const nivel = limite > 0 && porcentaje >= critico
        ? "critico"
        : limite > 0 && porcentaje >= aviso
            ? "aviso"
            : "normal"
    return { nivel, porcentaje, aviso, critico, limite, gastos }
}

export function simboloMonedaCuenta(moneda) {
    return DIVISAS_SYMBOLS[(moneda || "pen").toLowerCase()] || "S/"
}

// ============================================
// CICLO DE FACTURACIÓN DE LA TARJETA
// ============================================
// El "ciclo actual" de una tarjeta va del último día de corte al próximo.
// Los gastos (compra) registrados con fecha dentro de ese rango forman el
// estado de cuenta que se paga en el próximo día de pago. Lo gastado tras un
// corte pertenece al siguiente ciclo.
//
//   consumos  = suma de gastos (gasto / compraTarjeta) del ciclo
//   pagos     = suma de pagos (pagoTarjeta) con fecha en el ciclo
//   restante  = consumos − pagos (≥ 0)
//   pagado    = pagos >= consumos (el valor del mes está pago completo)

function inicioDeDia(fecha) {
    const d = new Date(fecha)
    d.setHours(0, 0, 0, 0)
    return d
}

function diaDelMesComoFecha(anio, mes, dia) {
    const ultimoDia = new Date(anio, mes + 1, 0).getDate()
    const d = Math.min(Math.max(1, Math.round(Number(dia))), ultimoDia)
    return new Date(anio, mes, d)
}

export function periodoDeCorte(diaCorte, ref = new Date()) {
    const dia = Math.round(Number(diaCorte))
    if (!Number.isFinite(dia) || dia < 1) return null

    const hoy = inicioDeDia(ref)
    const anio = hoy.getFullYear()
    const mes = hoy.getMonth()

    const corteEsteMes = diaDelMesComoFecha(anio, mes, dia)
    const ultimoCorte = corteEsteMes <= hoy
        ? corteEsteMes
        : diaDelMesComoFecha(anio, mes - 1, dia)
    const proximoCorte = corteEsteMes > hoy
        ? corteEsteMes
        : diaDelMesComoFecha(anio, mes + 1, dia)

    return { ultimoCorte, proximoCorte }
}

function fechaDeMovimiento(m) {
    const valor = m?.fechaRealizacion || m?.fechaRegistro
    if (!valor) return null
    if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
        const [anio, mes, dia] = valor.split("-").map(Number)
        return inicioDeDia(new Date(anio, mes - 1, dia))
    }
    if (valor?.toDate) return inicioDeDia(valor.toDate())
    if (valor?.seconds) return inicioDeDia(new Date(valor.seconds * 1000))
    return inicioDeDia(new Date(valor))
}

function esGastoDeTarjeta(m, tarjetaId) {
    return (
        (m?.tipo === "gasto" || m?.tipo === "compraTarjeta" || m?.tipo === "compraActivo" || m?.tipo === "p2pCompra") &&
        m?.cuenta === tarjetaId
    )
}

function esPagoDeTarjeta(m, tarjetaId) {
    return m?.tipo === "pagoTarjeta" && m?.tarjeta === tarjetaId
}

function montoDeGasto(m) {
    if (m?.monto !== undefined && m?.monto !== null && m?.monto !== "") return Number(m.monto) || 0
    return ((Number(m?.cantidad) || 0) * (Number(m?.precio) || 0)) + (Number(m?.comision) || 0)
}

export function movimientosDelCiclo(tarjeta, movimientos = []) {
    const periodo = periodoDeCorte(tarjeta?.diaCorte)
    if (!periodo) return { consumos: 0, pagos: 0, enRango: [] }

    const enRango = []
    let consumos = 0
    let pagos = 0

    for (const m of movimientos) {
        const fecha = fechaDeMovimiento(m)
        if (!fecha) continue
        if (fecha < periodo.ultimoCorte || fecha >= periodo.proximoCorte) continue

        if (esGastoDeTarjeta(m, tarjeta.id)) {
            consumos += montoDeGasto(m)
            enRango.push(m)
        } else if (esPagoDeTarjeta(m, tarjeta.id)) {
            pagos += Number(m.monto) || 0
            enRango.push(m)
        }
    }

    return { consumos, pagos, enRango }
}

export function estadoCicloDe(tarjeta, movimientos = []) {
    const { consumos, pagos, enRango } = movimientosDelCiclo(tarjeta, movimientos)
    const restante = Math.max(0, consumos - pagos)
    const pagadoCompleto = consumos > 0 ? pagos >= consumos : false
    const periodo = periodoDeCorte(tarjeta?.diaCorte)

    return {
        consumos,
        pagos,
        restante,
        pagadoCompleto,
        enRango,
        ultimoCorte: periodo?.ultimoCorte || null,
        proximoCorte: periodo?.proximoCorte || null
    }
}

// ============================================
// ANUALIDAD DE LA TARJETA
// ============================================
// `anualidad` (monto) + `anualidadFecha` ("MM-DD"). Devuelve la próxima
// ocurrencia de la anualidad a partir de hoy, o null si no está configurada.

export function proximaAnualidad(tarjeta) {
    const monto = Number(tarjeta?.anualidad)
    const fechaStr = String(tarjeta?.anualidadFecha || "").trim()
    if (!monto || monto <= 0 || !/^\d{2}-\d{2}$/.test(fechaStr)) return null

    const [mesStr, diaStr] = fechaStr.split("-").map(Number)
    if (!mesStr || mesStr < 1 || mesStr > 12 || !diaStr || diaStr < 1 || diaStr > 31) return null

    const hoy = inicioDeDia(new Date())
    const anio = hoy.getFullYear()

    let fecha = diaDelMesComoFecha(anio, mesStr - 1, diaStr)
    if (fecha < hoy) {
        fecha = diaDelMesComoFecha(anio + 1, mesStr - 1, diaStr)
    }

    return { fecha, monto }
}

// ============================================
// DETECCIÓN DE CRUCE
// ============================================
// Recorre las tarjetas, notifica solo cuando se cruza un umbral
// (una vez, gracias a los flags) y limpia los flags al bajar del aviso.
// Devuelve cuántas notificaciones dispararon y persiste el estado.

export async function notificarCruces(cuentas, uid) {
    const actualizaciones = []
    let notificadas = 0

    for (const c of cuentas) {
        if (c.tipo !== "credito") continue
        if (c.estado === "archivada") continue

        const { nivel } = nivelUsoDe(c)
        const cambios = {}

        if (nivel === "critico") {
            if (!c.avisoCriticoEnviado) {
                notificadas++
                notificarUsoDeCredito(c)
                cambios.avisoUsoEnviado = true
                cambios.avisoCriticoEnviado = true
            }
        } else if (nivel === "aviso") {
            if (!c.avisoUsoEnviado) {
                notificadas++
                notificarUsoDeCredito(c)
                cambios.avisoUsoEnviado = true
            }
        } else if (c.avisoUsoEnviado || c.avisoCriticoEnviado) {
            cambios.avisoUsoEnviado = false
            cambios.avisoCriticoEnviado = false
        }

        if (Object.keys(cambios).length > 0 && uid) {
            actualizaciones.push(actualizarCuenta(uid, c.id, cambios))
        }
    }

    if (actualizaciones.length > 0) {
        await Promise.all(actualizaciones)
    }
    return notificadas
}

// Evalúa todas las tarjetas del usuario y notifica los cruces recientes.
export async function evaluarCreditosYNotificar(uid) {
    if (!uid) return 0
    const cuentas = await obtenerCuentas(uid)
    return notificarCruces(cuentas, uid)
}

// ============================================
// NOTIFICACIÓN + MODAL EDUCATIVO
// ============================================

function notificarUsoDeCredito(tarjeta) {
    const info = nivelUsoDe(tarjeta)
    const mensaje = info.nivel === "critico"
        ? `${tarjeta.nombre}: usaste el ${info.porcentaje.toFixed(1)}% de tu línea de crédito. Por encima del ${info.critico}% es uso excesivo y puede afectar tu historial crediticio.`
        : `${tarjeta.nombre}: usaste el ${info.porcentaje.toFixed(1)}% de tu línea de crédito. Por encima del ${info.aviso}% el uso puede afectar tu historial crediticio.`

    mostrarNotificacion("warning", mensaje, 0, [{
        texto: "Más info",
        primaria: true,
        alClick: () => abrirModalEducativoCredito(tarjeta)
    }])
}

export function abrirModalEducativoCredito(tarjeta) {
    const { nivel, porcentaje, aviso, critico, limite, deuda } = nivelUsoDe(tarjeta)
    const simbolo = simboloMonedaCuenta(tarjeta.moneda)

    abrirModal({
        titulo: `Manejo del dinero · ${tarjeta.nombre}`,
        variante: "narrow",
        contenido: `
            <div class="credito-educativo">
                <div class="credito-educativo-cifra ${nivel}">
                    <span class="label">Uso de la línea de crédito</span>
                    <span class="valor">${porcentaje.toFixed(1)}%</span>
                </div>
                <div class="aporte-progreso-wrap">
                    <div class="aporte-progreso">
                        <div class="aporte-progreso-barra ${nivel}" style="--progreso:${Math.min(100, porcentaje).toFixed(1)}%"></div>
                    </div>
                    <span class="aporte-progreso-badge ${nivel}">${porcentaje.toFixed(0)}%</span>
                </div>
                <p class="credito-educativo-detalle">
                    ${simbolo}${deuda.toFixed(2)} de ${simbolo}${limite.toFixed(2)} de línea.
                </p>
                <div class="credito-educativo-niveles">
                    <div class="credito-educativo-fila">
                        <span class="punto normal"></span>
                        <span>Menos del <strong>${aviso}%</strong> de la línea: uso saludable.</span>
                    </div>
                    <div class="credito-educativo-fila">
                        <span class="punto aviso"></span>
                        <span>Entre <strong>${aviso}%</strong> y <strong>${critico}%</strong>: uso elevado; las entidades pueden verlo como riesgo en tu historial crediticio.</span>
                    </div>
                    <div class="credito-educativo-fila">
                        <span class="punto critico"></span>
                        <span>Más del <strong>${critico}%</strong>: uso excesivo o peligroso; conviene reducir la deuda cuanto antes.</span>
                    </div>
                </div>
                <p class="credito-educativo-tip">Tip: paga más que el mínimo, respeta tu día de pago y limita los consumos con la tarjeta para mantener una utilización sana.</p>
            </div>
        `,
        confirmText: `${icono("credit-card", 16)} Pagar tarjeta`,
        onConfirm: async () => {
            try {
                const { abrirPagarTarjeta } = await import("../pages/cuentas.js")
                await abrirPagarTarjeta(tarjeta)
            } catch (error) {
                console.error("Error abriendo pago de tarjeta:", error)
                mostrarNotificacion("error", "No se pudo abrir el pago de tarjeta")
            }
            return false
        }
    })
}