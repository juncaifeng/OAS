import { invoke } from "@tauri-apps/api/core"
import type { BackendInfo, HealthInfo, ScriptMenu, TaskConfig } from "@/types"

const isTauri = "__TAURI_INTERNALS__" in window
let apiBasePromise: Promise<string> | undefined

export function getBackendInfo() {
  if (!isTauri) {
    return Promise.resolve<BackendInfo>({
      host: "127.0.0.1",
      port: Number(import.meta.env.VITE_API_PORT ?? 22267),
      status: "running",
    })
  }
  return invoke<BackendInfo>("backend_status")
}

export function restartBackend() {
  if (!isTauri) return Promise.reject(new Error("浏览器开发模式请手动重启 FastAPI"))
  return invoke<BackendInfo>("restart_backend")
}

export function resetApiBase() {
  apiBasePromise = undefined
}

export function apiBase() {
  apiBasePromise ??= (async () => {
    if (!isTauri) {
      return import.meta.env.VITE_API_URL ?? "http://127.0.0.1:22267"
    }
    const info = await getBackendInfo()
    if (!info.port) throw new Error(info.message ?? "FastAPI 尚未分配端口")
    return `http://${info.host}:${info.port}`
  })()
  return apiBasePromise
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${await apiBase()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `请求失败 (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  health: () => request<HealthInfo>("/api/health"),
  configs: () => request<string[]>("/config_list"),
  menu: () => request<ScriptMenu>("/script_menu"),
  newConfigName: () => request<string>("/config_new_name"),
  createConfig: async (name: string) => {
    await request<string[]>("/config_copy?file=" + encodeURIComponent(name), { method: "POST" })
    return name
  },
  task: (instance: string, task: string) =>
    request<TaskConfig>(`/${encodeURIComponent(instance)}/${encodeURIComponent(task)}/args`),
  setField: async (
    instance: string,
    task: string,
    group: string,
    field: string,
    type: string,
    value: unknown,
  ) => {
    const query = new URLSearchParams({ types: type, value: String(value) })
    return request<boolean>(
      `/${encodeURIComponent(instance)}/${encodeURIComponent(task)}/${encodeURIComponent(group)}/${encodeURIComponent(field)}/value?${query}`,
      { method: "PUT" },
    )
  },
  start: (instance: string) => request(`/${encodeURIComponent(instance)}/start`),
  stop: (instance: string) => request(`/${encodeURIComponent(instance)}/stop`),
}

export async function instanceWebSocket(instance: string) {
  const base = await apiBase()
  return new WebSocket(`${base.replace(/^http/, "ws")}/ws/${encodeURIComponent(instance)}`)
}
