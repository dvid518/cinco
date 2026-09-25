# Propuesta de estructura masonry del dashboard

## Decisión general

Usaría CSS Grid como estructura base y un scheduler JavaScript pequeño para calcular la posición inicial de cada card. No usaría CSS `columns` porque no permite reservar de forma fiable un bloque de 2 columnas para patrimonio, ni controlar con precisión los spans y la ausencia de huecos.

La propuesta conserva el orden del DOM para lectores de pantalla y navegación por teclado. El scheduler solo asigna coordenadas visuales; la lista de cards seguirá siendo la fuente de orden semántico.

La propiedad principal será:

```css
.dashboard {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: var(--unidad-card);
    gap: var(--gap-card);
}
```

El valor inicial de `--unidad-card` será 80px, configurable en la fase de implementación si la verificación visual demuestra que 80px no deja suficiente espacio para el contenido de las cards de 1 unidad.

## 1. Alturas y anchors

### Patrimonio

- Identificador: `patrimonio`.
- Ancho: 2 columnas en escritorio, tablet y móvil de dos columnas.
- Altura: 2 unidades.
- Se inserta siempre antes de las demás cards.
- No aparece en el selector de cards.
- No se puede ocultar, mover ni reordenar.
- Mantiene sus clases y variables de color actuales, incluido `resaltado-0`, `resaltado-1` y `resaltado-2`.
- En menos de 600px ocupará una sola columna y 2 unidades.

Propuesta CSS:

```css
.patrimonio-card {
    grid-column: span 2;
    grid-row: span 2;
}

@media (max-width: 599px) {
    .patrimonio-card {
        grid-column: span 1;
        grid-row: span 2;
    }
}
```

### Cards secundarias

| Card | Ancho | Altura | Motivo |
|---|---:|---:|---|
| `cuentas` | 1 | 1 | Dato simple y detalle de una línea |
| `inversiones` | 1 | 1 | Dato simple y detalle de una línea |
| `vencimientos` | 1 | 1 | Dato simple y resumen corto |
| `favoritos` | 1 | 2 | Lista con scroll interno |
| `metas` | 1 | 2 | Lista con scroll interno y botón de alta |
| `movimientos` | 1 | 3 | Lista densa de movimientos |
| `grafico` | 1 | 3 | Gráfico y selector de periodos |

`movimientos` y `grafico` quedan en 3 unidades como altura inicial. La arquitectura permitirá subir `grafico` a 4 unidades en una iteración posterior si la verificación visual lo recomienda, sin cambiar el scheduler.

Las alturas se expresarán mediante clases o atributos de layout, no con alturas inline. La fuente de verdad será un mapa central de cards:

```js
{
    patrimonio: { ancho: 2, alto: 2, fijo: true },
    cuentas: { ancho: 1, alto: 1 },
    inversiones: { ancho: 1, alto: 1 },
    vencimientos: { ancho: 1, alto: 1 },
    favoritos: { ancho: 1, alto: 2 },
    metas: { ancho: 1, alto: 2 },
    movimientos: { ancho: 1, alto: 3 },
    grafico: { ancho: 1, alto: 3 }
}
```

## 2. Distribución masonry con 4 columnas

El algoritmo será un first-fit controlado por unidades, no un posicionamiento absoluto:

1. Se añade patrimonio en la posición inicial: columna 1, fila 1, ocupando 2 columnas y 2 filas.
2. Se recorren las cards secundarias en el orden elegido por el usuario.
3. Para cada card se busca la primera posición libre donde quepa su ancho y alto.
4. La búsqueda empieza en la columna con menor altura acumulada y prueba las siguientes si no cabe.
5. La card se coloca en la primera fila disponible de la columna seleccionada.
6. Se actualiza la altura acumulada de la columna.
7. Se repite hasta que no queden cards.

Esto mantiene el orden de lectura del DOM y evita que una card larga sea abandonada debajo de un bloque corto. También permite que la card de 3 unidades salte a la siguiente columna si la columna actual tiene un fragmento insuficiente.

Ejemplo inicial de distribución con 4 columnas y el orden actual de las cards secundarias:

```text
                COL 1        COL 2        COL 3        COL 4
row 1           [ PATRIMONIO ][ PATRIMONIO ][ CUENTAS     ][ INVERSIONES ]
row 2           [ PATRIMONIO ][ PATRIMONIO ][ VENCIMIENTOS][ FAVORITOS   ]
row 3           [ MOVIMIENTOS  (3 unidades)              ][ FAVORITOS   ]
row 4           [            MOVIMIENTOS                  ][ METAS       ]
row 5           [            MOVIMIENTOS                  ][ METAS       ]
row 6           [            (siguiente card)             ][ GRAFICO     ]
```

El dibujo anterior es ilustrativo: el scheduler real colocará las cards según la altura disponible y mantendrá la prioridad de lectura. La card de patrimonio ocupa siempre el inicio del recorrido.

Con 3 columnas, patrimonio ocupa columnas 1–2 y la tercera queda disponible para la siguiente card. Con 2 columnas, patrimonio ocupa el ancho completo. Con 1 columna, patrimonio y las cards secundarias pasan a una sola columna.

## 3. Estructura HTML/CSS propuesta

### HTML

El HTML de las cards no necesita cambiarse en la Fase 3. Se conserva el markup generado por `render()` y se añaden únicamente atributos de datos de layout generados desde JavaScript, por ejemplo:

```html
<div class="dashboard">
    <div class="glass card primary patrimonio-card" data-dashboard-card="patrimonio"></div>
    <div class="glass card movimientos-card" data-dashboard-card="movimientos"></div>
</div>
```

El scheduler asignará las coordenadas mediante clases calculadas o propiedades CSS pendientes de definir. No se usarán valores inline.

La estructura de datos de layout se mantendrá separada del contenido de cada card. Esto permite que las funciones que calculan patrimonio, cuentas, inversiones y gráficos sigan intactas.

### CSS

Responsive objetivo:

| Rango | Columnas | Patrimonio |
|---|---:|---|
| ≥1200px | 4 | 2 columnas, 2 unidades |
| 900–1199px | 3 | 2 columnas, 2 unidades |
| 600–899px | 2 | 2 columnas, 2 unidades |
| <600px | 1 | 1 columna, 2 unidades |

La implementación tendrá un solo origen de verdad para el número de columnas. El scheduler leerá el número de columnas efectivo mediante una función de breakpoint o el valor CSS calculado por el navegador, y recalculará las posiciones al cambiar de tamaño.

La card seguirá usando el mismo `padding`, `border-radius` y jerarquía tipográfica existentes. La única excepción tipográfica será el valor de patrimonio, que podrá crecer a 40–48px.

## 4. Persistencia en Firestore

La preferencia se almacenará dentro de `preferencias`:

```js
dashboard: {
    cardsVisibles: ["cuentas", "inversiones", "vencimientos", "favoritos", "metas", "movimientos", "grafico"],
    orden: ["cuentas", "inversiones", "vencimientos", "favoritos", "metas", "movimientos", "grafico"]
}
```

`patrimonio` no se incluye en ninguna de las dos arrays porque es fijo, siempre visible y siempre primero.

### Normalización al leer

El dashboard_normalizará los datos al iniciar:

1. Forzar `patrimonio` como primera card.
2. Rechazar ids desconocidos.
3. Eliminar ids duplicados.
4. Añadir al final las cards secundarias que falten, usando el orden por defecto.
5. Aplicar `cardsVisibles` como filtro.
6. Aplicar `orden` a las cards visibles.
7. Mantener siempre al menos una card secundaria visible; si la preferencia queda vacía o corrupta, se recupera el conjunto secundario por defecto.

La misma normalización se usará antes de guardar para evitar que datos antiguos impidan el layout.

### Compatibilidad

La primera vez que se lea la nueva estructura se puede mantener `localStorage["escinco_dashboard_cards"]` como fallback temporal. Una vez guardada la nueva preferencia `dashboard`, Firestore será la fuente principal.

No se usará `MAX_DASHBOARD_CARDS`. Si existen más de 20 cards:

- el contenedor seguirá mostrando todas;
- el panel tendrá scroll vertical;
- el layout conservará scroll interno en las cards de lista.

Si existen más de 30 cards:

- se mostrará un aviso informativo;
- no se bloqueará la edición ni la visualización.

El aviso no aparecerá todavía en la Fase 3; se añadirá con la UI de edición de la Fase 5 o en una fase posterior, según la arquitectura definitiva.

## 5. Activación del modo edición

El botón `data-accion="editar-dashboard"` ya existe en el lastbar del dashboard. Se reutilizará como entrada.

Estados:

- `normal`: cards navegan como ahora; patrimonio no tiene navegación todavía.
- `edicion`: se muestran controles de edición, se desactiva la navegación de las cards secundarias y patrimonio queda protegido.

Durante la edición aparecerán:

- botón `Añadir/quitar cards`;
- botón `Listo`;
- handles de drag en cards secundarias;
- controles de orden por teclado.

Al salir del dashboard se cerrará el modo edición. Si existen cambios pendientes, se reutilizará el patrón actual de Configuración: aviso de cambios sin guardar con opciones de aceptar o cancelar.

## 6. Drag & drop

Para escritorio se propone HTML5 nativo:

- `draggable="true"` solo en cards secundarias durante edición;
- handle explícito para iniciar el drag;
- `dragstart`, `dragover`, `drop` y `dragend` sobre el contenedor;
- `dataTransfer` solo para comunicar el id de la card, sin serializar contenido;
- patrimonio no recibe `draggable`.

Motivos:

- No requiere una dependencia nueva.
- Encaja con la arquitectura HTML/JS existente.
- Permite actualizar la posición sin cambiar la lógica interna.
- El handle evita que cualquier zona de la card sea arrastrable accidentalmente.

En móvil:

- no se usará drag;
- cada card tendrá botones `↑` y `↓`;
- el botón `↑` 재정irmará el orden DOM y recalculará las posiciones visuales.

El scheduler volverá a ejecutar el first-fit después de cada cambio. La animación de recolocación se podrá hacer con una transición de `transform` de 150–200ms, sin cambiar las alturas.

## 7. Fallback de teclado

Cada card secundaria tendrá controles de orden accesibles en modo edición:

- botón `Mover antes` o flecha `↑`;
- botón `Mover después` o flecha `↓`;
- `aria-label` con el nombre de la card y la acción.

El flujo será:

1. Entrar al dashboard con el botón `Editar dashboard`.
2. Recorrer las cards con Tab en orden DOM.
3. Pulsar el botón de movimiento de la card enfocada.
4. El DOM se actualiza y el foco permanece en el nuevo lugar lógico de la card.
5. Al pulsar `Listo`, la navegación normal se restaura.

El patrimonio será el primer elemento enfocable del dashboard, aunque no sea una card navegable. Se propondrá añadirle `tabindex="0"` y un `aria-label` descriptivo en la Fase de accesibilidad, sin convertirlo todavía en una acción clicable.

La card de patrimonio se anunciará primero con una descripción como “Patrimonio total, valor actual”, y las cards secundarias aparecerán después en el orden elegido.

## Riesgos y decisiones pendientes

1. **Altura base:** 80px es el punto inicial propuesto; se ajustará después de verificar 1400px, 1000px, 700px y 500px.
2. **Altura del gráfico:** se propone 3 unidades y se evaluará 4 unidades si el gráfico queda demasiado comprimido.
3. **Orden visual versus orden DOM:** el scheduler puede colocar visualmente una card en una columna distinta sin cambiar el orden DOM. La verificación de teclado y lector de pantalla será obligatoria antes de dar por terminada la Fase 3.
4. **Contenido de las cards:** no se modificará su lógica; el layout solo añadirá tamaños, clases de rejilla y coordinación de posicionamiento.
5. **Modal de patrimonio:** queda fuera de esta propuesta. La card no se hará clicable hasta definir qué información debe mostrar.
6. **Más de 30 cards:** se requiere confirmar el texto y el momento del aviso, pero no debe impedir la edición.

## Resultado esperado de la Fase 3

La Fase 3 deberá demostrar, sin persistencia ni drag todavía:

- patrimonio siempre primero, visible y con 2×2 unidades;
- cards secundarias con anchos y alturas fijas;
- distribución sin huecos grandes ni solapamientos;
- responsive 4/3/2/1;
- listas con scroll interno;
- compatibilidad con los niveles de resalte 0/1/2;
- orden semántico del DOM conservado.
