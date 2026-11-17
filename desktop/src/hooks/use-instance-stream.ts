import { useCallback, useEffect, useRef, useState } from "react"
import { api, instanceWebSocket } from "@/lib/api"
import type { InstanceStreamPayload, ScheduleData } from "@/types"

export function useInstanceStream(instance: string) {
  const [state, setState] = useState(0)
  const [connected, setConnected] = useState(false)
  const [schedule, setSchedule] = useState<ScheduleData>()
  const [logs, setLogs] = useState<string[]>([])
  const socketRef = useRef<WebSocket>()

  useEffect(() => {
    if (!instance) return
    let disposed = false
    let reconnectTimer: number | undefined
    let socket: WebSocket | undefined

    const connect = async () => {
      try {
        const nextSocket = await instanceWebSocket(instance)
        if (disposed) {
          nextSocket.close()
          return
        }
        socket = nextSocket
        socketRef.current = nextSocket
        nextSocket.onopen = () => {
          setConnected(true)
          nextSocket.send("get_state")
          nextSocket.send("get_schedule")
        }
        nextSocket.onmessage = (event) => {
          const raw = String(event.data)
          try {
            const payload = JSON.parse(raw) as InstanceStreamPayload
            if (typeof payload.state === "number") setState(payload.state)
            if (payload.schedule) setSchedule(payload.schedule)
            if (payload.status) setState(payload.status === "Run" ? 1 : 0)
          } catch {
            setLogs((current) => [...current.slice(-299), raw])
          }
        }
        nextSocket.onclose = () => {
          setConnected(false)
          if (!disposed) reconnectTimer = window.setTimeout(() => void connect(), 3000)
        }
        nextSocket.onerror = () => nextSocket.close()
      } catch {
        if (!disposed) reconnectTimer = window.setTimeout(() => void connect(), 3000)
      }
    }

    setSchedule(undefined)
    setState(0)
    void connect()
    return () => {
      disposed = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      socket?.close()
      socketRef.current = undefined
    }
  }, [instance])

  const start = useCallback(async () => {
    await api.start(instance)
    socketRef.current?.send("get_state")
  }, [instance])
  const stop = useCallback(async () => {
    await api.stop(instance)
    socketRef.current?.send("get_state")
  }, [instance])

  return { state, connected, schedule, logs, start, stop, clearLogs: () => setLogs([]) }
}
