"""强制作息时间的判定逻辑（纯函数，便于单测）。

运行窗口、随机偏移、连续运行后的强制休息、每周休息日都在这里计算，
调度器只负责按 ``evaluate_rest`` 的结果休眠。
"""
from __future__ import annotations

import random
from datetime import date, datetime, time, timedelta


def parse_hhmm(value: str) -> time:
    hour, minute = str(value).strip().split(':')
    return time(hour=int(hour), minute=int(minute))


def offset_for_day(day: date, random_offset: int) -> timedelta:
    """每天一个固定的随机偏移，避免窗口在同一天内来回抖动。"""
    if random_offset <= 0:
        return timedelta(0)
    rng = random.Random(day.toordinal())
    return timedelta(minutes=rng.randint(-random_offset, random_offset))


def window_for_day(day: date, start: str, end: str, random_offset: int = 0) -> tuple[datetime, datetime]:
    offset = offset_for_day(day, random_offset)
    start_dt = datetime.combine(day, parse_hhmm(start)) + offset
    end_dt = datetime.combine(day, parse_hhmm(end)) + offset
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return start_dt, end_dt


def is_rest_day(day: date, weekly_rest: str) -> bool:
    weekly_rest = getattr(weekly_rest, 'value', weekly_rest) or 'none'
    if weekly_rest == 'single':
        return day.weekday() == 6
    if weekly_rest == 'double':
        return day.weekday() >= 5
    return False


def next_work_day(day: date, weekly_rest: str) -> date:
    for _ in range(14):
        day = day + timedelta(days=1)
        if not is_rest_day(day, weekly_rest):
            return day
    return day


def evaluate_rest(now: datetime, rest) -> dict:
    """Return whether tasks may run now and when the next window starts."""
    enable = bool(getattr(rest, 'enable', False))
    if not enable:
        return {
            'allowed': True,
            'status': 'off',
            'next_at': None,
            'window_start': None,
            'window_end': None,
            'work_minutes': 0,
            'break_minutes': 0,
        }

    start = getattr(rest, 'start', '08:30')
    end = getattr(rest, 'end', '23:30')
    random_offset = int(getattr(rest, 'random_offset', 0) or 0)
    run_minutes = int(getattr(rest, 'run_minutes', 0) or 0)
    break_minutes = int(getattr(rest, 'break_minutes', 0) or 0)
    weekly_rest = getattr(rest, 'weekly_rest', 'none')

    def next_start(day: date) -> datetime:
        if is_rest_day(day, weekly_rest):
            day = next_work_day(day, weekly_rest)
        return window_for_day(day, start, end, random_offset)[0]

    day = now.date()
    start_dt, end_dt = window_for_day(day, start, end, random_offset)

    # 昨天的窗口可能跨过午夜，仍然算在昨天的作息里
    yesterday_start, yesterday_end = window_for_day(day - timedelta(days=1), start, end, random_offset)
    if yesterday_end > now and yesterday_start <= now:
        start_dt, end_dt = yesterday_start, yesterday_end

    base = {
        'status': 'outside',
        'next_at': None,
        'window_start': start_dt,
        'window_end': end_dt,
        'work_minutes': 0,
        'break_minutes': break_minutes,
    }

    if is_rest_day(start_dt.date(), weekly_rest):
        return {**base, 'allowed': False, 'status': 'weekly', 'next_at': next_start(day)}

    if now < start_dt:
        return {**base, 'allowed': False, 'next_at': start_dt}

    if now >= end_dt:
        return {**base, 'allowed': False, 'next_at': next_start(day + timedelta(days=1))}

    if run_minutes <= 0 or break_minutes <= 0:
        work = int((now - start_dt).total_seconds() // 60)
        return {**base, 'allowed': True, 'status': 'working', 'work_minutes': work}

    cycle = timedelta(minutes=run_minutes + break_minutes)
    work_span = timedelta(minutes=run_minutes)
    elapsed = now - start_dt
    cycles = int(elapsed // cycle)
    phase = elapsed - cycles * cycle
    if phase < work_span:
        return {**base, 'allowed': True, 'status': 'working', 'work_minutes': int(phase.total_seconds() // 60)}
    next_at = start_dt + cycles * cycle + cycle
    return {**base, 'allowed': False, 'status': 'break', 'next_at': next_at,
            'work_minutes': run_minutes}


def jitter_absolute(value: int, delta: int, rng: random.Random | None = None) -> int:
    """在 ±delta 内随机浮动；delta 会被限制为基准值的 30%（取整）。

    界面上直接填写绝对值，例如 4 ±1、45 ±13（上限 floor(45×0.3)）。
    """
    value = int(value)
    delta = max(0, int(delta))
    if value <= 0 or delta <= 0:
        return max(0, value)
    delta = min(delta, int(value * 0.3))
    if delta <= 0:
        return value
    rng = rng or random
    return max(0, value + rng.randint(-delta, delta))

