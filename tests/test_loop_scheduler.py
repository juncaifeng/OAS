import pytest
from pydantic import ValidationError

from module.base.loop import compare_value, wait_after_poll
from tasks.Script.config import Script
from tasks.Script.config_loop import Loop, LoopCompare, LoopStep, LoopStepKind
from tasks.Script.config_optimization import Optimization, ScheduleMode


def test_compare_value_supports_all_operators():
    assert compare_value(5, LoopCompare.GT, 0) is True
    assert compare_value(0, LoopCompare.GT, 0) is False
    assert compare_value(0, LoopCompare.GE, 0) is True
    assert compare_value(1, LoopCompare.LT, 2) is True
    assert compare_value(2, LoopCompare.LE, 2) is True
    assert compare_value(2, LoopCompare.EQ, 2) is True
    assert compare_value(2, LoopCompare.NE, 2) is False
    assert compare_value(2, ">", 1) is True


def test_loop_rest_after_n_polls():
    assert wait_after_poll(1, 300, 6, 1800) == 300
    assert wait_after_poll(5, 300, 6, 1800) == 300
    assert wait_after_poll(6, 300, 6, 1800) == 1800
    assert wait_after_poll(6, 300, 0, 1800) == 300


def test_loop_defaults_and_mode_are_separate():
    optimization = Optimization()
    assert optimization.schedule_mode == ScheduleMode.TIME

    loop = Loop()
    assert loop.enable is False
    assert loop.max_cycles == 0
    assert [step.kind for step in loop.steps] == [
        LoopStepKind.TASK,
        LoopStepKind.PROBE,
        LoopStepKind.TASK,
    ]
    assert loop.steps[0].task == "Exploration"
    assert loop.steps[1].task == "realm_raid_ticket"
    assert loop.steps[2].task == "RealmRaid"

    script = Script()
    assert script.loop.enable is False


def test_loop_step_queue_order_and_probe_fields():
    loop = Loop(
        steps=[
            LoopStep(id="a", kind=LoopStepKind.TASK, task="Exploration"),
            LoopStep(
                id="b",
                kind=LoopStepKind.PROBE,
                task="realm_raid_ticket",
                operator=LoopCompare.GE,
                threshold=30,
                interval=600,
                max_polls=6,
            ),
        ]
    )
    assert [step.task for step in loop.steps] == ["Exploration", "realm_raid_ticket"]
    probe = loop.steps[1]
    assert probe.operator == LoopCompare.GE
    assert probe.threshold == 30
    assert probe.interval == 600
    assert probe.max_polls == 6


def test_loop_step_rejects_out_of_range_values():
    with pytest.raises(ValidationError):
        LoopStep(interval=1)
    with pytest.raises(ValidationError):
        Loop(interval=1)
    with pytest.raises(ValidationError):
        LoopStep(max_polls=-1)


def test_template_ships_ordered_loop_plan():
    from module.config.config_model import ConfigModel

    plan = ConfigModel(config_name="template").loop_plan()

    assert plan["enable"] is False
    assert [step["kind"] for step in plan["steps"]] == ["task", "probe", "task"]
    assert [step["task"] for step in plan["steps"]] == ["Exploration", "realm_raid_ticket", "RealmRaid"]
    assert plan["steps"][1]["operator"] == ">"
    assert plan["max_cycles"] == 0


def test_script_params_hide_loop_planner_group():
    from module.config.config_model import ConfigModel

    groups = ConfigModel(config_name="template").script_task("Script")

    assert "loop" not in groups
    assert "optimization" in groups
