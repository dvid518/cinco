import {
    getAuth,
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
    getAdditionalUserInfo
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js"
import { app } from "./firebaseClient.js"
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
import { db } from "./firestore.js"

const auth = getAuth(app)
const INACTIVITY_TIME = 30 * 60 * 1000
let inactivityTimer

// ============================================
// LOGIN CON EMAIL Y CONTRASEÑA
// ============================================

export async function login(email, password) {
    return await signInWithEmailAndPassword(auth, email, password)
}

// ============================================
// LOGIN CON GOOGLE
// ============================================

export async function loginConGoogle() {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: "select_account" })

    const resultado = await signInWithPopup(auth, provider)
    const esNuevo = getAdditionalUserInfo(resultado)?.isNewUser || false

    // Asegurar doc del usuario en Firestore
    await asegurarDocUsuario(resultado.user, esNuevo)

    return resultado
}

// ============================================
// ASEGURAR DOC DEL USUARIO EN FIRESTORE
// ============================================
// Crea usuarios/{uid} si no existe. No sobreescribe si ya existe.
// ============================================

async function asegurarDocUsuario(user, esNuevo) {
    const referencia = doc(db, "usuarios", user.uid)
    const existente = await getDoc(referencia)

    if (!existente.exists()) {
        await setDoc(referencia, {
            email: user.email || null,
            nombre: user.displayName || null,
            foto: user.photoURL || null,
            fechaRegistro: serverTimestamp(),
            preferencias: {}
        })
        console.log("[INFO] Doc de usuario creado en Firestore")
    } else if (esNuevo) {
        console.log("[INFO] Doc ya existía (caso raro)")
    }
}

// ============================================
// LOGOUT
// ============================================

export async function logout() {
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

function resetInactivityTimer() {
    clearTimeout(inactivityTimer)

    inactivityTimer = setTimeout(async () => {
        await logout()
        window.location.replace("/login.html")
    }, INACTIVITY_TIME)
}

export function startInactivityTimer() {
    const events = ["click", "mousemove", "keydown", "scroll", "touchstart"]
    events.forEach(event => {
        document.addEventListener(event, resetInactivityTimer)
    })
    resetInactivityTimer()
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

    // 2. Actualizar
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