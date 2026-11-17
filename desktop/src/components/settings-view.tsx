import { useState } from "react"
import { Moon, RefreshCw, Server, Sun } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { BackendInfo, HealthInfo } from "@/types"

interface SettingsProps {
  backend?: BackendInfo
  health?: HealthInfo
  restarting: boolean
  onRestart: () => Promise<void>
}

export function SettingsView({ backend, health, restarting, onRestart }: SettingsProps) {
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

    <Card className="glass"><CardHeader><CardTitle className="text-base">外观</CardTitle><CardDescription>主题设置保存在当前设备</CardDescription></CardHeader><CardContent><div className="flex items-center justify-between"><Label htmlFor="theme" className="flex items-center gap-2">{light ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}浅色模式</Label><Switch id="theme" checked={light} onCheckedChange={toggleTheme} /></div></CardContent></Card>

    <Card className="glass"><CardHeader><CardTitle className="text-base">运行时</CardTitle><CardDescription>桌面安装包完全自包含</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Badge variant="secondary">Tauri v2</Badge><Badge variant="secondary">React + Vite</Badge><Badge variant="secondary">shadcn/ui</Badge><Badge variant="secondary">uv</Badge><Badge variant="secondary">python-build-standalone</Badge></CardContent></Card>
  </div>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="mb-1 text-xs text-muted-foreground">{label}</p><p className="break-all">{value}</p></div>
}
