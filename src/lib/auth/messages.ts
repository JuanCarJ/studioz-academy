import type { AuthActionState } from "@/actions/auth"

export const SAFE_SIGNUP_RETRY_MESSAGE =
  "No se pudo crear la cuenta. Si ya tienes una, inicia sesión o recupera tu contraseña."

const AUTH_PAGE_ERROR_MESSAGES = {
  "account-deleted":
    "Esta cuenta fue eliminada. Crea una cuenta nueva o contacta soporte.",
  callback: "No se pudo acceder con Google. Inténtalo de nuevo.",
  csrf: "La solicitud venció. Recarga la página e inténtalo de nuevo.",
  "no-code": "No se pudo acceder con Google. Inténtalo de nuevo.",
  oauth: "No se pudo acceder con Google. Inténtalo de nuevo.",
} as const

export function getAuthPageErrorMessage(errorCode: string | null) {
  if (!errorCode) {
    return null
  }

  return AUTH_PAGE_ERROR_MESSAGES[errorCode as keyof typeof AUTH_PAGE_ERROR_MESSAGES] ?? null
}

export function buildInvalidCredentialsError(): AuthActionState {
  return {
    error: "Correo o contraseña incorrectos.",
  }
}
