import { useEffect, useRef, useState } from "react"
import { Activity, Clock3, ListTodo, Play, Square, Trash2, Wifi, WifiOff } from "lucide-react"
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
  onClearLogs: () => void
}

export function Dashboard({ instance, version, translations, state, connected, schedule, logs, onStart, onStop, onClearLogs }: DashboardProps) {
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const logEnd = useRef<HTMLDivElement>(null)
  const running = state === 1
  const runningTask = schedule?.running && "name" in schedule.running ? schedule.running.name : undefined

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
              <Badge variant={running ? "success" : "secondary"}>{running ? "运行中" : "待命中"}</Badge>
              <span className="text-xs text-muted-foreground">{version ? `FastAPI v${version}` : "正在连接 FastAPI"}</span>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight">{instance}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {runningTask ? `正在执行 ${translate(runningTask, translations)}` : "自动化调度已就绪，选择任务或启动实例。"}
            </p>
          </div>
          <Button size="lg" variant={running ? "outline" : "default"} disabled={busy || !connected} onClick={() => void act(running ? onStop : onStart)}>
            {running ? <Square /> : <Play />}{running ? "停止实例" : "启动实例"}
          </Button>
        </div>
        {actionError && <p className="relative mt-4 text-sm text-destructive">{actionError}</p>}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<Activity />} label="当前任务" value={runningTask ? translate(runningTask, translations) : "空闲"} detail={running ? "实例正在运行" : "没有正在执行的任务"} />
        <MetricCard icon={<ListTodo />} label="等待执行" value={String(schedule?.pending.length ?? 0)} detail="已到计划时间的任务" />
        <MetricCard icon={<Clock3 />} label="下次计划" value={formatDateTime(schedule?.waiting[0]?.next_run)} detail={schedule?.waiting[0] ? translate(schedule.waiting[0].name, translations) : "暂无未来任务"} />
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
            <Button variant="ghost" size="sm" onClick={onClearLogs}><Trash2 />清空</Button>
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

function MetricCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <Card className="glass"><CardContent className="flex items-center gap-4 p-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">{icon}</div><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate text-lg font-semibold">{value}</p><p className="truncate text-xs text-muted-foreground">{detail}</p></div></CardContent></Card>
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">{text}</div>
}
