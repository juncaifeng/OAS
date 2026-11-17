#!/usr/bin/env python3
"""Synchronize release versions without changing the uv project lock metadata."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def update_json(path: Path, version: str) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    data["version"] = version
    if path.name == "package-lock.json" and "" in data.get("packages", {}):
        data["packages"][""]["version"] = version
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("version")
    args = parser.parse_args()
    match = re.fullmatch(r"v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)", args.version)
    if not match:
        raise SystemExit(f"Invalid semantic version: {args.version}")
    version = match.group(1)

    update_json(ROOT / "desktop/package.json", version)
    lock = ROOT / "desktop/package-lock.json"
    if lock.exists():
        update_json(lock, version)
    update_json(ROOT / "desktop/src-tauri/tauri.conf.json", version)

    cargo = ROOT / "desktop/src-tauri/Cargo.toml"
    text = cargo.read_text(encoding="utf-8")
    text, count = re.subn(r'(?m)^version = "[^"]+"$', f'version = "{version}"', text, count=1)
    if count != 1:
        raise SystemExit("Unable to update Cargo package version")
    cargo.write_text(text, encoding="utf-8")
    (ROOT / "module/version.py").write_text(f'__version__ = "{version}"\n', encoding="utf-8")
    print(f"Release version: {version}")


if __name__ == "__main__":
    main()
