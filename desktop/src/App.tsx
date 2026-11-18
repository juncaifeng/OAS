import { useCallback, useEffect, useState } from "react"
import { Bot, CalendarClock, CirclePlus, LayoutDashboard, ListChecks, LoaderCircle, Lock, PenTool, Plug, Settings, Sparkles } from "lucide-react"
import { AnnotatorView } from "@/components/annotator-view"
import { Dashboard } from "@/components/dashboard"
import { DeviceGate, DeviceView } from "@/components/device-view"
import { InstanceManager } from "@/components/instance-manager"
import { SettingsView } from "@/components/settings-view"
import { TaskOverview } from "@/components/task-overview"
import { TaskWorkspace } from "@/components/task-workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useBackend } from "@/hooks/use-backend"
import { useDeviceStatus } from "@/hooks/use-device-status"
import { useInstanceStream } from "@/hooks/use-instance-stream"
import { api } from "@/lib/api"
import type { TranslationMap } from "@/lib/i18n"
import type { ScriptMenu } from "@/types"

type Page = "overview" | "devices" | "schedule" | "tasks" | "tools" | "settings"

const navigation = [
  { id: "overview" as const, label: "运行总览", icon: LayoutDashboard },
  { id: "devices" as const, label: "设备连接", icon: Plug },
  { id: "schedule" as const, label: "任务总览", icon: CalendarClock },
  { id: "tasks" as const, label: "任务配置", icon: ListChecks },
  { id: "tools" as const, label: "素材标注", icon: PenTool },
  { id: "settings" as const, label: "应用设置", icon: Settings },
]

function instanceBadge(state: number) {
  if (state === 1) return { variant: "success" as const, label: "实例运行中" }
  if (state === 2) return { variant: "destructive" as const, label: "实例异常退出" }
  if (state === 3) return { variant: "secondary" as const, label: "实例更新中" }
  return { variant: "secondary" as const, label: "实例未运行" }
}

export default function App() {
  const [page, setPage] = useState<Page>("overview")
  const [configs, setConfigs] = useState<string[]>([])
  const [instance, setInstance] = useState("")
  const [menu, setMenu] = useState<ScriptMenu>({})
  const [translations, setTranslations] = useState<TranslationMap>({})
  const [selectedTask, setSelectedTask] = useState("")
  const [loadError, setLoadError] = useState<string>()
  const backend = useBackend()
  const stream = useInstanceStream(instance)
  const device = useDeviceStatus(instance, 5000)
  const deviceStatus = device.status
  // 设备心跳是任务配置的前置条件；首次探测完成前不锁，避免启动闪烁
  const deviceLocked = Boolean(instance) && Boolean(deviceStatus) && !deviceStatus?.ready

  const load = useCallback(async () => {
    setLoadError(undefined)
    try {
      const [configList, scriptMenu, translationMap] = await Promise.all([api.configs(), api.menu(), api.translations()])
      setConfigs(configList)
      setInstance((current) => current && configList.includes(current) ? current : configList[0] ?? "")
      setMenu(scriptMenu)
      setTranslations(translationMap)
      const firstTask = scriptMenu.Script?.[0] ?? Object.values(scriptMenu)[0]?.[0] ?? ""
      setSelectedTask((current) => current || firstTask)
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [])

  const reloadConfigs = useCallback(async (preferred?: string) => {
    const list = await api.configs()
    setConfigs(list)
    setInstance((current) => {
      if (preferred && list.includes(preferred)) return preferred
      if (current && list.includes(current)) return current
      return list[0] ?? ""
    })
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("light", localStorage.getItem("oas-theme") === "light")
  }, [])

  useEffect(() => {
    if (backend.health) void load()
  }, [backend.health, load])

  const activeLabel = navigation.find((item) => item.id === page)?.label
  const badge = instanceBadge(stream.state)

  return <div className="flex h-screen overflow-hidden bg-background">
    <aside className="flex w-[248px] shrink-0 flex-col border-r bg-card/60">
      <div className="flex h-[76px] items-center gap-3 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/15"><Bot className="h-5 w-5" /></div>
        <div><div className="flex items-center gap-1.5 font-semibold tracking-wide">OAS <Sparkles className="h-3.5 w-3.5 text-primary" /></div><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Onmyoji Auto Script</p></div>
      </div>
      <Separator />
      <div className="space-y-2 p-4">
        <Label className="text-xs text-muted-foreground">当前实例</Label>
        <div className="flex gap-2">
          <Select value={instance} onValueChange={setInstance} disabled={!configs.length}><SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="暂无实例" /></SelectTrigger><SelectContent>{configs.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
          <CreateConfig configs={configs} onCreated={(name) => { setInstance(name); void reloadConfigs(name) }} />
          <InstanceManager instance={instance} onRenamed={(_oldName, newName) => { setInstance(newName); void reloadConfigs(newName) }} onDeleted={() => { void reloadConfigs() }} />
        </div>
      </div>
      <nav className="space-y-1 px-3 py-2">
        {navigation.map((item) => {
          const locked = deviceLocked && (item.id === "schedule" || item.id === "tasks")
          return <button
            key={item.id}
            disabled={locked}
            title={locked ? "设备心跳未通过，请先在「设备连接」完成绑定" : undefined}
            onClick={() => setPage(item.id)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${locked ? "cursor-not-allowed text-muted-foreground/50" : page === item.id ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {locked && <Lock className="ml-auto h-3.5 w-3.5" />}
            {!locked && page === item.id && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
          </button>
        })}
      </nav>
      <div className="mt-auto p-4">
        <div className="rounded-xl border bg-background/40 p-4">
          <div className="flex items-center gap-2 text-xs font-medium"><span className={`h-2 w-2 rounded-full ${backend.health ? "bg-primary" : "bg-amber-500"}`} />{backend.health ? "后端服务正常" : "正在启动后端"}</div>
          <p className="mt-2 truncate text-[11px] text-muted-foreground">{backend.backend?.port ? `127.0.0.1:${backend.backend.port}` : "Tauri + FastAPI"}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{backend.health ? `Version ${backend.health.version}` : "首次启动可能需要片刻"}</p>
        </div>
      </div>
    </aside>

    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-[76px] shrink-0 items-center justify-between border-b px-7">
        <div><h1 className="text-lg font-semibold">{activeLabel}</h1><p className="mt-0.5 text-xs text-muted-foreground">阴阳师自动化控制台</p></div>
        <div className="flex items-center gap-3"><Badge variant={badge.variant}>{badge.label}</Badge><span className="text-xs text-muted-foreground">{instance || "未选择实例"}</span></div>
      </header>
      {(loadError || backend.error) && <div className="mx-7 mt-4 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"><span className="truncate">{loadError ?? backend.error}</span><Button variant="ghost" size="sm" onClick={() => { void backend.refresh(); void load() }}>重试</Button></div>}
      <div className={`min-h-0 flex-1 overflow-y-auto ${page === "tools" ? "p-0" : "p-7"}`}>
        {page === "tools" ? <AnnotatorView backendPort={backend.backend?.port} /> : !instance && !loadError ? <div className="flex h-full items-center justify-center"><LoaderCircle className="h-6 w-6 animate-spin text-primary" /></div> : <>
          {page === "overview" && <Dashboard instance={instance} version={backend.health?.version} translations={translations} state={stream.state} connected={stream.connected} schedule={stream.schedule} logs={stream.logs} onStart={stream.start} onStop={stream.stop} onRestart={stream.restart} onReloadLogs={stream.reloadLogs} onClearLogs={stream.clearLogs} onOpenDevices={() => setPage("devices")} deviceStatus={deviceStatus} deviceError={device.error} />}
          {page === "devices" && <DeviceView instance={instance} onRestart={stream.restart} status={deviceStatus} statusError={device.error} refreshStatus={device.refresh} />}
          {page === "schedule" && (deviceLocked
            ? <DeviceGate status={deviceStatus} onOpenDevices={() => setPage("devices")} />
            : <TaskOverview instance={instance} menu={menu} translations={translations} state={stream.state} onChanged={stream.refreshSchedule} onConfigure={(task) => { setSelectedTask(task); setPage("tasks") }} />)}
          {page === "tasks" && (deviceLocked
            ? <DeviceGate status={deviceStatus} onOpenDevices={() => setPage("devices")} />
            : <TaskWorkspace instance={instance} menu={menu} translations={translations} selectedTask={selectedTask} onSelectTask={setSelectedTask} />)}
          {page === "settings" && <SettingsView instance={instance} backend={backend.backend} health={backend.health} restarting={backend.restarting} onRestart={backend.restart} />}
        </>}
      </div>
    </main>
  </div>
}

function CreateConfig({ configs, onCreated }: { configs: string[]; onCreated: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [template, setTemplate] = useState("template")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const prepare = async () => {
    setError(undefined)
    setTemplate("template")
    try { setName(await api.newConfigName()) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const create = async () => {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) { setError("名称只能包含字母、数字、下划线和连字符"); return }
    if (configs.includes(name)) { setError("该实例名称已存在"); return }
    setBusy(true)
    setError(undefined)
    try { onCreated(await api.createConfig(name, template)); setOpen(false) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (value) void prepare() }}>
    <DialogTrigger asChild><Button variant="outline" size="icon" title="新建实例"><CirclePlus /></Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>新建自动化实例</DialogTitle><DialogDescription>从模板或现有实例复制一份独立配置。</DialogDescription></DialogHeader>
      <div className="space-y-3 py-3">
        <div className="space-y-2"><Label htmlFor="config-name">实例名称</Label><Input id="config-name" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void create() }} placeholder="oas1" /></div>
        <div className="space-y-2"><Label htmlFor="config-template">复制来源</Label>
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger id="config-template"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="template">默认模板（template）</SelectItem>
              {configs.map((item) => <SelectItem key={item} value={item}>复制自 {item}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button disabled={busy || !name} onClick={() => void create()}>{busy && <LoaderCircle className="animate-spin" />}创建实例</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
