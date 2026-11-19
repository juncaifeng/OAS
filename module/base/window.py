"""定时任务执行窗口的纯函数判定。"""
from __future__ import annotations

from datetime import datetime, time, timedelta


def parse_hhmm(value: str) -> time:
    hour, minute = str(value).strip().split(':')
    return time(hour=int(hour), minute=int(minute))


def in_window(now: datetime, start: str, end: str) -> bool:
    """是否落在 HH:MM - HH:MM 内；end <= start 视为跨午夜。"""
    start_t = parse_hhmm(start)
    end_t = parse_hhmm(end)
    current = now.time()
    if end_t > start_t:
        return start_t <= current < end_t
    return current >= start_t or current < end_t


def next_window_start(now: datetime, start: str, end: str) -> datetime:
    """下一次进入窗口的时间（今天还没到就是今天，否则明天）。"""
    candidate = datetime.combine(now.date(), parse_hhmm(start))
    if candidate <= now:
        candidate += timedelta(days=1)
    return candidate


def window_bounds(day, start: str, end: str) -> tuple[datetime, datetime]:
    start_dt = datetime.combine(day, parse_hhmm(start))
    end_dt = datetime.combine(day, parse_hhmm(end))
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return start_dt, end_dt


def in_window_prelude(now: datetime, start: str, end: str, lead_minutes: int) -> bool:
    """是否处于「窗口开始前 lead 分钟」的抢占区间。"""
    lead = timedelta(minutes=max(0, lead_minutes))
    if lead <= timedelta(0):
        return False
    for day in (now.date() - timedelta(days=1), now.date()):
        start_dt, _ = window_bounds(day, start, end)
        if start_dt - lead <= now < start_dt:
            return True
    return False
