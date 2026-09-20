# escinco · Modelo de datos (Firestore)

## Convenciones

- Todo en `camelCase`.
- Todos los tipos en minúsculas.
- Divisiones en mayúsculas (`PEN`, `USD`, `USDT`).
- IDs personalizados en minúsculas con guiones bajos.
- Todas las fechas en Firestore son `Timestamp`.
- Los snapshots usan ID `YYYY-MM-DD`.
- No se guarda información que pueda recalcularse, salvo por rendimiento.

## Árbol general

```
usuarios/{uid}
├── preferencias            (objeto)
├── cuentas/{autoId}
├── movimientos/{autoId}
├── activos/{autoId}
│   └── historial/{YYYY-MM-DD}
├── posiciones/{autoId}
├── pendientes/{autoId}
├── estrategias/{autoId}
├── metas/{autoId}
├── ordenes/{autoId}
├── snapshots/{YYYY-MM-DD}
└── trades/{autoId}

config/version              (versión publicada)
```

Todas las colecciones cuelgan de `usuarios/{uid}` (aislamiento total por
usuario en `firebase/firestore.rules`, nivel de validación MEDIA).

## `usuarios/{uid}` · doc del usuario

| Campo | Tipo | Descripción |
|---|---|---|
| `email` | string | Correo de Firebase Auth |
| `nombre` | string | Nombre (displayName) |
| `foto` | string/null | photoURL |
| `fechaRegistro` | Timestamp | Alta |
| `preferencias` | object | Ver abajo |

### `preferencias`

| Campo | Tipo | Valores / formato |
|---|---|---|
| `tema` | string | `dark` \| `light` \| `system` |
| `divisaPrincipal` | string | `pen` (por defecto) \| `usd` \| `usdt` |
| `tipoCambio` | object | `{ pen_usd, modo }` — `modo: "manual"`; `actualizacion` ISO al guardar |
| `paginas` | object | Visibilidad por ruta: `{ dashboard, cuentas, movimientos, inversiones, trading, configuracion }` (boolean) |

## `cuentas/{autoId}`

| Campo | Tipo | Descripción |
|---|---|---|
| `nombre` | string | Nombre de la cuenta |
| `tipo` | string | `banco` \| `efectivo` \| `broker` \| `exchange` \| `credito` |
| `divisa` | string | Divisa de la cuenta |
| `saldoInicial` | number | Saldo vivo (se actualiza con cada movimiento) |
| `archivada` | boolean | Fuera del patrimonio si `true` |
| `fechaCreacion` | Timestamp | Alta |

Campos adicionales para `tipo === "credito"`:

| Campo | Tipo | Descripción |
|---|---|---|
| `deuda` | number | Deuda actual de la tarjeta |
| `limite` | number | Límite de crédito |
| `diaCorte` | number | Día de corte del mes |
| `diaPago` | number | Día de pago del mes |
| `desgravamen` | number | Porcentaje de desgravamen (para comisión por pago) |

## `movimientos/{autoId}`

| Campo | Tipo | Descripción |
|---|---|---|
| `tipo` | string | Uno de los 11 tipos (`constants/tiposMovimiento.js`) |
| `cuenta` | string | Cuenta principal (según tipo) |
| `cuentaOrigen` / `cuentaDestino` | string | Transferencias / cambios de divisa |
| `tarjeta` | string | Tarjeta (compra/pago con tarjeta) |
| `concepto` | string | Concepto (ingreso, gasto…) |
| `monto` | number | Monto simple |
| `montoOrigen` / `montoDestino` | number | Pares de monto en cambios de divisa |
| `cantidad` | number | Cantidad de activo (compra/venta/p2p) |
| `precio` | number | Precio unitario |
| `comision` | number | Comisión (se suma en compras, se resta en ventas) |
| `tasa` | number | Tasa aplicada en cambios de divisa |
| `divisa` | string | Divisa del movimiento |
| `exchange` | string | Exchange (p2p) |
| `nombreVendedor` / `nombreComprador` | string | Contraparte P2P |
| `cuentaPago` / `cuentaCobro` | string | Cuenta de pago/cobro P2P |
| `fechaRealizacion` | Timestamp | Fecha real del gasto |
| `fechaRegistro` | Timestamp | Creación (server) |

## `activos/{autoId}`

| Campo | Tipo | Descripción |
|---|---|---|
| `nombre` | string | Nombre del activo |
| `simbolo` | string | Símbolo en mayúsculas |
| `tipo` | string | `accion` \| `etf` \| `crypto` \| `bono` |
| `ultimoPrecio` | number | Última cotización conocida |
| `ultimaActualizacion` | Timestamp | Última actualización de precio |
| `fechaCreacion` | Timestamp | Alta |
| `favorito` | boolean | Marcado en Inversiones (`false` por defecto) |

### `activos/{id}/historial/{YYYY-MM-DD}`

Registro diario de cotización. ID = fecha; contiene el `precio` del día y
metadatos de la consulta (`actualizacion`). Se alimenta al consultar precios
(`HistorialServicio`) y se exporta hasta 9.999 días en el `.dvid` (máximo
permitido por Firestore; 10.000 por consulta).

## `posiciones/{autoId}`

| Campo | Tipo | Descripción |
|---|---|---|
| `activoId` | string | Referencia al activo |
| `cantidad` | number | Cantidad total (negativas solo transitoriamente al revertir) |
| `divisa` | string | Divisa de la posición (default `usd`) |
| `precioPromedio` | number | Precio medio ponderado incluida comisión de compra |
| `ultimaActualizacion` | Timestamp | Último movimiento |

`valorTotal`, `ganancia` y `rendimientoPorcentual` son **calculados** en el
modelo contra `activo.ultimoPrecio` (no se almacenan).

## `estrategias/{autoId}`

Estrategias de compra programada (DCA) sobre un activo. Se ejecutan de forma
manual/automática según la frecuencia configurada.

| Campo | Tipo | Descripción |
|---|---|---|
| `nombre` | string | Nombre de la estrategia |
| `activoSimbolo` | string | Símbolo del activo (mayúsculas) |
| `cuentaId` | string | Cuenta de origen del aporte |
| `montoFijo` | number | Monto a invertir en cada ejecución |
| `divisa` | string | `pen` \| `usd` \| `usdt` (default `pen`) |
| `frecuencia` | string | `diaria` \| `semanal` \| `mensual` |
| `diaPreferido` | number/null | Día de la semana/lunes para semanal/mensual |
| `proximaEjecucion` | Timestamp/null | Próxima fecha programada |
| `ultimaEjecucion` | Timestamp/null | Última ejecución realizada |
| `activa` | boolean | `true` activa, `false` pausada |
| `fechaCreacion` | Timestamp | Alta (server) |

Índice: no requiere índice compuesto; el `orderBy` por campo único usa el
índice automático de `fechaCreacion`.

## `metas/{autoId}`

Metas de ahorro con seguimiento de progreso.

| Campo | Tipo | Descripción |
|---|---|---|
| `nombre` | string | Nombre de la meta |
| `montoObjetivo` | number | Monto a alcanzar |
| `montoActual` | number | Monto acumulado |
| `divisa` | string | `pen` \| `usd` \| `usdt` (default `pen`) |
| `fechaLimite` | Timestamp/null | Fecha objetivo |
| `activa` | boolean | `true` activa, `false` pausada |
| `icono` | string | Ícono Lucide (`target` por defecto) |
| `fechaCreacion` | Timestamp | Alta (server) |

`porcentaje`, `montoRestante` y `completada` son **calculados** por getters del
modelo. Los aportes se registran como un movimiento `gasto` (ver
`MetaServicio.aportarMeta`).

Índice: no requiere índice compuesto; el `orderBy` por campo único usa el
índice automático de `fechaCreacion`.

## `pendientes/{autoId}`

| Campo | Tipo | Descripción |
|---|---|---|
| `concepto` | string | Concepto del cobro/pago |
| `tipo` | boolean | `true` = cobrar, `false` = pagar |
| `monto` | number | Importe |
| `divisa` | string | Divisa (default `pen`) |
| `fechaRegistro` | Timestamp | Creación (index desc con `pendiente`) |
| `fechaVencimiento` | Timestamp/null | Vencimiento |
| `fechaConsolidacion` | Timestamp/null | Cuándo se consolidó |
| `pendiente` | boolean | `true` activo, `false` consolidado |
| `movimientoId` | string/null | Movimiento generado al consolidar |

Índice compuesto: `pendiente` ASC + `fechaRegistro` DESC (+ `__name__` DESC).

## `snapshots/{YYYY-MM-DD}`

| Campo | Tipo | Descripción |
|---|---|---|
| `cerrado` | boolean | `true` cuando el día cerró |
| `actualizacion` | Timestamp | Última actualización del día |
| `total…` | object/number | Patrimonio calculado por `SnapshotServicio.calcularPatrimonio` (totales por divisa y/o divisa objetivo) |

Índice: `__name__` DESC (lectura de últimos N días por ID de fecha).

## `trades/{autoId}`

| Campo | Tipo | Descripción |
|---|---|---|
| `activo` | string | Símbolo del activo |
| `cuenta` | string | Cuenta asociada |
| `entrada` | number | Precio de entrada |
| `salida` | number/null | Precio de salida (`null` mientras esté abierto) |
| `lotaje` | number | Tamaño del trade |
| `sl` / `tp` | number/null | Stop loss / take profit |
| `tipo` | string | `long` \| `short` |
| `estado` | string | `abierto` \| `cerrado` |
| `divisa` | string | Divisa |
| `nota` | string | Nota opcional |
| `ordenId` | string/null | Orden que abrió el trade (si vino de una orden) |
| `fechaCierre` | Timestamp/null | Cierre |
| `fechaRegistro` | Timestamp | Apertura |

`pnl` y `pnlPorcentaje` son **calculados** por getters del modelo.

## `ordenes/{autoId}`

Órdenes límite/stop que vigilan el precio de un activo. Al dispararse abren un
trade nuevo (`registrarTrade`) y pasan a estado `ejecutada`. La evaluación es
**pull**: se ejecuta al entrar a Trading y al pulsar "Actualizar"
(`OrdenServicio.evaluarOrdenesPendientes`), no hay scheduler.

| Campo | Tipo | Descripción |
|---|---|---|
| `activo` | string | Símbolo del activo (mayúsculas) |
| `cuenta` | string | Cuenta asociada al trade que abra |
| `tipoOrden` | string | `limite` \| `stop` |
| `direccion` | string | `long` (compra) \| `short` (venta) |
| `precioDisparo` | number | Precio que activa la orden |
| `lotaje` | number | Tamaño del trade |
| `sl` / `tp` | number/null | Stop loss / take profit |
| `divisa` | string | Divisa (default `usd`) |
| `nota` | string | Nota opcional |
| `estado` | string | `pendiente` \| `ejecutada` \| `cancelada` |
| `tradeId` | string/null | Trade abierto al ejecutarse |
| `precioEjecucion` | number/null | Precio de mercado observado al disparar |
| `fechaCreacion` | Timestamp | Alta (server) |
| `fechaEjecucion` | Timestamp/null | Cuándo se ejecutó |

Condición de disparo (`Orden.debeDisparar`):

- `limite` + `long`: `precio <= precioDisparo`; `limite` + `short`: `precio >= precioDisparo`.
- `stop` + `long`: `precio >= precioDisparo`; `stop` + `short`: `precio <= precioDisparo`.

El trade abierto usa el precio de mercado observado como `entrada` y guarda
`ordenId` para la relación inversa.

Índice: no requiere índice compuesto; el `orderBy` por campo único usa el
índice automático de `fechaCreacion`.

## `config/version`

Documento único con la versión publicada; `VersionServicio` la compara con
`constants/version.js` para avisar de actualización.

## Formato de respaldo `.dvid`

Versión **4.0.0** (`formato: "ESCINCO"`). Incluye `cuentas`, `movimientos`,
`activos`, `pendientes`, `posiciones` (con `activoSimbolo` en vez de
`activoId`), `trades`, `ordenes`, `estrategias`, `metas`, `historial` (por
símbolo), `snapshots` y `preferencias`. Todas las fechas se exportan como ISO
string. Se importan versiones desde 2.0.0 (compatible hacia atrás). Los
respaldos 2.x/3.x no contenían `ordenes`, `estrategias` ni `metas`, por lo que
se importan sin ellos (solo se restaura lo que incluyen); los respaldos 4.0.0
los importan completos. La importación **agrega** datos (no borra).

Evolución del formato:
- **2.0.0** → cuentas, movimientos, activos, pendientes, snapshots.
- **3.0.0** → + posiciones, trades, historial, preferencias; timestamps
  normalizados (ISO) para roundtrip fiel.
- **4.0.0** → + ordenes, estrategias, metas.