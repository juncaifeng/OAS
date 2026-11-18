import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, ClipboardList, LoaderCircle, Play, RefreshCw, Search, Settings2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { translate, type TranslationMap } from "@/lib/i18n"
import { buildTaskGroups, filterTaskGroups, type TaskRow } from "@/lib/tasks"
import { formatDateTime } from "@/lib/utils"
import type { ScriptMenu, TaskSummaryMap } from "@/types"

interface TaskOverviewProps {
  instance: string
  menu: ScriptMenu
  translations: TranslationMap
  state: number
  onConfigure: (task: string) => void
  onChanged?: () => void
}

export function TaskOverview({ instance, menu, translations, state, onConfigure, onChanged }: TaskOverviewProps) {
  const [summary, setSummary] = useState<TaskSummaryMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState<string>()
  const [saved, setSaved] = useState<string>()
  const [running, setRunning] = useState<string>()
  const [ran, setRan] = useState<string>()

  const load = useCallback(async () => {
    if (!instance) return
    setLoading(true)
    setError(undefined)
    try {
      setSummary(await api.tasks(instance))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [instance])

  useEffect(() => {
    setLoading(true)
    setSummary({})
    void load()
    // next_run 由调度器在后台不断推进，页面停留期间定时拉取一次。
    const timer = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (state !== 0) void load()
  }, [state, load])

  const toggle = async (task: string, enable: boolean) => {
    setSaving(task)
    setError(undefined)
    setSummary((current) => ({ ...current, [task]: { enable, next_run: current[task]?.next_run ?? "" } }))
    try {
      const success = await api.setField(instance, task, "scheduler", "enable", "boolean", enable)
      if (!success) throw new Error("FastAPI 未接受该配置值")
      onChanged?.()
      setSaved(task)
      window.setTimeout(() => setSaved((current) => (current === task ? undefined : current)), 1500)
    } catch (reason) {
      setSummary((current) => ({ ...current, [task]: { enable: !enable, next_run: current[task]?.next_run ?? "" } }))
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(undefined)
    }
  }

  const runNow = async (task: string) => {
    setRunning(task)
    setError(undefined)
    try {
      const success = await api.runTask(instance, task)
      if (!success) throw new Error("FastAPI 未接受该任务")
      onChanged?.()
      setRan(task)
      window.setTimeout(() => setRan((current) => (current === task ? undefined : current)), 1500)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRunning(undefined)
    }
  }

  const groups = useMemo(() => buildTaskGroups(menu, summary), [menu, summary])
  const visible = useMemo(
    () => filterTaskGroups(groups, query, (value) => translate(value, translations)),
    [groups, query, translations],
  )

  const rows = groups.flatMap((group) => group.tasks)
  const enabled = rows.filter((row) => row.enable)
  const nextRun = enabled
    .map((row) => row.next_run)
    .filter((value) => value && !value.startsWith("2023-01-01"))
    .sort()[0]
  const nextTask = nextRun ? enabled.find((row) => row.next_run === nextRun) : undefined

  return <div className="space-y-6">
    <section className="subtle-grid relative overflow-hidden rounded-2xl border bg-card p-7">
      <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2"><Badge variant="outline">调度器</Badge><span className="text-xs text-muted-foreground">{instance}</span></div>
          <h2 className="text-2xl font-semibold tracking-tight">任务总览</h2>
          <p className="mt-2 text-sm text-muted-foreground">批量启用任务、查看下次运行时间，并直接跳到参数配置。</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务" className="w-56 pl-9" />
          </div>
          <Button variant="outline" size="icon" onClick={() => void load()} title="刷新"><RefreshCw className={loading ? "animate-spin" : ""} /></Button>
        </div>
      </div>
    </section>

    <div className="grid gap-4 md:grid-cols-3">
      <Metric label="已启用任务" value={`${enabled.length} / ${rows.length}`} detail="启用后会进入调度队列" />
      <Metric label="下次运行" value={nextRun ? formatDateTime(nextRun) : "暂无计划"} detail={nextTask ? translate(nextTask.task, translations) : "启用任务后自动安排"} />
      <Metric label="实例状态" value={stateLabel(state)} detail={state === 1 ? "调度器正在推进任务" : "启动实例后任务才会执行"} />
    </div>

    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

    {!loading && !rows.length && <Card className="glass"><CardContent className="py-16 text-center text-sm text-muted-foreground">没有可显示的任务，请确认实例配置是否正常。</CardContent></Card>}
    {loading && !rows.length && <Card className="glass"><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />正在读取任务列表</CardContent></Card>}

    {visible.map((group) => <Card key={group.category} className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-primary" />
          {translate(group.category, translations)}
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{group.tasks.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {group.tasks.map((row) => <div key={row.task} className="flex items-center gap-3 rounded-lg border bg-background/40 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{translate(row.task, translations)}</p>
              {saved === row.task && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
              {ran === row.task && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
              {saving === row.task && <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{describeNextRun(row)}</p>
          </div>
          <Switch checked={row.enable} disabled={saving === row.task} onCheckedChange={(value) => void toggle(row.task, value)} />
          <Button variant="ghost" size="sm" disabled={!row.enable || running === row.task} title={row.enable ? "立即加入调度队列（实例运行中才会执行）" : "请先启用任务"} onClick={() => void runNow(row.task)}>
            {running === row.task ? <LoaderCircle className="animate-spin" /> : <Play />}运行
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onConfigure(row.task)}><Settings2 />配置</Button>
        </div>)}
      </CardContent>
    </Card>)}

    {!loading && rows.length > 0 && !visible.length && <Card className="glass"><CardContent className="py-12 text-center text-sm text-muted-foreground">没有匹配“{query}”的任务</CardContent></Card>}
  </div>
}

function describeNextRun(row: TaskRow) {
  if (!row.enable) return "未启用"
  if (row.next_run.startsWith("2023-01-01")) return "启用后按周期调度"
  return `下次运行 ${formatDateTime(row.next_run)}`
}

function stateLabel(state: number) {
  if (state === 1) return "运行中"
  if (state === 2) return "异常退出"
  if (state === 3) return "更新中"
  return "待命中"
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="glass"><CardContent className="p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-lg font-semibold">{value}</p><p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p></CardContent></Card>
}
