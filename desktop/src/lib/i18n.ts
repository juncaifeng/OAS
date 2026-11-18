import { humanizeTaskName } from "@/lib/utils"

export type TranslationMap = Record<string, string>

function pascalCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

export function translate(value: unknown, translations: TranslationMap, humanizeFallback = true): string {
  if (value === undefined || value === null) return ""
  const source = String(value)
  const direct = translations[source]
  if (direct !== undefined) return direct
  const camelized = translations[pascalCase(source)]
  if (camelized !== undefined) return camelized
  const configGroup = translations[`${pascalCase(source)}Config`]
  if (configGroup !== undefined) return configGroup
  return humanizeFallback ? humanizeTaskName(source) : source
}

export function translateDescription(value: unknown, translations: TranslationMap): string {
  if (!value) return ""
  const source = String(value)
  const translated = translate(source, translations, false)
  // Missing help keys are implementation details, not useful UI content.
  return translated === source && source.endsWith("_help") ? "" : translated
}
