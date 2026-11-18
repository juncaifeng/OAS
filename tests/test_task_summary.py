from module.config.config_menu import ConfigMenu
from module.config.config_model import ConfigModel


def test_task_summary_contains_only_scheduled_tasks():
    summary = ConfigModel(config_name='template').task_summary()

    assert 'Orochi' in summary
    # Script / Restart / GlobalGame 没有 scheduler 分组，不应出现在任务总览里
    assert 'Script' not in summary
    assert 'Restart' not in summary
    assert 'GlobalGame' not in summary

    for item in summary.values():
        assert set(item) == {'enable', 'next_run'}
        assert isinstance(item['enable'], bool)
        assert isinstance(item['next_run'], str)


def test_script_task_exposes_numeric_limits():
    fields = ConfigModel(config_name='template').script_task('Orochi')['scheduler']
    delay_date = next(field for field in fields if field['name'] == 'delay_date')

    assert delay_date['minimum'] == 1
    assert delay_date['maximum'] == 31


def test_gui_menu_list_hides_placeholders_and_empty_groups():
    menu = ConfigMenu().gui_menu_list

    assert 'Tools' not in menu
    assert 'TaskList' not in menu
    assert 'Overview' not in menu
    assert all(tasks for tasks in menu.values())
    assert 'Orochi' in menu['Soul Zones']
