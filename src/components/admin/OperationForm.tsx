"use client"

import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { performAdminOperation } from "@/actions/admin/operations"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface Props {
  targetId: string
  operations: { value: string; label: string }[]
  courses?: { id: string; title: string }[]
  contactStatus?: string
  notes?: string
}

export function OperationForm({
  targetId,
  operations,
  courses,
  contactStatus,
  notes,
}: Props) {
  const id = useId()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ error?: string; success?: boolean }>(
    {}
  )
  const [operation, setOperation] = useState(operations[0]?.value ?? "")
  const needsCourse =
    operation.startsWith("access.") || operation === "progress.reset"
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        const form = event.currentTarget
        const values = new FormData(form)
        setMessage({})
        start(async () => {
          try {
            const result = await performAdminOperation({
              action: operation,
              targetId,
              reason: String(values.get("reason") ?? ""),
              courseId: String(values.get("courseId") ?? ""),
              status: String(values.get("status") ?? ""),
              assign: values.get("assign") ? "me" : undefined,
              notes: String(values.get("notes") ?? ""),
            })
            setMessage(result)
            if (result.success) {
              form.reset()
              router.refresh()
            }
          } catch {
            setMessage({
              error:
                "No pudimos guardar el cambio. Revisa tu conexión e inténtalo de nuevo.",
            })
          }
        })
      }}
    >
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor={`${id}-action`}>
          Acción
        </label>
        <select
          id={`${id}-action`}
          className="h-11 w-full rounded-md border bg-background px-3"
          value={operation}
          onChange={(e) => setOperation(e.target.value)}
          disabled={pending}
        >
          {operations.map((o) => (
            <option value={o.value} key={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {needsCourse && (
        <div className="space-y-1">
          <label htmlFor={`${id}-course`}>Curso</label>
          <select
            className="h-11 w-full rounded-md border bg-background px-3"
            id={`${id}-course`}
            name="courseId"
            required
            disabled={pending}
          >
            <option value="">Selecciona un curso</option>
            {courses?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {contactStatus !== undefined && (
        <>
          <label className="block" htmlFor={`${id}-status`}>
            Estado del mensaje
          </label>
          <select
            id={`${id}-status`}
            name="status"
            defaultValue={contactStatus}
            className="h-11 w-full rounded-md border bg-background px-3"
          >
            <option value="new">Nuevo</option>
            <option value="in_progress">En gestión</option>
            <option value="resolved">Resuelto</option>
          </select>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="assign" />
            Asignarme este mensaje
          </label>
          <label htmlFor={`${id}-notes`}>Notas internas</label>
          <Textarea
            id={`${id}-notes`}
            name="notes"
            defaultValue={notes}
            maxLength={4000}
          />
        </>
      )}
      <label className="block text-sm font-medium" htmlFor={`${id}-reason`}>
        {operation === "user.note" ? "Nota de soporte" : "Motivo del cambio"}
      </label>
      <Textarea
        id={`${id}-reason`}
        name="reason"
        minLength={5}
        maxLength={2000}
        required
        disabled={pending}
      />
      {operation !== "user.note" && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" required disabled={pending} />
          Confirmo que revisé el caso y quiero aplicar esta acción.
        </label>
      )}
      {message.error && (
        <p role="alert" className="text-sm text-destructive">
          {message.error}
        </p>
      )}
      {message.success && (
        <p role="status" className="text-sm">
          Cambio guardado y registrado en el historial.
        </p>
      )}
      <Button className="min-h-11" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambio"}
      </Button>
    </form>
  )
}
