export const danceCoursesOpen = [
  "Bachata Principiantes",
  "Bachata Intermedio",
  "Bachata Avanzado",
  "Salsa Principiantes",
  "Salsa Intermedio",
  "Salsa Avanzado",
  "Multiritmos",
  "Sexy Dance",
  "Urbano",
] as const

export const studioZLines = {
  dance: {
    name: "Academia de baile",
    shortName: "Baile",
    eyebrow: "Movimiento, tecnica y comunidad",
    whatsappNumber: "573117720702",
    whatsappLabel: "Escribir a baile",
    whatsappMessage:
      "Hola Studio Z, quiero informacion sobre los cursos y clases de baile.",
    instagramUrl: "https://www.instagram.com/studioz.dance/",
    instagramLabel: "@studioz.dance",
    address: "Cra 55A calle 26-6, tercer piso, Rionegro, Antioquia",
    mapsQuery: "Cra 55A calle 26-6, tercer piso, Rionegro, Antioquia",
    intro:
      "Studio Z Dance es una academia para quienes quieren empezar, subir de nivel y entrenar con una energia real de estudio. Aqui el baile se vive como tecnica, seguridad corporal y conexion con la musica.",
    details: [
      "Clases para personas que quieren aprender desde cero o seguir creciendo con una ruta mas clara.",
      "Espacio pensado para ritmo, confianza, presencia y constancia, no solo para memorizar pasos.",
    ],
    audience:
      "Si quieres unirte a nuestros cursos, encontrar tu nivel o entender por donde empezar, esta es la linea correcta.",
  },
  tattoo: {
    name: "Studio Z Tattoo",
    shortName: "Tattoo",
    eyebrow: "Proyecto, estilo y criterio visual",
    whatsappNumber: "573206470132",
    whatsappLabel: "Escribir a tattoo",
    whatsappMessage:
      "Hola Studio Z Tattoo, tengo un proyecto que quiero plasmar y quiero hablarlo con ustedes.",
    instagramUrl: "https://www.instagram.com/studioz_tattoo/",
    instagramLabel: "@studioz_tattoo",
    address: "Rionegro, Parque Principal",
    mapsQuery: "Rionegro, Parque Principal",
    intro:
      "Studio Z Tattoo trabaja cada pieza como un proyecto conversado, aterrizado y ejecutado con criterio. La idea no es solo tatuar, sino darle una forma que se sostenga con el tiempo.",
    details: [
      "El proceso parte de la idea, el estilo y la piel de cada persona para construir una propuesta con direccion.",
      "Es un espacio para resolver dudas, afinar conceptos y llevar una idea a una pieza que tenga presencia real.",
    ],
    audience:
      "Si tienes un proyecto que quieres plasmar o quieres aterrizar una idea antes de tatuarte, esta es la linea para hablarlo.",
  },
} as const

export function buildWhatsAppUrl(phoneNumber: string, message: string) {
  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`
}

export function buildMapsUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
