import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Politica de Privacidad — Studio Z Academy",
  description:
    "Informacion sobre el tratamiento de datos personales conforme a la Ley 1581 de 2012.",
}

export default function PrivacyPolicyPage() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER

  return (
    <section className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">
        Politica de Privacidad y Tratamiento de Datos Personales
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ultima actualizacion: febrero 2026
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            1. Responsable del tratamiento
          </h2>
          <p>
            <strong>Studio Z Academy</strong> (en adelante &ldquo;Studio Z&rdquo;), con
            domicilio en Colombia, es responsable del tratamiento de los datos
            personales recolectados a traves de la plataforma{" "}
            <strong>studiozacademy.com</strong>.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            2. Finalidad del tratamiento
          </h2>
          <p>Los datos personales seran utilizados para:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              Gestion de la cuenta de usuario (registro, autenticacion, perfil).
            </li>
            <li>
              Prestacion del servicio de cursos online (inscripcion, acceso a
              contenido, seguimiento de progreso).
            </li>
            <li>
              Procesamiento de pagos a traves de Wompi (pasarela de pagos
              autorizada en Colombia).
            </li>
            <li>
              Comunicaciones relacionadas con los cursos adquiridos
              (notificaciones, actualizaciones).
            </li>
            <li>Soporte al cliente via WhatsApp.</li>
            <li>Mejora continua del servicio y analisis de uso.</li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            3. Datos recolectados
          </h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong>Datos de identificacion:</strong> nombre completo, correo
              electronico, telefono (opcional).
            </li>
            <li>
              <strong>Datos de transaccion:</strong> historial de compras,
              metodo de pago utilizado, referencia de la transaccion.
            </li>
            <li>
              <strong>Datos de uso:</strong> progreso en cursos, lecciones
              completadas, fecha de ultimo acceso.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            4. Derechos del titular
          </h2>
          <p>
            De conformidad con la Ley 1581 de 2012 y el Decreto 1377 de 2013,
            el titular de los datos tiene derecho a:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>Conocer:</strong> acceder a los datos personales que
              Studio Z tiene almacenados.
            </li>
            <li>
              <strong>Actualizar:</strong> rectificar datos inexactos o
              incompletos.
            </li>
            <li>
              <strong>Suprimir:</strong> solicitar la eliminacion de datos
              cuando no sean necesarios para la finalidad autorizada.
            </li>
            <li>
              <strong>Revocar:</strong> revocar la autorizacion otorgada para el
              tratamiento de datos.
            </li>
            <li>
              <strong>Presentar quejas:</strong> ante la Superintendencia de
              Industria y Comercio por el uso indebido de datos personales.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            5. Procedimiento para ejercer derechos
          </h2>
          <p>
            Para ejercer cualquiera de los derechos mencionados, el titular
            puede comunicarse con Studio Z a traves de:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {whatsappNumber && (
              <li>
                <strong>WhatsApp:</strong>{" "}
                <a
                  href={`https://wa.me/${whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  +{whatsappNumber}
                </a>
              </li>
            )}
            <li>
              <strong>Desde la plataforma:</strong> los usuarios registrados
              pueden solicitar la eliminacion de su cuenta directamente desde
              la seccion &ldquo;Mi Perfil&rdquo;. El proceso es automatizado e
              inmediato: los datos personales se anonimizan y el historial de
              compras se conserva de forma anonima durante 5 anos conforme a
              las obligaciones tributarias de la legislacion colombiana.
            </li>
            <li>
              La solicitud sera atendida en un plazo maximo de quince (15) dias
              habiles.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            6. Seguridad de la informacion
          </h2>
          <p>
            Studio Z implementa medidas tecnicas y organizacionales para
            proteger los datos personales contra acceso no autorizado,
            perdida, alteracion o destruccion. Los datos se almacenan en
            servidores de Supabase con cifrado en transito y en reposo. Los
            pagos son procesados exclusivamente por Wompi; Studio Z no
            almacena datos de tarjetas de credito ni debito.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            7. Transferencia de datos
          </h2>
          <p>
            Los datos personales podran ser compartidos con terceros
            unicamente cuando sea necesario para la prestacion del servicio:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>Wompi:</strong> para procesamiento de pagos.
            </li>
            <li>
              <strong>Supabase:</strong> para almacenamiento de datos.
            </li>
            <li>
              <strong>Bunny Stream:</strong> para entrega de contenido de video.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            8. Vigencia
          </h2>
          <p>
            Esta politica entra en vigencia a partir de su publicacion y se
            mantendra mientras Studio Z Academy opere la plataforma. Los datos
            seran conservados durante el tiempo necesario para cumplir con las
            finalidades descritas, o durante el periodo exigido por la
            legislacion colombiana vigente.
          </p>
        </div>
      </div>
    </section>
  )
}
