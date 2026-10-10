"""WSGI transport draft. No listener, deployment or real assessor is started."""
import hashlib
import hmac
import json
import os
import threading
import time
from collections import OrderedDict
from processor import MAX_BODY, ProcessingError, process_request

def create_app(enabled=False, token="", processor=process_request, now=time.monotonic):
    lock = threading.Lock()
    cache = OrderedDict()
    ttl = 300
    def application(environ, start_response):
        def respond(status, result):
            raw = json.dumps(result, allow_nan=False).encode("utf-8")
            start_response(status, [("Content-Type", "application/json"), ("Content-Length", str(len(raw))),
                                   ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff")])
            return [raw]
        if environ.get("PATH_INFO") != "/v1/evaluate":
            return respond("404 Not Found", {"ok": False, "code": "NOT_FOUND"})
        if environ.get("REQUEST_METHOD") != "POST":
            return respond("405 Method Not Allowed", {"ok": False, "code": "POST_REQUIRED"})
        if not enabled or len(token) < 32 or len(token) > 4096:
            return respond("503 Service Unavailable", {"ok": False, "code": "WORKER_DISABLED"})
        supplied = environ.get("HTTP_AUTHORIZATION", "")
        if not isinstance(supplied, str) or len(supplied) > 4103 or not hmac.compare_digest(supplied.encode(), ("Bearer " + token).encode()):
            return respond("401 Unauthorized", {"ok": False, "code": "UNAUTHENTICATED"})
        length = environ.get("CONTENT_LENGTH", "")
        if not str(length).isascii() or not str(length).isdigit() or not 1 <= int(length) <= MAX_BODY or environ.get("HTTP_TRANSFER_ENCODING") or environ.get("CONTENT_TYPE") != "application/json":
            return respond("400 Bad Request", {"ok": False, "code": "INVALID_REQUEST"})
        if not lock.acquire(blocking=False):
            return respond("503 Service Unavailable", {"ok": False, "code": "BUSY"})
        try:
            raw = environ["wsgi.input"].read(int(length))
            if len(raw) != int(length):
                return respond("400 Bad Request", {"ok": False, "code": "INVALID_REQUEST"})
            body = json.loads(raw)
            key = environ.get("HTTP_IDEMPOTENCY_KEY")
            if not isinstance(body, dict) or not key or body.get("requestID") != key:
                return respond("400 Bad Request", {"ok": False, "code": "INVALID_REQUEST"})
            fingerprint = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
            current = now()
            for expired in [k for k, v in cache.items() if current - v[0] >= ttl]:
                del cache[expired]
            if key in cache:
                previous = cache[key]
                if not hmac.compare_digest(previous[1], fingerprint):
                    return respond("409 Conflict", {"ok": False, "code": "REQUEST_IDENTITY_CONFLICT"})
                return respond("200 OK", json.loads(previous[2]))
            result = processor(body)
            saved = json.dumps(result, allow_nan=False)
            if len(saved) > 262144:
                raise ProcessingError("ASSESSMENT_INVALID")
            cache[key] = (current, fingerprint, saved)
            while len(cache) > 32:
                cache.popitem(last=False)
            return respond("200 OK", result)
        except ProcessingError as error:
            status = "503 Service Unavailable" if error.code == "ASSESSOR_NOT_CONFIGURED" else "422 Unprocessable Entity"
            return respond(status, {"ok": False, "code": error.code})
        except (ValueError, KeyError, TypeError, UnicodeError):
            return respond("400 Bad Request", {"ok": False, "code": "INVALID_REQUEST"})
        except Exception:
            return respond("503 Service Unavailable", {"ok": False, "code": "PROCESSING_FAILED"})
        finally:
            lock.release()
    return application

# Importing this file creates a callable, not a running HTTP server.
application = create_app(os.environ.get("DMI_AUDIO_WORKER_ENABLED") == "true",
                         os.environ.get("DMI_AUDIO_WORKER_TOKEN", ""))
