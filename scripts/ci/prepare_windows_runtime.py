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


def clean_python_env() -> dict[str, str]:
    """Remove CI shell state that can redirect a relocatable interpreter."""
    env = os.environ.copy()
    for key in list(env):
        if key.startswith("PYTHON") or key in {
            "VIRTUAL_ENV", "UV_PROJECT_ENVIRONMENT", "UV_PYTHON", "UV_SYSTEM_PYTHON"
        }:
            env.pop(key, None)
    env.update({
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
        "TERM": "xterm-256color",
    })
    return env


def run(*args: str, capture: bool = False, env: dict[str, str] | None = None) -> str:
    print("+", " ".join(args), flush=True)
    result = subprocess.run(
        args,
        cwd=ROOT,
        env=env,
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

    print("Installing locked runtime dependencies", flush=True)
    run("uv", "python", "install", "3.10")
    python_root = Path(run("uv", "python", "dir", capture=True))
    candidates = sorted(python_root.glob("cpython-3.10*/python.exe"), reverse=True)
    source_python = next(
        (path.resolve() for path in candidates if (path.parent / "python310.dll").is_file()),
        None,
    )
    if source_python is None or not source_python.is_file():
        raise RuntimeError(f"Unable to locate the uv-managed Python 3.10 under {python_root}")

    requirements = RUNTIME / "requirements.lock.txt"
    run(
        "uv", "export", "--frozen", "--format", "requirements-txt",
        "--no-dev", "--no-emit-project", "--no-hashes",
        "--output-file", str(requirements),
    )
    dependency_target = RUNTIME / "python-deps"
    run(
        "uv", "--directory", str(RUNTIME), "pip", "install",
        "--python", str(source_python),
        "--target", str(dependency_target),
        "-r", str(requirements),
    )
    requirements.unlink()

    print("Copying python-build-standalone interpreter", flush=True)
    shutil.copytree(source_python.parent, python_target)
    bundled_python = python_target / "python.exe"
    site_packages = python_target / "Lib" / "site-packages"
    site_packages.mkdir(parents=True, exist_ok=True)
    shutil.copytree(dependency_target, site_packages, dirs_exist_ok=True)
    shutil.rmtree(dependency_target)

    print("Copying OAS application resources", flush=True)

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
    bundled_env = clean_python_env()
    run(
        str(bundled_python), "-E", "-s", "-c",
        "import fastapi, cv2, numpy, pydantic; print('Bundled runtime imports OK')",
        env=bundled_env,
    )
    smoke_data = RUNTIME / "smoke-data"
    smoke_code = (
        "import io, os, sys; "
        "stdout, stderr = sys.stdout, sys.stderr; sys.stdout = sys.stderr = io.StringIO(); "
        f"os.environ['OAS_DATA_DIR'] = {str(smoke_data)!r}; "
        f"sys.path.insert(0, {str(app_target)!r}); os.chdir({str(app_target)!r}); "
        "from module.runtime import ensure_runtime_data; ensure_runtime_data(); "
        "from module.server.app import app; "
        "assert any(getattr(route, 'path', None) == '/api/health' for route in app.routes); "
        "sys.stdout, sys.stderr = stdout, stderr; "
        "print('Bundled FastAPI application import OK')"
    )
    run(str(bundled_python), "-E", "-s", "-c", smoke_code, env=bundled_env)
    shutil.rmtree(smoke_data, ignore_errors=True)
    print(f"Runtime staged at {RUNTIME}")


if __name__ == "__main__":
    main()
