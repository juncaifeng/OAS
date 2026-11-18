import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"
import { Dashboard } from "@/components/dashboard"

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

// Deliberately return a non-function. The effect must ignore this value rather
// than handing it to React as an effect cleanup callback.
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(() => ({})),
})

describe("Dashboard", () => {
  it("renders and scrolls new logs without treating scrollIntoView as cleanup", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    const props = {
      instance: "oas1",
      translations: {},
      state: 0,
      connected: true,
      logs: [] as string[],
      onStart: vi.fn(async () => {}),
      onStop: vi.fn(async () => {}),
      onClearLogs: vi.fn(),
    }

    await act(async () => {
      root.render(createElement(Dashboard, props))
    })
    expect(container.textContent).toContain("oas1")

    await act(async () => {
      root.render(createElement(Dashboard, { ...props, logs: ["backend ready"] }))
    })
    expect(container.textContent).toContain("backend ready")

    await act(async () => root.unmount())
    container.remove()
  })
})
