import { registrarConEmail, registrarConGoogle, observeAuth } from "../../firebase/auth.js"
import { initTemaLocal } from "../core/tema.js"
import { initPWA } from "../core/pwa.js"
import { initDoodles } from "../ui/doodles.js"
import { icono } from "../core/iconos.js"
import { mostrarNotificacion } from "../ui/notificaciones.js"

// ============================================
// REFERENCIAS DOM
// ============================================

const inputNombre = document.getElementById("nombre")
const inputEmail = document.getElementById("email")
const inputClave = document.getElementById("clave")
const inputConfirmarClave = document.getElementById("confirmar-clave")
const botonSubmit = document.getElementById("register-submit")
const botonGoogle = document.getElementById("register-google")

// ============================================
// INIT
// ============================================

initTemaLocal()
initPWA()
initDoodles({ logoSpin: true })

// ============================================
// REGISTRO CON EMAIL + CONTRASEÑA
// ============================================

async function registrarConPassword() {
    const nombre = inputNombre.value.trim()
    const email = inputEmail.value.trim()
    const password = inputClave.value
    const confirmar = inputConfirmarClave.value

    const errorValidacion = validarDatos(nombre, email, password, confirmar)
    if (errorValidacion) {
        mostrarNotificacion("error", errorValidacion)
        return
    }

    try {
        await registrarConEmail(nombre, email, password)
        window.location.href = "/"
    } catch (error) {
        mostrarNotificacion("error", mensajeDeError(error))
        inputClave.value = ""
        inputConfirmarClave.value = ""
        inputClave.focus()
    }
}

// ============================================
// REGISTRO CON GOOGLE
// ============================================

async function registrarConGoogleHandler() {
    try {
        await registrarConGoogle()
        window.location.href = "/"
    } catch (error) {
        console.error("Error Google:", error)
        mostrarNotificacion("error", mensajeDeError(error))
    }
}

// ============================================
// MENSAJES DE ERROR
// ============================================

function validarDatos(nombre, email, password, confirmar) {
    if (!nombre) return "Escribe tu nombre."
    if (nombre.length < 2) return "El nombre es demasiado corto."
    if (!email) return "Escribe tu correo electrónico."
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "El correo no es válido."
    if (!password) return "Escribe una contraseña."
    if (password.length < 6) return "La contraseña debe tener al menos 6 caracteres."
    if (!confirmar) return "Confirma tu contraseña."
    if (password !== confirmar) return "Las contraseñas no coinciden."
    return null
}

function mensajeDeError(error) {
    switch (error.code) {
        case "auth/email-already-in-use":
            return "Ya existe una cuenta con ese correo."
        case "auth/invalid-email":
            return "El correo no es válido."
        case "auth/weak-password":
            return "La contraseña es demasiado débil."
        case "auth/operation-not-allowed":
            return "El registro con correo está deshabilitado."
        case "auth/popup-closed-by-user":
            return "Cancelaste el registro con Google."
        case "auth/popup-blocked":
            return "El navegador bloqueó la ventana emergente de Google."
        case "auth/network-request-failed":
            return "Sin conexión. Revisa tu red."
        default:
            return "No se pudo crear la cuenta. Inténtalo de nuevo."
    }
}

// ============================================
// OBSERVAR AUTH (redirigir si ya logueado)
// ============================================

observeAuth(async (user) => {
    if (user) {
        await bodyVisibility(1, 1)
        await new Promise(resolve => setTimeout(resolve, 300))
        window.location.replace("/")
        return
    }

    await bodyVisibility(1, 1)
})

async function bodyVisibility(opacity, ms) {
    await new Promise(resolve => setTimeout(resolve, ms))
    switch (opacity) {
        case 0:
            document.body.classList.add("loading")
            break
        case 1:
            document.body.classList.remove("loading")
            break
    }
}

// ============================================
// EVENTOS
// ============================================

botonSubmit?.addEventListener("click", registrarConPassword)
botonGoogle?.addEventListener("click", registrarConGoogleHandler)

inputEmail?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault()
        inputClave?.focus()
    }
})

inputClave?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault()
        inputConfirmarClave?.focus()
    }
})

inputConfirmarClave?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault()
        registrarConPassword()
    }
})

inputNombre?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault()
        inputEmail?.focus()
    }
})

// ============================================
// VER / OCULTAR CONTRASEÑA
// ============================================

function alternarVisibilidadClave(boton) {
    const input = document.getElementById(boton.dataset.toggle)
    if (!input) return
    const esVisible = input.type === "text"
    input.type = esVisible ? "password" : "text"
    boton.innerHTML = icono(esVisible ? "eye" : "eye-closed", 18)
    boton.setAttribute("aria-label", esVisible ? "Mostrar contraseña" : "Ocultar contraseña")
}

document.querySelectorAll(".pass-toggle").forEach(boton => {
    boton.addEventListener("click", () => alternarVisibilidadClave(boton))
})