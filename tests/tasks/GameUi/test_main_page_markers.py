from tasks.GameUi.action import ActionSequence
from tasks.GameUi.assets import GameUiAssets
from tasks.GameUi.default_pages import page_exploration, page_main


class PageProbe:
    def __init__(self, matched_rule):
        self.matched_rule = matched_rule

    def appear(self, target):
        return target is self.matched_rule


def test_main_page_accepts_open_menu_markers():
    probe = PageProbe(GameUiAssets.I_MAIN_GOTO_COLLECTION)

    assert page_main.recognizer.evaluate(probe)


def test_main_page_accepts_scroll_marker_when_dynamic_banner_changes():
    probe = PageProbe(GameUiAssets.I_MAIN_SCROLL_CLOSE)

    assert page_main.recognizer.evaluate(probe)


def test_main_to_exploration_collapses_open_menu_before_clicking_exploration():
    transition = next(t for t in page_main.transitions if t.destination is page_exploration)

    assert isinstance(transition.action, ActionSequence)
    assert transition.action.success_index == 1
    assert callable(transition.action.actions[1])


def test_main_page_still_rejects_unrelated_pages():
    probe = PageProbe(GameUiAssets.I_CHECK_GUILD)

    assert not page_main.recognizer.evaluate(probe)
