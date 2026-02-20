"use client"

// SVG star path — a standard 5-point star
const STAR_PATH =
  "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"

type StarSize = "sm" | "md"

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  mode: "input" | "display"
  size?: StarSize
}

const SIZE_CLASS: Record<StarSize, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
}

// ── Display star (supports half-star via clipPath) ────────────────────────────

function DisplayStar({
  index,
  value,
  sizeClass,
}: {
  index: number
  value: number
  sizeClass: string
}) {
  // index is 0-based; e.g. index=0 represents the "1 star" position
  const fill = Math.min(Math.max(value - index, 0), 1) // 0, 0.5, or 1
  const clipId = `star-clip-${index}-${Math.round(value * 10)}`

  if (fill <= 0) {
    return (
      <svg className={`${sizeClass} text-muted`} fill="currentColor" viewBox="0 0 20 20">
        <path d={STAR_PATH} />
      </svg>
    )
  }

  if (fill >= 1) {
    return (
      <svg className={`${sizeClass} text-amber-400`} fill="currentColor" viewBox="0 0 20 20">
        <path d={STAR_PATH} />
      </svg>
    )
  }

  // Partial (half-star) — use clipPath to show only a fraction
  return (
    <svg className={sizeClass} viewBox="0 0 20 20">
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={`${fill * 100}%`} height="100%" />
        </clipPath>
      </defs>
      {/* Background (empty) star */}
      <path d={STAR_PATH} fill="currentColor" className="text-muted" />
      {/* Filled portion */}
      <path d={STAR_PATH} fill="currentColor" className="text-amber-400" clipPath={`url(#${clipId})`} />
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StarRating({
  value,
  onChange,
  mode,
  size = "md",
}: StarRatingProps) {
  const sizeClass = SIZE_CLASS[size]

  if (mode === "display") {
    return (
      <div
        className="flex items-center gap-0.5"
        aria-label={`${value.toFixed(1)} de 5 estrellas`}
        role="img"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <DisplayStar key={i} index={i} value={value} sizeClass={sizeClass} />
        ))}
      </div>
    )
  }

  // mode === "input"
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Calificacion">
      {Array.from({ length: 5 }).map((_, i) => {
        const starValue = i + 1
        const isFilled = starValue <= value
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={starValue === value}
            aria-label={`${starValue} ${starValue === 1 ? "estrella" : "estrellas"}`}
            onClick={() => onChange?.(starValue)}
            className={`
              cursor-pointer transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded-sm
              ${isFilled ? "text-amber-400 scale-110" : "text-muted hover:text-amber-300"}
            `}
          >
            <svg className={sizeClass} fill="currentColor" viewBox="0 0 20 20">
              <path d={STAR_PATH} />
            </svg>
          </button>
        )
      })}
    </div>
  )
}
