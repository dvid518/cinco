// ============================================
// EXPERIMENTO · DETECCIÓN DE PULSOS TÁCTILES (2-5 dedos)
// ============================================
// Registra en consola cuántos dedos están tocando simultáneamente.
// Cargar con: <script src="exp.js"></script> o por consola con
// `import('./exp.js')`. Usa eventos touch (touchstart/touchend/touchcancel).

const dedosActivos = new Set()
let ultimoConteo = 0

function logConteo(conteo) {
    if (conteo === ultimoConteo) return
    ultimoConteo = conteo
    if (conteo >= 2 && conteo <= 5) {
        console.log(`[EXP-DEDOS] ${conteo} dedos`)
    }
}

function manejarTouches(evento) {
    for (const touch of evento.changedTouches) {
        if (evento.type === "touchstart") {
            dedosActivos.add(touch.identifier)
        } else {
            dedosActivos.delete(touch.identifier)
        }
    }
    logConteo(dedosActivos.size)
}

document.addEventListener("touchstart", manejarTouches, { passive: true })
document.addEventListener("touchend", manejarTouches, { passive: true })
document.addEventListener("touchcancel", manejarTouches, { passive: true })

console.log("[EXP] Detector de pulsos activo. Toca la pantalla con 2 a 5 dedos.")