/** 后端使用 "YYYY-MM-DD HH:MM:SS"，`<input type="datetime-local">` 使用 "YYYY-MM-DDTHH:MM" 或带秒。 */
export function toDateTimeLocal(value: unknown): string {
  const source = String(value ?? "")
  return source ? source.replace(" ", "T") : ""
}

export function fromDateTimeLocal(value: string): string {
  if (!value) return ""
  const normalized = value.replace("T", " ")
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized) ? `${normalized}:00` : normalized
}

/** 后端要求 "HH:MM:SS"，浏览器可能只给出 "HH:MM"。 */
export function normalizeTime(value: string): string {
  if (!value) return ""
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) return value
  const [, hours, minutes, seconds = "00"] = match
  return `${hours.padStart(2, "0")}:${minutes}:${seconds}`
}

export interface DurationValue {
  days: string
  clock: string
}

/** 解析后端 "DD HH:MM:SS"（天数 1-3 位）。 */
export function parseDuration(value: unknown): DurationValue {
  const match = /^(\d{1,3})\s+(\d{1,2}):(\d{2}):(\d{2})$/.exec(String(value ?? ""))
  if (!match) return { days: "0", clock: "00:00:00" }
  const [, days, hours, minutes, seconds] = match
  return {
    days: String(Number.parseInt(days, 10)),
    clock: `${hours.padStart(2, "0")}:${minutes}:${seconds}`,
  }
}

export function formatDuration(days: string, clock: string): string {
  const parsed = Math.max(0, Math.min(999, Number.parseInt(days || "0", 10) || 0))
  return `${String(parsed).padStart(2, "0")} ${normalizeTime(clock) || "00:00:00"}`
}
