import { useCallback, useEffect, useState } from "react"
import { Check, LoaderCircle, RefreshCw, Wrench } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import type { DeployField, DeploySettings as DeploySettingsData } from "@/types"

export function DeploySettings() {
  const [data, setData] = useState<DeploySettingsData>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState<string>()
  const [saved, setSaved] = useState<string>()

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      setData(await api.deploySettings())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async (field: DeployField, raw: unknown) => {
    setSaving(field.key)
    setError(undefined)
    try {
      const result = await api.setDeploy(field.key, field.type, raw)
      if (!result.success) throw new Error("FastAPI 未接受该配置值")
      setData((current) => current ? {
        ...current,
        sections: current.sections.map((section) => ({
          ...section,
          fields: section.fields.map((item) => item.key === field.key ? { ...item, value: result.value } : item),
        })),
      } : current)
      setSaved(field.key)
      window.setTimeout(() => setSaved((current) => (current === field.key ? undefined : current)), 1800)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(undefined)
    }
  }

  return <Card className="glass">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4" />运行环境（deploy.yaml）</CardTitle>
      <CardDescription>模拟器、ADB、OCR 服务等底层设置。修改后需要重启后端才会生效，敏感字段不会在界面展示。</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background/40 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">配置文件</p>
          <p className="truncate font-mono text-xs" title={data?.path}>{data?.path ?? "读取中..."}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />重新读取</Button>
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {loading && !data && <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />正在读取 deploy.yaml</div>}

      {data && <Accordion type="multiple" defaultValue={data.sections.slice(0, 2).map((section) => section.name)}>
        {data.sections.map((section) => <AccordionItem key={section.name} value={section.name}>
          <AccordionTrigger><span className="flex items-center gap-2">{section.name}<span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{section.fields.length}</span></span></AccordionTrigger>
          <AccordionContent><div className="space-y-1 rounded-lg border bg-background/30 p-4">
            {section.fields.map((field) => <DeployFieldControl
              key={field.key}
              field={field}
              saving={saving === field.key}
              saved={saved === field.key}
              onSave={(value) => void save(field, value)}
            />)}
          </div></AccordionContent>
        </AccordionItem>)}
        {!data.sections.length && <p className="py-8 text-center text-sm text-muted-foreground">没有可编辑的配置项</p>}
      </Accordion>}
    </CardContent>
  </Card>
}

function DeployFieldControl({ field, saving, saved, onSave }: { field: DeployField; saving: boolean; saved: boolean; onSave: (value: unknown) => void }) {
  const id = `deploy-${field.key}`

  return <div className="grid min-h-14 items-center gap-3 border-b border-border/60 py-3 last:border-0 sm:grid-cols-[minmax(200px,1fr)_minmax(190px,0.8fr)]">
    <div className="min-w-0">
      <Label htmlFor={id} className="text-sm">{field.key}</Label>
      {field.description && <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground" title={field.description}>{field.description}</p>}
    </div>
    <div className="relative flex items-center gap-2">
      {field.type === "boolean"
        ? <div className="flex w-full items-center justify-between rounded-md border px-3 py-2">
            <span className="text-xs text-muted-foreground">{field.value ? "已启用" : "已禁用"}</span>
            <Switch id={id} checked={Boolean(field.value)} disabled={saving} onCheckedChange={onSave} />
          </div>
        : <DeployTextControl id={id} field={field} saving={saving} onSave={onSave} />}
      <span className="absolute -right-1 -top-2">{saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" />}{saved && <Check className="h-3.5 w-3.5 text-primary" />}</span>
    </div>
  </div>
}

function DeployTextControl({ id, field, saving, onSave }: { id: string; field: DeployField; saving: boolean; onSave: (value: unknown) => void }) {
  const [input, setInput] = useState(String(field.value ?? ""))
  useEffect(() => setInput(String(field.value ?? "")), [field.value])
  const isInteger = field.type === "integer"

  return <Input
    id={id}
    type={isInteger ? "number" : "text"}
    value={input}
    disabled={saving}
    onChange={(event) => setInput(event.target.value)}
    onBlur={() => { if (input !== String(field.value ?? "")) onSave(input) }}
    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }}
  />
}
