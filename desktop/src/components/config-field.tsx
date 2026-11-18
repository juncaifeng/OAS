import { useEffect, useState } from "react"
import { Check, LoaderCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { formatDuration, fromDateTimeLocal, normalizeTime, parseDuration, toDateTimeLocal } from "@/lib/config"
import { translate, translateDescription, type TranslationMap } from "@/lib/i18n"
import type { ConfigField } from "@/types"

interface FieldControlProps {
  field: ConfigField
  translations: TranslationMap
  saving: boolean
  saved: boolean
  onSave: (value: unknown) => void
}

interface ControlProps {
  id: string
  field: ConfigField
  saving: boolean
  onSave: (value: unknown) => void
}

export function FieldControl({ field, translations, saving, saved, onSave }: FieldControlProps) {
  const id = `field-${field.name}`
  const options = field.enumEnum ?? []

  return <div className="grid min-h-14 items-center gap-3 border-b border-border/60 py-3 last:border-0 sm:grid-cols-[minmax(180px,1fr)_minmax(190px,0.8fr)]">
    <div>
      <Label htmlFor={id} className="text-sm" title={field.name}>{translate(field.title, translations)}</Label>
      {field.description && <p className="mt-1.5 text-xs leading-4 text-muted-foreground">{translateDescription(field.description, translations)}</p>}
    </div>
    <div className="relative flex items-center gap-2">
      {field.type === "boolean" ? <BooleanControl id={id} field={field} saving={saving} onSave={onSave} />
        : options.length ? <EnumControl id={id} field={field} options={options} translations={translations} saving={saving} onSave={onSave} />
        : field.type === "multi_line" ? <MultiLineControl id={id} field={field} saving={saving} onSave={onSave} />
        : field.type === "date_time" ? <DateTimeControl id={id} field={field} saving={saving} onSave={onSave} />
        : field.type === "time" ? <TimeControl id={id} field={field} saving={saving} onSave={onSave} />
        : field.type === "time_delta" ? <DurationControl id={id} field={field} saving={saving} onSave={onSave} />
        : <TextControl id={id} field={field} saving={saving} onSave={onSave} />}
      <span className="absolute -right-1 -top-2">{saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" />}{saved && <Check className="h-3.5 w-3.5 text-primary" />}</span>
    </div>
  </div>
}

function BooleanControl({ id, field, saving, onSave }: ControlProps) {
  return <div className="flex w-full items-center justify-between rounded-md border px-3 py-2">
    <span className="text-xs text-muted-foreground">{field.value ? "已启用" : "已禁用"}</span>
    <Switch id={id} checked={Boolean(field.value)} disabled={saving} onCheckedChange={onSave} />
  </div>
}

function EnumControl({ id, field, options, translations, saving, onSave }: ControlProps & { options: Array<string | number>; translations: TranslationMap }) {
  return <Select value={String(field.value ?? "") || "__empty__"} disabled={saving} onValueChange={(selected) => {
    const actual = selected === "__empty__" ? "" : selected
    onSave(options.find((option) => String(option) === actual) ?? actual)
  }}>
    <SelectTrigger id={id}><SelectValue placeholder="请选择" /></SelectTrigger>
    <SelectContent>{options.map((option) => <SelectItem key={String(option)} value={String(option) || "__empty__"}>{translate(option, translations) || "空"}</SelectItem>)}</SelectContent>
  </Select>
}

function TextControl({ id, field, saving, onSave }: ControlProps) {
  const [input, setInput] = useState(String(field.value ?? ""))
  useEffect(() => setInput(String(field.value ?? "")), [field.value])
  const isNumber = field.type === "integer" || field.type === "number"

  return <Input
    id={id}
    type={isNumber ? "number" : "text"}
    step={field.type === "number" ? 0.1 : undefined}
    min={field.minimum}
    max={field.maximum}
    value={input}
    disabled={saving}
    onChange={(event) => setInput(event.target.value)}
    onBlur={() => { if (input !== String(field.value ?? "")) onSave(input) }}
    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }}
  />
}

function MultiLineControl({ id, field, saving, onSave }: ControlProps) {
  const [input, setInput] = useState(String(field.value ?? ""))
  useEffect(() => setInput(String(field.value ?? "")), [field.value])

  return <Textarea
    id={id}
    className="min-h-24 font-mono text-xs leading-5"
    value={input}
    disabled={saving}
    onChange={(event) => setInput(event.target.value)}
    onBlur={() => { if (input !== String(field.value ?? "")) onSave(input) }}
  />
}

function DateTimeControl({ id, field, saving, onSave }: ControlProps) {
  const [input, setInput] = useState(() => toDateTimeLocal(field.value))
  useEffect(() => setInput(toDateTimeLocal(field.value)), [field.value])

  return <Input
    id={id}
    type="datetime-local"
    step={1}
    value={input}
    disabled={saving}
    onChange={(event) => setInput(event.target.value)}
    onBlur={() => {
      const next = fromDateTimeLocal(input)
      // 清空时保留原值，避免提交空字符串导致后端 400
      if (next && next !== String(field.value ?? "")) onSave(next)
    }}
  />
}

function TimeControl({ id, field, saving, onSave }: ControlProps) {
  const [input, setInput] = useState(String(field.value ?? ""))
  useEffect(() => setInput(String(field.value ?? "")), [field.value])

  return <Input
    id={id}
    type="time"
    step={1}
    value={input}
    disabled={saving}
    onChange={(event) => setInput(event.target.value)}
    onBlur={() => {
      const next = normalizeTime(input)
      if (next && next !== String(field.value ?? "")) onSave(next)
    }}
  />
}

function DurationControl({ id, field, saving, onSave }: ControlProps) {
  const [value, setValue] = useState(() => parseDuration(field.value))
  useEffect(() => setValue(parseDuration(field.value)), [field.value])

  const commit = () => {
    const next = formatDuration(value.days, value.clock)
    if (next !== String(field.value ?? "")) onSave(next)
  }

  return <div className="flex w-full items-center gap-2">
    <Input
      id={id}
      type="number"
      min={0}
      max={999}
      className="w-20"
      value={value.days}
      disabled={saving}
      onChange={(event) => setValue((current) => ({ ...current, days: event.target.value }))}
      onBlur={commit}
    />
    <span className="shrink-0 text-xs text-muted-foreground">天</span>
    <Input
      type="time"
      step={1}
      className="flex-1"
      value={value.clock}
      disabled={saving}
      onChange={(event) => setValue((current) => ({ ...current, clock: event.target.value }))}
      onBlur={commit}
    />
  </div>
}
