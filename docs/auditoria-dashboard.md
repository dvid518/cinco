# Auditoría del dashboard actual

Fecha de auditoría: 2026-09-23

## Alcance

Se revisaron, sin modificar código de aplicación:

- `js/pages/dashboard.js`
- `css/dashboard.css`
- `dashboard.html`
- `js/pages/configuracion.js`
- `js/core/lastbar.js`, para localizar el montaje y la acción existente de edición

El dashboard actual tiene 8 cards. La mayoría de la lógica de contenido sigue concentrada en `dashboard.js`; el HTML únicamente monta el punto de entrada dinámico.

## 1. Grid actual

El contenedor principal se genera desde `render()` de `js/pages/dashboard.js`:

```html
<div class="dashboard">
    ...
</div>
```

Definición actual en `css/dashboard.css`:

- `display: grid`
- `grid-template-columns: repeat(5, minmax(0, 1fr))` en escritorio
- `grid-auto-rows: minmax(0, 1fr)`
- `gap: 20px`
- `width: 100%`
- `height: 100%`
- `align-content: stretch`
- `overflow: visible`

Las cards usan `height: 100%`, por lo que el grid distribuye la altura disponible entre las filas. No existe una unidad base de altura ni masonry.

Breakpoints actuales:

| Rango | Columnas actuales | Regla |
|---|---:|---|
| ≥1200px | 5 | `repeat(5, minmax(0, 1fr))` |
| 900–1199px | 4 | `@media (max-width: 1199px) and (min-width: 900px)` |
| 600–899px | 3 | `@media (max-width: 899px) and (min-width: 600px)` |
| 400–599px | 2 | `@media (max-width: 599px) and (min-width: 400px)` |
| <400px | 1 | `@media (max-width: 399px)` |

Además, para anchos de hasta 899px se establece `grid-auto-rows: minmax(220px, auto)` y las cards reciben `min-height: 220px`. El panel del dashboard pasa a tener `overflow-y: auto` en ese rango.

La disposición responsive actual no coincide con la regla solicitada: el diseño objetivo requiere 4 columnas desde 1200px, 3 entre 900–1199px, 2 entre 600–899px y 1 por debajo de 600px.

## 2. Cards existentes

| Identificador | ID o selector adicional | Contenido | Altura natural aproximada actual |
|---|---|---|---|
| `patrimonio` | `.patrimonio-card`, `#patrimonio-valor` | Patrimonio total, selector de divisa, valor principal y detalle de activos/deuda | En escritorio queda determinada por la fila del grid; en móvil, mínimo 220px por la regla global |
| `cuentas` | `#card-cuentas`, `#total-cuentas` | Cantidad de cuentas activas y tarjetas; el detalle indica “Activas y tarjetas” | Misma altura de fila del grid; mínimo 220px en anchos ≤899px |
| `inversiones` | `#card-inversiones`, `#inversiones-valor` | Valor de inversiones, cantidad de posiciones y ganancia total | Misma altura de fila; mínimo 220px en anchos ≤899px |
| `vencimientos` | `#card-vencimientos`, `#vencimientos-cantidad` | Próximos vencimientos de los próximos 7 días, total y vencidos | Misma altura de fila; mínimo 220px en anchos ≤899px |
| `movimientos` | `#card-movimientos`, `#movimientos-lista` | Últimos movimientos, con cantidad configurable entre 1 y 10 | Misma altura de fila; la lista usa scroll interno |
| `favoritos` | `#card-favoritos`, `#favoritos-cantidad` | Activos marcados como favoritos y su precio; muestra contador | Misma altura de fila; la lista usa scroll interno |
| `metas` | `#card-metas`, `#metas-lista` | Metas de ahorro, monto actual y porcentaje; incluye botón de nueva meta | Misma altura de fila; la lista usa scroll interno |
| `grafico` | `.grafico-patrimonio-card`, `#grafico-patrimonio` | Gráfico de evolución patrimonial, selector 7D/30D/90D/1A/Todo y estado vacío | Misma altura de fila; el canvas ocupa el espacio disponible |

En el CSS actual, `.movimientos-lista`, `.favoritos-lista` y `.metas-lista` tienen `flex: 1 1 auto`, `overflow-y: auto` y `min-height: 0`. Esto permite que las listas conserven scroll interno en vez de aumentar la altura natural de la card.

No hay una clase de altura específica por tipo de card. La altura se decide globalmente por el grid y por `min-height: 220px` en responsive.

## 3. Renderizado de cada card

No existe una función de render independiente para cada card de nivel superior. `render()` genera las ocho estructuras HTML directamente y después `init()` instala eventos y carga datos.

### Patrimonio

- Markup estático en `render()`.
- `actualizarPatrimonio()` calcula y actualiza `#patrimonio-valor`.
- `actualizarCuentas()` actualiza `#patrimonio-detalle` con activos y deuda.
- `configurarDivisa()` actualiza la divisa seleccionada y redibuja el gráfico.
- El valor conserva las clases `positive` o `negative` según el resultado.
- El resalte actual `resaltado-0`, `resaltado-1` o `resaltado-2` se añade en el markup y solo redefine variables CSS de color.

### Cuentas

- Markup estático en `render()`.
- `actualizarCuentas()` actualiza `#total-cuentas`.
- `configurarCardsNavegacion()` asocia `card-cuentas` con `/cuentas`.

### Inversiones

- Markup estático en `render()`.
- `cargarInversiones()` obtiene posiciones y calcula valor, ganancia, cantidad y favoritos.
- `actualizarInversiones()` actualiza valor, detalle y clases de color de la card.
- `configurarCardsNavegacion()` asocia `card-inversiones` con `/inversiones`.

### Próximos vencimientos

- Markup estático en `render()`.
- `cargarVencimientos()` combina pendientes, tarjetas con pago próximo, anualidades y metas con fecha límite.
- `obtenerPendientesConVencimiento()`, `obtenerMetasConVencimiento()`, `obtenerAnualidadesConVencimiento()` y `obtenerTarjetasConPagoProximo()` producen los datos.
- `actualizarVencimientos()` actualiza cantidad, resumen y color.
- `abrirModalVencimientos()` crea el detalle y permite abrir el elemento relacionado.

### Últimos movimientos

- Markup estático en `render()`, con `#movimientos-lista`.
- `cargarMovimientos()` ordena por fecha.
- `actualizarMovimientos()` sustituye el contenido usando `plantillaMovimiento()`.
- `enlazarMovimientos()` delega los clics y teclado al detalle del movimiento.

### Favoritos

- Markup estático en `render()`, con `#favoritos-lista` y `#favoritos-cantidad`.
- `actualizarFavoritos()` renderiza la lista o el estado vacío.
- `plantillaFavorito()` crea cada fila.
- `enlazarFavoritos()` abre el gráfico/precio del activo.
- `configurarCardsNavegacion()` asocia la card a `/inversiones`.

### Metas

- Markup estático en `render()`, con `#metas-lista` y botón de nueva meta.
- `configurarMetas()` conecta el botón y registra sincronización con el evento `metas-actualizadas`.
- `actualizarMetas()` renderiza la lista o el estado vacío.
- `plantillaMeta()` crea cada fila.
- `enlazarListaMetas()` abre el aporte a la meta.

### Evolución patrimonial

- Markup estático en `render()`, con `#grafico-periodos`, `#grafico-periodo`, canvas y estado vacío.
- `configurarPeriodos()` gestiona el selector de temporalidad y persiste el periodo seleccionado mediante `actualizarPreferencias`.
- `cargarGraficoPatrimonio()` obtiene snapshots filtrados por el periodo.
- `dibujarGrafico()` delega el chart a `js/ui/graficos.js`.
- `crearGraficoPatrimonio()` decide el dataset de divisa y dibuja el gráfico.

## 4. Contenedor del grid

En `dashboard.html`:

- El punto de montaje es `<main id="app-content"></main>` en la línea 67.
- El footer persistente es `<footer id="app-footer"></footer>` en la línea 70.
- `dashboard.js` devuelve el HTML de `render()`, y el router/app lo inserta en `app-content`.
- El grid no está escrito directamente en `dashboard.html`; se crea en `js/pages/dashboard.js:155`.

La hoja de estilos del dashboard se carga en `dashboard.html:13`.

## 5. Persistencia actual de preferencias

El patrón usado por Configuración es:

1. `cargarPreferencias()` en `js/pages/configuracion.js` llama a `obtenerPreferencias(uid)`.
2. Los valores se muestran en los controles de la página.
3. `construirPreferencias()` construye un objeto completo de preferencias.
4. `guardarPreferencias()` llama a `aplicarPreferencias()`.
5. `aplicarPreferencias()` llama a `actualizarPreferencias(uid, objeto)` para persistir en Firestore.
6. `sesion.setPreferencias(preferencias)` actualiza la copia de sesión.
7. Algunas preferencias también se reflejan en `sessionStorage` mediante `sesion.setPreferencias()`.

El objeto actual de preferencias incluye, entre otros campos:

- `tema`
- `periodoEvolucion`
- `resaltarPatrimonio`
- `formatoDivisa`
- `movimientosRecientes`
- `paginas`
- `divisaPrincipal`
- `tipoCambio`
- `seg`
- `accesibilidad`
- `tiposMovimiento`

### Persistencia específica del dashboard actual

La selección y orden actuales de cards no se guardan en `preferencias.dashboard` ni en Firestore. Se guardan en:

```text
localStorage["escinco_dashboard_cards"]
```

La función `obtenerIdsDashboard()` lee esa clave, filtra ids conocidos, elimina duplicados y limita el resultado a 8. `aplicarLayoutDashboard()` oculta cards y las vuelve a anexar en el orden leído.

El editor actual:

- Se abre desde el botón existente `data-accion="editar-dashboard"` del lastbar del dashboard.
- Se define en `js/core/lastbar.js` y se delega a `abrirEditorDashboard()`.
- Muestra las ocho cards, incluido patrimonio.
- Exige al menos dos visibles.
- Impone un máximo de ocho.
- Guarda únicamente en `localStorage`.
- No tiene orden independiente de visibilidad: el orden guardado es el orden de los checkboxes consultedados y usado para reappendar las cards.

## 6. Lógica actual de orden y visibilidad

La lógica existente está en el bloque inicial de `dashboard.js`:

- `DASHBOARD_CARDS`: catálogo de ids y etiquetas.
- `MAX_DASHBOARD_CARDS = 8`: límite actual.
- `CLAVE_LAYOUT_DASHBOARD = "escinco_dashboard_cards"`: clave local.
- `obtenerIdsDashboard()`: lectura, validación y límite.
- `aplicarLayoutDashboard()`:
  - consulta `.dashboard`;
  - obtiene todas las cards `[data-dashboard-card]`;
  - asigna `hidden` a las no seleccionadas;
  - anexa las visibles en el orden de `obtenerIdsDashboard()`.
- `abrirEditorDashboard()`: crea checkboxes, valida cantidad y persiste en `localStorage`.

Actualmente:

- Patrimonio es ocultable desde el editor.
- Patrimonio puede cambiar de posición si el orden guardado lo coloca en otro lugar.
- El orden sí cambia en el DOM, pero no hay una array `orden` separada de Firestore.
- El layout no soporta más de ocho cards.
- No hay modo edición de dashboard propiamente dicho: solo hay un modal de checkboxes.
- No hay drag and drop.
- No hay alternativa de teclado para reordenar.
- No hay modo de edición que inhiba la navegación de cards.
- El lastbar ya tiene un botón de edición visible solo en el dashboard.
- La card de patrimonio no tiene navegación configurada actualmente.

## 7. Clases CSS y atributos de cada card

### Patrimonio

- `glass card primary patrimonio-card`
- `data-dashboard-card="patrimonio"`
- Puede recibir `resaltado-1` o `resaltado-2` desde `resaltarPatrimonio`.
- Contiene `.card-header`, `.card-title`, `.divisa-select`, `.card-value` y `.card-sub`.
- No tiene `role="button"` ni `tabindex`.
- El valor tiene `id="patrimonio-valor"`; el detalle tiene `id="patrimonio-detalle"`.
- El selector de divisa tiene `id="divisa-select"`.

### Cuentas

- `glass card card-navegable positive`
- `data-dashboard-card="cuentas"`
- `id="card-cuentas"`
- `role="button"`, `tabindex="0"`, `title="Ver cuentas"`.
- Elementos internos: `.card-title`, `.card-value#total-cuentas`, `.card-sub`.

### Inversiones

- `glass card card-navegable`
- `data-dashboard-card="inversiones"`
- `id="card-inversiones"`
- `role="button"`, `tabindex="0"`, `title="Ver inversiones"`.
- Elementos internos: `.card-value#inversiones-valor`, `.card-sub#inversiones-detalle`.

### Próximos vencimientos

- `glass card card-navegable`
- `data-dashboard-card="vencimientos"`
- `id="card-vencimientos"`
- `role="button"`, `tabindex="0"`, `title="Ver pendientes"`.
- Elementos internos: `.card-value#vencimientos-cantidad`, `.card-sub#vencimientos-detalle`.

### Últimos movimientos

- `glass card card-navegable movimientos-card`
- `data-dashboard-card="movimientos"`
- `id="card-movimientos"`
- `role="button"`, `tabindex="0"`, `title="Ver movimientos"`.
- Lista interna `.movimientos-lista#movimientos-lista`.

### Favoritos

- `glass card card-navegable favoritos-card`
- `data-dashboard-card="favoritos"`
- `id="card-favoritos"`
- `role="button"`, `tabindex="0"`, `title="Ver inversiones"`.
- Header con `.card-title`, `.card-badge#favoritos-cantidad`.
- Lista interna `.favoritos-lista#favoritos-lista`.

### Metas

- `glass card metas-card`
- `data-dashboard-card="metas"`
- No tiene `role="button"` a nivel de card.
- Header con `.card-title` y `.glass-btn.btn-meta-nueva#btn-nueva-meta`.
- Lista interna `.metas-lista#metas-lista`.

### Evolución patrimonial

- `glass card grafico-patrimonio-card`
- `data-dashboard-card="grafico"`
- No tiene `role="button"` a nivel de card.
- Header con `.card-title` y `.toggle-group.grafico-periodos#grafico-periodos`.
- Etiqueta de periodo `.card-sub#grafico-periodo`.
- Contenedor `.grafico-container-dashboard`.
- Canvas `#grafico-patrimonio`.
- Estado `.grafico-estado#grafico-estado`.

## Conclusiones para la Fase 2

- El punto de entrada y la arquitectura de cards permiten conservar la lógica de contenido y cambiar solo la distribución visual.
- La selección actual en `localStorage` debe migrarse a `preferencias.dashboard.cardsVisibles` y `preferencias.dashboard.orden` en Firestore.
- El catálogo y el editor actuales tienen que separar patrimonio de las cards secundarias: patrimonio debe ser siempre visible, primero y fijo.
- El grid actual es uniforme; no existe todavía una unidad de altura ni masonry.
- Los breakpoints actuales deben reorganizarse para cumplir 4/3/2/1 columnas.
- El botón de última barra para editar dashboard ya existe y puede reutilizarse como punto de entrada.
- El contenido interno de las cards no necesita modificarse en las fases de layout; sus funciones de carga, actualización y navegación están separadas de la estructura visual.
- El modal de información del patrimonio no se debe añadir todavía: la tarea de esta fase es únicamente auditoría.
