import { useEffect } from "react"
export default function Script({ onReady }: { onReady?: () => void }) {
  useEffect(() => { onReady?.() }, [onReady])
  return null
}
