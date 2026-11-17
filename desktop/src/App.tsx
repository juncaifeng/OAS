import { useCallback, useEffect, useState } from "react"
import { Bot, CirclePlus, LayoutDashboard, ListChecks, LoaderCircle, Settings, Sparkles } from "lucide-react"
import { Dashboard } from "@/components/dashboard"
import { SettingsView } from "@/components/settings-view"
import { TaskWorkspace } from "@/components/task-workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useBackend } from "@/hooks/use-backend"
import { useInstanceStream } from "@/hooks/use-instance-stream"
import { api } from "@/lib/api"
import type { ScriptMenu } from "@/types"

type Page = "overview" | "tasks" | "settings"

const navigation = [
  { id: "overview" as const, label: "运行总览", icon: LayoutDashboard },
  { id: "tasks" as const, label: "任务配置", icon: ListChecks },
  { id: "settings" as const, label: "应用设置", icon: Settings },
]

export default function App() {
  const [page, setPage] = useState<Page>("overview")
  const [configs, setConfigs] = useState<string[]>([])
  const [instance, setInstance] = useState("")
  const [menu, setMenu] = useState<ScriptMenu>({})
  const [selectedTask, setSelectedTask] = useState("")
  const [loadError, setLoadError] = useState<string>()
  const backend = useBackend()
  const stream = useInstanceStream(instance)

  const load = useCallback(async () => {
    setLoadError(undefined)
    try {
      const [configList, scriptMenu] = await Promise.all([api.configs(), api.menu()])
      setConfigs(configList)
      setInstance((current) => current && configList.includes(current) ? current : configList[0] ?? "")
      setMenu(scriptMenu)
      const firstTask = scriptMenu.Script?.[0] ?? Object.values(scriptMenu)[0]?.[0] ?? ""
      setSelectedTask((current) => current || firstTask)
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("light", localStorage.getItem("oas-theme") === "light")
  }, [])

  useEffect(() => {
    if (backend.health) void load()
  }, [backend.health, load])

  const activeLabel = navigation.find((item) => item.id === page)?.label

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
          <CreateConfig onCreated={(name) => { setConfigs((current) => [...current, name].sort()); setInstance(name) }} />
        </div>
      </div>
      <nav className="space-y-1 px-3 py-2">
        {navigation.map((item) => <button key={item.id} onClick={() => setPage(item.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${page === item.id ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}><item.icon className="h-4 w-4" />{item.label}{page === item.id && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}</button>)}
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
        <div className="flex items-center gap-3"><Badge variant={stream.state === 1 ? "success" : "secondary"}>{stream.state === 1 ? "实例运行中" : "实例未运行"}</Badge><span className="text-xs text-muted-foreground">{instance || "未选择实例"}</span></div>
      </header>
      {(loadError || backend.error) && <div className="mx-7 mt-4 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"><span className="truncate">{loadError ?? backend.error}</span><Button variant="ghost" size="sm" onClick={() => { void backend.refresh(); void load() }}>重试</Button></div>}
      <div className="min-h-0 flex-1 overflow-y-auto p-7">
        {!instance && !loadError ? <div className="flex h-full items-center justify-center"><LoaderCircle className="h-6 w-6 animate-spin text-primary" /></div> : <>
          {page === "overview" && <Dashboard instance={instance} version={backend.health?.version} state={stream.state} connected={stream.connected} schedule={stream.schedule} logs={stream.logs} onStart={stream.start} onStop={stream.stop} onClearLogs={stream.clearLogs} />}
          {page === "tasks" && <TaskWorkspace instance={instance} menu={menu} selectedTask={selectedTask} onSelectTask={setSelectedTask} />}
          {page === "settings" && <SettingsView backend={backend.backend} health={backend.health} restarting={backend.restarting} onRestart={backend.restart} />}
        </>}
      </div>
    </main>
  </div>
}

function CreateConfig({ onCreated }: { onCreated: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const prepare = async () => {
    setError(undefined)
    try { setName(await api.newConfigName()) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const create = async () => {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) { setError("名称只能包含字母、数字、下划线和连字符"); return }
    setBusy(true)
    setError(undefined)
    try { onCreated(await api.createConfig(name)); setOpen(false) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (value) void prepare() }}>
    <DialogTrigger asChild><Button variant="outline" size="icon" title="新建实例"><CirclePlus /></Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>新建自动化实例</DialogTitle><DialogDescription>从 template.json 复制一份独立配置。</DialogDescription></DialogHeader>
      <div className="space-y-2 py-3"><Label htmlFor="config-name">实例名称</Label><Input id="config-name" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void create() }} placeholder="oas1" />{error && <p className="text-xs text-destructive">{error}</p>}</div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button disabled={busy || !name} onClick={() => void create()}>{busy && <LoaderCircle className="animate-spin" />}创建实例</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
