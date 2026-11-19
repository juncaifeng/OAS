import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, Download, LoaderCircle, RefreshCw, Timer, TrendingDown, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { downloadStats, api } from "@/lib/api"
import { translate, type TranslationMap } from "@/lib/i18n"
import type { StatsPayload } from "@/types"

interface StatsViewProps {
  instance: string
  translations: TranslationMap
}

const RANGES = [
  { key: "today", label: "今日" },
  { key: "yesterday", label: "昨日" },
  { key: "7d", label: "近 7 天" },
]

const TASK_COLORS = ["text-primary", "text-emerald-400", "text-indigo-400", "text-amber-400", "text-rose-400", "text-sky-400"]
const BAR_COLORS = ["bg-primary", "bg-emerald-400", "bg-indigo-400", "bg-amber-400", "bg-rose-400", "bg-sky-400"]

/** 今日大盘：执行次数、成功率、用时分布、任务排行、异常与跳过。 */
export function StatsView({ instance, translations }: StatsViewProps) {
  const [range, setRange] = useState("today")
  const [data, setData] = useState<StatsPayload>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [updatedAt, setUpdatedAt] = useState<string>("--:--")
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async (initial = false) => {
    if (!instance) return
    if (initial) setLoading(true)
    try {
      setData(await api.stats(instance, range))
      setUpdatedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }))
      setError(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (initial) setLoading(false)
    }
  }, [instance, range])

  useEffect(() => {
    setData(undefined)
    void load(true)
    const timer = window.setInterval(() => void load(), 30000)
    return () => window.clearInterval(timer)
  }, [load])

  const exportReport = async () => {
    setExporting(true)
    setError(undefined)
    try {
      await downloadStats(instance, range)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setExporting(false)
    }
  }

  const metrics = data?.metrics
  const hourly = data?.hourly ?? Array(24).fill(0)
  const peakHour = hourly.indexOf(Math.max(...hourly))
  const maxHourly = Math.max(1, ...hourly)
  const durationSlices = useMemo(() => {
    const tasks = [...(data?.tasks ?? [])].sort((a, b) => b.seconds - a.seconds)
    const total = tasks.reduce((sum, task) => sum + task.seconds, 0)
    if (!total) return []
    const top = tasks.slice(0, 4)
    const restSeconds = tasks.slice(4).reduce((sum, task) => sum + task.seconds, 0)
    const slices = top.map((task, index) => ({
      label: translate(task.task, translations),
      seconds: task.seconds,
      percent: Math.round(task.seconds / total * 100),
      color: TASK_COLORS[index % TASK_COLORS.length],
    }))
    if (restSeconds > 0) {
      slices.push({ label: "其他", seconds: restSeconds, percent: Math.round(restSeconds / total * 100), color: "text-muted-foreground" })
    }
    return slices
  }, [data, translations])

  return <div className="space-y-5">
    <section className="subtle-grid relative overflow-hidden rounded-2xl border bg-card p-7">
      <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2"><Badge variant="outline">大盘</Badge><span className="text-xs text-muted-foreground">OVERVIEW</span></div>
          <h2 className="text-2xl font-semibold tracking-tight">{range === "today" ? "今日大盘" : range === "yesterday" ? "昨日大盘" : "近 7 天大盘"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">任务执行情况、用时分布与次数统计。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">更新于 {updatedAt}</span>
          <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
            {RANGES.map((item) => <button
              key={item.key}
              type="button"
              onClick={() => setRange(item.key)}
              className={`rounded-md px-2.5 py-1 text-xs ${range === item.key ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground"}`}
            >{item.label}</button>)}
          </div>
          <Button variant="outline" size="sm" onClick={() => void load(true)}><RefreshCw className={loading ? "animate-spin" : ""} />刷新</Button>
          <Button size="sm" onClick={() => void exportReport()} disabled={exporting}>{exporting ? <LoaderCircle className="animate-spin" /> : <Download />}导出报表</Button>
        </div>
      </div>
    </section>

    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Metric icon={<BarChart3 className="h-3.5 w-3.5" />} label="执行次数" value={metrics ? String(metrics.runs) : "--"} unit="次" detail={metrics ? `失败 ${metrics.failures} 次` : "等待数据"} />
      <Metric icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="成功率" value={metrics ? metrics.success_rate.toFixed(1) : "--"} unit="%" detail={metrics ? `失败 ${metrics.failures} 次 · 跳过 ${metrics.skips} 次` : "等待数据"} />
      <Metric icon={<Clock3 className="h-3.5 w-3.5" />} label="总用时" value={metrics ? formatSeconds(metrics.total_seconds) : "--"} detail={metrics && metrics.runs ? `平均 ${formatSeconds(Math.round(metrics.total_seconds / metrics.runs))}/次` : "等待数据"} />
      <Metric icon={<Timer className="h-3.5 w-3.5" />} label="定时 / 轮询" value={metrics ? `${metrics.scheduled} / ${metrics.loop}` : "--"} detail={metrics && (metrics.scheduled + metrics.loop) ? `定时任务占 ${Math.round(metrics.scheduled / Math.max(1, metrics.scheduled + metrics.loop) * 100)}%` : "等待数据"} />
      <Metric icon={<AlertTriangle className="h-3.5 w-3.5" />} label="异常与跳过" value={metrics ? String(metrics.skips + metrics.failures) : "--"} unit="次" detail="窗口外、探针未满足、执行失败" />
    </div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
      <Card className="glass">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />每小时执行次数</span>
            <span className="text-[11px] font-normal text-muted-foreground">共 {metrics?.runs ?? 0} 次 · 峰值 {peakHour < 0 ? "--" : `${String(peakHour).padStart(2, "0")}:00`}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[180px] items-end gap-1.5">
            {hourly.map((count, hour) => {
              const height = count ? Math.max(4, Math.round(count / maxHourly * 100)) : 2
              const peak = count > 0 && count === maxHourly
              return <div key={hour} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${hour}:00 · ${count} 次`}>
                <div className={`w-full rounded-sm ${peak ? "bg-primary" : count ? "bg-primary/35" : "bg-secondary/60"}`} style={{ height: `${height}%` }} />
                <span className="text-[9px] text-muted-foreground">{hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}</span>
              </div>
            })}
          </div>
          {metrics && metrics.runs === 0 && <p className="mt-3 text-center text-xs text-muted-foreground">还没有运行记录，启动实例后开始统计。</p>}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>用时分布</span>
            <span className="text-[11px] font-normal text-muted-foreground">总用时 {formatSeconds(metrics?.total_seconds ?? 0)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-2">
            <Donut slices={durationSlices} total={formatSeconds(metrics?.total_seconds ?? 0)} />
          </div>
          <div className="mt-3 space-y-1.5">
            {!durationSlices.length && <p className="py-4 text-center text-xs text-muted-foreground">暂无用时数据</p>}
            {durationSlices.map((slice) => <div key={slice.label} className="flex items-center gap-2 text-[11px]">
              <span className={`h-1.5 w-1.5 rounded-full bg-current ${slice.color}`} />
              <span className="min-w-0 flex-1 truncate">{slice.label}</span>
              <span className="font-mono text-muted-foreground">{formatSeconds(slice.seconds)}</span>
              <span className="w-9 text-right text-muted-foreground">{slice.percent}%</span>
            </div>)}
          </div>
        </CardContent>
      </Card>
    </div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="glass">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />任务次数排行</span>
            <span className="text-[11px] font-normal text-muted-foreground">共 {metrics?.runs ?? 0} 次 · {data?.tasks.length ?? 0} 个任务</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!data?.tasks.length && <p className="py-10 text-center text-xs text-muted-foreground">暂无任务记录</p>}
          {data?.tasks.map((task, index) => {
            const max = Math.max(1, ...(data.tasks.map((item) => item.count)))
            return <div key={task.task} className="grid grid-cols-[minmax(90px,130px)_minmax(0,1fr)_44px_64px_52px] items-center gap-2 text-[11px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-sm ${BAR_COLORS[index % BAR_COLORS.length]}`} />
                <span className="truncate">{translate(task.task, translations)}</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded bg-secondary/70">
                <span className={`block h-full rounded ${BAR_COLORS[index % BAR_COLORS.length]}`} style={{ width: `${Math.max(3, Math.round(task.count / max * 100))}%` }} />
              </span>
              <span className="text-right font-mono">{task.count}</span>
              <span className="text-right font-mono text-muted-foreground">{formatSeconds(task.seconds)}</span>
              <span className={`text-right font-mono ${task.success_rate >= 100 ? "text-emerald-400" : task.success_rate >= 80 ? "text-amber-400" : "text-destructive"}`}>{task.success_rate}%</span>
            </div>
          })}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-amber-400" />异常与跳过</span>
            <span className="text-[11px] font-normal text-muted-foreground">共 {(data?.exceptions.length ?? 0)} 条</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {!data?.exceptions.length && <p className="py-8 text-center text-xs text-muted-foreground">没有异常或跳过记录</p>}
          {data?.exceptions.map((item, index) => <div key={`${item.time}-${index}`} className="flex items-center gap-2 rounded-lg border bg-background/40 px-2.5 py-2">
            <span className="w-12 shrink-0 font-mono text-[10px] text-muted-foreground">{formatTime(item.time)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{item.task ? translate(item.task, translations) : "实例"}</p>
              <p className="truncate text-[10px] text-muted-foreground">{item.reason}</p>
            </div>
            <Badge variant={item.kind === "skip" ? "secondary" : "destructive"} className="shrink-0 text-[9px]">{item.kind === "skip" ? "跳过" : "失败"}</Badge>
          </div>)}
        </CardContent>
      </Card>
    </div>
  </div>
}

function Metric({ icon, label, value, unit, detail }: { icon: ReactNode; label: string; value: string; unit?: string; detail: string }) {
  return <Card className="glass"><CardContent className="p-4">
    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{icon}{label}</p>
    <p className="mt-1 truncate text-2xl font-semibold">{value}<span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span></p>
    <p className="mt-1 truncate text-[10px] text-muted-foreground">{detail}</p>
  </CardContent></Card>
}

function Donut({ slices, total }: { slices: Array<{ label: string; percent: number; color: string }>; total: string }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return <div className="relative h-[150px] w-[150px]">
    <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
      <circle cx="70" cy="70" r={radius} fill="none" strokeWidth="16" className="stroke-secondary/60" />
      {slices.map((slice) => {
        const length = circumference * slice.percent / 100
        const dash = `${length} ${circumference - length}`
        const item = <circle
          key={slice.label}
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          strokeWidth="16"
          strokeLinecap="butt"
          strokeDasharray={dash}
          strokeDashoffset={-offset}
          className={`stroke-current ${slice.color}`}
        />
        offset += length
        return item
      })}
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <span className="font-mono text-lg font-semibold">{total}</span>
      <span className="text-[10px] text-muted-foreground">总用时</span>
    </div>
  </div>
}

function formatSeconds(seconds: number) {
  if (!seconds) return "0m"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function formatTime(value: string | null) {
  if (!value) return "--:--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--:--"
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}
