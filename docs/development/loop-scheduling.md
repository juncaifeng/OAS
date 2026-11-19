# 循环调度

OAS 默认使用 `next_run` 的定时调度。桌面端把调度拆成两个页面：

- **定时任务**：日历视图，管理每个任务的执行窗口，窗口前会抢占轮询队列。
- **轮询任务**：顺序循环执行当前任务列表，定时任务到点优先执行。

`script.optimization.schedule_mode` 仍然是底层开关：`time` 或 `loop`。


## 界面

任务总览页就是调度中心：

```
调度器
  调度模式：时间模式 / 轮询模式
  轮询间隔 / 单次探针超时 / 每 N 次休息 / 休息时长 / 每日轮数

当前任务列表
  01  任务  Exploration
  02  探针  结界突破券 > 0   间隔 300 次 0
  03  任务  RealmRaid
  （拖动调整顺序，删除即移出队列）

任务库
  探针任务：结界突破券、始终成立
  其他分类：日常任务、寮任务、御魂……
```

两种模式共用同一份任务队列，只是执行节奏不同：

- 时间模式：按各任务自己的 `next_run` 执行，队列顺序只用于展示和共用列表。
- 轮询模式：严格按队列顺序循环执行。

任务参数在总览页的悬浮弹窗里配置，保存后立即生效，不再跳转到单独的配置页。

模式切换和计划保存都通过后端接口写回配置文件，不需要再进 Script 参数页。

## 配置结构

```yaml
script:
  optimization:
    schedule_mode: loop
  loop:
    enable: true
    steps:
      - id: step-1
        kind: task
        task: Exploration
      - id: step-2
        kind: probe
        task: realm_raid_ticket
        operator: ">"
        threshold: 0
        interval: 300
        max_polls: 0
      - id: step-3
        kind: task
        task: RealmRaid
    interval: 300
    timeout_minutes: 360
    rest_every: 0
    rest_duration: 1800
    max_cycles: 0
    cycle_interval: 0
```

含义：

```
Exploration 完成
  -> 探针：突破券 > 0
       成立：继续下一步
       不成立：等待 interval 后重新检查（受 max_polls / timeout_minutes 限制）
  -> RealmRaid
  -> 回到第 1 步
```

字段：

| 字段 | 说明 |
|---|---|
| `schedule_mode` | `time` 定时调度；`loop` 循环调度 |
| `steps` | 有序步骤列表，就是界面上的「当前任务列表」 |
| `steps[].kind` | `task` 普通任务；`probe` 探针条件 |
| `steps[].task` | 任务名（大驼峰/下划线均可）或探针 id |
| `steps[].operator` / `threshold` | 探针值与阈值的比较 |
| `steps[].interval` | 该探针的轮询间隔（秒） |
| `steps[].max_polls` | 该探针最多检查次数，`0` 表示不限 |
| `interval` | 新添加探针步骤的默认间隔（秒） |
| `timeout_minutes` | 单次探针等待的总超时（分钟），`0` 表示不限制 |
| `rest_every` | 每检查 N 次休息一次，`0` 表示不额外休息 |
| `rest_duration` | 休息时长（秒） |
| `max_cycles` | 每日最大轮数，`0` 表示不限 |
| `cycle_interval` | 完成一轮后的额外等待（秒） |

## 强制作息时间

「作息时间」独立于时间/轮询模式，始终生效：只在每日运行窗口内执行任务。

```yaml
script:
  rest:
    enable: true
    start: "08:30"
    end: "23:30"
    random_offset: 25      # 每天窗口随机浮动 ±25 分钟，0 = 固定
    run_minutes: 90        # 连续运行 90 分钟后强制休息
    break_minutes: 12      # 休息 12 分钟
    weekly_rest: none      # none / single（周日）/ double（周六、周日）
```

- 窗口外、休息中或每周休息日时，调度器不执行任何任务，只按 `next_at` 休眠。
- 每日随机偏移由日期决定，同一天内保持不变，避免窗口来回抖动。
- 连续运行按「窗口开始时间」对齐：工作 90 分钟 → 休息 12 分钟 → 继续，依此循环。
- 配置和当前状态分别通过 `GET/PUT /{instance}/rest` 读写，状态写入 `log/rest_state_<config>.json`。

## 轮询休息与执行选项

| 字段 | 说明 |
|---|---|
| `rest_every` | 每 N 次轮询后休息，`0` = 不休息 |
| `rest_every_jitter` | 轮询次数的随机浮动绝对值（上限 `floor(rest_every × 0.3)`） |
| `rest_duration` | 休息时长（秒），界面按分钟显示 |
| `rest_jitter` | 休息时长的随机浮动绝对值（秒，上限 `floor(rest_duration × 0.3)`） |
| `rotation` | 轮转方式，目前只有 `sequential`（顺序轮转） |
| `idle_on_empty` | 队列为空时休眠 30 分钟，避免空转 |
| `retry_on_failure` | 任务失败后自动重试一次 |

## 定时任务窗口

```yaml
script:
  scheduled:
    windows:
      - task: RealmRaid
        enable: true
        start: "19:00"
        end: "21:00"
        lead_minutes: 2
        note: 逢魔之时
```

| 字段 | 说明 |
|---|---|
| `task` | 任务名（大驼峰） |
| `enable` | 是否启用该窗口 |
| `start` / `end` | 每日执行窗口，`end <= start` 视为跨午夜 |
| `lead_minutes` | 窗口开始前 N 分钟暂停轮询队列，给定时任务让路 |

行为：

- 定时模式：任务的 `next_run` 落在窗口外时，顺延到下一次窗口开始。
- 轮询模式：到点的定时任务先执行，再继续轮询队列；窗口开始前的抢占区间会暂停队列。
- 窗口只限制「什么时候可以开始执行」，不会中断已经开始的单个任务。

## 今日大盘与运行历史

每次任务执行结束后写入 `log/runs_<config>.jsonl`（单文件最多保留 20000 行）：

```json
{"kind":"run","task":"Exploration","mode":"loop","start":"2026-11-19T09:05:00","end":"2026-11-19T09:15:00","seconds":600,"success":true}
{"kind":"skip","task":"RealmRaid","mode":"time","start":"...","end":"...","seconds":0,"success":false,"reason":"窗口外（19:00-21:00）"}
```

- `run`：正常执行的任务（不含 `Restart` / `LoopProbe` / `GotoMain`）
- `skip`：窗口外顺延、探针未满足等跳过事件，同一任务/原因 30 分钟内只记一次

桌面端「大盘」页读取 `GET /{instance}/stats?range=today|yesterday|7d`，展示执行次数、成功率、总用时、定时/轮询占比、每小时分布、任务排行和异常与跳过。
`GET /{instance}/stats/export?range=...` 导出 CSV。

体力消耗目前没有记录，盘面上用「异常与跳过」替代。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/{instance}/loop` | 计划、运行状态、探针当前值、任务/探针目录 |
| `PUT` | `/{instance}/loop` | 整体保存计划 |
| `PUT` | `/{instance}/schedule_mode?mode=time\|loop` | 切换调度模式 |
| `GET` | `/{instance}/rest` | 作息时间配置 + 当前状态 |
| `PUT` | `/{instance}/rest` | 保存作息时间 |
| `GET` | `/{instance}/schedule` | 定时任务窗口 + scheduler 状态 |
| `PUT` | `/{instance}/schedule` | 保存定时任务窗口 |
| `GET` | `/{instance}/stats?range=today\|yesterday\|7d` | 大盘统计 |
| `GET` | `/{instance}/stats/export?range=...` | 导出运行记录 CSV |

运行状态写到 `log/loop_state_<config>.json`，探针最近一次读数写到 `log/loop_probe_values_<config>.json`，任务总览页定时读取。

## 实现说明

- 循环模式完全忽略任务的 `next_run` 和定时调度器。
- 探针通过隐藏任务 `tasks/LoopProbe` 执行；调度器把探针 id 写入 `log/loop_probe_request_<config>.json`，探针复用 GameUi 导航和任务自身的 OCR 资产。
- `max_polls=0` 时会按 `interval` / `rest_every` 持续轮询，直到条件成立、`timeout_minutes` 到达或手动停止。
- 探针不满足条件时本轮结束，下一轮从列表第 1 步重新开始。
- 循环模式仍经过正常的 `Script.run()`，因此队列模式、防封和失败处理继续生效。
- 任务失败或客户端掉线时，任务自己排入的 `Restart` 会在循环模式下立即执行。
