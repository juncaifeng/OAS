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

export type ScheduleMode = "time" | "loop"

export type LoopStepKind = "task" | "probe"

export interface LoopStep {
  id: string
  kind: LoopStepKind
  task: string
  operator: string
  threshold: number
  interval: number
  max_polls: number
}

export interface LoopPlan {
  enable: boolean
  steps: LoopStep[]
  interval: number
  timeout_minutes: number
  rest_every: number
  rest_duration: number
  max_cycles: number
  cycle_interval: number
}

export interface LoopProbeRuntime {
  task: string
  value: number | null
  condition: boolean
  polls: number
}

export interface LoopRuntime {
  updated?: string
  cycle?: number
  task?: string
  kind?: string
  index?: number
  status?: string
  probe?: LoopProbeRuntime | null
}

export interface LoopProbeValue {
  value: number | null
  ok: boolean
  time?: string
}

export interface LoopCatalog {
  tasks: Array<{ task: string; category: string }>
  probes: Array<{ task: string; value_type: string; operator: string; threshold: number; interval: number }>
}

export interface LoopState {
  plan: LoopPlan
  mode: ScheduleMode
  state: number
  runtime: LoopRuntime | null
  probes: Record<string, LoopProbeValue>
  catalog: LoopCatalog
}

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

export interface PayloadVersion {
  version: string
  path: string
  active: boolean
  installedAt?: string | null
}

export interface PayloadStatus {
  source: string
  currentVersion?: string | null
  bundledVersion?: string | null
  payloadRoot: string
  versions: PayloadVersion[]
  signatureRequired: boolean
  message?: string | null
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
