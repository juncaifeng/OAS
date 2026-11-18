export type BackendStatus = "starting" | "running" | "stopped" | "error"

export interface BackendInfo {
  host: string
  port: number
  status: BackendStatus
  pid?: number | null
  message?: string | null
}

export interface HealthInfo {
  status: string
  service: string
  version: string
}

export interface ConfigField {
  name: string
  title: string
  description?: string
  default: unknown
  value: unknown
  type: string
  enumEnum?: Array<string | number>
  minimum?: number
  maximum?: number
}

export type TaskConfig = Record<string, ConfigField[]>
export type ScriptMenu = Record<string, string[]>

export interface TaskSummary {
  enable: boolean
  next_run: string
}

export type TaskSummaryMap = Record<string, TaskSummary>

export interface LogTail {
  path: string | null
  lines: string[]
}

export interface DeployField {
  key: string
  value: unknown
  type: string
  description: string
}

export interface DeploySection {
  name: string
  fields: DeployField[]
}

export interface DeploySettings {
  path: string
  sections: DeploySection[]
}

export interface DeviceWindow {
  pid: number
  hwnd: number
  title: string
  x: number
  y: number
  width: number
  height: number
  foreground: boolean
}

export interface DesktopDeviceState {
  enabled: boolean
  input_mode: string
  game_path: string
  configured_handle: string
  install_root: string
  windows: DeviceWindow[]
  bound: DeviceWindow | null
  access: { oas_admin: boolean; can_access: boolean }
  blocking: string[]
  warnings: string[]
  ready: boolean
}

export interface AdbDeviceState {
  serial: string
  selected: string | null
  devices: Array<{ serial: string }>
  resolution: string | null
  resolution_ok: boolean
  ready: boolean
  issues: string[]
  skipped?: boolean
}

export interface DeviceStatus {
  instance: string
  mode: "desktop" | "adb"
  ready: boolean
  launchable: boolean
  blocking: string[]
  warnings: string[]
  checked_at: string
  desktop: DesktopDeviceState
  adb: AdbDeviceState
}

export interface DeviceOptions {
  mode: "desktop" | "adb"
  desktop: DesktopDeviceState
  adb: AdbDeviceState
}

export interface ScheduleItem {
  name: string
  next_run: string
}

export interface ScheduleData {
  running?: ScheduleItem | Record<string, never>
  pending: ScheduleItem[]
  waiting: ScheduleItem[]
}

export interface InstanceStreamPayload {
  state?: number
  status?: string
  schedule?: ScheduleData
}
