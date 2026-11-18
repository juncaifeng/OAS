"""设备绑定与心跳检测。

只做轻量探测：枚举桌面客户端窗口、读取窗口状态、查询 ADB 设备，
不实例化 Device（避免启动模拟器/客户端等副作用）。
"""
from __future__ import annotations

import re
import time
from datetime import datetime

from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool

from module.device.env import IS_WINDOWS
from module.server.main_manager import mm
from module.server.setting import State

device_app = APIRouter(prefix="/device", tags=["device"])

TARGET_SIZE = (1280, 720)

# MuMu 12 / MuMu 6 / 通用 / 夜神；本轮只做短列表，失败 10 秒后再试
ADB_AUTO_SERIALS = (
    "127.0.0.1:16384",
    "127.0.0.1:7555",
    "127.0.0.1:5555",
    "127.0.0.1:62001",
)
_ADB_LAST_ATTEMPT = 0.0


def _config(instance: str):
    if instance not in mm.all_script_files():
        raise HTTPException(status_code=404, detail=f"Instance {instance} not found")
    return mm.config_cache(instance)


def _is_admin() -> bool:
    if not IS_WINDOWS:
        return False
    import ctypes

    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def _can_open_process(pid: int) -> bool:
    if not IS_WINDOWS:
        return True
    import ctypes

    handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, int(pid))  # QUERY_LIMITED_INFORMATION
    if not handle:
        return False
    ctypes.windll.kernel32.CloseHandle(handle)
    return True


def _window_detail(hwnd: int) -> dict:
    if not IS_WINDOWS:
        return {"width": 0, "height": 0, "foreground": False}
    try:
        from win32gui import GetClientRect, GetForegroundWindow

        from module.device.method.desktop_impl import dpi_awareness

        with dpi_awareness():
            left, top, right, bottom = GetClientRect(hwnd)
        return {
            "width": right - left,
            "height": bottom - top,
            "foreground": GetForegroundWindow() == hwnd,
        }
    except Exception:
        return {"width": 0, "height": 0, "foreground": False}


def _desktop_windows(config) -> list[dict]:
    if not IS_WINDOWS:
        return []
    try:
        from module.device.method.desktop_impl import desktop_window_titles, list_desktop_windows

        return list_desktop_windows(desktop_window_titles(config))
    except Exception:
        return []


def _install_root(game_path: str) -> str:
    if not IS_WINDOWS:
        return ""
    try:
        from module.device.method.desktop_impl import desktop_install_root

        return desktop_install_root(game_path)
    except Exception:
        return ""


def _auto_connect_enabled() -> bool:
    try:
        return bool(State.deploy_config.AutoConnect)
    except Exception:
        return True


def _adb_devices(config=None, auto_connect: bool = False) -> list[dict]:
    """列出 ADB 设备；没有设备时按 AutoConnect 尝试连接常见模拟器端口。"""
    try:
        from adbutils import AdbClient

        client = AdbClient(host="127.0.0.1", port=5037)
        devices = [{"serial": device.serial} for device in client.device_list()]
        if devices or not auto_connect:
            return devices

        # 避免心跳每 5 秒都发起一轮 connect
        global _ADB_LAST_ATTEMPT
        now = time.time()
        if now - _ADB_LAST_ATTEMPT < 10:
            return devices
        _ADB_LAST_ATTEMPT = now

        configured = str(getattr(config.script.device, "serial", "") or "") if config is not None else ""
        candidates: list[str] = []
        if configured and configured != "auto" and ":" in configured and not configured.startswith("emulator-"):
            candidates.append(configured)
        candidates.extend(serial for serial in ADB_AUTO_SERIALS if serial not in candidates)

        for serial in candidates:
            try:
                message = str(client.connect(serial))
            except Exception:
                continue
            if "connected" in message:
                break
        return [{"serial": device.serial} for device in client.device_list()]
    except Exception:
        return []


def _desktop_state(config) -> dict:
    desktop = config.script.desktop
    device = config.script.device
    windows = _desktop_windows(config)
    install_root = _install_root(str(getattr(desktop, "game_path", "") or ""))
    configured = str(getattr(device, "handle", "") or "").strip()
    input_mode = getattr(getattr(desktop, "control_method", None), "value", "real_input")

    detail_by_hwnd = {}
    for window in windows:
        detail_by_hwnd[window["hwnd"]] = _window_detail(window["hwnd"])

    matched = [window for window in windows if configured and window["title"] == configured]
    candidates = matched or windows
    bound = candidates[0] if candidates else None
    bound_detail = detail_by_hwnd.get(bound["hwnd"], {}) if bound else None
    access = {
        "oas_admin": _is_admin(),
        "can_access": _can_open_process(bound["pid"]) if bound else True,
    }

    blocking: list[str] = []
    warnings: list[str] = []
    if not windows:
        blocking.append("未检测到阴阳师桌面客户端窗口")
    if not install_root:
        warnings.append("未找到游戏安装目录，无法自动拉起客户端")
    if bound:
        if input_mode == "real_input" and not bound_detail.get("foreground"):
            blocking.append("窗口不在前台，真实输入会被系统阻止")
        size = (bound_detail.get("width"), bound_detail.get("height"))
        if size != TARGET_SIZE:
            warnings.append(f"客户端尺寸 {size[0]}x{size[1]}，建议 1280x720")
        if not access["oas_admin"] and not access["can_access"]:
            blocking.append("游戏窗口权限高于 OAS，请以管理员身份运行 OAS")

    return {
        "enabled": bool(desktop.enable),
        "input_mode": input_mode,
        "game_path": str(getattr(desktop, "game_path", "") or ""),
        "configured_handle": configured,
        "install_root": install_root,
        "windows": [
            {**window, **detail_by_hwnd.get(window["hwnd"], {})}
            for window in windows
        ],
        "bound": {**bound, **bound_detail} if bound else None,
        "access": access,
        "blocking": blocking,
        "warnings": warnings,
        "ready": bool(bound) and not blocking,
    }


def _adb_resolution(serial: str) -> str | None:
    """读取 Android 分辨率，统一成宽x高（横屏）。"""
    try:
        from adbutils import AdbClient

        client = AdbClient(host="127.0.0.1", port=5037)
        output = str(client.device(serial).shell("wm size"))
        matches = re.findall(r"(\d+)x(\d+)", output)
        if not matches:
            return None
        width, height = (int(part) for part in matches[-1])
        return f"{max(width, height)}x{min(width, height)}"
    except Exception:
        return None


def _adb_state(config) -> dict:
    serial = str(getattr(config.script.device, "serial", "") or "")
    devices = _adb_devices(config, auto_connect=_auto_connect_enabled())
    if serial == "auto":
        selected = devices[0]["serial"] if devices else None
    else:
        selected = serial if any(device["serial"] == serial for device in devices) else None
    found = selected is not None
    resolution = _adb_resolution(selected) if selected else None
    resolution_ok = resolution in (None, "1280x720")

    issues = []
    if not found:
        issues.append("未检测到 ADB 设备（serial=auto）" if serial == "auto" else f"未找到 ADB 设备 {serial}")
    if resolution and not resolution_ok:
        issues.append(f"模拟器分辨率 {resolution}，请在 MuMu 设置中改为 1280x720")

    return {
        "serial": serial,
        "selected": selected,
        "devices": devices,
        "resolution": resolution,
        "resolution_ok": resolution_ok,
        "ready": found and resolution_ok,
        "issues": issues,
    }


def _status(instance: str, config) -> dict:
    desktop = _desktop_state(config)
    mode = "desktop" if config.script.desktop.enable else "adb"
    adb = _adb_state(config) if mode == "adb" else {
        "serial": str(getattr(config.script.device, "serial", "") or ""),
        "selected": None,
        "devices": [],
        "resolution": None,
        "resolution_ok": True,
        "ready": False,
        "issues": [],
        "skipped": True,
    }
    ready = desktop["ready"] if mode == "desktop" else adb["ready"]
    blocking = desktop["blocking"] if mode == "desktop" else adb["issues"]
    warnings = desktop["warnings"] if mode == "desktop" else []
    return {
        "instance": instance,
        "mode": mode,
        "ready": ready,
        "launchable": bool(desktop["install_root"]),
        "blocking": blocking,
        "warnings": warnings,
        "checked_at": datetime.now().isoformat(timespec="seconds"),
        "desktop": desktop,
        "adb": adb,
    }


def _options(config) -> dict:
    desktop = _desktop_state(config)
    return {
        "desktop": desktop,
        "adb": _adb_state(config),
        "mode": "desktop" if config.script.desktop.enable else "adb",
    }


@device_app.get("/status")
async def device_status(instance: str):
    config = _config(instance)
    return await run_in_threadpool(_status, instance, config)


@device_app.get("/options")
async def device_options(instance: str):
    config = _config(instance)
    return await run_in_threadpool(_options, config)


@device_app.post("/launch")
async def device_launch(instance: str):
    config = _config(instance)

    def launch() -> bool:
        from module.device.method.desktop_impl import desktop_launch_instance

        return desktop_launch_instance(config)

    success = await run_in_threadpool(launch)
    return {"success": bool(success)}
