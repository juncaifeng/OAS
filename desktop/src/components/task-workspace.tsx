import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, LoaderCircle, RotateCcw, Settings2 } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { translate, translateDescription, type TranslationMap } from "@/lib/i18n"
import type { ConfigField, ScriptMenu, TaskConfig as TaskConfigData } from "@/types"

interface TaskWorkspaceProps {
  instance: string
  menu: ScriptMenu
  translations: TranslationMap
  selectedTask: string
  onSelectTask: (task: string) => void
}

export function TaskWorkspace({ instance, menu, translations, selectedTask, onSelectTask }: TaskWorkspaceProps) {
  const categories = Object.keys(menu)
  const initialCategory = categories.find((category) => menu[category].includes(selectedTask)) ?? categories[0]
  const [category, setCategory] = useState(initialCategory)

  useEffect(() => {
    const owner = Object.keys(menu).find((item) => menu[item].includes(selectedTask))
    if (owner) setCategory(owner)
  }, [menu, selectedTask])

  return <div className="grid min-h-[680px] gap-5 lg:grid-cols-[290px_1fr]">
    <aside className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b p-4"><p className="text-sm font-medium">任务列表</p><p className="mt-1 text-xs text-muted-foreground">选择分类与要配置的任务</p></div>
      <div className="flex gap-1 overflow-x-auto border-b p-2 lg:block lg:space-y-1 lg:overflow-visible">
        {categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-md px-3 py-2 text-left text-xs transition-colors lg:w-full ${category === item ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`}>{translate(item, translations)}</button>)}
      </div>
      <ScrollArea className="h-[490px] p-2">
        <div className="space-y-1">
          {(menu[category] ?? []).map((task) => <button key={task} onClick={() => onSelectTask(task)} className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${selectedTask === task ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}><Settings2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{translate(task, translations)}</span></button>)}
        </div>
      </ScrollArea>
    </aside>
    <section className="min-w-0 rounded-xl border bg-card">
      {selectedTask ? <TaskConfig key={`${instance}-${selectedTask}`} instance={instance} task={selectedTask} translations={translations} /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">请选择一个任务</div>}
    </section>
  </div>
}

function TaskConfig({ instance, task, translations }: { instance: string; task: string; translations: TranslationMap }) {
  const [config, setConfig] = useState<TaskConfigData>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState<string>()
  const [saved, setSaved] = useState<string>()

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try { setConfig(await api.task(instance, task)) } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setLoading(false) }
  }, [instance, task])
  useEffect(() => { void load() }, [load])

  const groups = useMemo(() => Object.entries(config ?? {}), [config])
  const save = async (group: string, field: ConfigField, rawValue: unknown) => {
    let value = rawValue
    if (field.type === "integer") value = Number.parseInt(String(rawValue), 10)
    if (field.type === "number") value = Number.parseFloat(String(rawValue))
    if ((field.type === "integer" || field.type === "number") && typeof value === "number" && Number.isNaN(value)) return
    const key = `${group}.${field.name}`
    setSaving(key)
    setSaved(undefined)
    setError(undefined)
    try {
      const success = await api.setField(instance, task, group, field.name, field.type, value)
      if (!success) throw new Error("FastAPI 未接受该配置值，请检查字段格式")
      setConfig((current) => current ? { ...current, [group]: current[group].map((item) => item.name === field.name ? { ...item, value } : item) } : current)
      setSaved(key)
      window.setTimeout(() => setSaved((current) => current === key ? undefined : current), 1800)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setSaving(undefined) }
  }

  return <div className="flex h-full flex-col">
    <header className="flex items-center justify-between border-b px-6 py-5">
      <div><h2 className="text-lg font-semibold">{translate(task, translations)}</h2><p className="mt-1 text-xs text-muted-foreground">{instance} · 参数修改后直接写入 FastAPI 配置</p></div>
      <Button variant="ghost" size="icon" onClick={() => void load()} title="重新加载"><RotateCcw /></Button>
    </header>
    {error && <div className="mx-6 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
    {loading ? <div className="space-y-4 p-6"><Skeleton className="h-16" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div> : <ScrollArea className="h-[610px] px-6">
      <Accordion type="multiple" defaultValue={groups.slice(0, 2).map(([name]) => name)} className="pb-6">
        {groups.map(([group, fields]) => <AccordionItem key={group} value={group}>
          <AccordionTrigger><span className="flex items-center gap-2"><span>{translate(group, translations)}</span><span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{fields.length}</span></span></AccordionTrigger>
          <AccordionContent><div className="space-y-3 rounded-lg border bg-background/30 p-4">
            {fields.map((field) => {
              const key = `${group}.${field.name}`
              return <FieldControl key={field.name} field={field} translations={translations} saving={saving === key} saved={saved === key} onSave={(value) => void save(group, field, value)} />
            })}
          </div></AccordionContent>
        </AccordionItem>)}
      </Accordion>
      {!groups.length && <div className="py-20 text-center text-sm text-muted-foreground">该任务没有可配置参数</div>}
    </ScrollArea>}
  </div>
}

function FieldControl({ field, translations, saving, saved, onSave }: { field: ConfigField; translations: TranslationMap; saving: boolean; saved: boolean; onSave: (value: unknown) => void }) {
  const [input, setInput] = useState(String(field.value ?? ""))
  useEffect(() => setInput(String(field.value ?? "")), [field.value])
  const id = `field-${field.name}`
  const options = field.enumEnum ?? []
  const isNumber = field.type === "integer" || field.type === "number"

  return <div className="grid min-h-14 items-center gap-3 border-b border-border/60 py-3 last:border-0 sm:grid-cols-[minmax(180px,1fr)_minmax(190px,0.8fr)]">
    <div><Label htmlFor={id} className="text-sm" title={field.name}>{translate(field.title, translations)}</Label>{field.description && <p className="mt-1.5 text-xs leading-4 text-muted-foreground">{translateDescription(field.description, translations)}</p>}</div>
    <div className="relative flex items-center gap-2">
      {field.type === "boolean" ? <div className="flex w-full items-center justify-between rounded-md border px-3 py-2"><span className="text-xs text-muted-foreground">{field.value ? "已启用" : "已禁用"}</span><Switch id={id} checked={Boolean(field.value)} disabled={saving} onCheckedChange={onSave} /></div> : options.length ? <Select value={String(field.value ?? "") || "__empty__"} disabled={saving} onValueChange={(selected) => { const actual = selected === "__empty__" ? "" : selected; onSave(options.find((option) => String(option) === actual) ?? actual) }}>
        <SelectTrigger id={id}><SelectValue placeholder="请选择" /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={String(option)} value={String(option) || "__empty__"}>{translate(option, translations) || "空"}</SelectItem>)}</SelectContent>
      </Select> : <Input id={id} type={isNumber ? "number" : "text"} step={field.type === "number" ? "0.1" : undefined} value={input} disabled={saving} onChange={(event) => setInput(event.target.value)} onBlur={() => { if (input !== String(field.value ?? "")) onSave(input) }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }} />}
      <span className="absolute -right-1 -top-2">{saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" />}{saved && <Check className="h-3.5 w-3.5 text-primary" />}</span>
    </div>
  </div>
}
