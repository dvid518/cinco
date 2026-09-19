# escinco · Requisitos

- **Nombre**: escinco
- **Versión**: 1.0.0-beta.5
- **Fase**: beta
- **Lanzamiento**: 2026-09-13
- **Descripción**: tucson

## Qué es

escinco es una **SPA de finanzas personales** que registra el patrimonio, las
cuentas, los movimientos, las inversiones y el trading de un usuario en
Firestore. No usa framework: JavaScript (ES Modules), HTML y CSS propios.

## Stack

| Componente | Tecnología |
|---|---|
| Frontend | JavaScript ES Modules, sin frameworks |
| Estilos | CSS por página + variables de tema (`css/style.css`) |
| Backend | Firebase: Auth, Firestore (rules + índices), Hosting |
| Firebase SDK | CDN `gstatic.com/firebasejs/12.0.0` |
| Build (dev) | Vite (`vite.config.mjs`, puerto 5500) |
| Gráficos | Chart.js embebido local (`js/lib/chart.umd.min.js`) |
| PWA | `manifest.webmanifest` + `sw.js` (precache + network-first) |
| Caché de datos | `js/core/cache.js` (TTL 5 min, dedupe, invalidación por repos) |

## Funcionalidades

### Autenticación
- Registro e inicio de sesión con **email + contraseña** y con **Google**.
- Creación automática del documento de usuario en Firestore.
- Sesión persistida en `sessionStorage` con **cierre por inactividad (30 min)**.
- Reautenticación (password/Google) y eliminación definitiva de cuenta.

### Dashboard
- Resumen del patrimonio en la divisa elegida (PEN/USD/USDT).
- Vencimientos de pendientes con acción de consolidar.
- Gráfico histórico de patrimonio (Chart.js).

### Cuentas
- Tipos: banco, efectivo, broker, exchange, tarjeta de crédito.
- Saldo por cuenta, archivar/activar, detalle con movimientos.
- Tarjetas: `deuda`, `limite`, `diaCorte`, `diaPago`, desgravamen.

### Movimientos (11 tipos)
ingreso, gasto, transferencia, cambioDivisa, compraActivo, ventaActivo,
p2pCompra, p2pVenta, compraTarjeta, pagoTarjeta, error.
- Campos obligatorios/opcionales por tipo en `constants/tiposMovimiento.js`.
- Actualización automática de saldos (con comisión en compras y ventas).
- Edición y eliminación con **reversión** de saldos y posiciones.
- Filtros: tipo, cuenta, divisa, rango de fechas, texto.

### Pendientes
- Cobrar/pagar con monto, divisa y fecha de vencimiento.
- Consolidar → genera el movimiento correspondiente y archiva el pendiente.

### Inversiones
- Posiciones por activo con promedio ponderado (compra) y valoración real.
- Rendimiento absoluto y porcentual frente al `ultimoPrecio` del activo.
- Gráfico de evolución del activo por periodo.
- **Favoritos**: marcar activos con estrella para resaltarlos en el dashboard.

### Estrategias DCA (compra programada)
- Estrategias por activo con monto fijo, divisa, cuenta de origen y frecuencia
  (diaria, semanal o mensual, con día preferido).
- Estado activa/pausada, próxima ejecución y última ejecución.
- CRUD desde Inversiones (vista Posiciones/Estrategias).

### Metas de ahorro
- Metas con monto objetivo, monto actual, divisa, fecha límite e ícono.
- Barra de progreso con porcentaje, monto restante y estado (activa, pausada,
  completada) en el dashboard.
- Aportes que descuentan de una cuenta y generan un movimiento de `gasto`.

### Trading
- Trades long/short con `entrada`, `salida`, `lotaje`, `sl`, `tp`, `nota`.
- P&L y P&L% calculados al cerrar; P&L flotante con el último precio conocido.

### Órdenes (límite/stop)
- Órdenes de compra (`long`) o venta (`short`), límite o stop, con precio de
  disparo, lotaje, SL/TP, cuenta y divisa.
- Al alcanzar el precio de disparo se abre un trade automáticamente y la orden
  pasa a `ejecutada`; incluye cancelar, eliminar y listado por estado.
- La evaluación es pull: al entrar a Trading y al pulsar "Actualizar".

### Snapshots de patrimonio
- Guardado diario (`snapshots/YYYY-MM-DD`) con `cerrado`.
- Excluye cuentas archivadas y no patrimoniales; resta la deuda de tarjetas.

### Divisa
- Divisas: PEN (`S/`), USD (`$`), USDT (`₮`, tratado como USD).
- Conversión manual con tipo de cambio configurable (`pen_usd`, modo manual).

### Datos
- **Exportar** respaldo `.dvid` (formato ESCINCO v3.0.0).
- **Importar** `.dvid` desde v2.0.0 (agrega sin borrar, con reporte).
- **Eliminar** todos los datos + cuenta de Auth (confirmación doble).

### Experiencia
- Tema oscuro/claro/sistema persistido (localStorage + Firestore).
- PWA instalable, actualización con banner y respaldo offline.
- Modal reutilizable (variantes, drag, focus trap), notificaciones, sidebar
  colapsable a riel de íconos, responsive móvil.

## Fuera de alcance (pendientes → `roadmap.md`)

Renta variable dentro de trading/posiciones y carga de precios diarios.
Detalle y prioridades en `roadmap.md`.