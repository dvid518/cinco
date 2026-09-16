export const TIPOS_MOVIMIENTO = {
    INGRESO: "ingreso",
    GASTO: "gasto",
    TRANSFERENCIA: "transferencia",
    CAMBIO_DIVISA: "cambioDivisa",
    COMPRA_ACTIVO: "compraActivo",
    VENTA_ACTIVO: "ventaActivo",
    P2P_COMPRA: "p2pCompra",
    P2P_VENTA: "p2pVenta",
    COMPRA_TARJETA: "compraTarjeta",
    PAGO_TARJETA: "pagoTarjeta",
    ERROR: "error"
}


export const CONFIG_MOVIMIENTOS = {
    ingreso: {
        nombre: "Ingreso",
        camposObligatorios: [
            "cuenta",
            "concepto",
            "monto",
            "divisa",
            "fechaRealizacion"
        ]
    },

    gasto: {
        nombre: "Gasto",
        camposObligatorios: [
            "cuenta",
            "concepto",
            "monto",
            "divisa",
            "fechaRealizacion"
        ]
    },

    transferencia: {
        nombre: "Transferencia",
        camposObligatorios: [
            "cuentaOrigen",
            "cuentaDestino",
            "monto",
            "divisa",
            "fechaRealizacion"
        ]
    },

    cambioDivisa: {
        nombre: "Cambio de divisa",
        camposObligatorios: [
            "cuentaOrigen",
            "cuentaDestino",
            "montoOrigen",
            "montoDestino",
            "tasa",
            "fechaRealizacion"
        ]
    },

    compraActivo: {
        nombre: "Compra de activo",
        camposObligatorios: [
            "activo",
            "cuenta",
            "cantidad",
            "precio",
            "divisa",
            "fechaRealizacion"
        ]
    },

    ventaActivo: {
        nombre: "Venta de activo",
        camposObligatorios: [
            "activo",
            "cuenta",
            "cantidad",
            "precio",
            "divisa",
            "fechaRealizacion"
        ]
    },

    p2pCompra: {
        nombre: "Compra P2P",
        camposObligatorios: [
            "activo",
            "cuenta",
            "cantidad",
            "precio",
            "divisa",
            "exchange",
            "nombreVendedor",
            "cuentaPago",
            "fechaRealizacion"
        ]
    },

    p2pVenta: {
        nombre: "Venta P2P",
        camposObligatorios: [
            "activo",
            "cuenta",
            "cantidad",
            "precio",
            "divisa",
            "exchange",
            "nombreComprador",
            "cuentaCobro",
            "fechaRealizacion"
        ]
    },

    compraTarjeta: {
        nombre: "Compra con tarjeta",
        camposObligatorios: [
            "cuenta",
            "concepto",
            "monto",
            "divisa",
            "fechaRealizacion"
        ]
    },

    pagoTarjeta: {
        nombre: "Pago de tarjeta",
        camposObligatorios: [
            "cuentaOrigen",
            "tarjeta",
            "monto",
            "fechaRealizacion"
        ]
    },

    error: {
        nombre: "Error",
        camposObligatorios: [
            "cuenta",
            "monto"
        ]
    }
};