import json
import pathlib
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
HOOKS_PATH = REPO_ROOT / '.codex' / 'hooks.json'


class HooksConfigTest(unittest.TestCase):
    def test_session_start_discards_script_status_json(self):
        hooks = json.loads(HOOKS_PATH.read_text(encoding='utf-8'))
        handlers = hooks['hooks']['SessionStart'][0]['hooks']
        command = handlers[0]['command']
        self.assertIn('start >/dev/null', command)

    def test_session_end_discards_script_status_json(self):
        hooks = json.loads(HOOKS_PATH.read_text(encoding='utf-8'))
        handlers = hooks['hooks']['SessionEnd'][0]['hooks']
        command = handlers[0]['command']
        self.assertIn('stop >/dev/null', command)


if __name__ == '__main__':
    unittest.main()
