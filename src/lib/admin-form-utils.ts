import { formatCOP } from "@/lib/utils"

export const COURSE_TITLE_MIN_LENGTH = 5
export const COURSE_TITLE_MAX_LENGTH = 120
export const COURSE_SHORT_DESCRIPTION_MIN_LENGTH = 20
export const COURSE_SHORT_DESCRIPTION_MAX_LENGTH = 200
export const COURSE_DESCRIPTION_MAX_LENGTH = 5000
export const COP_MAX_PESOS = 99_999_999
export const INSTRUCTOR_FULL_NAME_MIN_LENGTH = 2
export const INSTRUCTOR_FULL_NAME_MAX_LENGTH = 80
export const INSTRUCTOR_BIO_MAX_LENGTH = 1000
export const INSTRUCTOR_SPECIALTIES_MAX_ITEMS = 10
export const INSTRUCTOR_SPECIALTY_MIN_LENGTH = 2
export const INSTRUCTOR_SPECIALTY_MAX_LENGTH = 40
export const INSTRUCTOR_SPECIALTY_VALUE_SEPARATOR = "::"
export const INSTRUCTOR_SPECIALTY_CATEGORIES = ["baile", "tatuaje"] as const

const COP_INPUT_ALLOWED_PATTERN = /^[\s$.0-9]+$/

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

export function normalizeOptionalText(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value ?? "")
  return normalized.length > 0 ? normalized : null
}

export function getLengthError(input: {
  value: string
  label: string
  min?: number
  max?: number
  required?: boolean
}) {
  const { value, label, min, max, required } = input

  if (!value) {
    return required ? `${label} es obligatorio.` : undefined
  }

  if (typeof min === "number" && typeof max === "number") {
    if (value.length < min || value.length > max) {
      return `${label} debe tener entre ${min} y ${max} caracteres.`
    }
    return undefined
  }

  if (typeof min === "number" && value.length < min) {
    return `${label} debe tener al menos ${min} caracteres.`
  }

  if (typeof max === "number" && value.length > max) {
    return `${label} no puede superar ${max} caracteres.`
  }

  return undefined
}

export function sanitizeCopInput(value: string, maxPesos = COP_MAX_PESOS) {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "")
  if (!digits) return ""

  const limited = digits.slice(0, String(maxPesos).length)
  const parsed = Number(limited)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return limited
  }

  return String(Math.min(parsed, maxPesos))
}

export function formatCopFromPesos(pesos: number) {
  return formatCOP(Math.round(pesos * 100))
}

export function formatCopInputValue(value: string) {
  if (!value) return ""

  const pesos = Number(value)
  if (!Number.isFinite(pesos)) return ""

  return formatCopFromPesos(pesos)
}

export function parseCopInput(
  rawValue: string | null | undefined,
  input: {
    label: string
    required?: boolean
    minPesos?: number
    maxPesos?: number
  }
) {
  const { label, required = false, minPesos = 0, maxPesos = COP_MAX_PESOS } = input
  const value = String(rawValue ?? "").trim()

  if (!value) {
    return required
      ? { pesos: null, error: `${label} es obligatorio.` }
      : { pesos: null }
  }

  if (!COP_INPUT_ALLOWED_PATTERN.test(value)) {
    return {
      pesos: null,
      error: `${label} debe contener solo numeros enteros en pesos colombianos.`,
    }
  }

  const digits = value.replace(/\D/g, "")
  if (!digits) {
    return required
      ? { pesos: null, error: `${label} es obligatorio.` }
      : { pesos: null }
  }

  const pesos = Number(digits)
  if (!Number.isSafeInteger(pesos)) {
    return {
      pesos: null,
      error: `${label} no tiene un formato valido.`,
    }
  }

  if (pesos < minPesos) {
    return {
      pesos,
      error:
        minPesos <= 1
          ? `${label} debe ser mayor a ${formatCopFromPesos(0)}.`
          : `${label} debe ser de al menos ${formatCopFromPesos(minPesos)}.`,
    }
  }

  if (pesos > maxPesos) {
    return {
      pesos,
      error: `${label} no puede superar ${formatCopFromPesos(maxPesos)}.`,
    }
  }

  return { pesos }
}

export function parseWholeNumberInput(
  rawValue: string | null | undefined,
  input: {
    label: string
    min?: number
    max?: number
    required?: boolean
  }
) {
  const { label, min, max, required = false } = input
  const value = String(rawValue ?? "").trim()

  if (!value) {
    return required
      ? { value: null, error: `${label} es obligatorio.` }
      : { value: null }
  }

  if (!/^\d+$/.test(value)) {
    return {
      value: null,
      error: `${label} debe ser un numero entero.`,
    }
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    return {
      value: null,
      error: `${label} no tiene un formato valido.`,
    }
  }

  if (typeof min === "number" && parsed < min) {
    return {
      value: parsed,
      error: `${label} debe estar entre ${min} y ${max}.`,
    }
  }

  if (typeof max === "number" && parsed > max) {
    return {
      value: parsed,
      error: `${label} debe estar entre ${min} y ${max}.`,
    }
  }

  return { value: parsed }
}

export function normalizeSpecialtyKey(value: string) {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CO")
}

export function normalizeSpecialtyName(value: string) {
  const normalized = normalizeSpecialtyKey(value)

  return normalized.replace(/(^|[\s/-])([a-záéíóúñü])/g, (match, prefix, char) => {
    return `${prefix}${char.toLocaleUpperCase("es-CO")}`
  })
}

export function getSpecialtyNameError(value: string) {
  return getLengthError({
    value,
    label: "La especialidad",
    min: INSTRUCTOR_SPECIALTY_MIN_LENGTH,
    max: INSTRUCTOR_SPECIALTY_MAX_LENGTH,
  })
}

export function isInstructorSpecialtyCategory(
  value: string
): value is (typeof INSTRUCTOR_SPECIALTY_CATEGORIES)[number] {
  return INSTRUCTOR_SPECIALTY_CATEGORIES.includes(
    value as (typeof INSTRUCTOR_SPECIALTY_CATEGORIES)[number]
  )
}

export function buildInstructorSpecialtyValue(
  category: (typeof INSTRUCTOR_SPECIALTY_CATEGORIES)[number],
  normalizedName: string
) {
  return `${category}${INSTRUCTOR_SPECIALTY_VALUE_SEPARATOR}${normalizedName}`
}

export function parseInstructorSpecialtyValue(value: string) {
  const [category, ...nameParts] = value.split(INSTRUCTOR_SPECIALTY_VALUE_SEPARATOR)
  const normalizedName = nameParts.join(INSTRUCTOR_SPECIALTY_VALUE_SEPARATOR).trim()

  if (!isInstructorSpecialtyCategory(category) || !normalizedName) {
    return null
  }

  return { category, normalizedName }
}

export function validateImageFile(
  file: File | null | undefined,
  input: {
    label: string
    allowedTypes: string[]
    maxSizeBytes: number
  }
) {
  if (!file || file.size === 0) return undefined

  if (!input.allowedTypes.includes(file.type)) {
    return `${input.label} debe ser JPG, PNG o WebP.`
  }

  if (file.size > input.maxSizeBytes) {
    return `${input.label} no puede superar 2 MB.`
  }

  return undefined
}
