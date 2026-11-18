#!/usr/bin/env python3
"""Build the standalone backend payload consumed by the desktop updater.

The payload contains only the Python application and its runtime resources:

    server.py, script.py, module/, tasks/, assets/, deploy/, bin/
    config/template.json, config/findjade/, LICENSE

It never contains user configs (config/oas*.json, deploy.yaml), logs, tests,
caches, the Tauri shell or the bundled Python runtime. The zip is deterministic
so the same source produces the same sha256.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

INCLUDE_FILES = ("server.py", "script.py", "LICENSE", "BUILD_INFO.json")
INCLUDE_DIRS = ("module", "tasks", "assets", "deploy", "bin")
CONFIG_INCLUDE = ("template.json", "findjade")
EXCLUDE_DIR_NAMES = {
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    ".mypy_cache",
    "node_modules",
    ".venv",
}
EXCLUDE_RELATIVE_DIRS = (
    "module/gui",
    "deploy/docker",
    "deploy/launcher",
)
EXCLUDE_SUFFIXES = (".pyc", ".pyo", ".log", ".tmp")
EXCLUDE_NAMES = {".DS_Store", "Thumbs.db"}


def iter_payload_files(app_dir: Path):
    """Yield files that belong to the backend payload, sorted later."""
    app_dir = app_dir.resolve()

    for name in INCLUDE_FILES:
        path = app_dir / name
        if path.is_file():
            yield path

    for dirname in INCLUDE_DIRS:
        root = app_dir / dirname
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(app_dir)
            if any(part in EXCLUDE_DIR_NAMES for part in relative.parts[:-1]):
                continue
            relative_posix = relative.as_posix()
            if any(
                relative_posix == prefix or relative_posix.startswith(prefix + "/")
                for prefix in EXCLUDE_RELATIVE_DIRS
            ):
                continue
            if path.name in EXCLUDE_NAMES or path.suffix.lower() in EXCLUDE_SUFFIXES:
                continue
            yield path

    config = app_dir / "config"
    for name in CONFIG_INCLUDE:
        path = config / name
        if path.is_file():
            yield path
        elif path.is_dir():
            for item in path.rglob("*"):
                if not item.is_file():
                    continue
                if any(part in EXCLUDE_DIR_NAMES for part in item.relative_to(app_dir).parts[:-1]):
                    continue
                if item.suffix.lower() in EXCLUDE_SUFFIXES:
                    continue
                yield item


def build_zip(app_dir: Path, out_zip: Path) -> int:
    app_dir = app_dir.resolve()
    files = sorted(
        set(iter_payload_files(app_dir)),
        key=lambda path: path.relative_to(app_dir).as_posix(),
    )
    if not files:
        raise RuntimeError(f"No payload files found under {app_dir}")

    out_zip.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            relative = path.relative_to(app_dir).as_posix()
            info = zipfile.ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o644 & 0xFFFF) << 16
            archive.writestr(info, path.read_bytes())
    return len(files)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_commit(app_dir: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(app_dir), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "unknown"


def load_signing_key(value: str):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    value = value.strip()
    if not value:
        return None
    if value.startswith("-----BEGIN"):
        key = serialization.load_pem_private_key(value.encode("utf-8"), password=None)
        if not isinstance(key, Ed25519PrivateKey):
            raise ValueError("BACKEND_SIGNING_KEY must be an Ed25519 private key")
        return key

    raw = base64.b64decode(value)
    # Some tools export seed || public key; the seed is always the first 32 bytes.
    if len(raw) == 64:
        raw = raw[:32]
    if len(raw) != 32:
        raise ValueError("BACKEND_SIGNING_KEY must be base64 of a 32-byte Ed25519 seed")
    return Ed25519PrivateKey.from_private_bytes(raw)


def sign(version: str, sha256: str, key) -> str:
    return base64.b64encode(key.sign(f"{version}:{sha256}".encode("utf-8"))).decode("ascii")


def build_payload(
    app_dir: Path,
    out_dir: Path,
    version: str,
    channel: str = "dev",
    min_shell_version: str = "",
    config_schema: int = 1,
    signing_key: str = "",
    require_signature: bool = False,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    safe_version = version.replace("/", "-").replace("\\", "-")
    filename = f"oas-backend-{safe_version}.zip"
    out_zip = out_dir / filename

    file_count = build_zip(app_dir, out_zip)
    digest = sha256_file(out_zip)

    key = load_signing_key(signing_key)
    if key is None and require_signature:
        raise RuntimeError("A backend signing key is required but BACKEND_SIGNING_KEY is empty")
    signature = sign(version, digest, key) if key is not None else None

    manifest = {
        "schema": 1,
        "name": "oas-backend",
        "version": version,
        "channel": channel,
        "file": filename,
        "size": out_zip.stat().st_size,
        "sha256": digest,
        "files": file_count,
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "commit": os.environ.get("GITHUB_SHA") or git_commit(app_dir),
        "python": "3.10",
        "min_shell_version": min_shell_version or version,
        "config_schema": config_schema,
        "requires_full_install": False,
        "signature": signature,
        "signature_algorithm": "ed25519" if signature else None,
        "signature_subject": "version:sha256" if signature else None,
    }
    manifest_path = out_dir / f"oas-backend-{safe_version}.manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if signature is None:
        print("WARNING: BACKEND_SIGNING_KEY is empty, manifest is unsigned", file=sys.stderr)

    return {**manifest, "manifest": str(manifest_path), "zip": str(out_zip)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the OAS backend payload zip and manifest")
    parser.add_argument("--app-dir", type=Path, required=True, help="Staged runtime/app directory or repository root")
    parser.add_argument("--out-dir", type=Path, required=True, help="Directory for zip and manifest")
    parser.add_argument("--version", required=True)
    parser.add_argument("--channel", default="dev")
    parser.add_argument("--min-shell-version", default="")
    parser.add_argument("--config-schema", type=int, default=1)
    parser.add_argument("--signing-key", default=os.environ.get("BACKEND_SIGNING_KEY", ""))
    parser.add_argument("--require-signature", action="store_true")
    args = parser.parse_args()

    result = build_payload(
        app_dir=args.app_dir,
        out_dir=args.out_dir,
        version=args.version,
        channel=args.channel,
        min_shell_version=args.min_shell_version,
        config_schema=args.config_schema,
        signing_key=args.signing_key,
        require_signature=args.require_signature,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
