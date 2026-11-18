import { describe, expect, it } from "vitest"
import { buildTaskGroups, filterTaskGroups } from "@/lib/tasks"
import type { ScriptMenu, TaskSummaryMap } from "@/types"

const menu: ScriptMenu = {
  Overview: [],
  Script: ["Script"],
  "Soul Zones": ["Orochi", "Sougenbi"],
  Tools: [],
}

const summary: TaskSummaryMap = {
  Orochi: { enable: true, next_run: "2026-11-18 09:00:00" },
  Sougenbi: { enable: false, next_run: "2023-01-01 00:00:00" },
  OrochiMoans: { enable: false, next_run: "2023-01-01 00:00:00" },
}

describe("task overview grouping", () => {
  it("follows menu order and skips scheduler-less entries, empty categories and stubs", () => {
    const groups = buildTaskGroups(menu, summary)

    expect(groups.map((group) => group.category)).toEqual(["Soul Zones"])
    expect(groups[0].tasks.map((row) => row.task)).toEqual(["Orochi", "Sougenbi"])
    expect(groups[0].tasks[0]).toMatchObject({ enable: true, next_run: "2026-11-18 09:00:00" })
  })

  it("filters by raw and translated task names", () => {
    const groups = buildTaskGroups(menu, summary)
    const translate = (value: string) => (value === "Orochi" ? "八岐大蛇" : value)

    expect(filterTaskGroups(groups, "orochi", translate)[0].tasks.map((row) => row.task)).toEqual(["Orochi"])
    expect(filterTaskGroups(groups, "八岐", translate)[0].tasks.map((row) => row.task)).toEqual(["Orochi"])
    expect(filterTaskGroups(groups, "不存在", translate)).toEqual([])
  })
})
