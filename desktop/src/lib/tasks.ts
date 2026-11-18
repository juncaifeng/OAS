import type { ScriptMenu, TaskSummaryMap } from "@/types"

export interface TaskRow {
  task: string
  category: string
  enable: boolean
  next_run: string
}

export interface TaskGroup {
  category: string
  tasks: TaskRow[]
}

/**
 * Merge the menu categories with the per-task scheduler summary.
 *
 * Tasks are listed once, following menu order. Menu entries without a
 * scheduler (Script / Restart / GlobalGame) are skipped, and scheduler entries
 * outside the menu (unfinished stubs such as `OrochiMoans`) stay hidden just
 * like they were in the old TaskList page.
 */
export function buildTaskGroups(menu: ScriptMenu, summary: TaskSummaryMap): TaskGroup[] {
  const seen = new Set<string>()
  const groups: TaskGroup[] = []

  for (const [category, tasks] of Object.entries(menu)) {
    if (!tasks.length) continue
    const rows: TaskRow[] = []
    for (const task of tasks) {
      if (seen.has(task)) continue
      const item = summary[task]
      if (!item) continue
      seen.add(task)
      rows.push({ task, category, enable: item.enable, next_run: item.next_run })
    }
    if (rows.length) groups.push({ category, tasks: rows })
  }

  return groups
}

export function filterTaskGroups(groups: TaskGroup[], keyword: string, translate: (value: string) => string): TaskGroup[] {
  const query = keyword.trim().toLowerCase()
  if (!query) return groups
  return groups
    .map((group) => ({
      ...group,
      tasks: group.tasks.filter(
        (row) => row.task.toLowerCase().includes(query) || translate(row.task).toLowerCase().includes(query),
      ),
    }))
    .filter((group) => group.tasks.length > 0)
}
