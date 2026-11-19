import { useCallback, useEffect, useState } from "react"
import { RotateCcw } from "lucide-react"
import { FieldControl } from "@/components/config-field"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { translate, type TranslationMap } from "@/lib/i18n"
import type { ConfigField, TaskConfig as TaskConfigData } from "@/types"

interface TaskConfigDialogProps {
  instance: string
  task?: string
  translations: TranslationMap
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

/** 单个任务的参数弹窗：悬浮在任务总览上，保存后立即写入配置。 */
export function TaskConfigDialog({ instance, task, translations, open, onOpenChange, onSaved }: TaskConfigDialogProps) {
  const [config, setConfig] = useState<TaskConfigData>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState<string>()
  const [saved, setSaved] = useState<string>()

  const load = useCallback(async () => {
    if (!task) return
    setLoading(true)
    setError(undefined)
    try {
      setConfig(await api.task(instance, task))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [instance, task])

  useEffect(() => {
    if (open) {
      setConfig(undefined)
      void load()
    }
  }, [open, load])

  const groups = Object.entries(config ?? {})

  const save = async (group: string, field: ConfigField, rawValue: unknown) => {
    if (!task) return
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
      onSaved?.()
      window.setTimeout(() => setSaved((current) => current === key ? undefined : current), 1600)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(undefined)
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>{task ? translate(task, translations) : "任务配置"}</DialogTitle>
        <DialogDescription>{instance} · 参数改动保存后立即生效</DialogDescription>
      </DialogHeader>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      {loading
        ? <div className="space-y-3"><Skeleton className="h-14" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        : <ScrollArea className="h-[58vh] pr-3">
          <Accordion type="multiple" defaultValue={groups.slice(0, 2).map(([name]) => name)} className="pb-2">
            {groups.map(([group, fields]) => <AccordionItem key={group} value={group}>
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <span>{translate(group, translations)}</span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{fields.length}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-1 rounded-lg border bg-background/30 px-4 py-2">
                  {fields.map((field) => {
                    const key = `${group}.${field.name}`
                    return <FieldControl key={field.name} field={field} translations={translations} saving={saving === key} saved={saved === key} onSave={(value) => void save(group, field, value)} />
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>)}
          </Accordion>
          {!groups.length && <p className="py-12 text-center text-sm text-muted-foreground">该任务没有可配置参数</p>}
        </ScrollArea>}

      <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
        <span className="text-[11px] text-muted-foreground">改动即时写入实例配置，无需重启调度</span>
        <span className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RotateCcw />重新加载</Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>完成</Button>
        </span>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
