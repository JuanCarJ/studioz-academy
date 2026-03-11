import * as React from "react"

import { Input } from "@/components/ui/input"
import { formatCopInputValue, sanitizeCopInput } from "@/lib/admin-form-utils"

interface CopCurrencyInputProps
  extends Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> {
  value: string
  onValueChange: (value: string) => void
  maxPesos?: number
}

export function CopCurrencyInput({
  value,
  onValueChange,
  maxPesos,
  ...props
}: CopCurrencyInputProps) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatCopInputValue(value)}
      onChange={(event) =>
        onValueChange(sanitizeCopInput(event.target.value, maxPesos))
      }
    />
  )
}
