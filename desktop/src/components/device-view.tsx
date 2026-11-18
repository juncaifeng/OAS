import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, LoaderCircle, Monitor, Play, Plug, RefreshCw, RotateCcw, Smartphone, Sparkles, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import type { DeviceOptions, DeviceStatus, DeviceWindow } from "@/types"

interface DeviceViewProps {
  instance: string
  onRestart: () => Promise<void>
  status?: DeviceStatus
  statusError?: string
  refreshStatus: () => Promise<void>
}

export function DeviceView({ instance, onRestart, status, statusError, refreshStatus }: DeviceViewProps) {
  const [options, setOptions] = useState<DeviceOptions>()
  const [gamePath, setGamePath] = useState("")
  const [optionsError, setOptionsError] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const loadOptions = useCallback(async () => {
    if (!instance) return
    try {
      setOptions(await api.deviceOptions(instance))
      setOptionsError(undefined)
    } catch (reason) {
      setOptionsError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [instance])

  useEffect(() => { void loadOptions() }, [loadOptions])

  useEffect(() => {
    const current = status?.desktop.game_path ?? options?.desktop.game_path
    if (current !== undefined) setGamePath(current)
  }, [status?.desktop.game_path, options?.desktop.game_path])

  const refreshAll = async () => {
    setBusy("refresh")
    try {
      await Promise.all([refreshStatus(), loadOptions()])
    } finally {
      setBusy(undefined)
    }
  }

  const apply = async (key: string, updates: Array<[string, string, string, unknown]>, message = "绑定已保存，重启实例后生效") => {
    setBusy(key)
    setError(undefined)
    setNotice(undefined)
    try {
      for (const [group, field, type, value] of updates) {
        const success = await api.setField(instance, "Script", group, field, type, value)
        if (!success) throw new Error(`保存 ${group}.${field} 失败`)
      }
      setNotice(message)
      await refreshAll()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(undefined)
    }
  }

  const useAuto = () => apply("auto", [["desktop", "enable", "boolean", false], ["device", "serial", "string", "auto"]])
  const bindAdb = (serial: string) => apply(`adb-${serial}`, [["desktop", "enable", "boolean", false], ["device", "serial", "string", serial]])
  const bindDesktop = (window: DeviceWindow) => apply(`desktop-${window.hwnd}`, [["desktop", "enable", "boolean", true], ["device", "handle", "string", window.title]])
  const saveGamePath = () => apply("game-path", [["desktop", "game_path", "string", gamePath.trim()]], "程序位置已保存，重启实例后生效")
  const useDetectedRoot = () => {
    const root = desktop?.install_root
    if (!root) return
    setGamePath(root)
    void apply("game-path", [["desktop", "game_path", "string", root]], "已使用检测到的安装目录，重启实例后生效")
  }

  const launch = async () => {
    setBusy("launch")
    setError(undefined)
    setNotice(undefined)
    try {
      const result = await api.launchDevice(instance)
      setNotice(result.success ? "已请求启动客户端，等待窗口就绪" : "启动失败，请检查 game_path 与客户端安装目录")
      await refreshAll()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(undefined)
    }
  }

  const restart = async () => {
    setBusy("restart")
    setError(undefined)
    setNotice(undefined)
    try {
      await onRestart()
      setNotice("实例正在重启")
      window.setTimeout(() => void refreshAll(), 2000)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(undefined)
    }
  }

  const desktop = status?.desktop ?? options?.desktop
  const adb = status?.adb ?? options?.adb
  const bound = status?.desktop.bound
  const isDesktop = status?.mode === "desktop"

  return <div className="space-y-6">
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Plug className="h-4 w-4" />设备连接与心跳</CardTitle>
        <CardDescription>绑定模拟器或桌面客户端。设备未就绪时不会启动实例；绑定修改后需要重启实例。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={status?.ready ? "success" : "destructive"}>{isDesktop ? "PC 客户端" : "模拟器 ADB"} · {status?.ready ? "就绪" : "未就绪"}</Badge>
          <span className="text-xs text-muted-foreground">{status ? `心跳 ${status.checked_at.replace("T", " ")}` : "等待首次心跳"}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" disabled={busy != null} onClick={() => void refreshAll()}><RefreshCw className={busy === "refresh" ? "animate-spin" : ""} />刷新</Button>
            <Button variant="outline" size="sm" disabled={busy != null} onClick={() => void restart()}>{busy === "restart" ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}重启实例</Button>
          </div>
        </div>

        {status?.blocking.map((item) => <Issue key={item} tone="error" text={item} />)}
        {status?.warnings.map((item) => <Issue key={item} tone="warning" text={item} />)}
        {(error || statusError || optionsError) && <Issue tone="error" text={error ?? statusError ?? optionsError ?? ""} />}
        {notice && <Issue tone="info" text={notice} />}
      </CardContent>
    </Card>

    <div className="grid gap-4 xl:grid-cols-3">
      <Card className={`glass ${!isDesktop && adb?.serial === "auto" ? "ring-1 ring-primary/40" : ""}`}>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" />自动检测</CardTitle><CardDescription>模拟器场景：自动选择第一个 ADB 设备</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">当前 serial：{adb?.serial || "未设置"}</p>
          <Button size="sm" variant="outline" disabled={busy != null} onClick={() => void useAuto()}>{busy === "auto" ? <LoaderCircle className="animate-spin" /> : <Sparkles />}使用自动检测</Button>
        </CardContent>
      </Card>

      <Card className={`glass ${!isDesktop && adb?.serial !== "auto" ? "ring-1 ring-primary/40" : ""}`}>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Smartphone className="h-4 w-4 text-primary" />模拟器（ADB）</CardTitle><CardDescription>选择要绑定的 ADB 设备 serial</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {options?.adb.devices.length ? options.adb.devices.map((device) => <div key={device.serial} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
            <span className="truncate font-mono text-xs">{device.serial}</span>
            <Button size="sm" variant="outline" disabled={busy != null} onClick={() => void bindAdb(device.serial)}>{busy === `adb-${device.serial}` ? <LoaderCircle className="animate-spin" /> : null}绑定</Button>
          </div>) : <p className="py-6 text-center text-xs text-muted-foreground">未检测到 ADB 设备</p>}
        </CardContent>
      </Card>

      <Card className={`glass ${isDesktop ? "ring-1 ring-primary/40" : ""}`}>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Monitor className="h-4 w-4 text-primary" />PC 客户端</CardTitle><CardDescription>绑定阴阳师桌面客户端窗口</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-2 rounded-md border bg-background/30 p-3">
            <Label htmlFor="device-game-path" className="text-xs">程序位置（安装目录）</Label>
            <div className="flex gap-2">
              <Input id="device-game-path" value={gamePath} onChange={(event) => setGamePath(event.target.value)} placeholder="例如 E:\Program Files\yys" className="h-8 text-xs" />
              <Button size="sm" variant="outline" disabled={busy != null} onClick={() => void saveGamePath()}>{busy === "game-path" ? <LoaderCircle className="animate-spin" /> : null}保存</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">需包含 bin\onmyoji.exe；留空则自动检测。当前检测：{desktop?.install_root || "未找到"}</p>
            {desktop?.install_root && desktop.install_root !== gamePath && <Button size="sm" variant="ghost" disabled={busy != null} onClick={() => void useDetectedRoot()}>使用检测到的目录</Button>}
          </div>
          {options?.desktop.windows.length ? options.desktop.windows.map((window) => <div key={window.hwnd} className="space-y-1 rounded-md border px-3 py-2">
            <p className="truncate text-xs font-medium" title={window.title}>{window.title}</p>
            <p className="text-[11px] text-muted-foreground">PID {window.pid} · {window.width}x{window.height} · {window.foreground ? "前台" : "后台"}</p>
            <Button size="sm" variant="outline" disabled={busy != null} onClick={() => void bindDesktop(window)}>{busy === `desktop-${window.hwnd}` ? <LoaderCircle className="animate-spin" /> : null}绑定此窗口</Button>
          </div>) : <p className="py-3 text-center text-xs text-muted-foreground">未检测到客户端窗口</p>}
          <Button size="sm" variant="outline" disabled={busy != null || !desktop?.install_root} onClick={() => void launch()}>{busy === "launch" ? <LoaderCircle className="animate-spin" /> : <Play />}启动客户端</Button>
        </CardContent>
      </Card>
    </div>

    <Card className="glass">
      <CardHeader className="pb-3"><CardTitle className="text-base">心跳检查</CardTitle><CardDescription>每 5 秒刷新；任何阻塞项都会阻止启动实例并锁定任务配置</CardDescription></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {isDesktop ? <>
          <Check ok={Boolean(bound)} label="客户端窗口" detail={bound ? `${bound.title} · PID ${bound.pid}` : "未找到窗口"} />
          <Check ok={Boolean(bound?.foreground)} label="窗口前台" detail={desktop?.input_mode === "real_input" ? "真实输入要求窗口保持前台" : "后台消息模式"} />
          <Check ok={bound ? bound.width === 1280 && bound.height === 720 : false} label="客户端分辨率" detail={bound ? `${bound.width}x${bound.height}` : "未知"} />
          <Check ok={Boolean(desktop?.access.oas_admin || desktop?.access.can_access)} label="输入权限" detail={desktop?.access.oas_admin ? "OAS 已是管理员" : "游戏以管理员运行时，OAS 也需要管理员权限"} />
          <Check ok={Boolean(desktop?.install_root)} label="自动启动目录" detail={desktop?.install_root || "未找到 bin/onmyoji.exe"} />
        </> : <>
          <Check ok={Boolean(adb?.ready)} label="ADB 设备" detail={adb?.devices.length ? `${adb.devices.length} 个设备` : "未检测到设备"} />
          <Check ok={Boolean(adb?.serial)} label="当前 serial" detail={adb?.serial || "未设置"} />
        </>}
      </CardContent>
    </Card>
  </div>
}

export function DeviceGate({ status, onOpenDevices }: { status?: DeviceStatus; onOpenDevices: () => void }) {
  return <Card className="glass">
    <CardContent className="flex flex-col items-center gap-4 py-20 text-center">
      <XCircle className="h-10 w-10 text-destructive" />
      <div>
        <p className="text-lg font-semibold">设备心跳未通过</p>
        <p className="mt-2 text-sm text-muted-foreground">{status?.blocking[0] ?? "请先在「设备连接」完成绑定"}</p>
        {status?.warnings.length ? <p className="mt-1 text-xs text-muted-foreground">{status.warnings[0]}</p> : null}
      </div>
      <Button onClick={onOpenDevices}><Plug />去设备连接</Button>
    </CardContent>
  </Card>
}

function Issue({ tone, text }: { tone: "error" | "warning" | "info"; text: string }) {
  const style = tone === "error"
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : tone === "warning"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
      : "border-primary/30 bg-primary/10 text-primary"
  return <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${style}`}>
    {tone === "warning" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : tone === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
    <span className="break-all">{text}</span>
  </div>
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return <div className="flex items-start gap-2 rounded-md border bg-background/30 px-3 py-2">
    {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
    <div className="min-w-0">
      <p className="text-sm">{label}</p>
      {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
    </div>
  </div>
}
