"use client"

import { useActionState } from "react"
import { retryCourseMediaProcessing } from "@/actions/admin/media"
import { Button } from "@/components/ui/button"

export function MediaRetryButton({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState(retryCourseMediaProcessing, {})
  return <form action={action} className="mt-3 space-y-2">
    <input type="hidden" name="courseId" value={courseId} />
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Comprobando…" : "Volver a comprobar"}
    </Button>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state.success && <p role="status" className="text-sm text-muted-foreground">{state.success}</p>}
  </form>
}
