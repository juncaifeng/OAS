# This Python file uses the following encoding: utf-8
# @author runhey
# github https://github.com/runhey
import asyncio
import json
from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import StreamingResponse
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime
from module.config.utils import convert_to_underscore

from module.logger import logger
from module.runtime import data_path
from module.server.main_manager import mm
from module.server.log_tail import latest_log_file, tail_lines
from module.server.script_process import ScriptProcess, ScriptState
from module.server.i18n import I18n

from tasks.Component.config_base import parse_timedelta_string
from tasks.Script.config_loop import LoopProbe, LoopStepKind


script_app = APIRouter()

# 循环模式：不属于任务菜单的探针目录
LOOP_PROBES = [
    {
        'task': LoopProbe.REALM_RAID_TICKET.value,
        'value_type': 'number',
        'operator': '>',
        'threshold': 0,
        'interval': 300,
    },
    {
        'task': LoopProbe.ALWAYS.value,
        'value_type': 'bool',
        'operator': '>',
        'threshold': 0,
        'interval': 300,
    },
]

# 任务菜单里不属于可调度任务的条目
LOOP_HIDDEN_TASKS = {'Script', 'Restart', 'GlobalGame'}


def loop_state_path(script_name: str):
    return data_path('log', f'loop_state_{script_name}.json')


def read_loop_json(path) -> dict | None:
    try:
        if path.is_file():
            return json.loads(path.read_text(encoding='utf-8'))
    except Exception as error:
        logger.warning(f'Read loop state failed: {error}')
    return None


def loop_catalog() -> dict:
    menu = mm.config_cache('template').gui_menu_list
    tasks = []
    for category, items in menu.items():
        for task in items:
            if task in LOOP_HIDDEN_TASKS:
                continue
            tasks.append({'task': task, 'category': category})
    return {'tasks': tasks, 'probes': LOOP_PROBES}


@script_app.get('/test')
async def script_test():
    return 'success'

@script_app.get('/script_menu')
async def script_menu():
    return mm.config_cache('template').gui_menu_list


@script_app.get('/i18n/zh-CN')
async def script_i18n_zh_cn():
    """Return the merged Qt, asset and user-provided Chinese translations."""
    return I18n.load_zh_cn()

# ----------------------------------   配置文件管理   ----------------------------------
@script_app.get('/config_list')
async def config_list():
    return mm.all_script_files()

@script_app.post('/config_copy')
async def config_copy(file: str, template: str = 'template'):
    mm.copy(file, template)
    return mm.all_script_files()

@script_app.get('/config_new_name')
async def config_new_name():
    return mm.generate_script_name()

@script_app.get('/config_all')
async def config_all():
    return mm.all_json_file()


@script_app.put('/config')
async def config_rename(old_name: str = '', new_name: str = ''):
    """
    update config name
    :param old_name: old config name
    :param new_name: new config name
    :return: True or False
    """
    if old_name == new_name or new_name == '':
        return False
    if old_name in mm.script_process:
        if mm.script_process[old_name].state != ScriptState.INACTIVE:
            mm.script_process[old_name].stop()
        del mm.script_process[old_name]
    if not mm.rename(old_name, new_name):
        raise HTTPException(status_code=400, detail='Rename failed')
    return True


@script_app.delete('/config')
async def config_delete(name: str = ''):
    """
    delete config file
    :param name: config name
    :return: True or False
    """
    if name == '' or name == 'template':
        raise HTTPException(status_code=400, detail='Delete failed')
    if name in mm.script_process:
        if mm.script_process[name].state != ScriptState.INACTIVE:
            mm.script_process[name].stop()
        del mm.script_process[name]
    if not mm.delete(name):
        raise HTTPException(status_code=400, detail='Delete failed')
    return True


@script_app.put('/config/task/copy')
async def task_copy(task_name: str, dest_config_name: str, source_config_name: str):
    if dest_config_name not in mm.script_process or source_config_name not in mm.script_process:
        return False
    source_task = getattr(mm.config_cache(source_config_name).model, convert_to_underscore(task_name), None)
    if source_task is None:
        return False
    return mm.config_cache(dest_config_name).model.copy_script_task(task_name, source_task)


@script_app.put('/config/task/group/copy')
async def task_group_copy(task_name: str, group_name: str, dest_config_name: str, source_config_name: str):
    if dest_config_name not in mm.script_process or source_config_name not in mm.script_process:
        return False
    source_task = getattr(mm.config_cache(source_config_name).model, convert_to_underscore(task_name), None)
    if source_task is None:
        return False
    return mm.config_cache(dest_config_name).model.copy_task_group(task_name, group_name, source_task)


# ---------------------------------   脚本实例管理   ----------------------------------
@script_app.get('/{script_name}/start')
async def script_start(script_name: str):
    if script_name not in mm.script_process:
        mm.script_process[script_name] = ScriptProcess(script_name)
    await mm.script_process[script_name].start()
    return {'success': True, 'state': 'running'}

@script_app.get('/{script_name}/stop')
async def script_stop(script_name: str):
    if script_name not in mm.script_process:
        logger.warning(f'[{script_name}] script process does not exist')
        return
    await mm.script_process[script_name].stop()
    return {'success': True, 'state': 'inactive'}

@script_app.get('/{script_name}/tasks')
async def script_task_list(script_name: str):
    """每个任务的启用状态与下次运行时间，供前端任务总览页使用。"""
    if script_name not in mm.all_script_files():
        raise HTTPException(status_code=404, detail=f'Instance {script_name} not found')
    return mm.config_cache(script_name).model.task_summary()


@script_app.get('/{script_name}/loop')
async def script_loop_plan(script_name: str):
    """循环调度计划 + 运行状态，供任务总览页渲染“当前任务列表”。"""
    if script_name not in mm.all_script_files():
        raise HTTPException(status_code=404, detail=f'Instance {script_name} not found')
    config = mm.config_cache(script_name)
    mode = config.script.optimization.schedule_mode
    process = mm.script_process.get(script_name)
    return {
        'plan': config.model.loop_plan(),
        'mode': getattr(mode, 'value', mode),
        'state': int(process.state) if process is not None else 0,
        'runtime': read_loop_json(loop_state_path(script_name)),
        'probes': read_loop_json(data_path('log', f'loop_probe_values_{script_name}.json')) or {},
        'catalog': loop_catalog(),
    }


@script_app.put('/{script_name}/loop')
async def script_set_loop_plan(script_name: str, payload: dict = Body(...)):
    """整体保存循环调度计划。"""
    if script_name not in mm.all_script_files():
        raise HTTPException(status_code=404, detail=f'Instance {script_name} not found')

    steps = payload.get('steps')
    if steps is not None:
        if not isinstance(steps, list):
            raise HTTPException(status_code=400, detail='steps must be a list')
        probes = {probe.value for probe in LoopProbe}
        for index, step in enumerate(steps):
            if not isinstance(step, dict):
                raise HTTPException(status_code=400, detail=f'step {index} must be an object')
            kind = step.get('kind', LoopStepKind.TASK.value)
            task = str(step.get('task', '')).strip()
            if not task:
                raise HTTPException(status_code=400, detail=f'step {index} has empty task')
            if kind == LoopStepKind.PROBE.value and task not in probes:
                raise HTTPException(status_code=400, detail=f'unknown probe `{task}`')
            if kind not in (LoopStepKind.TASK.value, LoopStepKind.PROBE.value):
                raise HTTPException(status_code=400, detail=f'unknown step kind `{kind}`')

    if not mm.config_cache(script_name).model.set_loop_plan(payload):
        raise HTTPException(status_code=400, detail='Invalid loop plan')
    return {'success': True}


@script_app.put('/{script_name}/schedule_mode')
async def script_set_schedule_mode(script_name: str, mode: str):
    """切换 time / loop 调度模式，写回配置文件并立即广播。"""
    if script_name not in mm.all_script_files():
        raise HTTPException(status_code=404, detail=f'Instance {script_name} not found')
    from tasks.Script.config_optimization import ScheduleMode

    if mode not in {item.value for item in ScheduleMode}:
        raise HTTPException(status_code=400, detail=f'Unknown schedule mode `{mode}`')
    config = mm.config_cache(script_name)
    config.script.optimization.schedule_mode = ScheduleMode(mode)
    config.save()
    process = mm.script_process.get(script_name)
    if process is not None:
        await process.broadcast_state({"schedule": config.get_schedule_data()})
    return {'success': True, 'mode': mode}


@script_app.post('/{script_name}/restart')
async def script_restart(script_name: str):
    """重启单个实例的调度进程，供桌面端"重启实例"按钮使用。"""
    if script_name not in mm.all_script_files():
        raise HTTPException(status_code=404, detail=f'Instance {script_name} not found')
    if script_name not in mm.script_process:
        mm.script_process[script_name] = ScriptProcess(script_name)
    process = mm.script_process[script_name]
    await process.stop()
    await process.start()
    return {'success': True, 'state': 'running'}


@script_app.get('/{script_name}/{task}/args')
async def script_task(script_name: str, task: str):
    return mm.config_cache(script_name).model.script_task(task)

@script_app.put('/{script_name}/{task}/{group}/{argument}/value')
async def script_task(script_name: str, task: str, group: str, argument: str, types: str, value):
    try:
        match types:
            case 'integer':
                value = int(value)
            case 'number':
                value = float(value)
            case 'boolean':
                if isinstance(value, str):
                    logger.warning(f'[{script_name}] script argument {argument} value is string, try to convert to bool')
                    if value.lower() in ['true', '1']:
                        value = True
                    elif value.lower() in ['false', '0']:
                        value = False
                value = bool(value)
            case 'string':
                pass
            case 'date_time':
                value = datetime.strptime(value, '%Y-%m-%d %H:%M:%S')
            case 'time_delta':
                # 统一解析 "DD HH:MM:SS"；天数允许 1-3 位（原实现取 value[1] 会把 10 天读成 0 天）
                value = parse_timedelta_string(str(value))
            case 'time':
                value = datetime.strptime(value, '%H:%M:%S').time()
            case _: pass
    except Exception as e:
        # 类型不正确
        raise HTTPException(status_code=400, detail=f'Argument type error: {e}')
    return mm.config_cache(script_name).model.script_set_arg(task, group, argument, value)


@script_app.put('/{script_name}/{task}/sync_next_run')
async def sync_next_run(script_name: str, task: str, target_dt: str):
    if script_name not in mm.script_process:
        return False
    config = mm.config_cache(script_name)
    target = datetime.strptime(target_dt, '%Y-%m-%d %H:%M:%S') if target_dt else None
    config.task_delay(task=task, success=True, target=target)
    script_process = mm.script_process[script_name]
    config.get_next()
    await script_process.broadcast_state({"schedule": config.get_schedule_data()})
    return True


@script_app.post('/{script_name}/{task}/run')
async def script_run_task(script_name: str, task: str):
    """把某个任务的下次运行时间设为当前，立即排入调度队列。"""
    if script_name not in mm.all_script_files():
        raise HTTPException(status_code=404, detail=f'Instance {script_name} not found')
    config = mm.config_cache(script_name)
    try:
        success = config.task_call(task=task)
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error))
    process = mm.script_process.get(script_name)
    if process is not None:
        await process.broadcast_state({"schedule": config.get_schedule_data()})
    return bool(success)


# --------------------------------------  SSE  --------------------------------------
@script_app.get('/{script_name}/state')
async def script_task_state(script_name: str):
    async def state_generate_events():
        while True:
            # 生成 SSE 事件数据
            event_data = "data: Hello, SSE!\n\n"
            yield event_data

            # 模拟异步操作，可以替换为您的实际处理逻辑
            await asyncio.sleep(1)

    response = StreamingResponse(state_generate_events(), media_type="text/event-stream")
    response.headers["Cache-Control"] = "no-cache"
    return response

@script_app.get('/{script_name}/log')
async def script_task_log(script_name: str):
    async def log_generate_events():
        while True:
            # 生成 SSE 事件数据
            event_data = "data: log\n"
            yield event_data

            # 模拟异步操作，可以替换为您的实际处理逻辑
            await asyncio.sleep(1)

    response = StreamingResponse(log_generate_events(), media_type="text/event-stream")
    response.headers["Cache-Control"] = "no-cache"
    return response


@script_app.get('/{script_name}/log/tail')
async def script_task_log_tail(script_name: str, lines: int = 300):
    """读取实例最近一个日志文件的尾部，用于桌面端切换页面/重启后恢复日志。"""
    if script_name not in mm.all_script_files():
        raise HTTPException(status_code=404, detail=f'Instance {script_name} not found')
    log_file = latest_log_file(script_name)
    if log_file is None:
        return {'path': None, 'lines': []}
    return {'path': str(log_file), 'lines': tail_lines(log_file, min(max(lines, 1), 2000))}

# -------------------------------------- websocket --------------------------------------

@script_app.websocket("/ws/{script_name}")
async def websocket_endpoint(websocket: WebSocket, script_name: str):
    if script_name not in mm.script_process:
        mm.script_process[script_name] = ScriptProcess(script_name)
    script_process = mm.script_process[script_name]
    await script_process.connect(websocket)

    try:
        await script_process.send_json(websocket, {"state": script_process.state})
        config = mm.config_cache(script_name)
        config.get_next()
        await script_process.send_json(websocket, {"schedule": config.get_schedule_data()})

        while True:
            # 初次进入，广播state schedule
            data = await websocket.receive_text()
            if data == 'get_state':
                await script_process.broadcast_state({"state": script_process.state})
            elif data == 'get_schedule':
                config = mm.config_cache(script_name)
                config.get_next()
                await script_process.broadcast_state({"schedule": config.get_schedule_data()})
            elif data == 'start':
                await script_process.start()
            elif data == 'stop':
                await script_process.stop()

    except WebSocketDisconnect:
        logger.warning(f'[{script_name}] websocket disconnect')
        await script_process.disconnect(websocket)
    except Exception as e:
        logger.exception(f'[{script_name}] websocket error: {e}')
        await script_process.disconnect(websocket)
