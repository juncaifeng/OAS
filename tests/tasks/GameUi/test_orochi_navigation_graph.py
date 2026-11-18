from tasks.GameUi.page import page_shikigami_records
from tasks.Orochi.page import page_orochi


def test_orochi_enters_shikigami_records_without_creating_a_return_shortcut():
    orochi_destinations = {transition.destination for transition in page_orochi.transitions}
    record_destinations = {transition.destination for transition in page_shikigami_records.transitions}

    assert page_shikigami_records in orochi_destinations
    assert page_orochi not in record_destinations
