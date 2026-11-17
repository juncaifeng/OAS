"""Application and per-user data paths for source and packaged executions."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = Path(os.environ.get("OAS_DATA_DIR", APP_ROOT)).expanduser().resolve()


def data_path(*parts: str) -> Path:
    return DATA_ROOT.joinpath(*parts)


def app_path(*parts: str) -> Path:
    return APP_ROOT.joinpath(*parts)


def ensure_runtime_data() -> None:
    """Create writable data directories without copying executable resources."""
    config_dir = data_path("config")
    config_dir.mkdir(parents=True, exist_ok=True)
    data_path("log").mkdir(parents=True, exist_ok=True)

    source_template = app_path("config", "template.json")
    if source_template.is_file():
        target_template = config_dir / "template.json"
        if source_template.resolve() != target_template.resolve():
            shutil.copy2(source_template, target_template)

    source_findjade = app_path("config", "findjade")
    target_findjade = config_dir / "findjade"
    if source_findjade.is_dir() and not target_findjade.exists():
        shutil.copytree(source_findjade, target_findjade)
