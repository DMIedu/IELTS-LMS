"""Real loopback HTTP checks; no account, deployment or provider connection."""
import contextlib
import http.client
import json
import os
import pathlib
import socket
import subprocess
import sys
import time
import unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]
SERVICE = ROOT / "private-audio-service"
TOKEN = "synthetic-test-token-" + "x" * 32

@contextlib.contextmanager
def server(enabled=False, token=TOKEN):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    env = dict(os.environ)
    for key in list(env):
        if key.startswith("DMI_AUDIO_") or key.startswith("GUNICORN_"):
            del env[key]
    env.update(PORT=str(port), DMI_AUDIO_WORKER_ENABLED="true" if enabled else "false",
               DMI_AUDIO_WORKER_TOKEN=token, DMI_AUDIO_ASSESSOR_ENABLED="false")
    process = subprocess.Popen([sys.executable, "-m", "gunicorn", "--config",
                                "gunicorn.conf.py", "service:application"],
                               cwd=SERVICE, env=env, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            if process.poll() is not None:
                raise AssertionError("Server exited before startup")
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=.1):
                    break
            except OSError:
                time.sleep(.1)
        else:
            raise AssertionError("Server startup timed out")
        yield port
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)

def request(port, method="POST", path="/v1/evaluate", body="{}", headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
    try:
        conn.request(method, path, body=body, headers=headers or {})
        response = conn.getresponse()
        return response.status, dict(response.getheaders()), json.loads(response.read())
    finally:
        conn.close()

class HostingTests(unittest.TestCase):
    def test_default_disabled_over_http(self):
        with server() as port:
            status, headers, body = request(port)
        self.assertEqual(status, 503)
        self.assertEqual(body["code"], "WORKER_DISABLED")
        self.assertEqual(headers["Cache-Control"], "no-store")

    def test_missing_token_fails_closed(self):
        with server(True, "") as port:
            self.assertEqual(request(port)[2]["code"], "WORKER_DISABLED")

    def test_enabled_rejects_missing_and_wrong_credentials(self):
        with server(True) as port:
            self.assertEqual(request(port)[0], 401)
            self.assertEqual(request(port, headers={"Authorization": "Bearer wrong"})[0], 401)

    def test_authenticated_invalid_body_never_calls_provider(self):
        headers = {"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json",
                   "Idempotency-Key": "a" * 64}
        with server(True) as port:
            self.assertEqual(request(port, body='{"requestID":"' + "a"*64 + '"}', headers=headers)[0], 422)
            self.assertEqual(request(port, body="bad json", headers=headers)[0], 400)

    def test_method_and_route(self):
        with server() as port:
            self.assertEqual(request(port, method="GET")[0], 405)
            self.assertEqual(request(port, path="/other")[0], 404)

    def test_configuration_rejects_invalid_port(self):
        env = dict(os.environ, PORT="8080;invalid")
        result = subprocess.run([sys.executable, "gunicorn.conf.py"], cwd=SERVICE,
                                env=env, capture_output=True, timeout=3)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"INVALID_PORT", result.stderr)


    def test_browser_proxy_headers_reach_route_and_auth_checks(self):
        headers = {"X-Synthetic-Proxy-" + str(i): "fixture" for i in range(40)}
        with server() as port:
            status, _, body = request(port, method="GET", headers=headers)
            self.assertEqual(status, 405)
            self.assertEqual(body["code"], "POST_REQUIRED")
            self.assertEqual(request(port, headers=headers)[2]["code"], "WORKER_DISABLED")
        with server(True) as port:
            self.assertEqual(request(port, headers=headers)[0], 401)

    def test_excessive_headers_remain_rejected(self):
        headers = {"X-Synthetic-Extra-" + str(i): "fixture" for i in range(101)}
        with server() as port:
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
            try:
                conn.request("GET", "/v1/evaluate", headers=headers)
                response = conn.getresponse()
                self.assertEqual(response.status, 431)
                response.read()
            finally:
                conn.close()

if __name__ == "__main__":
    unittest.main()
