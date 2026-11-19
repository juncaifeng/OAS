import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  ClipboardList,
  GripVertical,
  Layers,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Timer,
  Trash2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { translate, type TranslationMap } from "@/lib/i18n"
import { buildTaskGroups, filterTaskGroups, type TaskRow } from "@/lib/tasks"
import { formatDateTime } from "@/lib/utils"
import type { LoopPlan, LoopState, LoopStep, ScheduleMode, ScriptMenu, TaskSummaryMap } from "@/types"

interface TaskOverviewProps {
  instance: string
  menu: ScriptMenu
  translations: TranslationMap
  state: number
  onConfigure: (task: string) => void
  onChanged?: () => void
}

const OPERATORS = [">", ">=", "<", "<=", "==", "!="]

/** 任务总览：调度器 + 当前任务列表 + 任务库。 */
export function TaskOverview({ instance, menu, translations, state, onConfigure, onChanged }: TaskOverviewProps) {
  const [summary, setSummary] = useState<TaskSummaryMap>({})
  const [loop, setLoop] = useState<LoopState>()
  const [plan, setPlan] = useState<LoopPlan>()
  const [mode, setMode] = useState<ScheduleMode>("time")
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("Probe")
  const dirtyRef = useRef(false)
  const dragId = useRef<string | undefined>(undefined)

  const load = useCallback(async (initial = false) => {
    if (!instance) return
    if (initial) setLoading(true)
    try {
      const [tasks, loopState] = await Promise.all([api.tasks(instance), api.loop(instance)])
      setSummary(tasks)
      setLoop(loopState)
      setMode(loopState.mode)
      if (!dirtyRef.current) setPlan(loopState.plan)
      setError(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (initial) setLoading(false)
    }
  }, [instance])

  useEffect(() => {
    setSummary({})
    setLoop(undefined)
    setPlan(undefined)
    dirtyRef.current = false
    setDirty(false)
    void load(true)
    const timer = window.setInterval(() => void load(), 8000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (state !== 0) void load()
  }, [state, load])

  const mutatePlan = (updater: (plan: LoopPlan) => LoopPlan) => {
    setPlan((current) => (current ? updater(current) : current))
    dirtyRef.current = true
    setDirty(true)
  }

  const savePlan = async (payload?: LoopPlan) => {
    const target = payload ?? plan
    if (!target) return
    setBusy("save")
    setError(undefined)
    try {
      await api.setLoop(instance, target)
      dirtyRef.current = false
      setDirty(false)
      onChanged?.()
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(undefined)
    }
  }

  const switchMode = async (next: ScheduleMode) => {
    if (!plan || next === mode) return
    const nextPlan: LoopPlan = { ...plan, enable: next === "loop" }
    setBusy("mode")
    setError(undefined)
    try {
      await api.setScheduleMode(instance, next)
      await api.setLoop(instance, nextPlan)
      setMode(next)
      setPlan(nextPlan)
      dirtyRef.current = false
      setDirty(false)
      onChanged?.()
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(undefined)
    }
  }

  const updateStep = (id: string, patch: Partial<LoopStep>) => {
    mutatePlan((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.id === id ? { ...step, ...patch } : step)),
    }))
  }

  const removeStep = (id: string) => {
    mutatePlan((current) => ({ ...current, steps: current.steps.filter((step) => step.id !== id) }))
  }

  const moveStep = (from?: string, to?: string) => {
    if (!from || !to || from === to) return
    mutatePlan((current) => {
      const index = current.steps.findIndex((step) => step.id === from)
      const target = current.steps.findIndex((step) => step.id === to)
      if (index < 0 || target < 0) return current
      const steps = [...current.steps]
      const [moved] = steps.splice(index, 1)
      steps.splice(target, 0, moved)
      return { ...current, steps }
    })
  }

  const addTask = (task: string) => {
    mutatePlan((current) => ({
      ...current,
      steps: [
        ...current.steps,
        {
          id: newStepId(),
          kind: "task",
          task,
          operator: ">",
          threshold: 0,
          interval: current.interval,
          max_polls: 0,
        },
      ],
    }))
  }

  const addProbe = (task: string) => {
    const probe = loop?.catalog.probes.find((item) => item.task === task)
    mutatePlan((current) => ({
      ...current,
      steps: [
        ...current.steps,
        {
          id: newStepId(),
          kind: "probe",
          task,
          operator: probe?.operator ?? ">",
          threshold: probe?.threshold ?? 0,
          interval: probe?.interval ?? current.interval,
          max_polls: 0,
        },
      ],
    }))
  }

  const toggle = async (task: string, enable: boolean) => {
    setBusy(task)
    setError(undefined)
    setSummary((current) => ({ ...current, [task]: { enable, next_run: current[task]?.next_run ?? "" } }))
    try {
      const success = await api.setField(instance, task, "scheduler", "enable", "boolean", enable)
      if (!success) throw new Error("FastAPI 未接受该配置值")
      onChanged?.()
    } catch (reason) {
      setSummary((current) => ({ ...current, [task]: { enable: !enable, next_run: current[task]?.next_run ?? "" } }))
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(undefined)
    }
  }

  const runNow = async (task: string) => {
    setBusy(`run:${task}`)
    setError(undefined)
    try {
      const success = await api.runTask(instance, task)
      if (!success) throw new Error("FastAPI 未接受该任务")
      onChanged?.()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(undefined)
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

  const label = (value: string) => translate(value, translations)

  return <div className="space-y-5">
    <section className="subtle-grid relative overflow-hidden rounded-2xl border bg-card p-7">
      <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2"><Badge variant="outline">任务调度</Badge><span className="text-xs text-muted-foreground">{instance}</span></div>
          <h2 className="text-2xl font-semibold tracking-tight">任务总览</h2>
          <p className="mt-2 text-sm text-muted-foreground">管理副本自动化任务、执行顺序与调度节奏。</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold ${state === 1 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "text-muted-foreground"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${state === 1 ? "bg-emerald-400" : "bg-muted-foreground"}`} />
            {stateLabel(state)}
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务" className="w-56 pl-9" />
          </div>
          <Button variant="outline" size="icon" onClick={() => void load(true)} title="刷新"><RefreshCw className={loading ? "animate-spin" : ""} /></Button>
        </div>
      </div>
    </section>

    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

    <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><Layers className="h-4 w-4 text-primary" />调度器</span>
          <Badge variant="secondary">调度核心</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">调度模式</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {mode === "loop"
                ? "按当前任务列表顺序执行，探针步骤会等待条件成立后继续。"
                : "按每个任务自己的 next_run 定时执行，忽略当前任务列表顺序。"}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
            <button
              type="button"
              onClick={() => void switchMode("time")}
              disabled={busy === "mode"}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${mode === "time" ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground"}`}
            >
              <Timer className="h-3.5 w-3.5" />时间模式
            </button>
            <button
              type="button"
              onClick={() => void switchMode("loop")}
              disabled={busy === "mode"}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${mode === "loop" ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground"}`}
            >
              <RefreshCw className="h-3.5 w-3.5" />轮询模式
            </button>
          </div>
        </div>

        {mode === "loop" && plan && <>
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-5">
            <NumberField label="轮询间隔（秒）" value={plan.interval} min={5} onChange={(value) => mutatePlan((current) => ({ ...current, interval: value }))} />
            <NumberField label="单次探针超时（分钟）" value={plan.timeout_minutes} min={0} onChange={(value) => mutatePlan((current) => ({ ...current, timeout_minutes: value }))} />
            <NumberField label="每 N 次轮询休息" hint="0 = 不休息" value={plan.rest_every} min={0} onChange={(value) => mutatePlan((current) => ({ ...current, rest_every: value }))} />
            <NumberField label="休息时长（秒）" value={plan.rest_duration} min={10} onChange={(value) => mutatePlan((current) => ({ ...current, rest_duration: value }))} />
            <NumberField label="每日轮数" hint="0 = 不限" value={plan.max_cycles} min={0} onChange={(value) => mutatePlan((current) => ({ ...current, max_cycles: value }))} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
            <span>
              {runtimeSummary(loop?.runtime, label) ?? "队列空闲，等待启动实例"}
              {loop?.probes.realm_raid_ticket?.ok && ` · 突破券 ${loop.probes.realm_raid_ticket.value ?? "-"}`}
            </span>
            <span className="flex items-center gap-2">
              {dirty && <span className="text-amber-400">有未保存的修改</span>}
              <Button size="sm" onClick={() => void savePlan()} disabled={!dirty || busy === "save"}>
                {busy === "save" ? <LoaderCircle className="animate-spin" /> : <Check />}保存计划
              </Button>
            </span>
          </div>
        </>}

        {mode === "time" && <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
          <span className="text-muted-foreground">下一次运行</span>
          <span className="font-mono text-lg">{nextRun ? formatDateTime(nextRun) : "暂无计划"}</span>
          <span className="text-xs text-muted-foreground">已启用 {enabled.length} / {rows.length} 个任务</span>
        </div>}
      </CardContent>
    </Card>

    {mode === "loop" && plan && <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />当前任务列表
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-normal text-primary">{plan.steps.length} 步</span>
          </span>
          <span className="flex items-center gap-1 text-[11px] font-normal text-muted-foreground"><GripVertical className="h-3.5 w-3.5" />拖动调整执行顺序</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!plan.steps.length && <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">列表为空，从下方任务库添加任务或探针。</p>}
        {plan.steps.map((step, index) => {
          const active = loop?.runtime?.index === index && (loop.runtime.status === "running" || loop.runtime.status === "waiting")
          const probe = step.kind === "probe" ? loop?.probes[step.task] : undefined
          return <div
            key={step.id}
            draggable
            onDragStart={() => { dragId.current = step.id }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => { moveStep(dragId.current, step.id); dragId.current = undefined }}
            className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 ${active ? "border-primary/60 bg-primary/5" : "bg-background/40"}`}
          >
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
            <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            <Badge variant={step.kind === "probe" ? "default" : "secondary"} className="shrink-0">
              {step.kind === "probe" ? "探针" : "任务"}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{label(step.task)}</span>

            {step.kind === "probe" ? <div className="flex flex-wrap items-center gap-2">
              <Select value={step.operator} onValueChange={(value) => updateStep(step.id, { operator: value })}>
                <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
                <SelectContent>{OPERATORS.map((operator) => <SelectItem key={operator} value={operator}>{operator}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" className="h-8 w-20" value={step.threshold} onChange={(event) => updateStep(step.id, { threshold: Number(event.target.value) })} />
              <span className="text-[11px] text-muted-foreground">间隔</span>
              <Input type="number" min={5} className="h-8 w-20" value={step.interval} onChange={(event) => updateStep(step.id, { interval: Number(event.target.value) })} />
              <span className="text-[11px] text-muted-foreground">次数</span>
              <Input type="number" min={0} className="h-8 w-20" value={step.max_polls} onChange={(event) => updateStep(step.id, { max_polls: Number(event.target.value) })} />
              {probe?.ok && <Badge variant="outline" className="font-mono">现值 {probe.value ?? "-"}</Badge>}
            </div> : <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onConfigure(step.task)}><Settings2 />配置</Button>
            </div>}

            <Button variant="ghost" size="icon" className="h-8 w-8" title="移除" onClick={() => removeStep(step.id)}><Trash2 /></Button>
          </div>
        })}
        <p className="pt-1 text-[11px] text-muted-foreground">执行顺序：从上到下循环；探针步骤会阻塞队列，直到条件成立。</p>
      </CardContent>
    </Card>}

    {mode === "time" && <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4 text-primary" />已启用任务</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!enabled.length && <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">还没有启用的任务，从下方任务库开启。</p>}
        {enabled.map((row) => <div key={row.task} className="flex items-center gap-3 rounded-lg border bg-background/40 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{label(row.task)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{describeNextRun(row)}</p>
          </div>
          <Button variant="ghost" size="sm" disabled={busy !== undefined} onClick={() => void runNow(row.task)}>
            {busy === `run:${row.task}` ? <LoaderCircle className="animate-spin" /> : <Play />}运行
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onConfigure(row.task)}><Settings2 />配置</Button>
          <Switch checked onCheckedChange={() => void toggle(row.task, false)} disabled={busy === row.task} />
        </div>)}
      </CardContent>
    </Card>}

    <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><Layers className="h-4 w-4 text-primary" />任务库</span>
          <span className="text-[11px] font-normal text-muted-foreground">
            {mode === "loop" ? "添加的步骤会追加到当前任务列表结尾" : "开启的任务会进入定时调度"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {mode === "loop" && plan && <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分类</SelectItem>
                <SelectItem value="Probe">探针任务</SelectItem>
                {categories(loop?.catalog.tasks ?? []).map((item) => <SelectItem key={item} value={item}>{label(item)}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{category === "Probe" ? "探针用于在循环中等待游戏状态" : "点击“添加”把任务加入当前任务列表"}</span>
          </div>

          {(category === "Probe" || category === "all") && <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {(loop?.catalog.probes ?? []).map((probe) => <LibraryRow
              key={probe.task}
              name={label(probe.task)}
              detail={`探针 · ${probe.value_type === "number" ? "数值" : "布尔"}`}
              onAdd={() => addProbe(probe.task)}
            />)}
          </div>}

          {category !== "Probe" && <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {(loop?.catalog.tasks ?? [])
              .filter((item) => category === "all" || item.category === category)
              .filter((item) => !query.trim() || item.task.toLowerCase().includes(query.trim().toLowerCase()) || label(item.task).toLowerCase().includes(query.trim().toLowerCase()))
              .map((item) => <LibraryRow
                key={item.task}
                name={label(item.task)}
                detail={label(item.category)}
                onAdd={() => addTask(item.task)}
                onConfigure={() => onConfigure(item.task)}
              />)}
          </div>}
        </>}

        {mode === "time" && <>
          {loading && !rows.length && <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />正在读取任务列表</p>}
          {!loading && !rows.length && <p className="py-8 text-center text-sm text-muted-foreground">没有可显示的任务，请确认实例配置是否正常。</p>}
          {visible.map((group) => <div key={group.category} className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              {label(group.category)}<span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-normal">{group.tasks.length}</span>
            </p>
            {group.tasks.map((row) => <div key={row.task} className="flex items-center gap-3 rounded-lg border bg-background/40 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{label(row.task)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{describeNextRun(row)}</p>
              </div>
              <Switch checked={row.enable} disabled={busy === row.task} onCheckedChange={(value) => void toggle(row.task, value)} />
              <Button variant="ghost" size="sm" disabled={!row.enable || busy === `run:${row.task}`} onClick={() => void runNow(row.task)}>
                {busy === `run:${row.task}` ? <LoaderCircle className="animate-spin" /> : <Play />}运行
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onConfigure(row.task)}><Settings2 />配置</Button>
            </div>)}
          </div>)}
          {!loading && rows.length > 0 && !visible.length && <p className="py-8 text-center text-sm text-muted-foreground">没有匹配“{query}”的任务</p>}
        </>}
      </CardContent>
    </Card>
  </div>
}

function NumberField({ label, hint, value, min, onChange }: { label: string; hint?: string; value: number; min: number; onChange: (value: number) => void }) {
  return <label className="space-y-1.5">
    <span className="block text-[11px] text-muted-foreground">{label}{hint ? `（${hint}）` : ""}</span>
    <Input type="number" min={min} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </label>
}

function LibraryRow({ name, detail, onAdd, onConfigure }: { name: string; detail: string; onAdd: () => void; onConfigure?: () => void }) {
  return <div className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2">
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{name}</p>
      <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
    </div>
    {onConfigure && <Button variant="ghost" size="icon" className="h-8 w-8" title="参数配置" onClick={onConfigure}><Settings2 /></Button>}
    <Button variant="outline" size="sm" onClick={onAdd}><Plus />添加</Button>
  </div>
}

function newStepId() {
  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function categories(tasks: Array<{ category: string }>) {
  return Array.from(new Set(tasks.map((item) => item.category)))
}

function runtimeSummary(runtime: LoopState["runtime"] | undefined, label: (value: string) => string) {
  if (!runtime) return undefined
  const status = runtime.status ?? "idle"
  if (status === "waiting" && runtime.probe) {
    return `等待探针 ${label(runtime.probe.task)}：当前 ${runtime.probe.value ?? "?"}，已检查 ${runtime.probe.polls} 次`
  }
  if (status === "running" && runtime.task) return `正在执行 ${label(runtime.task)}（第 ${(runtime.cycle ?? 0) + 1} 轮）`
  if (status === "blocked") return "探针未满足条件，本轮结束"
  if (status === "finished") return "已达到每日轮数上限，暂停中"
  if (status === "disabled") return "循环总开关未启用"
  if (status === "empty") return "任务列表为空"
  return `第 ${(runtime.cycle ?? 0) + 1} 轮空闲`
}

function describeNextRun(row: TaskRow) {
  if (!row.enable) return "未启用"
  if (row.next_run.startsWith("2023-01-01")) return "启用后按周期调度"
  return `下次运行 ${formatDateTime(row.next_run)}`
}

function stateLabel(state: number) {
  if (state === 1) return "调度运行中"
  if (state === 2) return "异常退出"
  if (state === 3) return "更新中"
  return "待命中"
}
