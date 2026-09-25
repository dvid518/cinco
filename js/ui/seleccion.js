export function expandirSeleccion(ids, id, seleccionados, orden) {
    if (!ids.includes(id) || seleccionados.size === 0) return false

    const actual = ids.indexOf(id)
    const anclaId = orden.find(item => item !== id && seleccionados.has(item)) || orden[0]
    const ancla = ids.indexOf(anclaId)
    if (ancla < 0) return false

    const inicio = Math.min(actual, ancla)
    const fin = Math.max(actual, ancla)
    for (const item of ids.slice(inicio, fin + 1)) {
        seleccionados.add(item)
        if (!orden.includes(item)) orden.push(item)
    }
    return true
}
