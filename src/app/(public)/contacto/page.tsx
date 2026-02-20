import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contacto — Studio Z Academy",
  description: "Ponte en contacto con Studio Z Academy.",
}

export default function ContactoPage() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER

  return (
    <section className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">Contacto</h1>
      <p className="mt-2 text-muted-foreground">
        Ponte en contacto con nosotros.
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        {whatsappNumber && (
          <div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              WhatsApp
            </h2>
            <p>
              Escribenos por WhatsApp para consultas, soporte tecnico o
              cualquier duda sobre tus cursos:{" "}
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                +{whatsappNumber}
              </a>
            </p>
          </div>
        )}

        {/* H-11: Info about data deletion */}
        <div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Eliminacion de datos personales
          </h2>
          <p>
            Si deseas eliminar tu cuenta y datos personales, puedes hacerlo
            de dos formas:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              Desde tu perfil: inicia sesion, ve a{" "}
              <strong>Mi Perfil</strong> y usa el boton{" "}
              &ldquo;Solicitar eliminacion de cuenta&rdquo; en la zona
              peligrosa.
            </li>
            {whatsappNumber && (
              <li>
                Por WhatsApp: escribenos a{" "}
                <a
                  href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
                    "Hola, quiero solicitar la eliminacion de mi cuenta y datos personales."
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  +{whatsappNumber}
                </a>{" "}
                indicando tu email registrado.
              </li>
            )}
          </ul>
          <p className="mt-2">
            Tu historial de compras se conservara de forma anonima por 5 anos
            conforme a la legislacion tributaria colombiana (Ley 1581 de 2012).
          </p>
        </div>
      </div>
    </section>
  )
}
