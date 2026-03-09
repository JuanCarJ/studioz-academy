"use client"

import { useActionState, useEffect, useRef } from "react"
import { useFormStatus } from "react-dom"

import { submitContactMessage } from "@/actions/editorial"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Enviando mensaje..." : "Enviar mensaje"}
    </Button>
  )
}

export function ContactForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useActionState(submitContactMessage, {})

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset()
    }
  }, [state.success])

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Nombre completo
          </label>
          <Input id="name" name="name" placeholder="Tu nombre" required />
        </div>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="tu@email.com"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="subject" className="text-sm font-medium">
          Asunto
        </label>
        <Input
          id="subject"
          name="subject"
          placeholder="Cursos, eventos, soporte o colaboraciones"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="message" className="text-sm font-medium">
          Mensaje
        </label>
        <Textarea
          id="message"
          name="message"
          placeholder="Cuentanos que necesitas y te responderemos por email o WhatsApp."
          className="min-h-36"
          required
        />
      </div>

      {state.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      {state.success && (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Recibimos tu mensaje. Te responderemos lo antes posible.
        </p>
      )}

      <SubmitButton />
    </form>
  )
}
