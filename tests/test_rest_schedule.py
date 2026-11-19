import random
from datetime import date, datetime, timedelta

from module.base.rest import evaluate_rest, is_rest_day, jitter_value, window_for_day
from tasks.Script.config_rest import RestSchedule, WeeklyRest


def schedule(**overrides) -> RestSchedule:
    data = {"enable": True, "start": "08:30", "end": "23:30", "run_minutes": 90, "break_minutes": 12}
    data.update(overrides)
    return RestSchedule(**data)


def test_window_is_stable_for_the_same_day():
    day = date(2026, 11, 19)
    first = window_for_day(day, "08:30", "23:30", 25)
    second = window_for_day(day, "08:30", "23:30", 25)

    assert first == second
    assert first[1] - first[0] == timedelta(hours=15)
    assert abs((first[0] - datetime(2026, 11, 19, 8, 30)).total_seconds()) <= 25 * 60


def test_disabled_schedule_always_allows_work():
    state = evaluate_rest(datetime(2026, 11, 19, 3, 0), RestSchedule())

    assert state["allowed"] is True
    assert state["status"] == "off"


def test_outside_window_waits_for_next_start():
    rest = schedule()

    before = evaluate_rest(datetime(2026, 11, 19, 7, 0), rest)
    assert before["allowed"] is False
    assert before["next_at"] == datetime(2026, 11, 19, 8, 30)

    after = evaluate_rest(datetime(2026, 11, 19, 23, 45), rest)
    assert after["allowed"] is False
    assert after["next_at"] == datetime(2026, 11, 20, 8, 30)


def test_continuous_run_forces_a_break():
    rest = schedule()
    start = datetime(2026, 11, 19, 8, 30)

    working = evaluate_rest(start + timedelta(minutes=30), rest)
    assert working["allowed"] is True
    assert working["status"] == "working"
    assert working["work_minutes"] == 30

    breaking = evaluate_rest(start + timedelta(minutes=95), rest)
    assert breaking["allowed"] is False
    assert breaking["status"] == "break"
    assert breaking["next_at"] == start + timedelta(minutes=102)

    resumed = evaluate_rest(start + timedelta(minutes=102), rest)
    assert resumed["allowed"] is True


def test_weekly_rest_skips_the_whole_day():
    rest = schedule(weekly_rest=WeeklyRest.SINGLE)

    assert is_rest_day(date(2026, 11, 22), "single") is True  # 周日
    assert is_rest_day(date(2026, 11, 21), "single") is False
    assert is_rest_day(date(2026, 11, 21), "double") is True  # 周六

    state = evaluate_rest(datetime(2026, 11, 22, 10, 0), rest)
    assert state["allowed"] is False
    assert state["status"] == "weekly"
    assert state["next_at"] == datetime(2026, 11, 23, 8, 30)


def test_zero_run_minutes_disables_forced_breaks():
    rest = schedule(run_minutes=0, break_minutes=0)
    state = evaluate_rest(datetime(2026, 11, 19, 20, 0), rest)

    assert state["allowed"] is True
    assert state["status"] == "working"


def test_jitter_stays_within_percent_and_caps_at_thirty():
    assert jitter_value(0, 20) == 0
    assert jitter_value(45, 0) == 45

    value = jitter_value(45, 10, rng=random.Random(0))
    assert 40 <= value <= 50

    capped = jitter_value(100, 60, rng=random.Random(1))
    assert 70 <= capped <= 130


def test_template_ships_rest_schedule_and_hides_it_from_script_params():
    from module.config.config_model import ConfigModel

    model = ConfigModel(config_name="template")
    schedule = model.rest_schedule()

    assert schedule["enable"] is False
    assert schedule["start"] == "08:30"
    assert schedule["end"] == "23:30"
    assert schedule["weekly_rest"] == "none"

    groups = model.script_task("Script")
    assert "rest" not in groups
    assert "loop" not in groups
