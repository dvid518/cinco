// ============================================
// GRÁFICOS CON CHART.JS
// ============================================

let chartInstance = null
let patrimonioChartInstance = null

// Última configuración usada, para poder redibujar al cambiar el tema
let ultimoGraficoLinea = null
let ultimoGraficoPatrimonio = null
let observadorTema = null

// ============================================
// CARGA DE CHART.JS (local)
// ============================================

let chartCargado = false

async function cargarChartJS() {
    if (window.Chart) return window.Chart

    if (chartCargado) {
        // Si ya se está cargando, esperar
        return new Promise(resolve => {
            const check = setInterval(() => {
                if (window.Chart) {
                    clearInterval(check)
                    resolve(window.Chart)
                }
            }, 50)
        })
    }

    chartCargado = true

    return new Promise((resolve, reject) => {
        const script = document.createElement("script")
        script.src = "/js/lib/chart.umd.min.js"
        script.onload = () => resolve(window.Chart)
        script.onerror = () => {
            chartCargado = false
            reject(new Error("No se pudo cargar Chart.js"))
        }
        document.head.appendChild(script)
    })
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
        if (ultimoGraficoPatrimonio) {
            const { canvasId, datos, opciones } = ultimoGraficoPatrimonio
            crearGraficoPatrimonio(canvasId, datos, opciones)
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

export async function crearGraficoPatrimonio(canvasId, datos, opciones = {}) {
    try {
        const Chart = await cargarChartJS()

        if (patrimonioChartInstance) {
            patrimonioChartInstance.destroy()
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

        const divisa = opciones.divisa || 'PEN'

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

        patrimonioChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: datos.labels || [],
                datasets: [{
                    label: `Patrimonio ${divisa}`,
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
                            label: (context) => {
                                return `${divisa} ${context.parsed.y.toFixed(2)}`
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
                            callback: (value) => value.toFixed(0)
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
        ultimoGraficoPatrimonio = { canvasId, datos, opciones }
        configurarObservadorTema()

        return patrimonioChartInstance
    } catch (error) {
        console.error("Error creando gráfico de patrimonio:", error)
        return null
    }
}

export function destruirGraficoPatrimonio() {
    if (patrimonioChartInstance) {
        patrimonioChartInstance.destroy()
        patrimonioChartInstance = null
    }
    ultimoGraficoPatrimonio = null
}