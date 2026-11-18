"""deploy.yaml 的读取与安全写回。

`deploy/template` 带有完整注释，`poor_yaml_write` 会以模板为底稿只替换值，
所以这里沿用同一套逻辑，避免把注释写丢。
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Union, get_args, get_origin, get_type_hints

from fastapi import APIRouter, HTTPException

from deploy.config import ConfigModel
from deploy.utils import DEPLOY_CONFIG, DEPLOY_TEMPLATE, poor_yaml_read
from module.server.setting import State

deploy_app = APIRouter(prefix="/deploy", tags=["deploy"])

# 不向前端暴露、也不允许通过接口修改的字段
SENSITIVE_KEYS = {"Password", "SSHUser"}

_TYPE_NAMES = {bool: "boolean", int: "integer", str: "string"}


def parse_deploy_template(path: Path | str) -> list[dict]:
    """从 deploy/template 提取分区、字段和注释说明。"""
    sections: list[dict] = []
    current: dict | None = None
    comments: list[str] = []

    for raw_line in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped:
            comments = []
            continue
        if stripped.startswith("#"):
            text = stripped.lstrip("#").strip()
            if text:
                comments.append(text)
            continue

        section_match = re.match(r"^  ([A-Za-z_]\w*):\s*$", line)
        if section_match:
            current = {"name": section_match.group(1), "fields": []}
            sections.append(current)
            comments = []
            continue

        field_match = re.match(r"^    ([A-Za-z_]\w*):\s*(.*)$", line)
        if field_match and current is not None:
            current["fields"].append({
                "key": field_match.group(1),
                "description": "\n".join(comments),
            })
            comments = []

    return sections


def field_type_name(key: str, current: Any = None) -> str:
    """优先按当前值的实际类型判断，None 时退回类型注解。

    `CDN` 这类 `Union[str, bool]` 字段默认是 False，用户希望看到开关，
    因此当前值为 bool 时按 boolean 处理。
    """
    annotation = get_type_hints(ConfigModel).get(key)
    origin = get_origin(annotation)
    if origin is Union:
        arguments = get_args(annotation)
        if current is not None:
            for argument in (bool, int, str):
                if argument in arguments and isinstance(current, argument):
                    if argument is int and isinstance(current, bool):
                        continue
                    return _TYPE_NAMES[argument]
        for argument in arguments:
            if argument in _TYPE_NAMES:
                return _TYPE_NAMES[argument]
        return "string"
    return _TYPE_NAMES.get(annotation, "string")


def coerce_deploy_value(key: str, raw: str, current: Any = None) -> Any:
    kind = field_type_name(key, current)
    if kind == "boolean":
        lowered = str(raw).strip().lower()
        if lowered in ("true", "1", "yes", "on"):
            return True
        if lowered in ("false", "0", "no", "off"):
            return False
        raise ValueError("期望布尔值 true/false")
    if kind == "integer":
        return int(str(raw).strip())

    text = str(raw)
    if "\n" in text or "\r" in text:
        raise ValueError("不允许换行")
    if text == "":
        # poor_yaml_read() 会丢弃空值，可选字符串统一写成 null
        if type(None) in get_args(get_type_hints(ConfigModel).get(key)):
            return None
        raise ValueError("不允许为空")
    # poor_yaml_read() 会把反斜杠统一成 /，这里保持一致，避免写入后又校验失败
    return text.replace("\\", "/")


def _deploy_schema() -> dict[str, dict]:
    """key -> {section, description, type}，只包含模板里真实存在的字段。"""
    schema: dict[str, dict] = {}
    for section in parse_deploy_template(DEPLOY_TEMPLATE):
        for field in section["fields"]:
            key = field["key"]
            if key in SENSITIVE_KEYS:
                continue
            current = State.deploy_config.config.get(key)
            schema[key] = {
                "section": section["name"],
                "description": field["description"],
                "type": field_type_name(key, current),
            }
    return schema


def _value_matches(actual: Any, expected: Any, kind: str) -> bool:
    if expected is None:
        return actual is None
    if kind == "boolean":
        return isinstance(actual, bool) and actual == expected
    if kind == "integer":
        return isinstance(actual, int) and not isinstance(actual, bool) and actual == expected
    return str(actual) == str(expected)


@deploy_app.get("/settings")
async def deploy_settings():
    deploy = State.deploy_config
    schema = _deploy_schema()
    sections: dict[str, dict] = {}

    for key, meta in schema.items():
        if key not in deploy.config:
            continue
        section = sections.setdefault(meta["section"], {"name": meta["section"], "fields": []})
        section["fields"].append({
            "key": key,
            "value": deploy.config[key],
            "type": meta["type"],
            "description": meta["description"],
        })

    return {
        "path": DEPLOY_CONFIG,
        "sections": [section for section in sections.values() if section["fields"]],
    }


@deploy_app.put("/settings/{key}")
async def deploy_setting_update(key: str, types: str, value: str):
    deploy = State.deploy_config
    schema = _deploy_schema()
    if key not in schema or key not in deploy.config:
        raise HTTPException(status_code=404, detail=f"Unknown deploy setting: {key}")

    kind = schema[key]["type"]
    if types != kind:
        raise HTTPException(status_code=400, detail=f"{key} expects type {kind}, got {types}")
    try:
        converted = coerce_deploy_value(key, value, deploy.config.get(key))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=f"Invalid value for {key}: {error}")

    config_path = Path(DEPLOY_CONFIG)
    original = config_path.read_text(encoding="utf-8") if config_path.is_file() else None
    try:
        setattr(deploy, key, converted)
        written = poor_yaml_read(DEPLOY_CONFIG)
        if key not in written or not _value_matches(written[key], converted, kind):
            raise ValueError(f"deploy.yaml 校验失败: {written.get(key)!r} != {converted!r}")
    except Exception as error:
        # 写入失败时恢复原文件，避免把用户配置写坏
        if original is not None:
            config_path.write_text(original, encoding="utf-8")
        raise HTTPException(status_code=400, detail=f"Failed to update {key}: {error}")

    return {"success": True, "key": key, "value": converted, "restart_required": True}
