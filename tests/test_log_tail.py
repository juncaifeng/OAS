import os

from module.server.log_tail import latest_log_file, tail_lines


def test_tail_lines_reads_only_the_tail(tmp_path):
    path = tmp_path / "2026-11-18_oas1.txt"
    path.write_text("\n".join(f"line {index}" for index in range(500)) + "\n", encoding="utf-8")

    assert tail_lines(path, limit=3) == ["line 497", "line 498", "line 499"]
    assert tail_lines(path, limit=0) == []
    assert tail_lines(tmp_path / "missing.txt", limit=10) == []


def test_latest_log_file_picks_newest_and_uses_logger_name_rule(tmp_path):
    older = tmp_path / "2026-11-17_oas1.txt"
    newer = tmp_path / "2026-11-18_oas1.txt"
    older.write_text("old", encoding="utf-8")
    newer.write_text("new", encoding="utf-8")
    os.utime(older, (0, 0))

    assert latest_log_file("oas1", tmp_path) == newer
    # set_file_logger() 会在第一个下划线处截断配置名
    assert latest_log_file("oas1_debug", tmp_path) == newer
    assert latest_log_file("missing", tmp_path) is None
