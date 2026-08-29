#!/usr/bin/env python3
"""Manage the project-local static preview server for Codex lifecycle hooks."""

import hashlib
import json
import os
import pathlib
import signal
import shlex
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from contextlib import contextmanager

import fcntl


HOST = '127.0.0.1'
DEFAULT_PORT = 8000
HEALTHCHECK_TIMEOUT = 3
STOP_TIMEOUT = 2


def project_root():
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--show-toplevel'],
            check=True,
            capture_output=True,
            text=True,
        )
        return pathlib.Path(result.stdout.strip()).resolve()
    except (OSError, subprocess.CalledProcessError):
        return pathlib.Path(__file__).resolve().parents[2]


def port():
    value = os.environ.get('CODEX_PREVIEW_PORT', str(DEFAULT_PORT))
    try:
        value = int(value)
    except ValueError:
        raise RuntimeError('CODEX_PREVIEW_PORT must be an integer')
    if value < 1 or value > 65535:
        raise RuntimeError('CODEX_PREVIEW_PORT must be between 1 and 65535')
    return value


def state_file(root):
    configured_dir = os.environ.get('CODEX_PREVIEW_STATE_DIR')
    if configured_dir:
        directory = pathlib.Path(configured_dir)
    else:
        key = hashlib.sha256(str(root).encode('utf-8')).hexdigest()[:16]
        directory = pathlib.Path(tempfile.gettempdir()) / ('codex-preview-' + key)
    directory.mkdir(parents=True, exist_ok=True)
    return directory / 'server.json'


def read_state(path):
    try:
        with path.open('r', encoding='utf-8') as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


@contextmanager
def state_lock(path):
    lock_path = path.with_name('server.lock')
    with lock_path.open('a', encoding='utf-8') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def write_state(path, state):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w', encoding='utf-8') as handle:
        json.dump(state, handle)
    os.replace(temporary, path)


def remove_state(path):
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def process_command(pid):
    try:
        result = subprocess.run(
            ['ps', '-p', str(pid), '-o', 'command='],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ''


def process_cwd(pid):
    try:
        result = subprocess.run(
            ['lsof', '-a', '-p', str(pid), '-d', 'cwd', '-Fn'],
            check=True,
            capture_output=True,
            text=True,
        )
        for line in result.stdout.splitlines():
            if line.startswith('n'):
                return pathlib.Path(line[1:]).resolve()
    except (OSError, subprocess.CalledProcessError):
        pass

    try:
        return pathlib.Path(os.readlink('/proc/' + str(pid) + '/cwd')).resolve()
    except OSError:
        return None


def process_matches(state, root):
    try:
        command_tokens = shlex.split(process_command(state['pid']))
        module_index = command_tokens.index('-m')
        bind_index = command_tokens.index('--bind')
        return (
            state['root'] == str(root)
            and command_tokens[module_index + 1] == 'http.server'
            and command_tokens[bind_index + 1] == HOST
            and str(state['port']) in command_tokens
            and process_cwd(state['pid']) == root
        )
    except (KeyError, IndexError, ValueError):
        return False


def process_running(state, root):
    try:
        os.kill(state['pid'], 0)
    except (OSError, TypeError, ValueError):
        return False
    return process_matches(state, root)


def server_url(server_port):
    return 'http://' + HOST + ':' + str(server_port) + '/index.html'


def healthy(server_port):
    try:
        with urllib.request.urlopen(server_url(server_port), timeout=0.2) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def wait_for_health(server_port, timeout, process=None):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if process is not None and process.poll() is not None:
            return False
        if healthy(server_port):
            return True
        time.sleep(0.05)
    return False


def stop_process(root, state):
    if not process_running(state, root):
        return
    try:
        os.kill(state['pid'], signal.SIGTERM)
    except OSError:
        return
    deadline = time.time() + STOP_TIMEOUT
    while time.time() < deadline:
        if not process_running(state, root):
            return
        time.sleep(0.05)
    if process_running(state, root):
        try:
            os.kill(state['pid'], signal.SIGKILL)
        except OSError:
            pass


def start(root, path):
  with state_lock(path):
    return _start(root, path)


def _start(root, path):
    existing = read_state(path)
    if existing and process_running(existing, root) and healthy(existing['port']):
        print(json.dumps({'running': True, 'pid': existing['pid'], 'reused': True}))
        return 0
    if existing:
        stop_process(root, existing)
        remove_state(path)

    server_port = port()
    log_path = path.with_name('server.log')
    log_handle = log_path.open('a', encoding='utf-8')
    try:
        process = subprocess.Popen(
            [sys.executable, '-m', 'http.server', str(server_port), '--bind', HOST],
            cwd=str(root),
            stdin=subprocess.DEVNULL,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    finally:
        log_handle.close()

    state = {
        'pid': process.pid,
        'port': server_port,
        'host': HOST,
        'root': str(root),
    }
    try:
        write_state(path, state)
    except OSError:
        process.terminate()
        raise
    if not wait_for_health(server_port, HEALTHCHECK_TIMEOUT, process):
        stop_process(root, state)
        remove_state(path)
        print('preview server failed health check', file=sys.stderr)
        return 1

    print(json.dumps({'running': True, 'pid': process.pid, 'reused': False}))
    return 0


def stop(root, path, quiet=False):
  with state_lock(path):
    return _stop(root, path, quiet)


def _stop(root, path, quiet=False):
    state = read_state(path)
    if not state:
        if not quiet:
            print(json.dumps({'running': False}))
        return 0

    stop_process(root, state)
    remove_state(path)
    if not quiet:
        print(json.dumps({'running': False}))
    return 0


def status(root, path):
    with state_lock(path):
        return _status(root, path)


def _status(root, path):
    state = read_state(path)
    if state and process_running(state, root) and healthy(state['port']):
        print(json.dumps({'running': True, 'pid': state['pid'], 'port': state['port']}))
        return 0
    if state:
        remove_state(path)
    print(json.dumps({'running': False}))
    return 0


def main(arguments):
    if len(arguments) != 2 or arguments[1] not in ('start', 'stop', 'status'):
        print('usage: preview_server.py {start|stop|status}', file=sys.stderr)
        return 2
    root = project_root()
    path = state_file(root)
    try:
        if arguments[1] == 'start':
            return start(root, path)
        if arguments[1] == 'stop':
            return stop(root, path)
        return status(root, path)
    except (OSError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv))
