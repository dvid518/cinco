import {
    getAuth,
    createUserWithEmailAndPassword,
    updateProfile,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    EmailAuthProvider,
    linkWithCredential,
    updatePassword,
    reauthenticateWithCredential,
    fetchSignInMethodsForEmail,
    getAdditionalUserInfo,
    deleteUser,
    setPersistence,
    browserSessionPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js"
import { app } from "./firebaseClient.js"
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { db, asegurarCuentaEfectivoInicial } from "./firestore.js"
import { cacheCapa } from "../js/core/cache.js"
import { sesion } from "../js/core/sesion.js"

const auth = getAuth(app)

const INACTIVIDAD_MINUTOS_DEFAULT = 15
const REAUTH_VIGENCIA_MINUTOS = 5
const CLAVE_REAUTH = "escinco_reauth_time"
const EVENTOS_ACTIVIDAD = ["click", "mousemove", "keydown", "scroll", "touchstart"]

let inactivityTimer = null
let actividadRegistrada = false

// ============================================
// REGISTRO CON EMAIL Y CONTRASEÑA
// ============================================

export async function registrarConEmail(nombre, email, password) {
    const credencial = await createUserWithEmailAndPassword(auth, email, password)

    if (nombre) {
        await updateProfile(credencial.user, { displayName: nombre })
    }

    await asegurarDocUsuario(credencial.user, true, nombre)
    await asegurarCuentaEfectivoInicial(credencial.user.uid, credencial.user)

    return credencial
}

// ============================================
// REGISTRO / LOGIN CON GOOGLE
// ============================================
// El flujo es el mismo: al aceptar el popup se crea el usuario
// si no existía. Aquí solo se garantiza su doc en Firestore.

export async function registrarConGoogle() {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: "select_account" })

    const resultado = await signInWithPopup(auth, provider)
    const esNuevo = getAdditionalUserInfo(resultado)?.isNewUser || false

    await asegurarDocUsuario(resultado.user, esNuevo)
    await asegurarCuentaEfectivoInicial(resultado.user.uid, resultado.user)

    return resultado
}

// ============================================
// LOGIN CON GOOGLE
// ============================================
// Mismo flujo que registrarConGoogle: al aceptar el popup, si la cuenta
// no existe se crea. Se expone con nombre de login para la página index.

export async function loginConGoogle() {
    return registrarConGoogle()
}

// ============================================
// CAMBIAR NOMBRE DEL USUARIO
// ============================================
// Actualiza el displayName del auth y el campo `nombre` del doc.

export async function actualizarNombre(nombre) {
    const user = auth.currentUser
    if (!user) throw new Error("No hay usuario autenticado")

    const nombreLimpio = String(nombre || "").trim()
    if (!nombreLimpio) throw new Error("El nombre no puede estar vacío")
    if (nombreLimpio.length > 60) throw new Error("El nombre es demasiado largo")

    await updateProfile(user, { displayName: nombreLimpio })

    const referencia = doc(db, "usuarios", user.uid)
    await updateDoc(referencia, { nombre: nombreLimpio })

    return nombreLimpio
}

// ============================================
// LOGIN CON EMAIL Y CONTRASEÑA
// ============================================

export async function login(email, password) {
    return await signInWithEmailAndPassword(auth, email, password)
}

// ============================================
// ASEGURAR DOC DEL USUARIO EN FIRESTORE
// ============================================
// Crea usuarios/{uid} si no existe. No sobreescribe si ya existe.
// ============================================

async function asegurarDocUsuario(user, esNuevo, nombrePersonalizado) {
    const referencia = doc(db, "usuarios", user.uid)
    const existente = await getDoc(referencia)

    if (!existente.exists()) {
        await setDoc(referencia, {
            email: user.email || null,
            nombre: nombrePersonalizado || user.displayName || null,
            foto: user.photoURL || null,
            fechaRegistro: serverTimestamp(),
            preferencias: {}
        })
        console.log("[INFO] Doc de usuario creado en Firestore")
    } else if (esNuevo && nombrePersonalizado) {
        await updateDoc(referencia, { nombre: nombrePersonalizado })
        console.log("[INFO] Doc ya existía, nombre actualizado (caso raro)")
    }
}

// ============================================
// LOGOUT
// ============================================

export async function logout() {
    cacheCapa.limpiar(auth.currentUser?.uid)
    // Limpiar la sesión local: sin esto quedaban guardados en sessionStorage
    // los datos del usuario anterior (bug #6).
    sesion.limpiar()
    try {
        sessionStorage.removeItem(CLAVE_REAUTH)
    } catch {
        // Ignorar errores de storage
    }
    return await signOut(auth)
}

// ============================================
// OBSERVAR ESTADO DE AUTH
// ============================================

export function observeAuth(callback) {
    return onAuthStateChanged(auth, callback)
}

// ============================================
// INACTIVIDAD
// ============================================
// El tiempo se lee de usuarios/{uid}.preferencias.seg.inactividadMinutos.
//   0  → nunca (no se inicia el temporizador)
//   >0 → se cierra la sesión tras esos minutos sin actividad

function minutosInactividad() {
    const seg = sesion.getPreferencias()?.seg
    if (!seg || seg.inactividadMinutos === undefined || seg.inactividadMinutos === null) {
        return INACTIVIDAD_MINUTOS_DEFAULT
    }
    return Number(seg.inactividadMinutos)
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer)
    inactivityTimer = null

    const minutos = minutosInactividad()

    // 0 = nunca: no se programa cierre por inactividad
    if (!Number.isFinite(minutos) || minutos <= 0) return

    inactivityTimer = setTimeout(async () => {
        await logout()
        window.location.replace("/login")
    }, minutos * 60 * 1000)
}

/**
 * Inicia (o reinicia) el temporizador de inactividad con la configuración
 * actual de preferencias. Es idempotente: los listeners solo se registran una vez.
 */
export function startInactivityTimer() {
    if (!actividadRegistrada) {
        EVENTOS_ACTIVIDAD.forEach(event => {
            document.addEventListener(event, resetInactivityTimer)
        })
        actividadRegistrada = true
    }
    resetInactivityTimer()
}

// ============================================
// PERSISTENCIA DE SESIÓN
// ============================================
// cerrarAlCerrarPestana = true  → browserSessionPersistence (sessionStorage)
// cerrarAlCerrarPestana = false → browserLocalPersistence (localStorage)

export async function aplicarPersistenciaSesion(cerrarAlCerrarPestana = true) {
    const persistencia = cerrarAlCerrarPestana
        ? browserSessionPersistence
        : browserLocalPersistence

    await setPersistence(auth, persistencia)
    return true
}

// ============================================
// VIGENCIA DE REAUTENTICACIÓN
// ============================================
// Una sesión se considera "reciente" si el último inicio de sesión o
// reautenticación ocurrió hace menos de REAUTH_VIGENCIA_MINUTOS.

export function marcarReautenticacion() {
    try {
        sessionStorage.setItem(CLAVE_REAUTH, String(Date.now()))
    } catch (e) {
        // Ignorar errores de storage
    }
}

function ultimaAutenticacion() {
    const user = auth.currentUser
    const desdeMetadata = user?.metadata?.lastSignInTime
        ? new Date(user.metadata.lastSignInTime).getTime()
        : 0

    let desdeReauth = 0
    try {
        desdeReauth = Number(sessionStorage.getItem(CLAVE_REAUTH)) || 0
    } catch (e) {
        // Ignorar errores de storage
    }

    return Math.max(desdeMetadata, desdeReauth)
}

export function esSesionReciente(minutos = REAUTH_VIGENCIA_MINUTOS) {
    const ultima = ultimaAutenticacion()
    if (!ultima) return false
    return Date.now() - ultima < minutos * 60 * 1000
}

// ============================================
// CAMBIAR / CREAR CONTRASEÑA
// ============================================

/**
 * Devuelve true si el usuario tiene proveedor 'password' vinculado.
 */
export function tienePassword(user = auth.currentUser) {
    if (!user) return false
    return user.providerData.some(p => p.providerId === "password")
}

/**
 * Devuelve true si el usuario tiene proveedor 'google.com' vinculado.
 */
export function tieneGoogle(user = auth.currentUser) {
    if (!user) return false
    return user.providerData.some(p => p.providerId === "google.com")
}

/**
 * Configura contraseña por primera vez (usuario de Google).
 * Vincula el proveedor 'password' al usuario actual.
 *
 * @param {string} passwordNueva
 */
export async function configurarPassword(passwordNueva) {
    const user = auth.currentUser
    if (!user) throw new Error("No hay usuario autenticado")
    if (!user.email) throw new Error("El usuario no tiene email asociado")
    if (tienePassword(user)) throw new Error("El usuario ya tiene contraseña")

    const credential = EmailAuthProvider.credential(user.email, passwordNueva)
    await linkWithCredential(user, credential)
    return true
}

/**
 * Cambia la contraseña existente.
 * Requiere reautenticación reciente para evitar auth/requires-recent-login.
 *
 * @param {string} passwordActual
 * @param {string} passwordNueva
 */
export async function cambiarPassword(passwordActual, passwordNueva) {
    const user = auth.currentUser
    if (!user) throw new Error("No hay usuario autenticado")
    if (!user.email) throw new Error("El usuario no tiene email asociado")

    // 1. Reautenticar
    const credencial = EmailAuthProvider.credential(user.email, passwordActual)
    await reauthenticateWithCredential(user, credencial)
    marcarReautenticacion()

    // 2. Actualizar
    await updatePassword(user, passwordNueva)
    return true
}

/**
 * Cambia la contraseña cuando la sesión ya fue verificada/reauntenticada
 * recientemente (evita pedir de nuevo la contraseña actual).
 *
 * @param {string} passwordNueva
 */
export async function cambiarPasswordVerificada(passwordNueva) {
    const user = auth.currentUser
    if (!user) throw new Error("No hay usuario autenticado")
    if (!user.email) throw new Error("El usuario no tiene email asociado")

    await updatePassword(user, passwordNueva)
    return true
}

// ============================================
// DETECCIÓN DE PROVEEDORES DE UN EMAIL
// ============================================

/**
 * Devuelve los métodos de login asociados a un email.
 * Útil para detectar cuentas solo-Google al intentar login con contraseña.
 */
export async function obtenerMetodosDeEmail(email) {
    try {
        return await fetchSignInMethodsForEmail(auth, email)
    } catch (error) {
        console.warn("No se pudo consultar métodos de email:", error)
        return []
    }
}

// ============================================
// REAUTENTICACIÓN Y ELIMINACIÓN DE CUENTA
// ============================================
// Para operaciones sensibles (eliminar cuenta, cambiar email) Firebase exige
// una reautenticación reciente. Se reautentica con el proveedor disponible:
// contraseña o Google (popup en contexto de clic).

/**
 * Reautentica al usuario actual con su contraseña.
 *
 * @param {string} password
 */
export async function reautenticarConPassword(password) {
    const user = auth.currentUser
    if (!user) throw new Error("No hay usuario autenticado")
    if (!user.email) throw new Error("El usuario no tiene email asociado")

    const credencial = EmailAuthProvider.credential(user.email, password)
    await reauthenticateWithCredential(user, credencial)
    marcarReautenticacion()
    return true
}

/**
 * Reautentica al usuario actual con Google (popup).
 * Debe invocarse dentro de un gesto de usuario (clic) para que el popup no
 * sea bloqueado por el navegador.
 */
export async function reautenticarConGoogle() {
    const user = auth.currentUser
    if (!user) throw new Error("No hay usuario autenticado")

    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: "select_account" })

    await signInWithPopup(auth, provider)
    marcarReautenticacion()
    return true
}

/**
 * Elimina definitivamente la cuenta de Firebase Auth.
 * Debe ejecutarse DESPUÉS de borrar los datos de Firestore: al eliminar la
 * cuenta, `request.auth` deja de existir y ya no se podría borrar nada más.
 */
export async function eliminarCuentaFirebase() {
    const user = auth.currentUser
    if (!user) throw new Error("No hay usuario autenticado")

    await deleteUser(user)
    return true
}