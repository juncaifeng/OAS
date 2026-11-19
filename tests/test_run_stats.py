from datetime import datetime

import module.server.stats as stats_module
from module.base.run_history import range_start
from module.server.stats import build_stats


def record(task, start, seconds, success, mode="loop", kind="run", reason=""):
    return {
        "kind": kind,
        "task": task,
        "mode": mode,
        "start": start,
        "end": start,
        "seconds": seconds,
        "success": success,
        "reason": reason,
    }


def test_range_start_variants():
    now = datetime(2026, 11, 19, 15, 0)
    assert range_start("today", now)[0] == datetime(2026, 11, 19)
    assert range_start("yesterday", now) == (datetime(2026, 11, 18), datetime(2026, 11, 19))
    assert range_start("7d", now)[0] == datetime(2026, 11, 13)


def test_build_stats_aggregates_metrics_and_hourly(monkeypatch):
    records = [
        record("Exploration", "2026-11-19T09:05:00", 600, True),
        record("Exploration", "2026-11-19T12:10:00", 300, False),
        record("RealmRaid", "2026-11-19T12:30:00", 1200, True, mode="time"),
        record("realm_raid_ticket", "2026-11-19T13:00:00", 0, False, kind="skip", reason="探针未满足条件"),
    ]
    monkeypatch.setattr(stats_module, "load_runs", lambda config, since: records)

    result = build_stats("oas1", "today", now=datetime(2026, 11, 19, 15, 0))

    assert result["metrics"]["runs"] == 3
    assert result["metrics"]["failures"] == 1
    assert result["metrics"]["skips"] == 1
    assert result["metrics"]["scheduled"] == 1
    assert result["metrics"]["loop"] == 2
    assert result["metrics"]["total_seconds"] == 2100
    assert result["metrics"]["success_rate"] == 66.7

    assert result["hourly"][9] == 1
    assert result["hourly"][12] == 2
    assert sum(result["hourly"]) == 3

    assert result["tasks"][0]["task"] == "Exploration"
    assert result["tasks"][0]["count"] == 2
    assert result["tasks"][0]["success_rate"] == 50.0

    assert result["exceptions"][0]["kind"] == "skip"
    assert result["exceptions"][0]["reason"] == "探针未满足条件"


def test_build_stats_empty_history(monkeypatch):
    monkeypatch.setattr(stats_module, "load_runs", lambda config, since: [])

    result = build_stats("oas1", "today", now=datetime(2026, 11, 19, 15, 0))

    assert result["metrics"]["runs"] == 0
    assert result["metrics"]["success_rate"] == 0.0
    assert result["tasks"] == []
    assert result["exceptions"] == []
    assert result["hourly"] == [0] * 24
