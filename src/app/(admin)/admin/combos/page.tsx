import {
  createCombo,
  deleteCombo,
  getDiscountRules,
  updateCombo,
} from "@/actions/admin/combos"
import { formatCOP } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const selectClassName =
  "border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"

export default async function AdminCombosPage() {
  const rules = await getDiscountRules()

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gestion de combos</h1>
        <p className="mt-2 text-muted-foreground">
          Las reglas activas compiten y el checkout aplica automaticamente la de
          mayor beneficio.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo combo</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createCombo} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombre</label>
                <Input name="name" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Categoria</label>
                <select name="category" className={selectClassName} defaultValue="">
                  <option value="">Aplica a todo</option>
                  <option value="baile">Baile</option>
                  <option value="tatuaje">Tatuaje</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Minimo de cursos</label>
                <Input name="minCourses" type="number" min="1" defaultValue="2" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo</label>
                <select
                  name="discountType"
                  className={selectClassName}
                  defaultValue="percentage"
                >
                  <option value="percentage">Porcentaje</option>
                  <option value="fixed">Monto fijo (COP)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Valor</label>
                <Input name="discountValue" type="number" min="1" defaultValue="10" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked
                className="h-4 w-4"
              />
              Regla activa
            </label>

            <Button type="submit">Crear combo</Button>
          </form>
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
          const updateAction = updateCombo.bind(null, rule.id)
          const deleteAction = deleteCombo.bind(null, rule.id)
          const displayValue =
            rule.discount_type === "fixed"
              ? String(rule.discount_value / 100)
              : String(rule.discount_value)

          return (
            <Card key={rule.id}>
              <CardHeader className="gap-2">
                <CardTitle className="text-xl">{rule.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {rule.category ?? "Todas las categorias"} · minimo{" "}
                  {rule.min_courses} cursos ·{" "}
                  {rule.is_active ? "Activa" : "Inactiva"}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Beneficio actual:{" "}
                  <span className="font-medium text-foreground">
                    {rule.discount_type === "fixed"
                      ? formatCOP(rule.discount_value)
                      : `${rule.discount_value}%`}
                  </span>
                </div>

                <form action={updateAction} className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Nombre</label>
                      <Input name="name" defaultValue={rule.name} required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Categoria</label>
                      <select
                        name="category"
                        className={selectClassName}
                        defaultValue={rule.category ?? ""}
                      >
                        <option value="">Aplica a todo</option>
                        <option value="baile">Baile</option>
                        <option value="tatuaje">Tatuaje</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Minimo de cursos
                      </label>
                      <Input
                        name="minCourses"
                        type="number"
                        min="1"
                        defaultValue={String(rule.min_courses)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tipo</label>
                      <select
                        name="discountType"
                        className={selectClassName}
                        defaultValue={rule.discount_type}
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
                        defaultValue={displayValue}
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="isActive"
                      defaultChecked={rule.is_active}
                      className="h-4 w-4"
                    />
                    Regla activa
                  </label>

                  <Button type="submit">Guardar cambios</Button>
                </form>

                <form action={deleteAction}>
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
