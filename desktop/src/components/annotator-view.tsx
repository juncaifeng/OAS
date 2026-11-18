import { useEffect, useState } from "react"
import { LoaderCircle } from "lucide-react"
import { apiBase, resetApiBase } from "@/lib/api"

/**
 * 后端自带完整的素材标注页面（module/server/web/annotator）。
 * 这里直接嵌到 Tauri 窗口内，避免用户自己去翻端口。
 */
export function AnnotatorView({ backendPort }: { backendPort?: number }) {
  const [src, setSrc] = useState("")
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSrc("")
    setFailed(false)
    void apiBase()
      .then((base) => { if (!cancelled) setSrc(`${base}/tool/annotator`) })
      .catch(() => {
        // apiBase 会缓存失败的 Promise；后端还没分配端口时清掉缓存，等端口就绪后重试
        resetApiBase()
        if (!cancelled) setFailed(true)
      })
    return () => { cancelled = true }
  }, [backendPort])

  if (failed) return <div className="flex h-full items-center justify-center text-sm text-destructive">无法连接 FastAPI，暂时打不开标注工具。</div>
  if (!src) return <div className="flex h-full items-center justify-center"><LoaderCircle className="h-6 w-6 animate-spin text-primary" /></div>

  return <iframe key={src} src={src} title="OAS 素材标注工具" className="h-full w-full border-0 bg-background" />
}
