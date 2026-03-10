import {
  createCombo,
  deleteCombo,
  getDiscountRules,
  updateCombo,
} from "@/actions/admin/combos"
import { ComboManager } from "@/components/admin/ComboManager"

export default async function AdminCombosPage() {
  const rules = (await getDiscountRules()).map((rule) => ({
    ...rule,
    updateAction: updateCombo.bind(null, rule.id),
    deleteAction: deleteCombo.bind(null, rule.id),
  }))

  return (
    <ComboManager
      rules={rules}
      createAction={createCombo}
    />
  )
}
