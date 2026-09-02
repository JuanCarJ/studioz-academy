import type { ComponentProps } from "react"
export default function Link({ href, prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) {
  void _prefetch
  return <a href={href} {...props} />
}
