import { useCallback, useEffect, useState } from "react"
import { api, getBackendInfo, resetApiBase, restartBackend } from "@/lib/api"
import type { BackendInfo, HealthInfo } from "@/types"

export function useBackend() {
  const [backend, setBackend] = useState<BackendInfo>()
  const [health, setHealth] = useState<HealthInfo>()
  const [error, setError] = useState<string>()
  const [restarting, setRestarting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const info = await getBackendInfo()
      setBackend(info)
      const nextHealth = await api.health()
      setHealth(nextHealth)
      setError(undefined)
    } catch (reason) {
      setHealth(undefined)
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 4000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const restart = useCallback(async () => {
    setRestarting(true)
    setError(undefined)
    try {
      await restartBackend()
      resetApiBase()
      setHealth(undefined)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRestarting(false)
    }
  }, [refresh])

  return { backend, health, error, restarting, restart, refresh }
}
