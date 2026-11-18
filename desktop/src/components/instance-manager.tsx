import { useEffect, useState } from "react"
import { LoaderCircle, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api"

interface InstanceManagerProps {
  instance: string
  onRenamed: (oldName: string, newName: string) => void
  onDeleted: (name: string) => void
}

export function InstanceManager({ instance, onRenamed, onDeleted }: InstanceManagerProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(instance)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(instance)
    setError(undefined)
    setConfirmDelete(false)
  }, [open, instance])

  const rename = async () => {
    const next = name.trim()
    if (!next || next === instance) { setError("请输入一个不同的实例名称"); return }
    if (!/^[a-zA-Z0-9_-]+$/.test(next)) { setError("名称只能包含字母、数字、下划线和连字符"); return }
    setBusy(true)
    setError(undefined)
    try {
      await api.renameConfig(instance, next)
      onRenamed(instance, next)
      setOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setBusy(true)
    setError(undefined)
    try {
      await api.deleteConfig(instance)
      onDeleted(instance)
      setOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" size="icon" title="管理实例" disabled={!instance}><Pencil /></Button></DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>管理实例</DialogTitle>
        <DialogDescription>重命名或删除当前实例。重命名会先停止正在运行的调度进程。</DialogDescription>
      </DialogHeader>

      <div className="space-y-2 py-2">
        <Label htmlFor="instance-name">实例名称</Label>
        <Input id="instance-name" value={name} onChange={(event) => { setName(event.target.value); setConfirmDelete(false) }} onKeyDown={(event) => { if (event.key === "Enter") void rename() }} placeholder="oas1" />
        <p className="text-xs text-muted-foreground">当前：{instance}</p>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void rename()}>{busy && <LoaderCircle className="animate-spin" />}重命名</Button>
      </div>

      <Separator />

      <div className="space-y-2 py-1">
        <p className="text-sm font-medium text-destructive">删除实例</p>
        <p className="text-xs text-muted-foreground">会停止该实例并删除 config/{instance}.json，操作不可撤销。</p>
        <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}><Trash2 />{confirmDelete ? "再次点击确认删除" : "删除实例"}</Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>关闭</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
