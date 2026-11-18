import { describe, expect, it } from "vitest"
import { translate, translateDescription } from "@/lib/i18n"

const translations = {
  Orochi: "八岐大蛇",
  OrochiConfig: "副本",
  SwitchSoulConfig: "执行任务前切换御魂",
  UserStatus: "身份",
  leader: "队长",
  user_status_help: "可选队长、队员或单人挑战",
  layer_help: " ",
}

describe("Chinese configuration translations", () => {
  it("translates tasks, snake-case groups, fields and enum values", () => {
    expect(translate("Orochi", translations)).toBe("八岐大蛇")
    expect(translate("orochi_config", translations)).toBe("副本")
    expect(translate("user_status", translations)).toBe("身份")
    expect(translate("leader", translations)).toBe("队长")
    expect(translate("switch_soul", translations)).toBe("执行任务前切换御魂")
  })

  it("shows help text and hides blank help translations", () => {
    expect(translateDescription("user_status_help", translations)).toBe("可选队长、队员或单人挑战")
    expect(translateDescription("layer_help", translations)).toBe(" ")
    expect(translateDescription("missing_help", translations)).toBe("")
  })
})
