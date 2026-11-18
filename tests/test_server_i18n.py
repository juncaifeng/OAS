from module.server.i18n import I18n


def test_chinese_translations_merge_qt_and_asset_dictionaries():
    translations = I18n.load_zh_cn()

    assert translations['Orochi'] == '八岐大蛇'
    assert translations['OrochiConfig'] == '副本'
    assert translations['MetaDemon'] == '超鬼王'
    assert translations['leader'] == '队长'
    assert translations['alone'] == '单人挑战'
    assert '可选队长' in translations['user_status_help']


def test_runtime_translation_uses_the_same_merged_dictionary():
    assert I18n.trans_zh_cn('Orochi') == '八岐大蛇'
    assert I18n.trans_zh_cn('unknown_translation_key') == 'unknown_translation_key'
