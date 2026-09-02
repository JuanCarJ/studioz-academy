"use client"
import { useState, useTransition } from "react"
import { submitContactMessage } from "@/actions/contact"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
export function ContactForm() {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ success?: boolean; error?: string }>(
    {}
  )
  return (
    <section className="max-w-2xl space-y-4" aria-labelledby="message-heading">
      <h2 id="message-heading" className="text-2xl font-semibold">
        Déjanos un mensaje
      </h2>
      <p className="text-muted-foreground">
        Cuéntanos qué necesitas. Te responderemos al correo que indiques.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          const form = e.currentTarget
          const data = new FormData(form)
          setResult({})
          start(async () => {
            try {
              const response = await submitContactMessage({
                name: String(data.get("name")),
                email: String(data.get("email")),
                subject: String(data.get("subject")),
                message: String(data.get("message")),
                website: String(data.get("website") ?? ""),
              })
              setResult(response)
              if (response.success) form.reset()
            } catch {
              setResult({
                error:
                  "No pudimos enviar tu mensaje. Revisa tu conexión o escríbenos por WhatsApp.",
              })
            }
          })
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="contact-name">Tu nombre</label>
            <Input
              id="contact-name"
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={80}
            />
          </div>
          <div>
            <label htmlFor="contact-email">Correo electrónico</label>
            <Input
              id="contact-email"
              type="email"
              name="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </div>
        </div>
        <div>
          <label htmlFor="contact-subject">¿Sobre qué nos escribes?</label>
          <select
            id="contact-subject"
            name="subject"
            className="mt-1 h-11 w-full rounded-md border bg-background px-3"
          >
            {[
              "Clases de baile",
              "Tatuajes",
              "Cursos online",
              "Ayuda con una compra",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="contact-message">Tu mensaje</label>
          <Textarea
            id="contact-message"
            name="message"
            rows={5}
            minLength={10}
            maxLength={4000}
            required
          />
        </div>
        <div hidden aria-hidden="true">
          <label htmlFor="contact-website">Sitio web</label>
          <input
            id="contact-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          No incluyas contraseñas ni datos de tarjeta. Usaremos estos datos para
          atender tu consulta.
        </p>
        {result.error && (
          <p role="alert" className="text-destructive">
            {result.error}
          </p>
        )}
        {result.success && (
          <p role="status">Recibimos tu mensaje. Gracias por escribirnos.</p>
        )}
        <Button className="min-h-11" disabled={pending}>
          {pending ? "Enviando…" : "Enviar mensaje"}
        </Button>
      </form>
    </section>
  )
}
