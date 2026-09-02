import type { ComponentProps } from "react"
export default function Image({ fill, unoptimized: _unoptimized, priority: _priority, ...props }: ComponentProps<"img"> & { fill?: boolean; unoptimized?: boolean; priority?: boolean }) {
  void _unoptimized
  void _priority
  // Framework image sizing only; actual product image markup is retained.
  // eslint-disable-next-line @next/next/no-img-element -- isolated browser replacement of the Next image renderer
  return <img {...props} alt={props.alt ?? ""} style={{ ...(fill ? { position: "absolute", inset: 0, height: "100%", width: "100%" } : {}), ...props.style }} />
}
