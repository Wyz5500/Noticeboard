import json
import importlib.util
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from urllib.error import URLError
from unittest.mock import patch


REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
SERVER_SCRIPT = REPO_ROOT / '.codex' / 'hooks' / 'preview_server.py'

SERVER_MODULE_SPEC = importlib.util.spec_from_file_location('preview_server', SERVER_SCRIPT)
PREVIEW_SERVER = importlib.util.module_from_spec(SERVER_MODULE_SPEC)
SERVER_MODULE_SPEC.loader.exec_module(PREVIEW_SERVER)


class PreviewServerTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.environment = os.environ.copy()
        self.environment['CODEX_PREVIEW_STATE_DIR'] = self.temp_dir.name
        self.environment['CODEX_PREVIEW_PORT'] = '8765'

    def tearDown(self):
        if SERVER_SCRIPT.exists():
            subprocess.run(
                [sys.executable, str(SERVER_SCRIPT), 'stop'],
                env=self.environment,
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        self.temp_dir.cleanup()

    def run_server_command(self, action):
        return subprocess.run(
            [sys.executable, str(SERVER_SCRIPT), action],
            cwd=str(REPO_ROOT),
            env=self.environment,
            check=False,
            capture_output=True,
            text=True,
        )

    def wait_for_page(self):
        url = 'http://127.0.0.1:8765/index.html'
        deadline = time.time() + 3
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(url, timeout=0.2) as response:
                    return response.read()
            except Exception:
                time.sleep(0.05)
        self.fail('preview server did not serve index.html')

    def start_external_server(self, root):
        root = pathlib.Path(root)
        (root / 'external.txt').write_text('external server', encoding='utf-8')
        process = subprocess.Popen(
            [sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'],
            cwd=str(root),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        deadline = time.time() + 3
        last_error = None
        while time.time() < deadline:
            try:
                with urllib.request.urlopen('http://127.0.0.1:8765/external.txt', timeout=0.2):
                    return process
            except Exception as error:
                last_error = error
                time.sleep(0.05)
        process.terminate()
        process.wait(timeout=3)
        self.fail('external server did not start: ' + repr(last_error))

    def test_health_check_rejects_a_process_that_exits_after_external_health_response(self):
        class ExitingProcess:
            def __init__(self):
                self.poll_count = 0

            def poll(self):
                self.poll_count += 1
                return None if self.poll_count == 1 else 1

        process = ExitingProcess()
        with patch.object(PREVIEW_SERVER, 'healthy', return_value=True):
            self.assertFalse(PREVIEW_SERVER.wait_for_health(8765, 1, process))

    def test_start_reuses_server_and_stop_shuts_it_down(self):
        first_start = self.run_server_command('start')
        self.assertEqual(first_start.returncode, 0, first_start.stderr)
        self.assertIn(b'<!doctype html>', self.wait_for_page())

        first_status = self.run_server_command('status')
        self.assertEqual(first_status.returncode, 0, first_status.stderr)
        first_info = json.loads(first_status.stdout)
        self.assertTrue(first_info['running'])

        second_start = self.run_server_command('start')
        self.assertEqual(second_start.returncode, 0, second_start.stderr)
        second_info = json.loads(self.run_server_command('status').stdout)
        self.assertEqual(second_info['pid'], first_info['pid'])

        stop = self.run_server_command('stop')
        self.assertEqual(stop.returncode, 0, stop.stderr)
        stopped_info = json.loads(self.run_server_command('status').stdout)
        self.assertFalse(stopped_info['running'])
        with self.assertRaises(URLError):
            urllib.request.urlopen('http://127.0.0.1:8765/index.html', timeout=0.2)

    def test_start_fails_without_claiming_an_occupied_port(self):
        with tempfile.TemporaryDirectory() as external_root:
            external_process = self.start_external_server(pathlib.Path(external_root))
            try:
                start = self.run_server_command('start')
                self.assertNotEqual(start.returncode, 0)
                self.assertFalse(json.loads(self.run_server_command('status').stdout)['running'])
                with urllib.request.urlopen('http://127.0.0.1:8765/external.txt', timeout=0.2):
                    pass
            finally:
                external_process.terminate()
                external_process.wait(timeout=3)

    def test_stop_does_not_kill_a_server_from_another_directory(self):
        with tempfile.TemporaryDirectory() as external_root:
            external_process = self.start_external_server(pathlib.Path(external_root))
            state_path = pathlib.Path(self.temp_dir.name) / 'server.json'
            state_path.write_text(
                json.dumps({
                    'pid': external_process.pid,
                    'port': 8765,
                    'host': '127.0.0.1',
                    'root': str(REPO_ROOT),
                }),
                encoding='utf-8',
            )
            try:
                stop = self.run_server_command('stop')
                self.assertEqual(stop.returncode, 0, stop.stderr)
                self.assertIsNone(external_process.poll())
                with urllib.request.urlopen('http://127.0.0.1:8765/external.txt', timeout=0.2):
                    pass
            finally:
                external_process.terminate()
                external_process.wait(timeout=3)

    def test_concurrent_starts_share_one_server(self):
        starts = [
            subprocess.Popen(
                [sys.executable, str(SERVER_SCRIPT), 'start'],
                cwd=str(REPO_ROOT),
                env=self.environment,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            for _ in range(2)
        ]
        results = []
        for process in starts:
            stdout, stderr = process.communicate(timeout=5)
            results.append((process.returncode, stdout, stderr))
        self.assertTrue(all(result[0] == 0 for result in results), results)
        status = json.loads(self.run_server_command('status').stdout)
        self.assertTrue(status['running'])


if __name__ == '__main__':
    unittest.main()
