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
