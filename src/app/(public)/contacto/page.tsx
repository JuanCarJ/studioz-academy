import type { Metadata } from "next"

import { ContactForm } from "@/components/contact/ContactForm"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Contacto — Studio Z Academy",
  description: "Ponte en contacto con Studio Z Academy.",
}

export default function ContactoPage() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER

  return (
    <section className="container mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="space-y-8">
        <div>
          <p className="text-xs uppercase tracking-[0.36em] text-primary">
            Contacto
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Habla con Studio Z desde un canal formal o por WhatsApp.
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            El formulario persiste los mensajes para seguimiento interno y
            WhatsApp sigue disponible para una respuesta mas rapida.
          </p>
        </div>

        {whatsappNumber && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="space-y-3 pt-6">
              <h2 className="text-xl font-semibold">Canal rapido</h2>
              <p className="text-sm text-muted-foreground">
                Escribenos por WhatsApp para resolver dudas de cursos, pagos,
                soporte o acceso a la plataforma.
              </p>
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-sm font-medium text-primary hover:underline"
              >
                Abrir WhatsApp: +{whatsappNumber}
              </a>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="space-y-4 pt-6 text-sm leading-relaxed text-muted-foreground">
            <div>
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                Eliminacion de datos personales
              </h2>
              <p>
                Si deseas eliminar tu cuenta y datos personales, puedes hacerlo
                desde tu perfil en la seccion peligrosa o solicitarlo por
                WhatsApp indicando tu email registrado.
              </p>
              <p className="mt-2">
                El historial de compras se conserva de forma anonima por 5 anos
                conforme a la legislacion tributaria colombiana.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10">
        <CardContent className="pt-6">
          <ContactForm />
        </CardContent>
      </Card>
    </section>
  )
}
