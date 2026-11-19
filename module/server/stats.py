"""「今日大盘」统计聚合（纯函数，便于单测）。"""
from __future__ import annotations

from datetime import datetime

from module.base.run_history import load_runs, range_start


def build_stats(config_name: str, range_key: str = 'today', now: datetime | None = None) -> dict:
    start, end = range_start(range_key, now)
    records = load_runs(config_name, start)

    runs = [item for item in records if item.get('kind') == 'run']
    skips = [item for item in records if item.get('kind') == 'skip']

    total_seconds = sum(int(item.get('seconds', 0)) for item in runs)
    success = sum(1 for item in runs if item.get('success'))
    scheduled = sum(1 for item in runs if item.get('mode') == 'time')
    loop = sum(1 for item in runs if item.get('mode') == 'loop')

    hourly = [0] * 24
    for item in runs:
        try:
            hour = datetime.fromisoformat(item.get('start', '')).hour
        except ValueError:
            continue
        hourly[hour] += 1

    grouped: dict[str, dict] = {}
    for item in runs:
        task = str(item.get('task', '')).strip() or 'Unknown'
        entry = grouped.setdefault(task, {'task': task, 'count': 0, 'seconds': 0, 'success': 0})
        entry['count'] += 1
        entry['seconds'] += int(item.get('seconds', 0))
        entry['success'] += 1 if item.get('success') else 0

    tasks = sorted(grouped.values(), key=lambda entry: entry['count'], reverse=True)
    for entry in tasks:
        entry['success_rate'] = round(entry['success'] / entry['count'] * 100, 1) if entry['count'] else 0.0

    exceptions = []
    for item in records:
        if item.get('kind') == 'run' and item.get('success'):
            continue
        exceptions.append({
            'time': item.get('start'),
            'task': item.get('task'),
            'kind': item.get('kind'),
            'reason': item.get('reason', '') or ('执行失败' if item.get('kind') == 'run' else '跳过'),
        })
    exceptions.sort(key=lambda item: item.get('time') or '', reverse=True)

    return {
        'range': {'key': range_key, 'start': start.isoformat(timespec='seconds'), 'end': end.isoformat(timespec='seconds')},
        'metrics': {
            'runs': len(runs),
            'success_rate': round(success / len(runs) * 100, 1) if runs else 0.0,
            'total_seconds': total_seconds,
            'scheduled': scheduled,
            'loop': loop,
            'skips': len(skips),
            'failures': len(runs) - success,
        },
        'hourly': hourly,
        'tasks': tasks[:8],
        'exceptions': exceptions[:8],
    }
