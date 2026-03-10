interface SnapshotColumnErrorLike {
  code?: string | null
  details?: string | null
  message?: string | null
}

export function isMissingDiscountRuleNameSnapshotColumn(
  error: SnapshotColumnErrorLike | null | undefined
) {
  if (!error) return false

  return (
    (error.code === "PGRST204" || error.code === "42703") &&
    `${error.message ?? ""} ${error.details ?? ""}`.includes(
      "discount_rule_name_snapshot"
    )
  )
}

export function readDiscountRuleNameSnapshot(
  row: Record<string, unknown>
): string | null {
  return typeof row.discount_rule_name_snapshot === "string"
    ? row.discount_rule_name_snapshot
    : null
}
