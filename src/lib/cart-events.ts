"use client"

const CART_COUNT_UPDATED_EVENT = "studioz:cart-count-updated"

export function dispatchCartCountUpdated(count: number) {
  window.dispatchEvent(
    new CustomEvent<number>(CART_COUNT_UPDATED_EVENT, {
      detail: count,
    })
  )
}

export function subscribeToCartCountUpdated(listener: (count: number) => void) {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<number>
    if (typeof customEvent.detail === "number") {
      listener(customEvent.detail)
    }
  }

  window.addEventListener(CART_COUNT_UPDATED_EVENT, handler)

  return () => {
    window.removeEventListener(CART_COUNT_UPDATED_EVENT, handler)
  }
}
