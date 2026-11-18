import { useState } from "react"
import { Download, LoaderCircle, Moon, RefreshCw, Send, Server, Sun } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import type { BackendInfo, HealthInfo } from "@/types"

interface SettingsProps {
  instance: string
  backend?: BackendInfo
  health?: HealthInfo
  restarting: boolean
  onRestart: () => Promise<void>
}

export function SettingsView({ instance, backend, health, restarting, onRestart }: SettingsProps) {
  const [light, setLight] = useState(() => localStorage.getItem("oas-theme") === "light")
  const toggleTheme = (value: boolean) => {
    setLight(value)
    document.documentElement.classList.toggle("light", value)
    localStorage.setItem("oas-theme", value ? "light" : "dark")
  }

  return <div className="mx-auto max-w-4xl space-y-6">
    <Card className="glass"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Server className="h-4 w-4" />FastAPI 服务</CardTitle><CardDescription>Tauri 管理的本地后端，仅监听回环地址</CardDescription></CardHeader><CardContent className="space-y-5">
      <div className="grid gap-4 rounded-lg border bg-background/40 p-4 text-sm sm:grid-cols-2">
        <Info label="连接状态" value={health ? "服务正常" : backend?.message ?? "正在连接"} />
        <Info label="服务版本" value={health?.version ?? "未知"} />
        <Info label="监听地址" value={backend?.port ? `http://${backend.host}:${backend.port}` : "尚未分配"} />
        <Info label="进程 PID" value={backend?.pid?.toString() ?? "未运行"} />
      </div>
      <Button variant="outline" disabled={restarting} onClick={() => void onRestart()}><RefreshCw className={restarting ? "animate-spin" : ""} />{restarting ? "正在重启" : "重启后端"}</Button>
    </CardContent></Card>

    <NotifyTest />
    <Diagnostic instance={instance} />

    <Card className="glass"><CardHeader><CardTitle className="text-base">外观</CardTitle><CardDescription>主题设置保存在当前设备</CardDescription></CardHeader><CardContent><div className="flex items-center justify-between"><Label htmlFor="theme" className="flex items-center gap-2">{light ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}浅色模式</Label><Switch id="theme" checked={light} onCheckedChange={toggleTheme} /></div></CardContent></Card>

    <Card className="glass"><CardHeader><CardTitle className="text-base">运行时</CardTitle><CardDescription>桌面安装包完全自包含</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Badge variant="secondary">Tauri v2</Badge><Badge variant="secondary">React + Vite</Badge><Badge variant="secondary">shadcn/ui</Badge><Badge variant="secondary">uv</Badge><Badge variant="secondary">python-build-standalone</Badge></CardContent></Card>
  </div>
}

function NotifyTest() {
  const [setting, setSetting] = useState("provider: null")
  const [title, setTitle] = useState("OAS 测试")
  const [content, setContent] = useState("这是一条来自桌面端的测试消息")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string>()

  const send = async () => {
    setBusy(true)
    setResult(undefined)
    try {
      const response = await api.notifyTest(setting, title, content)
      setResult(response === true ? "推送已发送" : `推送失败：${String(response)}`)
    } catch (reason) {
      setResult(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return <Card className="glass"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4" />消息推送测试</CardTitle><CardDescription>使用任务里的 notify_config 相同语法，发送一条测试通知</CardDescription></CardHeader><CardContent className="space-y-3">
    <div className="space-y-2"><Label htmlFor="notify-setting">推送配置</Label><Textarea id="notify-setting" className="min-h-24 font-mono text-xs leading-5" value={setting} onChange={(event) => setSetting(event.target.value)} placeholder="provider: ..." /></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="notify-title">标题</Label><Input id="notify-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="notify-content">内容</Label><Input id="notify-content" value={content} onChange={(event) => setContent(event.target.value)} /></div>
    </div>
    <div className="flex items-center gap-3">
      <Button variant="outline" disabled={busy} onClick={() => void send()}>{busy ? <LoaderCircle className="animate-spin" /> : <Send />}发送测试</Button>
      {result && <p className="truncate text-xs text-muted-foreground">{result}</p>}
    </div>
  </CardContent></Card>
}

function Diagnostic({ instance }: { instance: string }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string>()

  const exportZip = async () => {
    setBusy(true)
    setResult(undefined)
    try {
      const response = await api.exportDiagnostic(instance)
      setResult(response.success ? `已导出：${response.path}` : response.error ?? "导出失败")
    } catch (reason) {
      setResult(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return <Card className="glass"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Download className="h-4 w-4" />诊断导出</CardTitle><CardDescription>打包当前实例的配置、日志和版本信息，便于反馈问题</CardDescription></CardHeader><CardContent className="space-y-3">
    <Button variant="outline" disabled={busy} onClick={() => void exportZip()}>{busy ? <LoaderCircle className="animate-spin" /> : <Download />}导出诊断包</Button>
    {result && <p className="break-all text-xs text-muted-foreground">{result}</p>}
  </CardContent></Card>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="mb-1 text-xs text-muted-foreground">{label}</p><p className="break-all">{value}</p></div>
}
