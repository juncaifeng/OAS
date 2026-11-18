import { invoke } from "@tauri-apps/api/core"
import type { PayloadStatus } from "@/types"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

function requireTauri() {
  if (!isTauri) throw new Error("后端载荷更新仅在桌面端可用")
}

export const payload = {
  available: isTauri,
  status: async () => {
    requireTauri()
    return invoke<PayloadStatus>("backend_payload_status")
  },
  install: async (sourceDir: string) => {
    requireTauri()
    return invoke<PayloadStatus>("install_backend_payload", { sourceDir })
  },
  activate: async (version: string) => {
    requireTauri()
    return invoke<PayloadStatus>("activate_backend_payload", { version })
  },
  reset: async () => {
    requireTauri()
    return invoke<PayloadStatus>("reset_backend_payload")
  },
}
