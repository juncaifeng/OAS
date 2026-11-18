from datetime import timedelta

import pytest

from tasks.Component.config_base import datadelta_validator, format_timedelta, parse_timedelta_string


def test_parse_timedelta_handles_multi_digit_and_single_digit_days():
    assert parse_timedelta_string("01 00:00:00") == timedelta(days=1)
    assert parse_timedelta_string("1 05:30:00") == timedelta(days=1, hours=5, minutes=30)
    assert parse_timedelta_string("10 05:30:00") == timedelta(days=10, hours=5, minutes=30)


def test_format_timedelta_round_trip_keeps_multi_digit_days():
    assert format_timedelta(parse_timedelta_string("10 05:30:00")) == "10 05:30:00"
    assert format_timedelta(timedelta(days=1)) == "01 00:00:00"


def test_invalid_duration_raises_and_validator_falls_back_to_one_day():
    with pytest.raises(ValueError):
        parse_timedelta_string("bad")
    assert datadelta_validator("bad") == timedelta(days=1)
