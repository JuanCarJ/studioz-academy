import { formatCOP } from "@/lib/utils"

import type { DiscountRule, PricingLine } from "@/types"

type CourseCategory = "baile" | "tatuaje"

export interface PriceableCourse {
  id: string
  title: string
  category: CourseCategory
  price: number
  is_free: boolean
  added_at?: string
  course_discount_enabled?: boolean
  course_discount_type?: string | null
  course_discount_value?: number | null
}

export interface PricedItem {
  courseId: string
  courseTitle: string
  category: CourseCategory
  addedAt: string
  listPrice: number
  courseDiscountAmount: number
  priceAfterCourseDiscount: number
  comboDiscountAmount: number
  finalPrice: number
  coursePromotionLabel: string | null
  comboPromotionLabel: string | null
}

export interface PricingResult {
  listSubtotal: number
  subtotal: number
  courseDiscountTotal: number
  comboDiscountTotal: number
  discountTotal: number
  total: number
  items: PricedItem[]
  appliedDiscountLines: PricingLine[]
  selectedComboScenario: "none" | "global" | "categories"
}

interface InternalPricedItem extends PricedItem {
  comboRuleIds: string[]
}

interface ComboApplication {
  totalAmount: number
  eligibleItemCount: number
  items: Map<string, number>
  lines: PricingLine[]
  labels: Map<string, string>
  ruleIds: string[]
  ruleNames: string[]
  oldestRuleCreatedAt: string
}

interface ComboScenario {
  mode: "none" | "global" | "categories"
  totalAmount: number
  eligibleItemCount: number
  items: Map<string, number>
  lines: PricingLine[]
  labels: Map<string, string>
  specificityScore: number
  oldestRuleCreatedAt: string
  ruleIds: string[]
  ruleNames: string[]
}

const FALLBACK_ADDED_AT = "9999-12-31T23:59:59.999Z"

function normalizeDate(value?: string | null): string {
  return value ?? FALLBACK_ADDED_AT
}

function clampDiscount(amount: number, subtotal: number): number {
  return Math.max(0, Math.min(amount, subtotal))
}

function getCoursePromotionLabel(input: {
  enabled?: boolean
  price?: number
  type?: string | null
  value?: number | null
}): string | null {
  if (!input.enabled || !input.type || !input.value) return null

  if (
    (input.type === "percentage" && input.value >= 100) ||
    (input.type === "fixed" && typeof input.price === "number" && input.value >= input.price)
  ) {
    return "100% OFF"
  }

  if (input.type === "percentage") {
    return `${input.value}% OFF`
  }

  return `Ahorra ${formatCOP(input.value)}`
}

export function getCourseDiscountAmount(course: Pick<
  PriceableCourse,
  | "price"
  | "is_free"
  | "course_discount_enabled"
  | "course_discount_type"
  | "course_discount_value"
>): number {
  if (
    course.is_free ||
    !course.course_discount_enabled ||
    !course.course_discount_type ||
    !course.course_discount_value
  ) {
    return 0
  }

  if (course.course_discount_type === "percentage") {
    return clampDiscount(
      Math.round((course.price * course.course_discount_value) / 100),
      course.price
    )
  }

  return clampDiscount(course.course_discount_value, course.price)
}

export function decorateCourseWithPricing<T extends PriceableCourse>(
  course: T
): T & {
  list_price: number
  current_price: number
  has_course_discount: boolean
  course_discount_amount: number
  course_discount_label: string | null
} {
  const courseDiscountAmount = getCourseDiscountAmount(course)
  const currentPrice = course.is_free ? 0 : course.price - courseDiscountAmount

  return {
    ...course,
    list_price: course.price,
    current_price: currentPrice,
    has_course_discount: courseDiscountAmount > 0,
    course_discount_amount: courseDiscountAmount,
    course_discount_label: getCoursePromotionLabel({
      enabled: course.course_discount_enabled,
      price: course.price,
      type: course.course_discount_type,
      value: course.course_discount_value,
    }),
  }
}

export function isPromotionalFreeCourse(input: {
  is_free: boolean
  current_price: number
  has_course_discount: boolean
}): boolean {
  return !input.is_free && input.current_price === 0 && input.has_course_discount
}

function buildBaseItems(courses: PriceableCourse[]): {
  items: InternalPricedItem[]
  lines: PricingLine[]
} {
  const items = [...courses]
    .sort((a, b) => normalizeDate(a.added_at).localeCompare(normalizeDate(b.added_at)))
    .map((course) => {
      const courseDiscountAmount = getCourseDiscountAmount(course)
      const listPrice = course.price
      const priceAfterCourseDiscount = course.is_free
        ? 0
        : Math.max(0, listPrice - courseDiscountAmount)

      return {
        courseId: course.id,
        courseTitle: course.title,
        category: course.category,
        addedAt: normalizeDate(course.added_at),
        listPrice,
        courseDiscountAmount,
        priceAfterCourseDiscount,
        comboDiscountAmount: 0,
        finalPrice: priceAfterCourseDiscount,
        coursePromotionLabel:
          courseDiscountAmount > 0
            ? getCoursePromotionLabel({
                enabled: course.course_discount_enabled,
                price: course.price,
                type: course.course_discount_type,
                value: course.course_discount_value,
              })
            : null,
        comboPromotionLabel: null,
        comboRuleIds: [],
      }
    })

  const lines: PricingLine[] = items
    .filter((item) => item.courseDiscountAmount > 0)
    .map((item) => ({
      scope: "course",
      kind: "course_discount",
      source_id: item.courseId,
      source_name: item.courseTitle,
      course_id: item.courseId,
      course_title: item.courseTitle,
      amount: item.courseDiscountAmount,
      metadata: {
        label: item.coursePromotionLabel,
      },
    }))

  return { items, lines }
}

function isEligibleForCombo(item: InternalPricedItem, rule: DiscountRule): boolean {
  if (item.finalPrice <= 0) return false
  if (!rule.category) return true
  return item.category === rule.category
}

function allocateDiscountProportionally(
  items: InternalPricedItem[],
  totalDiscount: number
): Map<string, number> {
  const allocation = new Map<string, number>()
  if (items.length === 0 || totalDiscount <= 0) return allocation

  const subtotal = items.reduce((sum, item) => sum + item.priceAfterCourseDiscount, 0)
  if (subtotal <= 0) return allocation

  let assigned = 0
  const remainders = items.map((item) => {
    const rawShare = (totalDiscount * item.priceAfterCourseDiscount) / subtotal
    const floored = Math.floor(rawShare)
    assigned += floored
    allocation.set(item.courseId, floored)

    return {
      courseId: item.courseId,
      remainder: rawShare - floored,
      addedAt: item.addedAt,
    }
  })

  let remaining = totalDiscount - assigned
  remainders.sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder
    return a.addedAt.localeCompare(b.addedAt)
  })

  for (const remainder of remainders) {
    if (remaining <= 0) break
    allocation.set(remainder.courseId, (allocation.get(remainder.courseId) ?? 0) + 1)
    remaining -= 1
  }

  return allocation
}

function getComboLabel(rule: DiscountRule): string {
  if (rule.combo_kind === "buy_x_get_y") {
    return `${rule.name} (${rule.buy_quantity}+${rule.free_quantity} gratis)`
  }

  if (rule.discount_type === "percentage" && rule.discount_value) {
    return `${rule.name} (${rule.discount_value}% OFF)`
  }

  return `${rule.name} (${formatCOP(rule.discount_value ?? 0)})`
}

function applyThresholdDiscount(
  rule: DiscountRule,
  items: InternalPricedItem[]
): ComboApplication | null {
  const eligibleItems = items.filter((item) => isEligibleForCombo(item, rule))
  if (eligibleItems.length < rule.min_courses || !rule.discount_type || !rule.discount_value) {
    return null
  }

  const eligibleSubtotal = eligibleItems.reduce(
    (sum, item) => sum + item.priceAfterCourseDiscount,
    0
  )
  if (eligibleSubtotal <= 0) return null

  const rawAmount =
    rule.discount_type === "percentage"
      ? Math.round((eligibleSubtotal * rule.discount_value) / 100)
      : rule.discount_value
  const totalAmount = clampDiscount(rawAmount, eligibleSubtotal)
  if (totalAmount <= 0) return null

  const allocation = allocateDiscountProportionally(eligibleItems, totalAmount)
  const label = getComboLabel(rule)
  const lines: PricingLine[] = []
  for (const item of eligibleItems) {
    const amount = allocation.get(item.courseId) ?? 0
    if (amount <= 0) continue
    lines.push({
      scope: "cart",
      kind: "combo",
      source_id: rule.id,
      source_name: rule.name,
      course_id: item.courseId,
      course_title: item.courseTitle,
      amount,
      metadata: {
        comboKind: rule.combo_kind,
        label,
        category: rule.category,
      },
    })
  }

  const labels = new Map<string, string>()
  for (const line of lines) {
    if (line.course_id) labels.set(line.course_id, label)
  }

  return {
    totalAmount,
    eligibleItemCount: eligibleItems.length,
    items: allocation,
    lines,
    labels,
    ruleIds: [rule.id],
    ruleNames: [rule.name],
    oldestRuleCreatedAt: rule.created_at,
  }
}

function applyBuyXGetY(
  rule: DiscountRule,
  items: InternalPricedItem[]
): ComboApplication | null {
  const eligibleItems = items.filter((item) => isEligibleForCombo(item, rule))
  const buyQuantity = rule.buy_quantity ?? 0
  const freeQuantity = rule.free_quantity ?? 0
  const blockSize = buyQuantity + freeQuantity

  if (buyQuantity < 1 || freeQuantity < 1 || eligibleItems.length < blockSize) {
    return null
  }

  const allocation = new Map<string, number>()
  let totalAmount = 0

  for (let start = 0; start + blockSize <= eligibleItems.length; start += blockSize) {
    const freeItems = eligibleItems.slice(start + buyQuantity, start + blockSize)
    for (const item of freeItems) {
      const nextAmount = (allocation.get(item.courseId) ?? 0) + item.priceAfterCourseDiscount
      allocation.set(item.courseId, nextAmount)
      totalAmount += item.priceAfterCourseDiscount
    }
  }

  if (totalAmount <= 0) return null

  const label = getComboLabel(rule)
  const lines: PricingLine[] = []
  for (const item of eligibleItems) {
    const amount = allocation.get(item.courseId) ?? 0
    if (amount <= 0) continue
    lines.push({
      scope: "cart",
      kind: "combo",
      source_id: rule.id,
      source_name: rule.name,
      course_id: item.courseId,
      course_title: item.courseTitle,
      amount,
      metadata: {
        comboKind: rule.combo_kind,
        label,
        buyQuantity,
        freeQuantity,
        category: rule.category,
      },
    })
  }

  const labels = new Map<string, string>()
  for (const line of lines) {
    if (line.course_id) labels.set(line.course_id, label)
  }

  return {
    totalAmount,
    eligibleItemCount: eligibleItems.length,
    items: allocation,
    lines,
    labels,
    ruleIds: [rule.id],
    ruleNames: [rule.name],
    oldestRuleCreatedAt: rule.created_at,
  }
}

function applyRule(rule: DiscountRule, items: InternalPricedItem[]): ComboApplication | null {
  if (!rule.is_active) return null
  if (rule.combo_kind === "buy_x_get_y") {
    return applyBuyXGetY(rule, items)
  }
  return applyThresholdDiscount(rule, items)
}

function compareApplications(
  current: ComboApplication | null,
  next: ComboApplication | null
): ComboApplication | null {
  if (!next) return current
  if (!current) return next

  if (next.totalAmount !== current.totalAmount) {
    return next.totalAmount > current.totalAmount ? next : current
  }

  if (next.eligibleItemCount !== current.eligibleItemCount) {
    return next.eligibleItemCount > current.eligibleItemCount ? next : current
  }

  return next.oldestRuleCreatedAt < current.oldestRuleCreatedAt ? next : current
}

function getBestApplicationForScope(
  rules: DiscountRule[],
  items: InternalPricedItem[],
  scope: ComboScenario["mode"]
): ComboScenario {
  let best: ComboApplication | null = null

  for (const rule of rules) {
    best = compareApplications(best, applyRule(rule, items))
  }

  if (!best) {
    return {
      mode: "none",
      totalAmount: 0,
      eligibleItemCount: 0,
      items: new Map(),
      lines: [],
      labels: new Map(),
      specificityScore: 0,
      oldestRuleCreatedAt: FALLBACK_ADDED_AT,
      ruleIds: [],
      ruleNames: [],
    }
  }

  return {
    mode: scope,
    totalAmount: best.totalAmount,
    eligibleItemCount: best.eligibleItemCount,
    items: best.items,
    lines: best.lines,
    labels: best.labels,
    specificityScore: scope === "categories" ? 2 : scope === "global" ? 1 : 0,
    oldestRuleCreatedAt: best.oldestRuleCreatedAt,
    ruleIds: best.ruleIds,
    ruleNames: best.ruleNames,
  }
}

function combineCategoryApplications(
  items: InternalPricedItem[],
  rules: DiscountRule[]
): ComboScenario {
  const byCategory: CourseCategory[] = ["baile", "tatuaje"]
  const combined: ComboScenario = {
    mode: "categories",
    totalAmount: 0,
    eligibleItemCount: 0,
    items: new Map(),
    lines: [],
    labels: new Map(),
    specificityScore: 2,
    oldestRuleCreatedAt: FALLBACK_ADDED_AT,
    ruleIds: [],
    ruleNames: [],
  }

  for (const category of byCategory) {
    const scopedRules = rules.filter((rule) => rule.category === category)
    const scopedItems = items.filter((item) => item.category === category)
    const result = getBestApplicationForScope(scopedRules, scopedItems, "categories")

    if (result.totalAmount <= 0) continue

    combined.totalAmount += result.totalAmount
    combined.eligibleItemCount += result.eligibleItemCount
    combined.lines.push(...result.lines)
    combined.ruleIds.push(...result.ruleIds)
    combined.ruleNames.push(...result.ruleNames)
    if (result.oldestRuleCreatedAt < combined.oldestRuleCreatedAt) {
      combined.oldestRuleCreatedAt = result.oldestRuleCreatedAt
    }

    for (const [courseId, amount] of result.items.entries()) {
      combined.items.set(courseId, amount)
    }

    for (const [courseId, label] of result.labels.entries()) {
      combined.labels.set(courseId, label)
    }
  }

  if (combined.totalAmount <= 0) {
    return {
      ...combined,
      mode: "none",
      specificityScore: 0,
    }
  }

  return combined
}

function compareScenarios(current: ComboScenario, next: ComboScenario): ComboScenario {
  if (next.totalAmount !== current.totalAmount) {
    return next.totalAmount > current.totalAmount ? next : current
  }

  if (next.eligibleItemCount !== current.eligibleItemCount) {
    return next.eligibleItemCount > current.eligibleItemCount ? next : current
  }

  if (next.specificityScore !== current.specificityScore) {
    return next.specificityScore > current.specificityScore ? next : current
  }

  return next.oldestRuleCreatedAt < current.oldestRuleCreatedAt ? next : current
}

function getSelectedComboScenario(
  items: InternalPricedItem[],
  rules: DiscountRule[]
): ComboScenario {
  const globalRules = rules.filter((rule) => rule.category === null)
  const globalScenario = getBestApplicationForScope(globalRules, items, "global")
  const categoryScenario = combineCategoryApplications(items, rules)

  return compareScenarios(globalScenario, categoryScenario)
}

export function calculatePricing(
  courses: PriceableCourse[],
  rules: DiscountRule[]
): PricingResult {
  const { items, lines: courseLines } = buildBaseItems(courses)
  const listSubtotal = items.reduce((sum, item) => sum + item.listPrice, 0)
  const courseDiscountTotal = items.reduce(
    (sum, item) => sum + item.courseDiscountAmount,
    0
  )
  const subtotal = items.reduce((sum, item) => sum + item.priceAfterCourseDiscount, 0)

  const comboScenario = getSelectedComboScenario(items, rules.filter((rule) => rule.is_active))

  for (const item of items) {
    const comboDiscountAmount = comboScenario.items.get(item.courseId) ?? 0
    item.comboDiscountAmount = comboDiscountAmount
    item.finalPrice = Math.max(0, item.priceAfterCourseDiscount - comboDiscountAmount)
    item.comboPromotionLabel = comboScenario.labels.get(item.courseId) ?? null
    if (comboDiscountAmount > 0) {
      item.comboRuleIds = comboScenario.ruleIds
    }
  }

  const comboDiscountTotal = items.reduce(
    (sum, item) => sum + item.comboDiscountAmount,
    0
  )
  const discountTotal = courseDiscountTotal + comboDiscountTotal
  const total = Math.max(0, subtotal - comboDiscountTotal)

  return {
    listSubtotal,
    subtotal,
    courseDiscountTotal,
    comboDiscountTotal,
    discountTotal,
    total,
    items: items.map((item) => {
      const { comboRuleIds: _comboRuleIds, ...rest } = item
      void _comboRuleIds
      return rest
    }),
    appliedDiscountLines: [...courseLines, ...comboScenario.lines],
    selectedComboScenario: comboScenario.mode,
  }
}

export function getPrimaryComboRuleIds(result: PricingResult): string[] {
  const ruleIds = new Set<string>()
  for (const line of result.appliedDiscountLines) {
    if (line.kind === "combo" && line.source_id) {
      ruleIds.add(line.source_id)
    }
  }
  return [...ruleIds]
}

export function getPrimaryComboRuleName(result: PricingResult): string | null {
  const comboLines = result.appliedDiscountLines.filter((line) => line.kind === "combo")
  const ruleNames = [...new Set(comboLines.map((line) => line.source_name))]
  if (ruleNames.length === 1) return ruleNames[0] ?? null
  if (ruleNames.length > 1) return "Promociones multiples"
  return null
}
