"""Bounded single-process pilot. HTTPS and ingress limits belong to the host."""
import os
port = os.environ.get("PORT", "8080")
if not port.isascii() or not port.isdigit() or not 1024 <= int(port) <= 65535:
    raise ValueError("INVALID_PORT")
bind = "0.0.0.0:" + port
workers = 1
worker_class = "sync"
threads = 1
timeout = 210
graceful_timeout = 210
backlog = 8
limit_request_line = 2048
limit_request_fields = 16
limit_request_field_size = 8190
worker_tmp_dir = "/dev/shm"
accesslog = None
errorlog = "-"
loglevel = "warning"
capture_output = False
preload_app = False
# Per-process replay cache does not survive restart; do not scale this pilot.
max_requests = 0
