import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  ClipboardList,
  Clock,
  GripVertical,
  Layers,
  LoaderCircle,
  Pause,
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
import { TaskConfigDialog } from "@/components/task-config-dialog"
import { api } from "@/lib/api"
import { translate, type TranslationMap } from "@/lib/i18n"
import { buildTaskGroups, filterTaskGroups } from "@/lib/tasks"
import { formatDateTime } from "@/lib/utils"
import type {
  LoopPlan,
  LoopState,
  LoopStep,
  RestPayload,
  RestSchedule,
  ScheduleMode,
  ScriptMenu,
  TaskSummaryMap,
  WeeklyRest,
} from "@/types"

interface TaskOverviewProps {
  instance: string
  menu: ScriptMenu
  translations: TranslationMap
  state: number
  onStart?: () => Promise<void>
  onStop?: () => Promise<void>
  onChanged?: () => void
}

const OPERATORS = [">", ">=", "<", "<=", "==", "!="]
const WEEKLY_REST: Array<{ value: WeeklyRest; label: string }> = [
  { value: "none", label: "不休" },
  { value: "single", label: "单休" },
  { value: "double", label: "双休" },
]

/** 任务总览：作息时间 + 调度器 + 当前任务列表 + 任务库。 */
export function TaskOverview({ instance, menu, translations, state, onStart, onStop, onChanged }: TaskOverviewProps) {
  const [summary, setSummary] = useState<TaskSummaryMap>({})
  const [loop, setLoop] = useState<LoopState>()
  const [plan, setPlan] = useState<LoopPlan>()
  const [rest, setRest] = useState<RestPayload>()
  const [restDraft, setRestDraft] = useState<RestSchedule>()
  const [restDirty, setRestDirty] = useState(false)
  const [mode, setMode] = useState<ScheduleMode>("time")
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("Probe")
  const [configTask, setConfigTask] = useState<string>()
  const dirtyRef = useRef(false)
  const restDirtyRef = useRef(false)
  const dragId = useRef<string | undefined>(undefined)

  const load = useCallback(async (initial = false) => {
    if (!instance) return
    if (initial) setLoading(true)
    try {
      const [tasks, loopState, restState] = await Promise.all([
        api.tasks(instance),
        api.loop(instance),
        api.rest(instance),
      ])
      setSummary(tasks)
      setLoop(loopState)
      setRest(restState)
      if (!dirtyRef.current) setPlan(loopState.plan)
      if (!restDirtyRef.current) setRestDraft(restState.schedule)
      setMode(loopState.mode)
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
    setRest(undefined)
    setRestDraft(undefined)
    dirtyRef.current = false
    restDirtyRef.current = false
    setDirty(false)
    setRestDirty(false)
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

  const mutateRest = (patch: Partial<RestSchedule>) => {
    setRestDraft((current) => (current ? { ...current, ...patch } : current))
    restDirtyRef.current = true
    setRestDirty(true)
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

  const saveRest = async () => {
    if (!restDraft) return
    setBusy("rest")
    setError(undefined)
    try {
      await api.setRest(instance, restDraft)
      restDirtyRef.current = false
      setRestDirty(false)
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
      if (enable && plan && !plan.steps.some((step) => step.kind === "task" && step.task === task)) {
        const nextPlan: LoopPlan = {
          ...plan,
          steps: [...plan.steps, { id: newStepId(), kind: "task", task, operator: ">", threshold: 0, interval: plan.interval, max_polls: 0 }],
        }
        await api.setLoop(instance, nextPlan)
        setPlan(nextPlan)
      }
      onChanged?.()
    } catch (reason) {
      setSummary((current) => ({ ...current, [task]: { enable: !enable, next_run: current[task]?.next_run ?? "" } }))
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(undefined)
    }
  }

  const controlInstance = async () => {
    const stop = state === 1
    if (stop ? !onStop : !onStart) return
    setBusy("control")
    setError(undefined)
    try {
      await (stop ? onStop!() : onStart!())
      onChanged?.()
      await load()
    } catch (reason) {
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
  const nextAt = loop?.runtime?.next_at ?? rest?.state?.next_at ?? undefined

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
            {state === 1 && mode === "loop" ? "轮询运行中" : stateLabel(state)}
          </span>
          {(onStart || onStop) && <Button
            variant={state === 1 ? "outline" : "default"}
            size="sm"
            disabled={busy === "control"}
            onClick={() => void controlInstance()}
          >
            {busy === "control" ? <LoaderCircle className="animate-spin" /> : state === 1 ? <Pause /> : <Play />}
            {state === 1 ? "暂停调度" : "全部启动"}
          </Button>}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务" className="w-52 pl-9" />
          </div>
          <Button variant="outline" size="icon" onClick={() => void load(true)} title="刷新"><RefreshCw className={loading ? "animate-spin" : ""} /></Button>
        </div>
      </div>
    </section>

    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

    {restDraft && <Card className="glass">
      <CardContent className="flex flex-wrap items-end gap-x-6 gap-y-4 p-5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">作息时间</span>
          <Badge variant={restDraft.enable ? "default" : "secondary"}>{restDraft.enable ? "强制" : "未启用"}</Badge>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">每日运行</p>
          <div className="flex items-center gap-1.5">
            <Switch checked={restDraft.enable} onCheckedChange={(value) => mutateRest({ enable: value })} />
            <Input type="time" className="h-9 w-[110px]" value={restDraft.start} onChange={(event) => mutateRest({ start: event.target.value })} />
            <span className="text-muted-foreground">-</span>
            <Input type="time" className="h-9 w-[110px]" value={restDraft.end} onChange={(event) => mutateRest({ end: event.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">随机偏移</p>
          <div className="flex h-9 items-center gap-1.5">
            <span className="text-sm text-muted-foreground">±</span>
            <Input type="number" min={0} max={120} className="h-9 w-20" value={restDraft.random_offset} onChange={(event) => mutateRest({ random_offset: Number(event.target.value) })} />
            <span className="text-xs text-muted-foreground">分钟</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">连续运行</p>
          <div className="flex h-9 items-center gap-1.5">
            <Input type="number" min={0} className="h-9 w-20" value={restDraft.run_minutes} onChange={(event) => mutateRest({ run_minutes: Number(event.target.value) })} />
            <span className="text-xs text-muted-foreground">分钟</span>
            <span className="ml-1 text-xs text-muted-foreground">休</span>
            <Input type="number" min={0} className="h-9 w-20" value={restDraft.break_minutes} onChange={(event) => mutateRest({ break_minutes: Number(event.target.value) })} />
            <span className="text-xs text-muted-foreground">分钟</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">每周休息</p>
          <div className="flex h-9 items-center gap-1 rounded-md border bg-background p-1">
            {WEEKLY_REST.map((item) => <button
              key={item.value}
              type="button"
              onClick={() => mutateRest({ weekly_rest: item.value })}
              className={`rounded px-2.5 py-1 text-xs ${restDraft.weekly_rest === item.value ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground"}`}
            >{item.label}</button>)}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className={`flex items-center gap-2 text-xs ${restStatusTone(restDraft, rest?.state)}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {restStatusLabel(restDraft, rest?.state)}
          </span>
          {restDirty && <span className="text-xs text-amber-400">未保存</span>}
          <Button size="sm" onClick={() => void saveRest()} disabled={!restDirty || busy === "rest"}>
            {busy === "rest" ? <LoaderCircle className="animate-spin" /> : <Check />}保存
          </Button>
        </div>
      </CardContent>
    </Card>}

    <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><Layers className="h-4 w-4 text-primary" />调度器<Badge variant="secondary">调度核心</Badge></span>
          {mode === "loop" && <span className="flex items-center gap-2 text-xs font-normal">
            {dirty && <span className="text-amber-400">未保存</span>}
            <Button size="sm" variant="outline" onClick={() => void savePlan()} disabled={!dirty || busy === "save"}>
              {busy === "save" ? <LoaderCircle className="animate-spin" /> : <Check />}保存
            </Button>
          </span>}
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
          <div className="grid items-end gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-5">
            <DurationField label="轮询间隔" value={plan.interval} min={5} onChange={(value) => mutatePlan((current) => ({ ...current, interval: value }))} />
            <NumberField label="单次探针超时" suffix="分钟" hint="0 = 不限" value={plan.timeout_minutes} min={0} onChange={(value) => mutatePlan((current) => ({ ...current, timeout_minutes: value }))} />
            <div className="space-y-1.5">
              <span className="block text-[11px] text-muted-foreground">轮转方式</span>
              <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">顺序轮转</div>
            </div>
            <NumberField label="每日轮数" hint="0 = 不限" value={plan.max_cycles} min={0} onChange={(value) => mutatePlan((current) => ({ ...current, max_cycles: value }))} />
            <div className="space-y-1 text-right">
              <p className="text-[11px] text-muted-foreground">下一轮</p>
              <p className="font-mono text-2xl">{nextAt ? formatClock(nextAt) : "--:--"}</p>
              <p className="text-[10px] text-muted-foreground">第 {(loop?.runtime?.cycle ?? 0) + 1} 轮 · 队列 {plan.steps.length} 项</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <span className="flex items-center gap-2 text-xs text-muted-foreground"><Settings2 className="h-3.5 w-3.5" />执行选项</span>
            <div className="flex flex-wrap items-center gap-2">
              <OptionSwitch label="空队列自动休眠" checked={plan.idle_on_empty} onChange={(value) => mutatePlan((current) => ({ ...current, idle_on_empty: value }))} />
              <OptionSwitch label="失败自动重试" checked={plan.retry_on_failure} onChange={(value) => mutatePlan((current) => ({ ...current, retry_on_failure: value }))} />
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
            <div>
              <p className="text-xs font-semibold">轮询休息</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">每 N 次轮询后暂停，0 = 不休息；± 直接填次数/分钟，上限 = 基准 × 30%（取整）</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {runtimeSummary(loop?.runtime, label) ?? "队列空闲，等待启动实例"}
                {loop?.probes.realm_raid_ticket?.ok && ` · 突破券 ${loop.probes.realm_raid_ticket.value ?? "-"}`}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <InlineNumber label="每" value={plan.rest_every} min={0} onChange={(value) => mutatePlan((current) => ({ ...current, rest_every: value }))} />
              <InlineNumber label="±" value={plan.rest_every_jitter} min={0} max={jitterMax(plan.rest_every)} onChange={(value) => mutatePlan((current) => ({ ...current, rest_every_jitter: Math.min(value, jitterMax(current.rest_every)) }))} />
              <span className="pb-2 text-[11px] text-muted-foreground">次轮询</span>
              <InlineNumber label="休息" value={Math.round(plan.rest_duration / 60)} min={0} onChange={(value) => mutatePlan((current) => ({ ...current, rest_duration: value * 60 }))} />
              <InlineNumber label="±" value={Math.round(plan.rest_jitter / 60)} min={0} max={jitterMax(Math.round(plan.rest_duration / 60))} onChange={(value) => mutatePlan((current) => ({ ...current, rest_jitter: Math.min(value, jitterMax(Math.round(current.rest_duration / 60))) * 60 }))} />
              <span className="pb-2 text-[11px] text-muted-foreground">分钟</span>
            </div>
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
              <DurationField compact value={step.interval} min={5} onChange={(value) => updateStep(step.id, { interval: value })} />
              <span className="text-[11px] text-muted-foreground">次数</span>
              <Input type="number" min={0} className="h-8 w-20" value={step.max_polls} onChange={(event) => updateStep(step.id, { max_polls: Number(event.target.value) })} />
              {probe?.ok && <Badge variant="outline" className="font-mono">现值 {probe.value ?? "-"}</Badge>}
            </div> : <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfigTask(step.task)}><Settings2 />配置</Button>
            </div>}

            <Button variant="ghost" size="icon" className="h-8 w-8" title="移除" onClick={() => removeStep(step.id)}><Trash2 /></Button>
          </div>
        })}
        <p className="pt-1 text-[11px] text-muted-foreground">执行顺序：从上到下循环；探针步骤会阻塞队列，直到条件成立。</p>
      </CardContent>
    </Card>}

    {mode === "time" && plan && <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />当前任务列表
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-normal text-primary">{plan.steps.length} 项</span>
          </span>
          <span className="text-[11px] font-normal text-muted-foreground">时间模式按各任务 next_run 执行，队列顺序仅用于共用列表</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!plan.steps.length && <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">队列为空，从下方任务库开启任务会自动加入。</p>}
        {plan.steps.map((step, index) => {
          const row = summary[step.task]
          const isTask = step.kind === "task"
          return <div key={step.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-background/40 px-4 py-2.5">
            <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            <Badge variant={isTask ? "secondary" : "default"} className="shrink-0">{isTask ? "任务" : "探针"}</Badge>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{label(step.task)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{isTask && row ? describeNextRun(row) : "探针仅在轮询模式参与执行"}</p>
            </div>
            {isTask && row && <>
              <Button variant="ghost" size="sm" disabled={!row.enable || busy === `run:${step.task}`} onClick={() => void runNow(step.task)}>
                {busy === `run:${step.task}` ? <LoaderCircle className="animate-spin" /> : <Play />}运行
              </Button>
              <Switch checked={row.enable} disabled={busy === step.task} onCheckedChange={(value) => void toggle(step.task, value)} />
            </>}
            {isTask && <Button variant="ghost" size="sm" onClick={() => setConfigTask(step.task)}><Settings2 />配置</Button>}
            <Button variant="ghost" size="icon" className="h-8 w-8" title="移出队列" onClick={() => removeStep(step.id)}><Trash2 /></Button>
          </div>
        })}
      </CardContent>
    </Card>}

    <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><Layers className="h-4 w-4 text-primary" />任务库</span>
          <span className="text-[11px] font-normal text-muted-foreground">
            {mode === "loop" ? "添加的步骤会追加到当前任务列表结尾" : "开启任务会自动加入上方队列并进入定时调度"}
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
                onConfigure={() => setConfigTask(item.task)}
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
              <Button variant="ghost" size="sm" onClick={() => setConfigTask(row.task)}><Settings2 />配置</Button>
            </div>)}
          </div>)}
          {!loading && rows.length > 0 && !visible.length && <p className="py-8 text-center text-sm text-muted-foreground">没有匹配“{query}”的任务</p>}
        </>}
      </CardContent>
    </Card>

    <TaskConfigDialog
      instance={instance}
      task={configTask}
      translations={translations}
      open={Boolean(configTask)}
      onOpenChange={(open) => { if (!open) setConfigTask(undefined) }}
      onSaved={() => void load()}
    />
  </div>
}

function NumberField({ label, hint, suffix, value, min, onChange }: { label: string; hint?: string; suffix?: string; value: number; min: number; onChange: (value: number) => void }) {
  return <label className="space-y-1.5">
    <span className="block text-[11px] text-muted-foreground">{label}{hint ? `（${hint}）` : suffix ? `（${suffix}）` : ""}</span>
    <div className="flex items-center gap-1.5">
      <Input type="number" min={min} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      {suffix && <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>}
    </div>
  </label>
}

function InlineNumber({ label, value, min, max, onChange }: { label: string; value: number; min: number; max?: number; onChange: (value: number) => void }) {
  return <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
    {label}
    <Input type="number" min={min} max={max} className="h-8 w-[68px]" value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </label>
}

function DurationField({ label, value, min, compact, onChange }: { label?: string; value: number; min: number; compact?: boolean; onChange: (value: number) => void }) {
  const [text, setText] = useState(() => formatDuration(value))
  useEffect(() => { setText(formatDuration(value)) }, [value])
  const commit = () => {
    const seconds = parseDuration(text)
    if (seconds === undefined || seconds < min) { setText(formatDuration(value)); return }
    onChange(Math.round(seconds))
  }
  const input = <Input
    className={compact ? "h-8 w-24 font-mono" : "h-9 font-mono"}
    value={text}
    onChange={(event) => setText(event.target.value)}
    onBlur={commit}
    onKeyDown={(event) => { if (event.key === "Enter") commit() }}
  />
  if (compact) return input
  return <label className="space-y-1.5">
    <span className="block text-[11px] text-muted-foreground">{label}</span>
    {input}
  </label>
}

function OptionSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
    <Switch checked={checked} onCheckedChange={onChange} />
    {label}
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

/** ± 输入的允许上限：基准值的 30%，向下取整。 */
function jitterMax(base: number) {
  return Math.max(0, Math.floor(base * 0.3))
}

function categories(tasks: Array<{ category: string }>) {
  return Array.from(new Set(tasks.map((item) => item.category)))
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  const pad = (value: number) => String(value).padStart(2, "0")
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`
}

function parseDuration(text: string) {
  const parts = text.trim().split(":").map((part) => Number(part))
  if (parts.some((part) => Number.isNaN(part))) return undefined
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 1) return parts[0] * 60
  return undefined
}

function formatClock(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--:--"
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function restStatusLabel(schedule: RestSchedule, state: RestPayload["state"] | undefined) {
  if (!schedule.enable) return "未启用"
  switch (state?.status) {
    case "working": return `工作中 · ${state.work_minutes ?? 0} 分钟`
    case "break": return `休息中 · ${state.next_at ? formatClock(state.next_at) : "--:--"} 恢复`
    case "weekly": return "每周休息日"
    case "outside": return state.next_at ? `未到运行时间 · ${formatClock(state.next_at)} 开始` : "未到运行时间"
    default: return "待命"
  }
}

function restStatusTone(schedule: RestSchedule, state: RestPayload["state"] | undefined) {
  if (!schedule.enable) return "text-muted-foreground"
  return state?.status === "working" ? "text-emerald-400" : "text-amber-400"
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

function describeNextRun(row: { enable: boolean; next_run: string }) {
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
