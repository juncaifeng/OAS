# 循环调度

OAS 默认使用 `next_run` 的定时调度。`script.optimization.schedule_mode` 可以切换到循环调度，循环模式下按「当前任务列表」的顺序执行。

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

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/{instance}/loop` | 计划、运行状态、探针当前值、任务/探针目录 |
| `PUT` | `/{instance}/loop` | 整体保存计划 |
| `PUT` | `/{instance}/schedule_mode?mode=time\|loop` | 切换调度模式 |

运行状态写到 `log/loop_state_<config>.json`，探针最近一次读数写到 `log/loop_probe_values_<config>.json`，任务总览页定时读取。

## 实现说明

- 循环模式完全忽略任务的 `next_run` 和定时调度器。
- 探针通过隐藏任务 `tasks/LoopProbe` 执行；调度器把探针 id 写入 `log/loop_probe_request_<config>.json`，探针复用 GameUi 导航和任务自身的 OCR 资产。
- `max_polls=0` 时会按 `interval` / `rest_every` 持续轮询，直到条件成立、`timeout_minutes` 到达或手动停止。
- 探针不满足条件时本轮结束，下一轮从列表第 1 步重新开始。
- 循环模式仍经过正常的 `Script.run()`，因此队列模式、防封和失败处理继续生效。
- 任务失败或客户端掉线时，任务自己排入的 `Restart` 会在循环模式下立即执行。
