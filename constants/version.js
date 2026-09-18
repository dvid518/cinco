export const VERSION = {
    numero: "1.0.0-beta.3",
    nombre: "cinco",
    descripcion: "tucson",
    ano: 2026,
    autor: "david",
    
    // Metadatos internos
    fechaLanzamiento: "2026-09-13",
    fase: "beta"
}

export function getVersionLabel() {
    return `${VERSION.nombre} · v${VERSION.numero}`
}

export function getVersionInfo() {
    return {
        version: VERSION.numero,
        nombre: VERSION.nombre,
        descripcion: VERSION.descripcion,
        copyright: `© ${VERSION.ano} ${VERSION.nombre}`
    }
}