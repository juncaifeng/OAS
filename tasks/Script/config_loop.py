# This Python file uses the following encoding: utf-8
"""Loop scheduling configuration.

Loop mode walks an ordered list of *steps*:

    task -> probe(gate) -> task -> ... -> back to the first step

A ``probe`` step blocks the queue until its condition is satisfied, polling
every ``interval`` seconds. A ``task`` step simply runs one normal task.

The list is the "current task list" shown on the task overview page, so the
order in the list is the execution order. ``optimization.schedule_mode`` picks
between this planner and the classic ``next_run`` scheduler.
"""
from enum import Enum

from pydantic import BaseModel, Field


class LoopProbe(str, Enum):
    """Probes understood by ``tasks/LoopProbe``."""

    ALWAYS = 'always'
    REALM_RAID_TICKET = 'realm_raid_ticket'


class LoopCompare(str, Enum):
    GT = '>'
    GE = '>='
    LT = '<'
    LE = '<='
    EQ = '=='
    NE = '!='


class LoopStepKind(str, Enum):
    TASK = 'task'
    PROBE = 'probe'


class LoopRotation(str, Enum):
    SEQUENTIAL = 'sequential'  # 顺序轮转


class LoopStep(BaseModel):
    # 前端生成的稳定 id，用于拖拽排序和定位
    id: str = Field(default='', description='loop_step_id_help')
    kind: LoopStepKind = Field(default=LoopStepKind.TASK, description='loop_step_kind_help')
    # kind=task 时是任务名（大驼峰），kind=probe 时是探针 id（如 realm_raid_ticket）
    task: str = Field(default='', description='loop_step_task_help')
    # 仅探针步骤使用
    operator: LoopCompare = Field(default=LoopCompare.GT, description='loop_operator_help')
    threshold: int = Field(default=0, description='loop_threshold_help')
    # 探针轮询间隔（秒）
    interval: int = Field(default=300, ge=5, description='loop_interval_help')
    # 该探针最多检查次数；0 = 不限次数
    max_polls: int = Field(default=0, ge=0, description='loop_max_polls_help')


def default_steps() -> list[LoopStep]:
    """探索 -> 突破券 > 0 -> 个人突破，作为新配置的示例队列。"""
    return [
        LoopStep(id='step-1', kind=LoopStepKind.TASK, task='Exploration'),
        LoopStep(
            id='step-2',
            kind=LoopStepKind.PROBE,
            task=LoopProbe.REALM_RAID_TICKET.value,
            operator=LoopCompare.GT,
            threshold=0,
            interval=300,
            max_polls=0,
        ),
        LoopStep(id='step-3', kind=LoopStepKind.TASK, task='RealmRaid'),
    ]


class Loop(BaseModel):
    # 总开关；循环模式下还需要 optimization.schedule_mode = loop
    enable: bool = Field(default=False, description='loop_enable_help')
    # 当前任务列表（有序）
    steps: list[LoopStep] = Field(default_factory=default_steps, description='loop_steps_help')
    # 新添加探针步骤的默认轮询间隔（秒）
    interval: int = Field(default=300, ge=5, description='loop_interval_help')
    # 单次探针等待的总超时（分钟）；0 = 不限制
    timeout_minutes: int = Field(default=360, ge=0, description='loop_timeout_help')
    # 每 N 次轮询休息一次；0 = 不额外休息
    rest_every: int = Field(default=0, ge=0, description='loop_rest_every_help')
    # rest_every 的随机浮动（次数，绝对值）
    rest_every_jitter: int = Field(default=0, ge=0, description='loop_rest_every_jitter_help')
    # 休息时长（秒）
    rest_duration: int = Field(default=1800, ge=10, description='loop_rest_duration_help')
    # rest_duration 的随机浮动（秒，绝对值）
    rest_jitter: int = Field(default=0, ge=0, description='loop_rest_jitter_help')
    # 每日最大轮数；0 = 不限
    max_cycles: int = Field(default=0, ge=0, description='loop_max_cycles_help')
    # 整个循环队列一轮完成后的额外等待（秒）
    cycle_interval: int = Field(default=0, ge=0, description='loop_cycle_interval_help')
    # 轮转方式；目前只有顺序轮转
    rotation: LoopRotation = Field(default=LoopRotation.SEQUENTIAL, description='loop_rotation_help')
    # 队列为空时进入休眠，而不是按 interval 反复空转
    idle_on_empty: bool = Field(default=True, description='loop_idle_on_empty_help')
    # 任务失败后自动重试一次
    retry_on_failure: bool = Field(default=True, description='loop_retry_on_failure_help')
