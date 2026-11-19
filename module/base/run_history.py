"""任务运行历史（JSONL），供「今日大盘」统计使用。

每条记录一行，字段：
    {"kind": "run"|"skip", "task": str, "mode": "time"|"loop",
     "start": iso, "end": iso, "seconds": int, "success": bool,
     "reason": str}
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

from module.logger import logger
from module.runtime import data_path

# 单个实例最多保留的记录数，超出后从头部裁剪
MAX_RECORDS = 20000


def runs_path(config_name: str) -> Path:
    return data_path('log', f'runs_{config_name}.jsonl')


def _append(config_name: str, record: dict) -> None:
    path = runs_path(config_name)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('a', encoding='utf-8') as file:
            file.write(json.dumps(record, ensure_ascii=False) + '\n')
    except Exception as error:
        logger.warning(f'Run history write failed: {error}')


def record_run(config_name: str, task: str, mode: str, started: datetime, ended: datetime, success: bool) -> None:
    _append(config_name, {
        'kind': 'run',
        'task': task,
        'mode': mode,
        'start': started.isoformat(timespec='seconds'),
        'end': ended.isoformat(timespec='seconds'),
        'seconds': max(0, int((ended - started).total_seconds())),
        'success': bool(success),
    })


def record_skip(config_name: str, task: str, mode: str, reason: str) -> None:
    now = datetime.now()
    _append(config_name, {
        'kind': 'skip',
        'task': task,
        'mode': mode,
        'start': now.isoformat(timespec='seconds'),
        'end': now.isoformat(timespec='seconds'),
        'seconds': 0,
        'success': False,
        'reason': reason,
    })


def load_runs(config_name: str, since: datetime) -> list[dict]:
    path = runs_path(config_name)
    if not path.is_file():
        return []
    records = []
    try:
        with path.open('r', encoding='utf-8') as file:
            for line in file:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except ValueError:
                    continue
                try:
                    start = datetime.fromisoformat(record.get('start', ''))
                except ValueError:
                    continue
                if start >= since:
                    records.append(record)
    except Exception as error:
        logger.warning(f'Run history read failed: {error}')
    return records


def trim_history(config_name: str) -> None:
    """记录过多时只保留最后 MAX_RECORDS 行。"""
    path = runs_path(config_name)
    if not path.is_file():
        return
    try:
        with path.open('r', encoding='utf-8') as file:
            lines = file.readlines()
        if len(lines) <= MAX_RECORDS:
            return
        with path.open('w', encoding='utf-8') as file:
            file.writelines(lines[-MAX_RECORDS:])
    except Exception as error:
        logger.warning(f'Run history trim failed: {error}')


def range_start(range_key: str, now: datetime | None = None) -> tuple[datetime, datetime]:
    """返回统计区间 [start, end)。"""
    now = now or datetime.now()
    today = datetime(now.year, now.month, now.day)
    if range_key == 'yesterday':
        return today - timedelta(days=1), today
    if range_key == '7d':
        return today - timedelta(days=6), now + timedelta(seconds=1)
    return today, now + timedelta(seconds=1)
