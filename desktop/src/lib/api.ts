import { invoke } from "@tauri-apps/api/core"
import type { TranslationMap } from "@/lib/i18n"
import type { BackendInfo, DeploySettings, DeviceOptions, DeviceStatus, HealthInfo, LogTail, LoopPlan, LoopState, RestPayload, RestSchedule, SchedulePayload, ScheduleWindow, ScriptMenu, TaskConfig, TaskSummaryMap } from "@/types"

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
  translations: () => request<TranslationMap>("/i18n/zh-CN"),
  newConfigName: () => request<string>("/config_new_name"),
  createConfig: async (name: string, template = "template") => {
    const query = new URLSearchParams({ file: name, template })
    await request<string[]>(`/config_copy?${query}`, { method: "POST" })
    return name
  },
  renameConfig: (oldName: string, newName: string) => {
    const query = new URLSearchParams({ old_name: oldName, new_name: newName })
    return request<boolean>(`/config?${query}`, { method: "PUT" })
  },
  deleteConfig: (name: string) =>
    request<boolean>(`/config?name=${encodeURIComponent(name)}`, { method: "DELETE" }),
  tasks: (instance: string) =>
    request<TaskSummaryMap>(`/${encodeURIComponent(instance)}/tasks`),
  loop: (instance: string) =>
    request<LoopState>(`/${encodeURIComponent(instance)}/loop`),
  setLoop: (instance: string, plan: LoopPlan) =>
    request<{ success: boolean }>(`/${encodeURIComponent(instance)}/loop`, {
      method: "PUT",
      body: JSON.stringify(plan),
    }),
  setScheduleMode: (instance: string, mode: "time" | "loop") =>
    request<{ success: boolean; mode: string }>(
      `/${encodeURIComponent(instance)}/schedule_mode?mode=${encodeURIComponent(mode)}`,
      { method: "PUT" },
    ),
  rest: (instance: string) =>
    request<RestPayload>(`/${encodeURIComponent(instance)}/rest`),
  setRest: (instance: string, schedule: RestSchedule) =>
    request<{ success: boolean }>(`/${encodeURIComponent(instance)}/rest`, {
      method: "PUT",
      body: JSON.stringify(schedule),
    }),
  schedule: (instance: string) =>
    request<SchedulePayload>(`/${encodeURIComponent(instance)}/schedule`),
  setSchedule: (instance: string, windows: ScheduleWindow[]) =>
    request<{ success: boolean }>(`/${encodeURIComponent(instance)}/schedule`, {
      method: "PUT",
      body: JSON.stringify({ windows }),
    }),
  runTask: (instance: string, task: string) =>
    request<boolean>(`/${encodeURIComponent(instance)}/${encodeURIComponent(task)}/run`, { method: "POST" }),
  logTail: (instance: string, lines = 300) =>
    request<LogTail>(`/${encodeURIComponent(instance)}/log/tail?lines=${lines}`),
  deviceStatus: (instance: string) =>
    request<DeviceStatus>(`/device/status?instance=${encodeURIComponent(instance)}`),
  deviceOptions: (instance: string) =>
    request<DeviceOptions>(`/device/options?instance=${encodeURIComponent(instance)}`),
  launchDevice: (instance: string) =>
    request<{ success: boolean }>(`/device/launch?instance=${encodeURIComponent(instance)}`, { method: "POST" }),
  deviceFrame: async (instance: string) => {
    const response = await fetch(`${await apiBase()}/device/frame?instance=${encodeURIComponent(instance)}`)
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(detail || `抓取画面失败 (${response.status})`)
    }
    return response.blob()
  },
  deploySettings: () => request<DeploySettings>("/deploy/settings"),
  setDeploy: (key: string, type: string, value: unknown) => {
    const query = new URLSearchParams({ types: type, value: String(value) })
    return request<{ success: boolean; value: unknown; restart_required: boolean }>(
      `/deploy/settings/${encodeURIComponent(key)}?${query}`,
      { method: "PUT" },
    )
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
  restart: (instance: string) =>
    request<{ success: boolean; state: string }>(`/${encodeURIComponent(instance)}/restart`, { method: "POST" }),
  notifyTest: (setting: string, title: string, content: string) => {
    const query = new URLSearchParams({ setting, title, content })
    return request<boolean | string>(`/home/notify_test?${query}`, { method: "POST" })
  },
  exportDiagnostic: (configName = "") => {
    const query = new URLSearchParams({ config_name: configName })
    return request<{ success: boolean; path: string; error?: string }>(`/home/export_diagnostic?${query}`)
  },
}

export async function instanceWebSocket(instance: string) {
  const base = await apiBase()
  return new WebSocket(`${base.replace(/^http/, "ws")}/ws/${encodeURIComponent(instance)}`)
}
