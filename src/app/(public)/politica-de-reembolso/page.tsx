import type { Metadata } from "next"

import { Mail } from "lucide-react"

export const metadata: Metadata = {
  title: "Politica de Reembolso — Studio Z Academy",
  description:
    "Conoce las condiciones de reembolso de Studio Z Academy para cursos digitales.",
}

export default function PoliticaReembolsoPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">Politica de Reembolso</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ultima actualizacion: febrero 2026
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        {/* 1. Condiciones generales */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            1. Condiciones generales
          </h2>
          <p>
            Studio Z Academy ofrece cursos digitales de acceso inmediato. Al
            realizar tu compra, obtienes acceso completo al contenido del curso
            adquirido. Dado que el contenido se entrega de forma digital e
            instantanea, las solicitudes de reembolso estan sujetas a las
            condiciones descritas a continuacion.
          </p>
        </section>

        {/* 2. Plazo para solicitar */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            2. Plazo para solicitar un reembolso
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Puedes solicitar un reembolso dentro de los{" "}
              <strong className="text-foreground">7 dias calendario</strong>{" "}
              posteriores a la fecha de compra.
            </li>
            <li>
              Pasado este plazo, no se aceptaran solicitudes de reembolso.
            </li>
          </ul>
        </section>

        {/* 3. Requisitos */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            3. Requisitos para el reembolso
          </h2>
          <p className="mb-2">
            Para que tu solicitud sea evaluada, debes cumplir con:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>No haber completado mas del 30% del contenido del curso.</li>
            <li>
              Presentar la solicitud por escrito indicando el motivo del
              reembolso.
            </li>
            <li>
              Proporcionar el correo electronico asociado a tu cuenta y el
              numero de orden.
            </li>
          </ul>
        </section>

        {/* 4. Como solicitar */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            4. Como solicitar un reembolso
          </h2>
          <p>
            Envia un correo electronico a{" "}
            <a
              href="mailto:soporte@studiozacademy.com"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              soporte@studiozacademy.com
            </a>{" "}
            con el asunto{" "}
            <strong className="text-foreground">
              &quot;Solicitud de reembolso&quot;
            </strong>{" "}
            e incluye:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Nombre completo</li>
            <li>Correo electronico de tu cuenta</li>
            <li>Numero de orden</li>
            <li>Motivo de la solicitud</li>
          </ul>
        </section>

        {/* 5. Proceso */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            5. Proceso de reembolso
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Revisaremos tu solicitud en un plazo de{" "}
              <strong className="text-foreground">5 dias habiles</strong>.
            </li>
            <li>
              Si la solicitud es aprobada, el reembolso se realizara al mismo
              medio de pago utilizado en la compra.
            </li>
            <li>
              El tiempo de reflejo en tu cuenta depende de tu entidad bancaria
              (generalmente entre 5 y 10 dias habiles adicionales).
            </li>
            <li>
              Al procesar el reembolso, se revocara tu acceso al contenido del
              curso.
            </li>
          </ul>
        </section>

        {/* 6. Exclusiones */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            6. Exclusiones
          </h2>
          <p className="mb-2">No se otorgaran reembolsos en los siguientes casos:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Solicitudes realizadas despues de los 7 dias calendario.</li>
            <li>
              Cursos en los que se haya completado mas del 30% del contenido.
            </li>
            <li>Cursos gratuitos.</li>
            <li>
              Compras realizadas con descuentos o promociones especiales (salvo
              que se indique lo contrario en los terminos de la promocion).
            </li>
          </ul>
        </section>

        {/* 7. Contacto */}
        <section className="rounded-lg border bg-muted/30 p-6">
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Contacto
          </h2>
          <p>
            Si tienes alguna pregunta sobre nuestra politica de reembolso, no
            dudes en contactarnos:
          </p>
          <a
            href="mailto:soporte@studiozacademy.com"
            className="mt-3 inline-flex items-center gap-2 font-medium text-primary underline-offset-4 hover:underline"
          >
            <Mail className="h-4 w-4" />
            soporte@studiozacademy.com
          </a>
        </section>
      </div>
    </main>
  )
}
