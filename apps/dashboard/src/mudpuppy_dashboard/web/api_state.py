"""The React console's recordings (R-100, spec 071; designer Q10): one recorded state with its
amendments and access, opened as a dialog on its Screen page, and the Screen page's recordings
(amendments, inputs, reached at). Read-only, no SQL here (G-15)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .. import (
    queries_app_screen_recordings,
    queries_app_state,
    queries_app_state_side,
    queries_settings,
    visuals,
)
from .api_common import store
from .deps import web_of

router = APIRouter(prefix="/api")


class StateView(BaseModel):
    page: queries_app_state.StatePage
    amendments: queries_app_state_side.Amendments
    access: queries_app_state_side.Access | None
    #: The reviewer's name is set, so marks can be written.
    can_mark: bool
    #: The model screen and variant it opens on (designer Q10); None: none holds it yet.
    place: queries_app_screen_recordings.RecordingPlace | None


@router.get("/portals/{portal}/screens/{key}/recordings")
def screen_recordings(
    request: Request, portal: str, key: str, env: str | None = None
) -> queries_app_screen_recordings.ScreenRecordings:
    """What the 1.x state page showed, on the Screen page (Q10): amendments, inputs, reached at."""
    web = web_of(request)
    c = web.ctx(request, env)
    with store(c) as conn:
        found = queries_app_screen_recordings.screen_recordings(
            conn, c.data_dir, portal, key, bool(web.settings.reviewer)
        )
    if found is None:
        raise HTTPException(404, f"Screen {key} of {portal} has no recordings.")
    return found


@router.get("/states/{state_id}")
def state(
    request: Request,
    state_id: str,
    env: str | None = None,
    left: str | None = None,
    right: str | None = None,
) -> StateView:
    """A recorded screen; `left` and `right` pick the two personas shown side by side."""
    web = web_of(request)
    c = web.ctx(request, env)
    with store(c) as conn:
        found = visuals.state_page(conn, c.data_dir, state_id)
        if found is None:
            raise HTTPException(404, f"There is no recorded screen {state_id} in this store.")
        st = found.figure.state
        attrs = queries_settings.attributes_by_persona(web.settings.personas_dir, st.portal_id)
        return StateView(
            page=queries_app_state.state_page(conn, found),
            amendments=queries_app_state_side.amendments(conn, c.data_dir, st, found.elements),
            access=queries_app_state_side.access(conn, st, attrs, (left, right)),
            can_mark=bool(web.settings.reviewer),
            place=queries_app_screen_recordings.place_of(conn, state_id),
        )
