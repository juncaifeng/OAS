import json
from pathlib import Path
from xml.etree import ElementTree

from module.runtime import app_path, data_path


class Addition:
    @classmethod
    def load_additions(cls) -> dict:
        result = {}
        files: str = ['en-US', 'zh-CN']
        for file in files:
            file_path = Path.cwd() / 'assets' / 'i18n' / f'{file}.json'
            result[file] = {}
            if not file_path.exists():
                continue
            with open(str(file_path), 'r', encoding='utf-8') as f:
                result[file] = json.load(f)
        return result


class I18n(Addition):
    file_zh_cn = data_path('config', 'i18n', 'zh-CN.json')

    @classmethod
    def trans_zh_cn(cls, text) -> str:
        cn_zh_data = cls.load_zh_cn()
        return cn_zh_data[text] if text in cn_zh_data else text

    @classmethod
    def save_zh_cn(cls, data) -> None:
        I18n.file_zh_cn.parent.mkdir(parents=True, exist_ok=True)
        with open(str(I18n.file_zh_cn), 'w', encoding='utf-8') as f:
            s = json.dumps(data, indent=2, ensure_ascii=False, sort_keys=False, default=str)
            f.write(s)

    @classmethod
    def load_zh_cn(cls) -> dict:
        result = {}
        qt_file = app_path('module', 'config', 'i18n', 'zh_CN.xml')
        if qt_file.is_file():
            root = ElementTree.parse(qt_file).getroot()
            for message in root.iter('message'):
                source = message.findtext('source')
                translation = message.findtext('translation')
                if source and translation is not None:
                    result[source] = translation

        additions = cls.load_additions()
        result.update(additions.get('zh-CN', {}))
        if I18n.file_zh_cn.is_file():
            with open(str(I18n.file_zh_cn), 'r', encoding='utf-8') as f:
                result.update(json.load(f))
        return result


if __name__ == '__main__':
    print(I18n.load_zh_cn())
