"""Routes. Each domain module owns its own ``urlpatterns`` (api/*, legacy/views, redirects)."""

from django.urls import path, re_path

from . import auth, captcha, estate, redirects
from .api import bank, insurer, shop
from .legacy import views as legacy

# Full page loads of these modern routes need a session of that brand (302 to login otherwise).
_protected_shell = {
    "shop": auth.require_page("shop")(estate.shell_page),
    "bank": auth.require_page("bank")(estate.shell_page),
}

urlpatterns = [
    path("healthz", estate.healthz),
    path("robots.txt", estate.robots),
    path("__admin/reset", estate.reset),
    path("__test/bundle-delay", estate.bundle_delay),
    path("api/clock", estate.clock),
    path("api/session", auth.session_info),
    path("api/login/form", auth.login_form),
    path("api/login", auth.login),
    path("api/logout", auth.logout),
    path("cms/<str:domain>/<str:lang>.json", estate.cms),
    path("mfe/import-map.json", estate.import_map),
    re_path(r"^mfe/(?P<name>[a-z]+)/(?P<file>[A-Za-z0-9_.\-/]+)$", estate.bundle),
    # CAPTCHA frames (widget port only, enforced by the port guard)
    path("widget/recaptcha/api2/anchor", captcha.anchor),
    path("widget/recaptcha/api2/bframe", captcha.bframe),
    path("widget/recaptcha/api2/payload", captcha.payload),
    path("widget/recaptcha/api2/userverify", captcha.userverify),
    *shop.urlpatterns,
    *bank.urlpatterns,
    *insurer.urlpatterns,
    *legacy.urlpatterns,
    *redirects.urlpatterns,
    # The shell (client-side routing)
    re_path(r"^sklep/konto/?$", _protected_shell["shop"]),
    re_path(r"^bank/(pulpit|przelew|wyciagi|historia)(/.*)?$", _protected_shell["bank"]),
    re_path(r"^(|logowanie|sklep(/.*)?|bank/?|ubezpieczenia/?)$", estate.shell_page),
]
