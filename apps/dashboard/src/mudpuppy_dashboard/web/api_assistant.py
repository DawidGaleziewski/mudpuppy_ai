"""The React console's assistant drawer (R-96, spec 069; spec 022 M3): the portal's conversation
as a timeline. Sending, the event stream, Stop, Reset and storing a credential stay the
dashboard's `/chat/…` forwarders (`web/chat.py`), which the drawer calls as the htmx one does.
No SQL here (G-15)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request

from .. import chat_client, queries_app_assistant, queries_chat, queries_proposals
from .api_common import store
from .deps import web_of
from .views_chat import timeline

router = APIRouter(prefix="/api/portals/{portal}/assistant")


@router.get("")
async def assistant_page(
    request: Request, portal: str, env: str | None = None, conversation: str | None = None
) -> queries_app_assistant.AssistantPage:
    """The conversation asked for, else the portal's newest active one (none yet: a way to start
    one)."""
    web = web_of(request)
    c = web.ctx(request, env)
    up = await chat_client.service_up(web.settings, web.chat_transport)
    with store(c) as conn:
        if conversation:
            found = queries_chat.get_conversation(conn, conversation)
            if found is None:
                raise HTTPException(404, f"There is no conversation {conversation}.")
        else:
            found = queries_chat.newest_active_conversation(conn, portal)
        entries, scan = [], None
        if found is not None:
            messages = queries_chat.list_messages(conn, found.id)
            entries = timeline(messages, queries_proposals.for_conversation(conn, found.id))
            progress = queries_chat.progress(conn, queries_chat.tracker(conn, found))
            scan = queries_app_assistant.scan_line(progress, datetime.now(UTC))
    hint = chat_client.start_hint(c.env)
    return queries_app_assistant.assistant_page(portal, found, entries, (up, hint), scan)
