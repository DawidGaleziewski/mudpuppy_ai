import os
from pathlib import Path

import pytest

FIXTURE_USERS = Path(__file__).parent / "fixtures" / "users.json"
PASSWORD = "test-password-not-real"

os.environ["PG_SEED_USERS"] = str(FIXTURE_USERS)
os.environ["PG_CMS_DELAY_MS"] = "0"


@pytest.fixture(autouse=True)
def fresh_estate():
    """Every test starts from the seed with the fixture users and default timeouts."""
    from proving_ground import config
    from proving_ground.store import STORE

    os.environ["PG_SESSION_TIMEOUT_S"] = "300"
    config.reload()
    STORE.reset()
    yield
    os.environ["PG_SESSION_TIMEOUT_S"] = "300"
    config.reload()


@pytest.fixture
def client():
    from django.test import Client

    return Client()


def login(client, brand: str, user: str, password: str = PASSWORD, captcha_token: str = ""):
    form = client.get(f"/api/login/form?marka={brand}").json()
    data = {"login": user, "haslo": password, "csrf": form["csrf"], "marka": brand, "next": "/x"}
    if captcha_token:
        data["g-recaptcha-response"] = captcha_token
    return client.post("/api/login", data)
