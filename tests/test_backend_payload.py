import base64
import json
import sys
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "ci"))

import build_backend_payload as payload  # noqa: E402


def make_app(root: Path) -> None:
    files = {
        "server.py": "print('server')\n",
        "script.py": "print('script')\n",
        "LICENSE": "GPL-3.0\n",
        "module/ok.py": "VALUE = 1\n",
        "module/gui/legacy.py": "should not ship\n",
        "module/__pycache__/ok.pyc": b"cache",
        "tasks/T/script_task.py": "pass\n",
        "tasks/T/o/image.png": b"\x89PNG\r\n\x1a\n",
        "assets/i18n/zh-CN.json": "{}",
        "deploy/config.py": "pass\n",
        "deploy/template": "Deploy:\n",
        "deploy/launcher/oas.bat": "should not ship\n",
        "config/template.json": "{}",
        "config/oas1.json": "user config must not ship",
        "config/deploy.yaml": "user deploy must not ship",
        "config/findjade/find_jade.json": "{}",
        "log/run.txt": "log",
        "tests/test_x.py": "pass\n",
        "desktop/app.tsx": "should not ship\n",
    }
    for relative, content in files.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            path.write_bytes(content)
        else:
            path.write_text(content, encoding="utf-8")


def test_payload_contains_only_runtime_files_and_is_deterministic(tmp_path):
    app = tmp_path / "app"
    make_app(app)

    first = payload.build_payload(app, tmp_path / "out1", "0.1.0-test", channel="test")
    second = payload.build_payload(app, tmp_path / "out2", "0.1.0-test", channel="test")

    assert first["sha256"] == second["sha256"]
    assert first["files"] == second["files"]

    with zipfile.ZipFile(first["zip"]) as archive:
        names = set(archive.namelist())

    assert "server.py" in names
    assert "module/ok.py" in names
    assert "tasks/T/script_task.py" in names
    assert "assets/i18n/zh-CN.json" in names
    assert "deploy/config.py" in names
    assert "deploy/template" in names
    assert "config/template.json" in names
    assert "config/findjade/find_jade.json" in names
    assert "LICENSE" in names

    assert "config/oas1.json" not in names
    assert "config/deploy.yaml" not in names
    assert "module/gui/legacy.py" not in names
    assert "module/__pycache__/ok.pyc" not in names
    assert "deploy/launcher/oas.bat" not in names
    assert "log/run.txt" not in names
    assert "tests/test_x.py" not in names
    assert "desktop/app.tsx" not in names


def test_manifest_matches_zip_and_signature(tmp_path):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    app = tmp_path / "app"
    make_app(app)
    key = Ed25519PrivateKey.generate()
    seed = key.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )

    result = payload.build_payload(
        app,
        tmp_path / "out",
        "0.1.0-signed",
        channel="dev",
        signing_key=base64.b64encode(seed).decode("ascii"),
    )

    zip_path = Path(result["zip"])
    manifest = json.loads(Path(result["manifest"]).read_text(encoding="utf-8"))
    assert manifest["sha256"] == payload.sha256_file(zip_path)
    assert manifest["size"] == zip_path.stat().st_size
    assert manifest["signature_algorithm"] == "ed25519"

    key.public_key().verify(
        base64.b64decode(manifest["signature"]),
        f"{manifest['version']}:{manifest['sha256']}".encode("utf-8"),
    )


def test_unsigned_payload_requires_key_when_requested(tmp_path):
    app = tmp_path / "app"
    make_app(app)

    unsigned = payload.build_payload(app, tmp_path / "out", "0.1.0-unsigned")
    assert unsigned["signature"] is None

    with pytest.raises(RuntimeError):
        payload.build_payload(app, tmp_path / "out2", "0.1.0-unsigned", require_signature=True)
