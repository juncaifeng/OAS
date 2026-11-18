import { useEffect, useRef, useState } from "react"
import { Activity, Clock3, ListTodo, Play, RefreshCw, Square, Trash2, Wifi, WifiOff } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { translate, type TranslationMap } from "@/lib/i18n"
import { formatDateTime } from "@/lib/utils"
import type { ScheduleData } from "@/types"

interface DashboardProps {
  instance: string
  version?: string
  translations: TranslationMap
  state: number
  connected: boolean
  schedule?: ScheduleData
  logs: string[]
  onStart: () => Promise<void>
  onStop: () => Promise<void>
  onRestart: () => Promise<void>
  onReloadLogs: () => Promise<void>
  onClearLogs: () => void
}

export function Dashboard({ instance, version, translations, state, connected, schedule, logs, onStart, onStop, onRestart, onReloadLogs, onClearLogs }: DashboardProps) {
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const logEnd = useRef<HTMLDivElement>(null)
  const running = state === 1
  const warning = state === 2
  const updating = state === 3
  const active = running || updating
  const runningTask = schedule?.running && "name" in schedule.running ? schedule.running.name : undefined
  const nextTask = schedule?.pending[0] ?? schedule?.waiting[0]

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  const act = async (action: () => Promise<void>) => {
    setBusy(true)
    setActionError(undefined)
    try { await action() } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <section className="subtle-grid relative overflow-hidden rounded-2xl border bg-card p-7">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex items-end justify-between gap-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Badge variant={running ? "success" : warning ? "destructive" : "secondary"}>{stateLabel(state)}</Badge>
              <span className="text-xs text-muted-foreground">{version ? `FastAPI v${version}` : "正在连接 FastAPI"}</span>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight">{instance}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {warning ? "调度进程已异常退出，重启实例即可恢复调度。"
                : runningTask ? `正在执行 ${translate(runningTask, translations)}`
                : active ? "调度器正在等待下一个任务。"
                : "自动化调度已就绪，选择任务或启动实例。"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {running && <Button size="lg" variant="outline" disabled={busy || !connected} onClick={() => void act(onRestart)}><RefreshCw />重启实例</Button>}
            <Button size="lg" variant={active ? "outline" : "default"} disabled={busy || !connected} onClick={() => void act(warning ? onRestart : active ? onStop : onStart)}>
              {active ? <Square /> : warning ? <RefreshCw /> : <Play />}{warning ? "重启实例" : active ? "停止实例" : "启动实例"}
            </Button>
          </div>
        </div>
        {actionError && <p className="relative mt-4 text-sm text-destructive">{actionError}</p>}
        {warning && <p className="relative mt-4 text-sm text-destructive">实例进程已退出（可能触发了连续失败保护），请查看日志与错误截图后再重启。</p>}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<Activity />} label="当前任务" value={warning ? "进程已退出" : runningTask ? translate(runningTask, translations) : "空闲"} detail={running ? "实例正在运行" : warning ? "请重启实例" : "没有正在执行的任务"} />
        <MetricCard icon={<ListTodo />} label="等待执行" value={String(schedule?.pending.length ?? 0)} detail="已到计划时间的任务" />
        <MetricCard icon={<Clock3 />} label="下次计划" value={formatDateTime(nextTask?.next_run)} detail={nextTask ? translate(nextTask.name, translations) : "暂无未来任务"} />
      </div>

      <div className="grid min-h-[420px] gap-6 xl:grid-cols-[1fr_1.15fr]">
        <Card className="glass">
          <CardHeader><CardTitle className="text-base">任务队列</CardTitle><CardDescription>由 FastAPI 调度器实时推送</CardDescription></CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px] pr-3">
              <div className="space-y-2">
                {[...(schedule?.pending ?? []), ...(schedule?.waiting ?? [])].slice(0, 30).map((task, index) => (
                  <div key={`${task.name}-${task.next_run}-${index}`} className="flex items-center justify-between rounded-lg border bg-background/40 px-4 py-3">
                    <div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-xs text-muted-foreground">{index + 1}</span><span className="text-sm font-medium">{translate(task.name, translations)}</span></div>
                    <span className="text-xs text-muted-foreground">{formatDateTime(task.next_run)}</span>
                  </div>
                ))}
                {!schedule?.pending.length && !schedule?.waiting.length && <Empty text="连接实例后显示任务队列" />}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="glass overflow-hidden">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle className="text-base">运行日志</CardTitle><CardDescription className="mt-1.5 flex items-center gap-1.5">{connected ? <Wifi className="h-3.5 w-3.5 text-primary" /> : <WifiOff className="h-3.5 w-3.5" />}{connected ? "WebSocket 已连接" : "WebSocket 重连中"}</CardDescription></div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => void onReloadLogs()}><RefreshCw />载入历史</Button>
              <Button variant="ghost" size="sm" onClick={onClearLogs}><Trash2 />清空</Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px] rounded-lg border bg-black/40 p-4 font-mono text-xs leading-5">
              {logs.map((log, index) => <div key={index} className="whitespace-pre-wrap break-words text-zinc-300"><span className="mr-2 select-none text-zinc-600">{String(index + 1).padStart(3, "0")}</span>{log}</div>)}
              {!logs.length && <Empty text="暂无日志，启动实例后此处会显示输出" />}
              <div ref={logEnd} />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function stateLabel(state: number) {
  if (state === 1) return "运行中"
  if (state === 2) return "异常退出"
  if (state === 3) return "更新中"
  return "待命中"
}

function MetricCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <Card className="glass"><CardContent className="flex items-center gap-4 p-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">{icon}</div><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate text-lg font-semibold">{value}</p><p className="truncate text-xs text-muted-foreground">{detail}</p></div></CardContent></Card>
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">{text}</div>
}
