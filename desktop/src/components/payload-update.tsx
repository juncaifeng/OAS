import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, LoaderCircle, PackageOpen, RefreshCw, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { payload } from "@/lib/payload"
import type { PayloadStatus } from "@/types"

interface PayloadUpdateProps {
  onBackendRestarted?: () => Promise<void>
}

export function PayloadUpdate({ onBackendRestarted }: PayloadUpdateProps) {
  const [status, setStatus] = useState<PayloadStatus>()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [sourceDir, setSourceDir] = useState("")

  const load = useCallback(async () => {
    if (!payload.available) return
    try {
      setStatus(await payload.status())
      setError(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const run = async (key: string, action: () => Promise<PayloadStatus>, message: string) => {
    setBusy(key)
    setError(undefined)
    setNotice(undefined)
    try {
      setStatus(await action())
      setNotice(message)
      await onBackendRestarted?.()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(undefined)
    }
  }

  return <Card className="glass">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base"><PackageOpen className="h-4 w-4" />后端更新（Payload）</CardTitle>
      <CardDescription>独立更新 Python 后端与任务资源，不重新安装整个桌面程序。默认仍使用安装包内置版本。</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {!payload.available && <p className="text-sm text-muted-foreground">浏览器开发模式下不可用，请在桌面端操作。</p>}

      {payload.available && <>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status?.source === "payload" ? "success" : "secondary"}>{status?.source === "payload" ? "当前使用载荷" : "当前使用内置版本"}</Badge>
          {status?.signatureRequired && <Badge variant="outline">签名校验开启</Badge>}
          <Button variant="ghost" size="sm" disabled={busy != null} onClick={() => void load()}><RefreshCw className={busy === "load" ? "animate-spin" : ""} />刷新</Button>
        </div>

        <div className="grid gap-3 rounded-lg border bg-background/40 p-4 text-sm sm:grid-cols-2">
          <Info label="当前版本" value={status?.currentVersion ?? "内置"} />
          <Info label="内置版本" value={status?.bundledVersion ?? "未知"} />
          <Info label="载荷目录" value={status?.payloadRoot ?? "未知"} />
          <Info label="已安装版本" value={String(status?.versions.length ?? 0)} />
        </div>

        {status?.message && <p className="text-sm text-amber-300">{status.message}</p>}

        {status?.versions.length ? <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">已安装版本</p>
          {status.versions.map((version) => <div key={version.version} className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 ${version.active ? "bg-primary/5 ring-1 ring-primary/40" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{version.version}{version.active && <span className="ml-2 text-xs text-primary">当前</span>}</p>
              <p className="truncate text-[11px] text-muted-foreground">{version.path}</p>
            </div>
            <Button size="sm" variant="outline" disabled={busy != null || version.active} onClick={() => void run(`activate-${version.version}`, () => payload.activate(version.version), `已切换到 ${version.version}`)}>
              {busy === `activate-${version.version}` ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}切换
            </Button>
          </div>)}
        </div> : <p className="py-3 text-center text-xs text-muted-foreground">还没有安装任何载荷</p>}

        <div className="space-y-2 rounded-lg border bg-background/30 p-4">
          <Label htmlFor="payload-source">本地载荷目录</Label>
          <div className="flex gap-2">
            <Input id="payload-source" value={sourceDir} onChange={(event) => setSourceDir(event.target.value)} placeholder="包含 oas-backend-*.zip 和 *.manifest.json 的目录" />
            <Button disabled={busy != null || !sourceDir.trim()} onClick={() => void run("install", () => payload.install(sourceDir.trim()), "载荷已安装并切换")}>
              {busy === "install" ? <LoaderCircle className="animate-spin" /> : <PackageOpen />}安装
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">从 CI Release 下载 `oas-backend-*.zip` 和 `oas-backend-*.manifest.json`，放在同一目录后填写该目录。安装成功会自动重启后端；健康检查失败会回滚。</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={busy != null || status?.source === "bundled"} onClick={() => void run("reset", () => payload.reset(), "已恢复内置版本")}>
            {busy === "reset" ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}恢复内置版本
          </Button>
          {notice && <span className="text-xs text-primary">{notice}</span>}
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </>}
    </CardContent>
  </Card>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="mb-1 text-xs text-muted-foreground">{label}</p><p className="break-all">{value}</p></div>
}
