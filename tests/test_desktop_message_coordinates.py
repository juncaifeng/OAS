from types import SimpleNamespace

from module.device.method.windows_impl import Window
from tasks.Script.config_desktop import DesktopControlMethod


def make_probe(physical_size, screenshot_size=(1280, 720)):
    probe = object.__new__(Window)
    probe.screenshot_size = screenshot_size
    probe.desktop_client_size = lambda: physical_size
    return probe


def test_desktop_message_coordinates_stay_in_physical_client_space():
    probe = make_probe((1280, 720))

    assert probe.desktop_message_coord(625, 596) == (625, 596)


def test_desktop_message_coordinates_scale_only_with_actual_client_size():
    probe = make_probe((1600, 900))

    assert probe.desktop_message_coord(640, 360) == (800, 450)


def test_desktop_input_method_defaults_to_real_input():
    probe = object.__new__(Window)
    probe.config = SimpleNamespace(script=SimpleNamespace(desktop=SimpleNamespace(
        control_method=DesktopControlMethod.REAL_INPUT)))

    assert probe.desktop_real_input_enabled()


def test_desktop_window_message_mode_can_be_selected_explicitly():
    probe = object.__new__(Window)
    probe.config = SimpleNamespace(script=SimpleNamespace(desktop=SimpleNamespace(
        control_method=DesktopControlMethod.WINDOW_MESSAGE)))

    assert not probe.desktop_real_input_enabled()
