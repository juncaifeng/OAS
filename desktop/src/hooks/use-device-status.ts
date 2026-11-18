import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { DeviceStatus } from "@/types"

/** 定时刷新设备心跳；实例未选择时不请求。 */
export function useDeviceStatus(instance: string, intervalMs = 5000) {
  const [status, setStatus] = useState<DeviceStatus>()
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    if (!instance) return
    try {
      setStatus(await api.deviceStatus(instance))
      setError(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [instance])

  useEffect(() => {
    setStatus(undefined)
    setError(undefined)
    if (!instance) return
    void refresh()
    const timer = window.setInterval(() => void refresh(), intervalMs)
    return () => window.clearInterval(timer)
  }, [instance, intervalMs, refresh])

  return { status, error, refresh }
}
