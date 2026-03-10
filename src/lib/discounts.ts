import type { DiscountRule } from "@/types"

interface DiscountableItem {
  category: "baile" | "tatuaje"
  price: number
  isFree?: boolean
}

export interface DiscountCalculation {
  amount: number
  rule: DiscountRule | null
  eligibleItemsCount: number
}

function getEligibleItemsForRule(
  items: DiscountableItem[],
  rule: DiscountRule
): DiscountableItem[] {
  return items.filter((item) => {
    if (item.isFree) return false
    if (!rule.category) return true
    return item.category === rule.category
  })
}

function calculateRuleDiscount(
  items: DiscountableItem[],
  rule: DiscountRule
): DiscountCalculation {
  if (
    rule.combo_kind !== "threshold_discount" ||
    !rule.discount_type ||
    !rule.discount_value
  ) {
    return { amount: 0, rule: null, eligibleItemsCount: 0 }
  }

  const eligibleItems = getEligibleItemsForRule(items, rule)
  if (eligibleItems.length < rule.min_courses) {
    return { amount: 0, rule: null, eligibleItemsCount: eligibleItems.length }
  }

  const subtotal = eligibleItems.reduce((acc, item) => acc + item.price, 0)
  const rawAmount =
    rule.discount_type === "percentage"
      ? Math.round((subtotal * rule.discount_value) / 100)
      : rule.discount_value

  return {
    amount: Math.min(rawAmount, subtotal),
    rule,
    eligibleItemsCount: eligibleItems.length,
  }
}

export function getBestDiscount(
  items: DiscountableItem[],
  rules: DiscountRule[]
): DiscountCalculation {
  const applicableRules = rules.filter((rule) => rule.is_active)
  let best: DiscountCalculation = {
    amount: 0,
    rule: null,
    eligibleItemsCount: 0,
  }

  for (const rule of applicableRules) {
    const current = calculateRuleDiscount(items, rule)
    if (
      current.amount > best.amount ||
      (current.amount === best.amount &&
        current.eligibleItemsCount > best.eligibleItemsCount)
    ) {
      best = current
    }
  }

  return best
}
