#!/usr/bin/env python3
"""Stage a Windows python-build-standalone runtime for the Tauri bundler.

This script is intended for GitHub Actions. It does not build a Python wheel or
executable: the portable CPython tree, locked dependencies and OAS source are
kept as separate files so multiprocessing and relative asset paths keep working.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / "desktop/src-tauri/resources/runtime"


def run(*args: str, capture: bool = False) -> str:
    print("+", " ".join(args), flush=True)
    result = subprocess.run(
        args,
        cwd=ROOT,
        check=False,
        text=True,
        encoding="utf-8",
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )
    if result.returncode:
        if capture:
            print(result.stdout, file=sys.stderr)
            print(result.stderr, file=sys.stderr)
        raise subprocess.CalledProcessError(result.returncode, args)
    return result.stdout.strip() if capture else ""


def ignore_for(directory: str, names: list[str]) -> set[str]:
    ignored = {"__pycache__", ".pytest_cache", ".ruff_cache"}.intersection(names)
    if Path(directory).name == "module":
        ignored.add("gui")
    if Path(directory).name == "deploy":
        ignored.update({"docker", "launcher"})
    return ignored


def main() -> None:
    if not sys.platform.startswith("win"):
        raise SystemExit("The Windows runtime must be staged on windows-latest")
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise SystemExit("Refusing to package outside GitHub Actions")

    if RUNTIME.exists():
        shutil.rmtree(RUNTIME)
    python_target = RUNTIME / "python"
    app_target = RUNTIME / "app"
    app_target.mkdir(parents=True)

    run("uv", "python", "install", "3.10")
    source_python = Path(run("uv", "python", "find", "--managed-python", "--no-project", "--resolve-links", "3.10", capture=True))
    if not source_python.is_file():
        raise RuntimeError(f"uv did not return a Python executable: {source_python}")
    shutil.copytree(source_python.parent, python_target)

    requirements = RUNTIME / "requirements.lock.txt"
    run(
        "uv", "export", "--frozen", "--format", "requirements-txt",
        "--no-dev", "--no-emit-project", "--no-hashes",
        "--output-file", str(requirements),
    )
    bundled_python = python_target / "python.exe"
    pyvenv_cfg = python_target / "pyvenv.cfg"
    # uv pip treats a relocated interpreter as a virtual environment and requires
    # pyvenv.cfg. The staging path is temporary, so remove the marker after the
    # dependencies have been installed and keep the published runtime portable.
    pyvenv_cfg.write_text(
        f"home = {python_target}\n"
        "include-system-site-packages = false\n"
        "version = 3.10\n",
        encoding="utf-8",
    )
    try:
        run(
            "uv", "--directory", str(RUNTIME), "pip", "install",
            "--python", str(bundled_python),
            "--target", str(python_target / "Lib" / "site-packages"),
            "-r", str(requirements),
        )
    finally:
        pyvenv_cfg.unlink(missing_ok=True)
    requirements.unlink()

    for directory in ("module", "tasks", "assets", "bin", "config", "deploy", "dev_tools"):
        shutil.copytree(ROOT / directory, app_target / directory, ignore=ignore_for)
    for filename in ("server.py", "script.py", "LICENSE"):
        shutil.copy2(ROOT / filename, app_target / filename)

    for cache in app_target.rglob("__pycache__"):
        shutil.rmtree(cache)
    build_info = {
        "version": os.environ.get("RELEASE_VERSION", "unknown"),
        "commit": os.environ.get("GITHUB_SHA", "unknown"),
        "python": "3.10/python-build-standalone",
        "backend": "fastapi",
    }
    (app_target / "BUILD_INFO.json").write_text(
        json.dumps(build_info, indent=2) + "\n", encoding="utf-8"
    )
    run(
        str(bundled_python), "-c",
        "import fastapi, cv2, numpy, pydantic; print('Bundled runtime imports OK')",
    )
    smoke_data = RUNTIME / "smoke-data"
    smoke_code = (
        "import os, sys; "
        f"os.environ['OAS_DATA_DIR'] = {str(smoke_data)!r}; "
        f"sys.path.insert(0, {str(app_target)!r}); os.chdir({str(app_target)!r}); "
        "from module.runtime import ensure_runtime_data; ensure_runtime_data(); "
        "from module.server.app import app; "
        "assert any(getattr(route, 'path', None) == '/api/health' for route in app.routes); "
        "print('Bundled FastAPI application import OK')"
    )
    run(str(bundled_python), "-c", smoke_code)
    shutil.rmtree(smoke_data, ignore_errors=True)
    print(f"Runtime staged at {RUNTIME}")


if __name__ == "__main__":
    main()
