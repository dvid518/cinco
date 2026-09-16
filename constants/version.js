export const VERSION = {
    numero: "1.0.0-beta.1",
    nombre: "cinco",
    descripcion: "Gestión personal de patrimonio y finanzas",
    ano: 2026,
    autor: "David",
    
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