# This Python file uses the following encoding: utf-8
"""定时任务：每个任务可选的执行窗口。

时间模式仍然使用任务自己的 ``scheduler.next_run`` 决定什么时候跑；
窗口只是把执行限制在 ``start`` - ``end`` 之间，窗口外顺延到下一次开始。
"""
import re
from pydantic import BaseModel, Field, field_validator


class ScheduleWindow(BaseModel):
    # 大驼峰任务名，如 RealmRaid
    task: str = Field(description='schedule_window_task_help')
    enable: bool = Field(default=True, description='schedule_window_enable_help')
    start: str = Field(default='19:00', description='schedule_window_start_help')
    end: str = Field(default='21:00', description='schedule_window_end_help')
    # 窗口开始前 N 分钟中断轮询，给定时任务让路
    lead_minutes: int = Field(default=2, ge=0, le=60, description='schedule_window_lead_help')
    note: str = Field(default='', description='schedule_window_note_help')

    @field_validator('start', 'end')
    @classmethod
    def validate_hhmm(cls, value: str) -> str:
        value = str(value).strip()
        if not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', value):
            raise ValueError('time must be HH:MM')
        return value


class ScheduledTasks(BaseModel):
    windows: list[ScheduleWindow] = Field(default_factory=list, description='schedule_windows_help')
