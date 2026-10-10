"""In-process WSGI checks only. No server/account/provider/candidate audio."""
import io
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).parents[1] / "private-audio-service"))
import service
from processor import ProcessingError

class ServiceChecks(unittest.TestCase):
    def setUp(self):
        self.calls = 0
        self.clock = 0
        def process(body):
            self.calls += 1
            return {"requestID": body["requestID"], "decoded": [], "assessment": None}
        self.app = service.create_app(True, "synthetic-token-" * 4, process, now=lambda: self.clock)
        self.body = {"requestID": "a" * 64, "synthetic": "fixture"}

    def call(self, app=None, body=None, **changes):
        raw = json.dumps(self.body if body is None else body).encode()
        environ = {"PATH_INFO": "/v1/evaluate", "REQUEST_METHOD": "POST", "CONTENT_LENGTH": str(len(raw)),
                   "CONTENT_TYPE": "application/json", "HTTP_AUTHORIZATION": "Bearer " + "synthetic-token-" * 4,
                   "HTTP_IDEMPOTENCY_KEY": "a" * 64, "wsgi.input": io.BytesIO(raw), **changes}
        response = []
        data = b"".join((app or self.app)(environ, lambda status, headers: response.extend([status, dict(headers)])))
        return response[0], response[1], json.loads(data)

    def test_default_app_disabled(self):
        self.assertEqual(self.call(service.create_app())[2]["code"], "WORKER_DISABLED")
        self.assertEqual(self.calls, 0)

    def test_private_auth_before_processing(self):
        self.assertEqual(self.call(HTTP_AUTHORIZATION="wrong")[0], "401 Unauthorized")
        self.assertEqual(self.calls, 0)

    def test_route_and_post_only(self):
        self.assertEqual(self.call(PATH_INFO="/other")[0], "404 Not Found")
        self.assertEqual(self.call(REQUEST_METHOD="GET")[0], "405 Method Not Allowed")
        self.assertEqual(self.calls, 0)

    def test_body_and_identity_bounds(self):
        for change in ({"CONTENT_LENGTH": "0"}, {"CONTENT_LENGTH": "99999999"},
                       {"CONTENT_LENGTH": "bad"}, {"CONTENT_TYPE": "text/html"},
                       {"HTTP_TRANSFER_ENCODING": "chunked"}, {"HTTP_IDEMPOTENCY_KEY": "wrong"}):
            with self.subTest(change=change):
                self.assertEqual(self.call(**change)[0], "400 Bad Request")
        self.assertEqual(self.calls, 0)

    def test_private_no_store_response(self):
        status, headers, result = self.call()
        self.assertEqual(status, "200 OK")
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertIsNone(result["assessment"])
        self.assertEqual(self.calls, 1)

    def test_exact_retry_processed_once(self):
        first = self.call()[2]
        self.assertEqual(self.call()[2], first)
        self.assertEqual(self.calls, 1)

    def test_changed_payload_same_identity_rejected(self):
        self.call()
        self.assertEqual(self.call(body={**self.body, "synthetic": "changed"})[0], "409 Conflict")
        self.assertEqual(self.calls, 1)

    def test_cache_expires_without_audio_retention(self):
        self.call()
        self.clock = 300
        self.call()
        self.assertEqual(self.calls, 2)

    def test_provider_not_configured_fails_closed(self):
        def unavailable(body):
            raise ProcessingError("ASSESSOR_NOT_CONFIGURED")
        result = self.call(service.create_app(True, "synthetic-token-" * 4, unavailable))
        self.assertEqual(result[0], "503 Service Unavailable")
        self.assertEqual(result[2]["code"], "ASSESSOR_NOT_CONFIGURED")

    def test_exception_details_are_not_returned(self):
        def failed(body):
            raise RuntimeError("private audio and synthetic-token")
        result = self.call(service.create_app(True, "synthetic-token-" * 4, failed))
        self.assertEqual(result[2], {"ok": False, "code": "PROCESSING_FAILED"})

if __name__ == "__main__":
    unittest.main()
