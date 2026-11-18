from module.notify.notify import Notifier


def test_missing_provider_returns_false_instead_of_raising():
    notifier = Notifier("provider: null", True)

    assert notifier.push(title="test", content="hello") is False


def test_invalid_yaml_returns_false_instead_of_raising():
    notifier = Notifier("provider: [", True)

    assert notifier.push(title="test", content="hello") is False


def test_disabled_notifier_returns_false():
    notifier = Notifier("provider: null", False)

    assert notifier.push(title="test", content="hello") is False
