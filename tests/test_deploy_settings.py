import pytest

from module.server.deploy_router import (
    coerce_deploy_value,
    field_type_name,
    parse_deploy_template,
)


def test_parse_deploy_template_groups_fields_and_keeps_comments(tmp_path):
    template = tmp_path / "template"
    template.write_text(
        "Deploy:\n"
        "  Git:\n"
        "    # URL of repo\n"
        "    # second line\n"
        "    Repository: https://example.com/repo\n"
        "\n"
        "  Ocr:\n"
        "    # Port of ocr server\n"
        "    OcrServerPort: 22268\n",
        encoding="utf-8",
    )

    sections = parse_deploy_template(template)

    assert [section["name"] for section in sections] == ["Git", "Ocr"]
    assert sections[0]["fields"] == [
        {"key": "Repository", "description": "URL of repo\nsecond line"},
    ]
    assert sections[1]["fields"] == [
        {"key": "OcrServerPort", "description": "Port of ocr server"},
    ]


def test_field_type_name_uses_annotation_and_current_value():
    assert field_type_name("OcrServerPort") == "integer"
    assert field_type_name("ReplaceAdb") == "boolean"
    assert field_type_name("Repository") == "string"
    # Union[str, bool]：默认 False 时按开关展示
    assert field_type_name("CDN", False) == "boolean"
    assert field_type_name("CDN", None) == "string"


def test_coerce_deploy_value_validates_and_normalizes():
    assert coerce_deploy_value("ReplaceAdb", "false", True) is False
    assert coerce_deploy_value("ReplaceAdb", "true", False) is True
    assert coerce_deploy_value("OcrServerPort", "22269") == 22269
    assert coerce_deploy_value("Repository", "https://a\\b") == "https://a/b"

    with pytest.raises(ValueError):
        coerce_deploy_value("ReplaceAdb", "maybe", True)
    with pytest.raises(ValueError):
        coerce_deploy_value("OcrServerPort", "not-a-number")
    with pytest.raises(ValueError):
        coerce_deploy_value("Repository", "line1\nline2")


def test_empty_optional_string_becomes_null():
    assert coerce_deploy_value("GitProxy", "", "127.0.0.1:7890") is None

    with pytest.raises(ValueError):
        coerce_deploy_value("Repository", "", "https://example.com/repo")
