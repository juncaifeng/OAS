"""Read the tail of an instance log file without loading the whole file."""
from __future__ import annotations

from pathlib import Path

from module.logger import LOG_DIR


def latest_log_file(config_name: str, log_dir: Path | str | None = None) -> Path | None:
    """返回某个实例最近写入的日志文件；不存在时返回 None。

    `set_file_logger()` 会把配置名从第一个下划线处截断，这里保持同样规则。
    """
    base = str(config_name).split("_", 1)[0]
    folder = Path(log_dir) if log_dir is not None else LOG_DIR
    if not folder.exists():
        return None
    files = sorted(folder.glob(f"*_{base}.txt"), key=lambda item: item.stat().st_mtime, reverse=True)
    return files[0] if files else None


def tail_lines(path: Path | str, limit: int = 300, chunk_size: int = 64 * 1024) -> list[str]:
    """从文件尾部倒着读取最多 `limit` 行，避免整文件读入内存。"""
    if limit <= 0:
        return []
    file_path = Path(path)
    if not file_path.is_file():
        return []

    with open(file_path, "rb") as file:
        file.seek(0, 2)
        position = file.tell()
        data = b""
        while position > 0 and data.count(b"\n") <= limit:
            step = min(chunk_size, position)
            position -= step
            file.seek(position)
            data = file.read(step) + data

    return data.decode("utf-8", errors="replace").splitlines()[-limit:]
