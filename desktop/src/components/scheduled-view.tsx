import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, LoaderCircle, Pause, Play, Plus, RefreshCw, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { translate, type TranslationMap } from "@/lib/i18n"
import { formatDateTime } from "@/lib/utils"
import type { SchedulePayload, ScheduleWindow, ScriptMenu } from "@/types"

interface ScheduledViewProps {
  instance: string
  menu: ScriptMenu
  translations: TranslationMap
  state: number
  onStart?: () => Promise<void>
  onStop?: () => Promise<void>
  onChanged?: () => void
}

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

/** 定时任务：日历 + 任务安排 + 今日待办。 */
export function ScheduledView({ instance, menu, translations, state, onStart, onStop, onChanged }: ScheduledViewProps) {
  const [data, setData] = useState<SchedulePayload>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState<ScheduleWindow>()
  const [adding, setAdding] = useState(false)
  const [newTask, setNewTask] = useState("")

  const load = useCallback(async (initial = false) => {
    if (!instance) return
    if (initial) setLoading(true)
    try {
      setData(await api.schedule(instance))
      setError(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (initial) setLoading(false)
    }
  }, [instance])

  useEffect(() => {
    setData(undefined)
    void load(true)
    const timer = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(timer)
  }, [load])

  const windows = data?.windows ?? []
  const summary = data?.summary ?? {}
  const label = (value: string) => translate(value, translations)

  const saveWindows = async (next: ScheduleWindow[]) => {
    setBusy("save")
    setError(undefined)
    try {
      await api.setSchedule(instance, next)
      setData((current) => current ? { ...current, windows: next } : current)
      onChanged?.()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      throw reason
    } finally {
      setBusy(undefined)
    }
  }

  const toggleWindow = async (window: ScheduleWindow, enable: boolean) => {
    setBusy(`window:${window.task}`)
    try {
      await saveWindows(windows.map((item) => item.task === window.task ? { ...item, enable } : item))
      await api.setField(instance, window.task, "scheduler", "enable", "boolean", enable)
      await load()
    } catch { /* 错误已在 saveWindows 中显示 */ } finally {
      setBusy(undefined)
    }
  }

  const removeWindow = async (window: ScheduleWindow) => {
    setBusy(`remove:${window.task}`)
    try {
      await saveWindows(windows.filter((item) => item !== window))
      await api.setField(instance, window.task, "scheduler", "enable", "boolean", false)
      setSelected(undefined)
      await load()
    } catch { /* ignore */ } finally {
      setBusy(undefined)
    }
  }

  const addWindow = async () => {
    if (!newTask) return
    const window: ScheduleWindow = { task: newTask, enable: true, start: "19:00", end: "21:00", lead_minutes: 2, note: "" }
    setBusy("add")
    try {
      await saveWindows([...windows, window])
      await api.setField(instance, newTask, "scheduler", "enable", "boolean", true)
      setAdding(false)
      setNewTask("")
      setSelected(window)
      await load()
    } catch { /* ignore */ } finally {
      setBusy(undefined)
    }
  }

  const enableAll = async () => {
    setBusy("all")
    try {
      await saveWindows(windows.map((item) => ({ ...item, enable: true })))
      for (const item of windows) {
        await api.setField(instance, item.task, "scheduler", "enable", "boolean", true)
      }
      onChanged?.()
      await load()
    } catch { /* ignore */ } finally {
      setBusy(undefined)
    }
  }

  const controlInstance = async () => {
    const stop = state === 1
    if (stop ? !onStop : !onStart) return
    setBusy("control")
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

  const scheduledDates = useMemo(() => {
    const map = new Map<string, ScheduleWindow[]>()
    for (const window of windows) {
      if (!window.enable) continue
      const date = windowDate(window, summary)
      if (!date) continue
      const list = map.get(date) ?? []
      list.push(window)
      map.set(date, list)
    }
    return map
  }, [windows, summary])

  const upcoming = windows
    .filter((item) => item.enable)
    .filter((item) => minutesUntil(item.start) <= 30 && minutesUntil(item.start) >= 0).length
  const today = isoDate(new Date())
  const todayItems = (scheduledDates.get(today) ?? []).slice().sort((a, b) => a.start.localeCompare(b.start))

  const days = useMemo(() => monthGrid(cursor), [cursor])

  return <div className="space-y-5">
    <section className="subtle-grid relative overflow-hidden rounded-2xl border bg-card p-7">
      <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2"><Badge variant="outline">定时任务</Badge><span className="text-xs text-muted-foreground">CALENDAR · 日历</span></div>
          <h2 className="text-2xl font-semibold tracking-tight">定时任务 · 日历</h2>
          <p className="mt-2 text-sm text-muted-foreground">按日历查看每日活动窗口，窗口开始前会抢占轮询队列。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            {upcoming ? `${upcoming} 个活动即将开启` : "暂无即将开启的活动"}
          </span>
          <Button variant="outline" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}><RefreshCw />回到今天</Button>
          {(onStart || onStop) && <Button size="sm" variant={state === 1 ? "outline" : "default"} disabled={busy === "control"} onClick={() => void controlInstance()}>
            {busy === "control" ? <LoaderCircle className="animate-spin" /> : state === 1 ? <Pause /> : <Play />}
            {state === 1 ? "暂停调度" : "全部启动"}
          </Button>}
          <Button size="sm" onClick={() => void enableAll()} disabled={!windows.length || busy === "all"}>{busy === "all" ? <LoaderCircle className="animate-spin" /> : <Check />}全部启用</Button>
        </div>
      </div>
    </section>

    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="glass">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />{cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月</span>
            <span className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCursor(addMonths(cursor, -1))}><ChevronLeft /></Button>
              <Button variant="ghost" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>今天</Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight /></Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
            {WEEKDAYS.map((day) => <div key={day} className="py-1">{day}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map(({ date, current }) => {
              const key = isoDate(date)
              const items = scheduledDates.get(key) ?? []
              const isToday = key === today
              return <div key={key} className={`min-h-[86px] rounded-lg border p-1.5 ${current ? "bg-background/50" : "bg-background/20 opacity-45"}`}>
                <div className="flex items-center justify-between">
                  <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] ${isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{date.getDate()}</span>
                  {items.length > 1 && <span className="text-[9px] text-muted-foreground">+{items.length}</span>}
                </div>
                <div className="mt-1 space-y-0.5">
                  {items.slice(0, 2).map((item) => <button
                    key={item.task}
                    type="button"
                    onClick={() => setSelected(item)}
                    className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] hover:bg-secondary"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="font-mono text-[9px] text-muted-foreground">{item.start}</span>
                    <span className="truncate">{label(item.task)}</span>
                  </button>)}
                </div>
              </div>
            })}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="glass">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>任务安排</span>
              <span className="flex items-center gap-2 text-[11px] font-normal text-muted-foreground">
                {windows.length} 项
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAdding(true)} title="添加定时任务"><Plus /></Button>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {loading && !windows.length && <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />正在读取</p>}
            {!loading && !windows.length && <p className="rounded-lg border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">还没有定时任务，点右上角 + 添加。</p>}
            {windows.map((item) => <div key={item.task} className="flex items-center gap-2 rounded-lg border bg-background/40 px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <button type="button" className="truncate text-left text-xs font-medium hover:text-primary" onClick={() => setSelected(item)}>{label(item.task)}</button>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.start} - {item.end}{item.lead_minutes > 0 ? ` · 前 ${item.lead_minutes} 分钟抢占` : ""}</p>
              </div>
              <Badge variant={item.enable ? "success" : "secondary"} className="shrink-0 text-[9px]">{item.enable ? "开启" : "关闭"}</Badge>
              <Switch checked={item.enable} disabled={busy === `window:${item.task}`} onCheckedChange={(value) => void toggleWindow(item, value)} />
            </div>)}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>今日待办</span>
              <span className="text-[11px] font-normal text-muted-foreground">{todayItems.length} 项</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {!todayItems.length && <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">今天没有定时任务</p>}
            {todayItems.map((item) => {
              const status = summary[item.task]
              const due = status?.next_run && !status.next_run.startsWith("2023-01-01") ? status.next_run : undefined
              return <button key={item.task} type="button" onClick={() => setSelected(item)} className="flex w-full items-center gap-2 rounded-lg border bg-background/40 px-2.5 py-2 text-left hover:bg-secondary/40">
                <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{label(item.task)}</p>
                  <p className="text-[10px] text-muted-foreground">{due ? formatDateTime(due) : `${item.start} - ${item.end}`}</p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[9px]">待执行</Badge>
              </button>
            })}
          </CardContent>
        </Card>
      </div>
    </div>

    <Dialog open={adding} onOpenChange={setAdding}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>添加定时任务</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Select value={newTask} onValueChange={setNewTask}>
            <SelectTrigger><SelectValue placeholder="选择任务" /></SelectTrigger>
            <SelectContent>
              {Object.entries(menu).flatMap(([category, tasks]) => tasks
                .filter((task) => !["Script", "Restart", "GlobalGame"].includes(task))
                .filter((task) => !windows.some((item) => item.task === task))
                .map((task) => <SelectItem key={task} value={task}>{label(category)} · {label(task)}</SelectItem>))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">默认窗口 19:00 - 21:00，添加后可点任务修改。</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAdding(false)}>取消</Button>
          <Button disabled={!newTask || busy === "add"} onClick={() => void addWindow()}>{busy === "add" && <LoaderCircle className="animate-spin" />}添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ScheduleWindowDialog
      instance={instance}
      window={selected}
      translations={translations}
      summary={summary}
      onClose={() => setSelected(undefined)}
      onSave={async (next) => {
        await saveWindows(windows.map((item) => item.task === selected?.task ? next : item))
        await api.setField(instance, next.task, "scheduler", "enable", "boolean", next.enable)
        setSelected(undefined)
        await load()
      }}
      onRemove={async () => { if (selected) await removeWindow(selected) }}
      onRun={async () => {
        if (!selected) return
        await api.runTask(instance, selected.task)
        onChanged?.()
      }}
    />
  </div>
}

function ScheduleWindowDialog({ instance, window, translations, summary, onClose, onSave, onRemove, onRun }: {
  instance: string
  window?: ScheduleWindow
  translations: TranslationMap
  summary: SchedulePayload["summary"]
  onClose: () => void
  onSave: (window: ScheduleWindow) => Promise<void>
  onRemove: () => Promise<void>
  onRun: () => Promise<void>
}) {
  const [draft, setDraft] = useState<ScheduleWindow>()
  const [busy, setBusy] = useState<string>()

  useEffect(() => { setDraft(window ? { ...window } : undefined) }, [window])

  if (!draft) return null
  const status = summary[draft.task]
  const taskName = translate(draft.task, translations)
  const nextRun = status?.next_run && !status.next_run.startsWith("2023-01-01") ? status.next_run : undefined

  const act = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    try { await action() } finally { setBusy(undefined) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">任务详情 · {instance}</span>
          <Badge variant={draft.enable ? "success" : "secondary"} className="text-[9px]">{draft.enable ? "启用中" : "已关闭"}</Badge>
        </div>
        <DialogTitle className="text-xl">{taskName}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="rounded-lg border bg-background/40 p-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>每日窗口</span><span>每日</span></div>
          <div className="mt-2 flex items-center gap-2">
            <Input type="time" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} />
            <span className="text-muted-foreground">-</span>
            <Input type="time" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">下次开启 {nextRun ? formatDateTime(nextRun) : `${draft.start}（窗口内无排队任务）`}</p>
        </div>

        <div className="space-y-2">
          <Row label="抢占规则" value={`窗口前 ${draft.lead_minutes} 分钟中断轮询`} />
          <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
            <span className="text-xs text-muted-foreground">抢占提前量</span>
            <div className="flex items-center gap-1.5">
              <Input type="number" min={0} max={60} className="h-8 w-20" value={draft.lead_minutes} onChange={(event) => setDraft({ ...draft, lead_minutes: Number(event.target.value) })} />
              <span className="text-[11px] text-muted-foreground">分钟</span>
            </div>
          </div>
          <Row label="关联任务" value={taskName} />
          <Row label="最近执行" value={nextRun ? `下次 ${formatDateTime(nextRun)}` : "暂无计划"} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">启用窗口</span>
            <Switch checked={draft.enable} onCheckedChange={(value) => setDraft({ ...draft, enable: value })} />
          </div>
        </div>
      </div>

      <DialogFooter className="flex-wrap items-center justify-between gap-2 sm:justify-between">
        <span className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void act("remove", onRemove)} disabled={busy !== undefined}><Trash2 />{busy === "remove" ? "关闭中…" : "关闭任务"}</Button>
          <Button variant="ghost" size="sm" onClick={() => void act("run", onRun)} disabled={busy !== undefined}><Play />{busy === "run" ? "已提交" : "立即执行"}</Button>
        </span>
        <span className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={() => void act("save", () => onSave(draft))} disabled={busy !== undefined}>
            {busy === "save" ? <LoaderCircle className="animate-spin" /> : <Check />}保存窗口
          </Button>
        </span>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="truncate text-xs">{value}</span>
  </div>
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function windowDate(window: ScheduleWindow, summary: SchedulePayload["summary"]) {
  const status = summary[window.task]
  if (!status?.enable) return null
  const nextRun = status.next_run
  if (!nextRun || nextRun.startsWith("2023-01-01")) return isoDate(new Date())
  return nextRun.slice(0, 10)
}

function monthGrid(cursor: Date) {
  const first = startOfMonth(cursor)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    return { date, current: date.getMonth() === cursor.getMonth() }
  })
  return cells
}

function minutesUntil(time: string) {
  const [hour, minute] = time.split(":").map(Number)
  const now = new Date()
  return hour * 60 + minute - (now.getHours() * 60 + now.getMinutes())
}
