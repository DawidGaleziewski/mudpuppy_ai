import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

DEBUG = False
SECRET_KEY = os.environ.get("PROVING_GROUND_SECRET_KEY", "proving-ground-dev-not-secret")
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]

INSTALLED_APPS: list[str] = []
# Order: the port guard first (wrong-port requests never touch a session), then sessions.
# The rate limiter (LO-41) sits after sessions because it counts per session.
MIDDLEWARE: list[str] = [
    "proving_ground.estate.widget_port_guard",
    "proving_ground.sessions.middleware",
    "proving_ground.ratelimit.middleware",
]
ROOT_URLCONF = "proving_ground.urls"
DATABASES: dict = {}
APPEND_SLASH = False

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": False,
        "OPTIONS": {"context_processors": []},
    }
]

USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {"django": {"handlers": ["console"], "level": "WARNING"}},
}
