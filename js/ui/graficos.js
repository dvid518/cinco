// ============================================
// GRÁFICOS CON CHART.JS
// ============================================

import { formatearMontoConDivisa, presentarDivisa } from "../services/DivisaServicio.js"

let chartInstance = null
const patrimonioCharts = new Map()
const configuracionesPatrimonio = new Map()

// Última configuración usada, para poder redibujar al cambiar el tema
let ultimoGraficoLinea = null
let observadorTema = null

// ============================================
// CARGA DE CHART.JS (local)
// ============================================

let promesaChartJS = null

async function cargarChartJS() {
    if (window.Chart) return window.Chart
    if (promesaChartJS) return promesaChartJS

    promesaChartJS = new Promise((resolve, reject) => {
        const script = document.createElement("script")
        script.src = "/js/lib/chart.umd.min.js"
        script.onload = () => resolve(window.Chart)
        script.onerror = () => {
            promesaChartJS = null
            reject(new Error("No se pudo cargar Chart.js"))
        }
        document.head.appendChild(script)
    })

    return promesaChartJS
}

// ============================================
// TEMA DINÁMICO
// ============================================
// Los colores se leen de las variables CSS con getComputedStyle al
// crear cada gráfico. Un único MutationObserver sobre data-theme
// redibuja los gráficos existentes con los colores del nuevo tema.

function configurarObservadorTema() {
    if (observadorTema) return

    observadorTema = new MutationObserver(() => {
        if (ultimoGraficoLinea) {
            const { canvasId, datos, opciones } = ultimoGraficoLinea
            crearGraficoLinea(canvasId, datos, opciones)
        }
        for (const [chartKey, configuracion] of configuracionesPatrimonio) {
            const { canvasId, datos, opciones } = configuracion
            crearGraficoPatrimonio(canvasId, datos, { ...opciones, chartKey })
        }
    })

    observadorTema.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"]
    })
}

function leerColores() {
    const estilos = getComputedStyle(document.documentElement)
    return {
        positive: estilos.getPropertyValue('--positive').trim() || '#00E695',
        text: estilos.getPropertyValue('--text').trim() || '#F3F3F3',
        textSecondary: estilos.getPropertyValue('--textSecondary').trim() || '#738391',
        border: estilos.getPropertyValue('--border').trim() || '#D0DCE8',
        textAct: estilos.getPropertyValue('--textAct').trim() || '#F3F3F3',
        paleSky: estilos.getPropertyValue('--paleSky').trim() || '#D0DCE8'
    }
}

// ============================================
// GRÁFICO DE LÍNEA
// ============================================

export async function crearGraficoLinea(canvasId, datos, opciones = {}) {
    try {
        const Chart = await cargarChartJS()

        if (chartInstance) {
            chartInstance.destroy()
        }

        const canvas = document.getElementById(canvasId)
        if (!canvas) {
            console.warn(`Canvas no encontrado: ${canvasId}`)
            return null
        }

        const ctx = canvas.getContext('2d')

        const colores = leerColores()
        const colorPositive = colores.positive
        const colorText = colores.text
        const colorTextSecondary = colores.textSecondary
        const colorBorder = colores.border

        const gradient = ctx.createLinearGradient(0, 0, 0, 300)
        gradient.addColorStop(0, colorPositive + '40')
        gradient.addColorStop(1, colorPositive + '00')

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: datos.labels || [],
                datasets: [{
                    label: opciones.label || 'Precio',
                    data: datos.data || [],
                    borderColor: colorPositive,
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: colorPositive,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: colorText,
                        bodyColor: colorText,
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            label: (context) => {
                                return `${opciones.simbolo || ''} ${context.parsed.y.toFixed(2)}`
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: colorTextSecondary,
                            font: { size: 10, family: 'Roboto Mono' }
                        }
                    },
                    y: {
                        grid: {
                            color: colorBorder + '30',
                            drawBorder: false
                        },
                        ticks: {
                            color: colorTextSecondary,
                            font: { size: 10, family: 'Roboto Mono' },
                            callback: (value) => value.toFixed(2)
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        })

        // Recordar para redibujar al cambiar el tema
        ultimoGraficoLinea = { canvasId, datos, opciones }
        configurarObservadorTema()

        return chartInstance
    } catch (error) {
        console.error("Error creando gráfico:", error)
        return null
    }
}

// ============================================
// GRÁFICO DE EVOLUCIÓN DE PRECIO (últimos 7 días)
// ============================================
// Línea simple, sin velas ni indicadores. Reutiliza la configuración
// de crearGraficoLinea (misma instancia, colores del tema y redibujado).

export async function crearGraficoEvolucionPrecio(canvasId, datos, opciones = {}) {
    return crearGraficoLinea(canvasId, datos, {
        label: opciones.label || "Precio",
        simbolo: opciones.simbolo || ""
    })
}

// ============================================
// DESTRUIR GRÁFICO
// ============================================

export function destruirGrafico() {
    if (chartInstance) {
        chartInstance.destroy()
        chartInstance = null
    }
    ultimoGraficoLinea = null
}

// ============================================
// GRÁFICO DE PATRIMONIO (múltiples líneas)
// ============================================

function simplificarEtiquetasPatrimonio(labels) {
    if (labels.length <= 8) return [...labels]
    const step = Math.ceil(labels.length / 8)
    return labels.map((label, indice) => indice % step === 0 || indice === labels.length - 1 ? label : "")
}

export async function crearGraficoPatrimonio(canvasId, datos, opciones = {}) {
    const { chartKey = "dashboard", ...opcionesGrafico } = opciones

    try {
        const Chart = await cargarChartJS()

        const instanciaAnterior = patrimonioCharts.get(chartKey)
        if (instanciaAnterior) {
            instanciaAnterior.destroy()
        }

        const canvas = document.getElementById(canvasId)
        if (!canvas) {
            console.warn(`Canvas no encontrado: ${canvasId}`)
            return null
        }

        const ctx = canvas.getContext('2d')

        const colores = leerColores()
        const colorPositive = colores.positive
        const colorText = colores.text
        const colorTextSecondary = colores.textSecondary
        const colorBorder = colores.border
        const colorTextAct = colores.textAct
        const colorPaleSky = colores.paleSky

        const divisa = opcionesGrafico.divisa || 'PEN'
        const etiquetaDivisa = opcionesGrafico.etiquetaDivisa || presentarDivisa(divisa.toLowerCase())
        const etiquetasOriginales = datos.labels || []
        const etiquetasVisibles = simplificarEtiquetasPatrimonio(etiquetasOriginales)

        // Seleccionar datos según divisa
        let data
        let color
        if (divisa === 'PEN') {
            data = datos.dataPEN
            color = colorPositive
        } else if (divisa === 'USD') {
            data = datos.dataUSD
            color = colorTextAct
        } else {
            data = datos.dataUSDT
            color = colorPaleSky
        }

        const gradient = ctx.createLinearGradient(0, 0, 0, 300)
        gradient.addColorStop(0, color + '40')
        gradient.addColorStop(1, color + '00')

        const instancia = new Chart(ctx, {
            type: 'line',
            data: {
                labels: etiquetasVisibles,
                datasets: [{
                    label: `Patrimonio ${etiquetaDivisa}`,
                    data: data || [],
                    borderColor: color,
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2,
                    pointBackgroundColor: color,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: colorText,
                        bodyColor: colorText,
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            title: (items) => {
                                const indice = items?.[0]?.dataIndex ?? 0
                                return etiquetasOriginales[indice] || ""
                            },
                            label: (context) => {
                                return formatearMontoConDivisa(context.parsed.y, divisa.toLowerCase())
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: colorTextSecondary,
                            font: { size: 10, family: 'Roboto Mono' },
                            maxRotation: 0,
                            autoSkip: false,
                            maxTicksLimit: 8
                        }
                    },
                    y: {
                        beginAtZero: true,
                        min: 0,
                        suggestedMin: 0,
                        grid: {
                            color: colorBorder + '30',
                            drawBorder: false
                        },
                        ticks: {
                            color: colorTextSecondary,
                            font: { size: 10, family: 'Roboto Mono' },
                            callback: (value) => value.toFixed(0)
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'nearest'
                }
            }
        })

        // Recordar para redibujar al cambiar el tema
        patrimonioCharts.set(chartKey, instancia)
        configuracionesPatrimonio.set(chartKey, { canvasId, datos, opciones: opcionesGrafico })
        configurarObservadorTema()

        return instancia
    } catch (error) {
        console.error("Error creando gráfico de patrimonio:", error)
        return null
    }
}

export function destruirGraficoPatrimonio(chartKey = "dashboard") {
    const instancia = patrimonioCharts.get(chartKey)
    if (instancia) {
        instancia.destroy()
        patrimonioCharts.delete(chartKey)
    }
    configuracionesPatrimonio.delete(chartKey)
}