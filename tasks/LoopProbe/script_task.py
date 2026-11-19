# This Python file uses the following encoding: utf-8
"""Hidden task that reads a loop-scheduling probe and stores the result.

The loop scheduler writes ``log/loop_probe_request_<config>.json`` with the
probe id, runs this task through the normal task loader, then reads
``log/loop_probe_<config>.json``. It is not part of the user-facing task menu.
"""
import json
from datetime import datetime

from module.exception import TaskEnd
from module.runtime import data_path
from tasks.GameUi.game_ui import GameUi
from tasks.GameUi.page import page_realm_raid
from tasks.RealmRaid.assets import RealmRaidAssets


class ScriptTask(GameUi, RealmRaidAssets):
    def run(self):
        probe = self._requested_probe()
        payload = {
            'probe': probe,
            'time': datetime.now().isoformat(timespec='seconds'),
        }
        try:
            if probe == 'realm_raid_ticket':
                self.goto_page(page_realm_raid)
                self.screenshot()
                current, remaining, total = self.O_NUMBER.ocr(self.device.image)
                payload.update({
                    'ok': True,
                    'value': int(current),
                    'remaining': int(remaining),
                    'total': int(total),
                })
            else:
                # `always` and future probes that need no game state
                payload.update({'ok': True, 'value': 1})
        except Exception as error:
            payload.update({'ok': False, 'error': str(error)})

        self._write_result(payload)
        raise TaskEnd

    def _requested_probe(self) -> str:
        request_path = data_path('log', f'loop_probe_request_{self.config.config_name}.json')
        try:
            if request_path.is_file():
                data = json.loads(request_path.read_text(encoding='utf-8'))
                probe = str(data.get('probe', '')).strip()
                if probe:
                    return probe
        except Exception:
            pass
        # 兼容旧配置：请求文件缺失时退回配置里的单条探针
        probe = getattr(self.config.script.loop, 'probe', 'always')
        return getattr(probe, 'value', probe) or 'always'

    def _write_result(self, payload: dict) -> None:
        target = data_path('log', f'loop_probe_{self.config.config_name}.json')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')

        # 汇总最近一次的探针值，任务总览页直接读这个文件
        values_path = data_path('log', f'loop_probe_values_{self.config.config_name}.json')
        try:
            values = {}
            if values_path.is_file():
                values = json.loads(values_path.read_text(encoding='utf-8'))
            values[payload.get('probe', 'unknown')] = {
                'value': payload.get('value'),
                'ok': payload.get('ok', False),
                'time': payload.get('time'),
            }
            values_path.write_text(json.dumps(values, ensure_ascii=False), encoding='utf-8')
        except Exception:
            pass
