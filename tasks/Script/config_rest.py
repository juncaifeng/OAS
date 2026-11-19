# This Python file uses the following encoding: utf-8
"""强制作息时间。

与时间/轮询模式无关，始终生效：只在每天的运行窗口内执行任务，连续运行
一段时间后强制休息，并支持每周固定休息日。
"""
import re
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class WeeklyRest(str, Enum):
    NONE = 'none'
    SINGLE = 'single'  # 周日休息
    DOUBLE = 'double'  # 周六、周日休息


class RestSchedule(BaseModel):
    enable: bool = Field(default=False, description='rest_enable_help')
    # 每日运行窗口，HH:MM
    start: str = Field(default='08:30', description='rest_start_help')
    end: str = Field(default='23:30', description='rest_end_help')
    # 窗口的随机浮动（分钟），0 = 固定；每天使用同一个偏移
    random_offset: int = Field(default=0, ge=0, le=120, description='rest_random_offset_help')
    # 连续运行 N 分钟后强制休息
    run_minutes: int = Field(default=90, ge=0, le=1440, description='rest_run_minutes_help')
    # 强制休息时长（分钟）
    break_minutes: int = Field(default=12, ge=0, le=720, description='rest_break_minutes_help')
    # 每周休息日
    weekly_rest: WeeklyRest = Field(default=WeeklyRest.NONE, description='rest_weekly_help')

    @field_validator('start', 'end')
    @classmethod
    def validate_hhmm(cls, value: str) -> str:
        value = str(value).strip()
        if not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', value):
            raise ValueError('time must be HH:MM')
        return value
