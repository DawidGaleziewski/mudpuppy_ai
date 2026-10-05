"""``uv run proving-ground``: one WSGI app served on the estate port and the widget port."""

import argparse
import os
import sys
import threading
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server


class _Server(ThreadingMixIn, WSGIServer):
    daemon_threads = True
    allow_reuse_address = True
    # The stdlib default backlog (5) makes parallel bursts wait for TCP retries (findings F-08).
    request_queue_size = 128


class _QuietHandler(WSGIRequestHandler):
    def log_message(self, format: str, *args) -> None:
        if os.environ.get("PG_ACCESS_LOG") == "1":
            super().log_message(format, *args)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="proving-ground")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=4100)
    p.add_argument("--widget-port", type=int, default=4101)
    p.add_argument("--session-timeout", type=int, default=300, help="idle seconds")
    p.add_argument("--cms-delay-ms", type=int, default=400)
    p.add_argument("--seed-users", help="users file (hashes); default backend/var/users.local.json")
    a = p.parse_args(argv)

    os.environ["PG_PORT"] = str(a.port)
    os.environ["PG_WIDGET_PORT"] = str(a.widget_port)
    os.environ["PG_SESSION_TIMEOUT_S"] = str(a.session_timeout)
    os.environ["PG_CMS_DELAY_MS"] = str(a.cms_delay_ms)
    if a.seed_users:
        os.environ["PG_SEED_USERS"] = os.path.abspath(a.seed_users)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "proving_ground.settings")

    from django.core.wsgi import get_wsgi_application

    from .store import STORE

    app = get_wsgi_application()
    servers = []
    for port in (a.port, a.widget_port):
        try:
            servers.append(make_server(a.host, port, app, _Server, _QuietHandler))
        except OSError as e:
            # Never pick another port: configs and ground truth name these (spec edge case).
            sys.exit(f"proving-ground: port {port} is not available ({e.strerror})")
    users = len(STORE.users)
    print(
        f"proving-ground on http://{a.host}:{a.port}/ (widgets :{a.widget_port}), "
        f"{users} seeded users, session timeout {a.session_timeout}s",
        flush=True,
    )
    if users == 0:
        print("  no users file; run pnpm vault generate (see quickstart) or pass --seed-users")
    threads = [threading.Thread(target=s.serve_forever, daemon=True) for s in servers]
    for t in threads:
        t.start()
    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        for s in servers:
            s.shutdown()
