import { expect, test } from "@playwright/test"

import { getBestDiscount } from "../src/lib/discounts"

import type { DiscountRule } from "../src/types"

const activeAllCategoriesRule: DiscountRule = {
  id: "rule-all",
  name: "Pack general",
  category: null,
  combo_kind: "threshold_discount",
  min_courses: 2,
  discount_type: "percentage",
  discount_value: 10,
  buy_quantity: null,
  free_quantity: null,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

test.describe("discount logic", () => {
  test("caps fixed discounts at the eligible subtotal", () => {
    const discount = getBestDiscount(
      [{ category: "baile", price: 50_000, isFree: false }],
      [
        {
          ...activeAllCategoriesRule,
          id: "fixed-cap",
          name: "Monto fijo",
          min_courses: 1,
          discount_type: "fixed",
          discount_value: 80_000,
        },
      ]
    )

    expect(discount.amount).toBe(50_000)
    expect(discount.rule?.id).toBe("fixed-cap")
  })

  test("ignores free courses for combo activation and discount subtotal", () => {
    const discount = getBestDiscount(
      [
        { category: "baile", price: 100_000, isFree: false },
        { category: "baile", price: 200_000, isFree: true },
      ],
      [activeAllCategoriesRule]
    )

    expect(discount.amount).toBe(0)
    expect(discount.rule).toBeNull()
  })

  test("ignores inactive rules", () => {
    const discount = getBestDiscount(
      [
        { category: "baile", price: 100_000, isFree: false },
        { category: "baile", price: 80_000, isFree: false },
      ],
      [
        {
          ...activeAllCategoriesRule,
          id: "inactive",
          is_active: false,
        },
      ]
    )

    expect(discount.amount).toBe(0)
    expect(discount.rule).toBeNull()
  })

  test("breaks discount ties by eligible item count", () => {
    const discount = getBestDiscount(
      [
        { category: "baile", price: 100_000, isFree: false },
        { category: "baile", price: 100_000, isFree: false },
        { category: "tatuaje", price: 100_000, isFree: false },
      ],
      [
        {
          ...activeAllCategoriesRule,
          id: "rule-category",
          name: "Solo baile",
          category: "baile",
          min_courses: 2,
          discount_type: "percentage",
          discount_value: 15,
        },
        {
          ...activeAllCategoriesRule,
          id: "rule-all-tie",
          name: "General",
          category: null,
          min_courses: 2,
          discount_type: "percentage",
          discount_value: 10,
        },
      ]
    )

    expect(discount.amount).toBe(30_000)
    expect(discount.rule?.id).toBe("rule-all-tie")
    expect(discount.eligibleItemsCount).toBe(3)
  })
})
