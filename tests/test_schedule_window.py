from datetime import datetime

from module.base.window import in_window, in_window_prelude, next_window_start
from tasks.Script.config import Script
from tasks.Script.config_schedule import ScheduleWindow, ScheduledTasks


def test_in_window_simple():
    assert in_window(datetime(2026, 11, 19, 19, 0), "19:00", "21:00") is True
    assert in_window(datetime(2026, 11, 19, 20, 59), "19:00", "21:00") is True
    assert in_window(datetime(2026, 11, 19, 21, 0), "19:00", "21:00") is False
    assert in_window(datetime(2026, 11, 19, 18, 59), "19:00", "21:00") is False


def test_in_window_overnight():
    assert in_window(datetime(2026, 11, 19, 23, 30), "22:00", "02:00") is True
    assert in_window(datetime(2026, 11, 20, 1, 59), "22:00", "02:00") is True
    assert in_window(datetime(2026, 11, 20, 3, 0), "22:00", "02:00") is False


def test_next_window_start_today_or_tomorrow():
    now = datetime(2026, 11, 19, 12, 0)
    assert next_window_start(now, "19:00", "21:00") == datetime(2026, 11, 19, 19, 0)
    assert next_window_start(datetime(2026, 11, 19, 22, 0), "19:00", "21:00") == datetime(2026, 11, 20, 19, 0)


def test_prelude_pauses_polling_before_the_window():
    assert in_window_prelude(datetime(2026, 11, 19, 18, 59), "19:00", "21:00", 2) is True
    assert in_window_prelude(datetime(2026, 11, 19, 18, 57), "19:00", "21:00", 2) is False
    assert in_window_prelude(datetime(2026, 11, 19, 19, 30), "19:00", "21:00", 2) is False
    assert in_window_prelude(datetime(2026, 11, 19, 18, 59), "19:00", "21:00", 0) is False


def test_window_model_defaults_and_validation():
    window = ScheduleWindow(task="RealmRaid")
    assert window.start == "19:00"
    assert window.end == "21:00"
    assert window.enable is True

    scheduled = ScheduledTasks()
    assert scheduled.windows == []
    assert Script().scheduled.windows == []


def test_template_ships_empty_windows_without_script_params_duplicate():
    from module.config.config_model import ConfigModel

    model = ConfigModel(config_name="template")
    assert model.scheduled_tasks()["windows"] == []

    groups = model.script_task("Script")
    assert "scheduled" not in groups
