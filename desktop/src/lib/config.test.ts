import { describe, expect, it } from "vitest"
import { formatDuration, fromDateTimeLocal, normalizeTime, parseDuration, toDateTimeLocal } from "@/lib/config"

describe("configuration value formats", () => {
  it("converts datetime between backend and datetime-local formats", () => {
    expect(toDateTimeLocal("2026-11-18 09:00:00")).toBe("2026-11-18T09:00:00")
    expect(fromDateTimeLocal("2026-11-18T09:00")).toBe("2026-11-18 09:00:00")
    expect(fromDateTimeLocal("2026-11-18T09:00:00")).toBe("2026-11-18 09:00:00")
    expect(fromDateTimeLocal("")).toBe("")
  })

  it("normalizes time inputs to HH:MM:SS", () => {
    expect(normalizeTime("09:00")).toBe("09:00:00")
    expect(normalizeTime("09:00:30")).toBe("09:00:30")
    expect(normalizeTime("")).toBe("")
  })

  it("parses and formats durations without losing multi-digit days", () => {
    expect(parseDuration("01 00:00:00")).toEqual({ days: "1", clock: "00:00:00" })
    expect(parseDuration("10 05:30:00")).toEqual({ days: "10", clock: "05:30:00" })
    expect(parseDuration("bad")).toEqual({ days: "0", clock: "00:00:00" })

    expect(formatDuration("1", "00:00:00")).toBe("01 00:00:00")
    expect(formatDuration("10", "5:30")).toBe("10 05:30:00")
    expect(formatDuration("-3", "")).toBe("00 00:00:00")
  })
})
