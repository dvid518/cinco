# escinco · Roadmap

- **Versión objetivo**: 1.0.0 estable
- **Estado actual**: v1.0.0-beta.5 (≈86 % del ideal)

## Fase 1 — Estabilización (desbloquea v1)

1. **Unificar Firebase** — `firebaseClient.js` importa la config desde
   `firebase/config.js`; `tema.js` usa `updateDoc` re-exportado por
   `firebase/firestore.js` (punto único de acceso; se mantiene CDN).
   - `firebase/firebaseClient.js`, `firebase/firestore.js`, `js/core/tema.js`
2. **Reactivar `orderBy` en pendientes** — el índice ya está desplegado;
   eliminar el sort manual y el comentario temporal.
   - `js/repositories/PendienteRepositorio.js`, `firebase/firestore.indexes.json`
3. **Comisión en ventas** — verificado: ya se resta del saldo recibido
   (`saldo += (cantidad × precio) − comisión`) en `MovimientoServicio.actualizarSaldos`
   para ventaActivo y p2pVenta; sin cambios adicionales.
4. **Documentación** — este `roadmap.md`, `requisitos.md` y `modelo-datos.md`.
5. **404 con marca + higiene** — página de error con los estilos de escinco;
   eliminar `firebase-debug.log` y `firestore-debug.log`.
   - `404.html`, `css/404.css`, raíz del proyecto

## Fase 2 — Funcionalidad media

| # | Tarea | Área | Prioridad |
|---|---|---|---|
| 6 | Tasa de cambio automática (modo `auto` con API + fallback manual) | `DivisaServicio`, `configuracion` | Alta |
| 7 | Módulo de órdenes (límite/stop) ligado a trades | `repositories`/`services` nuevos, trading | Media |
| 8 | Consolidar pendientes en lote (multiselección) | `ui/pendientes`, `PendienteServicio` | Media |
| 9 | Dashboard: selector de periodos (distancia entre días / 2nd timing) | `dashboard`, `graficos` | Media |
| 10 | Favoritos y metas de ahorro | nuevo modelo `metas` + sección | Media |
| 11 | Estrategias de compra (plantillas DCA / compra programada) | `formularioMovimiento`, servicio | Media |
| 12 | Renta variable (acciones/ETFs) dentro de trading/posiciones + carga de precios diarios | `ActivoRepositorio`, `HistorialServicio`, `trading` | Media |

## Fase 3 — Pulido

| # | Tarea | Área |
|---|---|---|
| 13 | Desduplicar CSS y cargar solo los estilos de cada página | `css/*` |
| 14 | Probar reglas en simulador + test de caché en producción (`test-cache.html`) | `firestore.rules`, `cache` |

## Orden de ejecución

Fase 1 completa en una sesión (1→2→3→5 en bloque; 4 en paralelo). Luego
6, 8, 9 (rápidas), y 7/11/12 como paquete de inversiones. Ninguna tarea borra
datos; `EliminarServicio` ya exige confirmación doble.