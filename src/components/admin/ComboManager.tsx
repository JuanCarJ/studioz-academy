"use client"

import { useState } from "react"

import { formatCOP } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

import type { DiscountRule } from "@/types"

const selectClassName =
  "border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"

type ComboKind = "threshold_discount" | "buy_x_get_y"
type DiscountType = "percentage" | "fixed"

function buildPreview(input: {
  comboKind: ComboKind
  category: string
  minCourses: number
  discountType: DiscountType
  discountValue: number
  buyQuantity: number
  freeQuantity: number
}) {
  const scope = input.category ? `de ${input.category}` : "de todo el catalogo"

  if (input.comboKind === "buy_x_get_y") {
    return `Cada bloque de ${input.buyQuantity + input.freeQuantity} cursos ${scope}: los ultimos ${input.freeQuantity} por orden de agregado quedan gratis.`
  }

  const valueLabel =
    input.discountType === "percentage"
      ? `${Math.max(1, input.discountValue)}%`
      : formatCOP(Math.max(1, input.discountValue) * 100)

  return `Al llevar minimo ${Math.max(2, input.minCourses)} cursos ${scope}, se aplica un descuento de ${valueLabel}.`
}

function ComboRuleForm({
  initialRule,
  action,
  submitLabel,
}: {
  initialRule?: DiscountRule
  action: (formData: FormData) => void | Promise<void>
  submitLabel: string
}) {
  const [comboKind, setComboKind] = useState<ComboKind>(
    initialRule?.combo_kind ?? "threshold_discount"
  )
  const [category, setCategory] = useState<string>(initialRule?.category ?? "baile")
  const [minCourses, setMinCourses] = useState(
    String(initialRule?.min_courses ?? 2)
  )
  const [discountType, setDiscountType] = useState<DiscountType>(
    initialRule?.discount_type === "fixed" ? "fixed" : "percentage"
  )
  const [discountValue, setDiscountValue] = useState(
    initialRule?.discount_type === "fixed" && initialRule.discount_value
      ? String(initialRule.discount_value / 100)
      : String(initialRule?.discount_value ?? 10)
  )
  const [buyQuantity, setBuyQuantity] = useState(
    String(initialRule?.buy_quantity ?? 2)
  )
  const [freeQuantity, setFreeQuantity] = useState(
    String(initialRule?.free_quantity ?? 1)
  )

  const preview = buildPreview({
    comboKind,
    category,
    minCourses: Number(minCourses),
    discountType,
    discountValue: Number(discountValue),
    buyQuantity: Number(buyQuantity),
    freeQuantity: Number(freeQuantity),
  })

  return (
    <form
      action={action}
      className="space-y-4"
      data-testid={initialRule ? `combo-form-${initialRule.id}` : "combo-create-form"}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Nombre</label>
          <Input name="name" defaultValue={initialRule?.name ?? ""} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Categoria</label>
          <select
            name="category"
            className={selectClassName}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="baile">Baile</option>
            <option value="tatuaje">Tatuaje</option>
            <option value="">Aplica a todo</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Tipo de combo</label>
        <select
          name="comboKind"
          className={selectClassName}
          value={comboKind}
          onChange={(event) =>
            setComboKind(event.target.value as ComboKind)
          }
        >
          <option value="threshold_discount">Descuento al llevar X</option>
          <option value="buy_x_get_y">Lleva X y recibe Y gratis</option>
        </select>
      </div>

      {comboKind === "threshold_discount" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Minimo de cursos</label>
            <Input
              name="minCourses"
              type="number"
              min="2"
              value={minCourses}
              onChange={(event) => setMinCourses(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Tipo</label>
            <select
              name="discountType"
              className={selectClassName}
              value={discountType}
              onChange={(event) =>
                setDiscountType(event.target.value as DiscountType)
              }
            >
              <option value="percentage">Porcentaje</option>
              <option value="fixed">Monto fijo (COP)</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Valor</label>
            <Input
              name="discountValue"
              type="number"
              min="1"
              max={discountType === "percentage" ? "100" : undefined}
              value={discountValue}
              onChange={(event) => setDiscountValue(event.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Cursos pagados</label>
            <Input
              name="buyQuantity"
              type="number"
              min="1"
              value={buyQuantity}
              onChange={(event) => setBuyQuantity(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Cursos gratis</label>
            <Input
              name="freeQuantity"
              type="number"
              min="1"
              value={freeQuantity}
              onChange={(event) => setFreeQuantity(event.target.value)}
            />
          </div>
        </div>
      )}

      <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Preview</p>
        <p className="mt-1">{preview}</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initialRule?.is_active ?? true}
          className="h-4 w-4"
        />
        Regla activa
      </label>

      <Button type="submit">{submitLabel}</Button>
    </form>
  )
}

interface ComboManagerProps {
  rules: Array<
    DiscountRule & {
      updateAction: (formData: FormData) => void | Promise<void>
      deleteAction: (formData: FormData) => void | Promise<void>
    }
  >
  createAction: (formData: FormData) => void | Promise<void>
}

export function ComboManager({
  rules,
  createAction,
}: ComboManagerProps) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gestion de combos</h1>
        <p className="mt-2 text-muted-foreground">
          Los combos activos compiten entre si y el checkout aplica el escenario
          que da mas ahorro sin duplicar descuento sobre el mismo curso.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo combo</CardTitle>
        </CardHeader>
        <CardContent>
          <ComboRuleForm action={createAction} submitLabel="Crear combo" />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {rules.length === 0 && (
          <Card className="xl:col-span-2">
            <CardContent className="pt-6 text-muted-foreground">
              No hay reglas de descuento creadas.
            </CardContent>
          </Card>
        )}

        {rules.map((rule) => {
          const displayValue =
            rule.discount_type === "fixed" && rule.discount_value
              ? formatCOP(rule.discount_value)
              : rule.discount_value
                ? `${rule.discount_value}%`
                : `${rule.buy_quantity}+${rule.free_quantity}`

          return (
            <Card key={rule.id} data-testid={`combo-card-${rule.id}`}>
              <CardHeader className="gap-2">
                <CardTitle className="text-xl">{rule.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {rule.category || "Todas las categorias"} ·{" "}
                  {rule.combo_kind === "buy_x_get_y"
                    ? `${rule.buy_quantity}+${rule.free_quantity} gratis`
                    : `minimo ${rule.min_courses} cursos`}{" "}
                  · {rule.is_active ? "Activa" : "Inactiva"}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Beneficio actual:{" "}
                  <span className="font-medium text-foreground">
                    {displayValue}
                  </span>
                </div>

                <ComboRuleForm
                  initialRule={rule}
                  action={rule.updateAction}
                  submitLabel="Guardar cambios"
                />

                <form action={rule.deleteAction}>
                  <Button type="submit" variant="destructive">
                    Eliminar combo
                  </Button>
                </form>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
