import type { AuthActionState } from "@/actions/auth"

export const SAFE_SIGNUP_RETRY_MESSAGE =
  "No se pudo crear la cuenta. Si ya te registraste antes, inicia sesion o recupera tu contrasena."

const AUTH_PAGE_ERROR_MESSAGES = {
  "account-deleted":
    "Esta cuenta fue eliminada. Si deseas volver, crea una cuenta nueva o contacta soporte si necesitas ayuda.",
  callback: "No se pudo completar el acceso con Google. Intenta de nuevo.",
  csrf: "La solicitud vencio por seguridad. Recarga la pagina e intenta de nuevo.",
  "no-code": "No se pudo completar el acceso con Google. Intenta de nuevo.",
  oauth: "No se pudo iniciar el acceso con Google. Intenta de nuevo.",
} as const

export function getAuthPageErrorMessage(errorCode: string | null) {
  if (!errorCode) {
    return null
  }

  return AUTH_PAGE_ERROR_MESSAGES[errorCode as keyof typeof AUTH_PAGE_ERROR_MESSAGES] ?? null
}

export function buildInvalidCredentialsError(): AuthActionState {
  return {
    error: "No pudimos iniciar sesion. Verifica tus credenciales o recupera tu contrasena.",
  }
}
