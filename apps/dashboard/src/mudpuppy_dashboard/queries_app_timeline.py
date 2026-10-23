"""A conversation's timeline for the assistant drawer (spec 022 FE-A04, FE-A05; R-96 spec 069):
messages, the credential requests the assistant made (names only, never a value) and its
proposals, in time order."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .models import ChatMessage
from .queries_proposals import ProposalView

# The chat service's history lines for a credential request and its answer (ui-actions.ts
# credentialLine, api.ts): names only, never a value.
CREDENTIAL_NEEDED = re.compile(
    r"^Credential needed: ([A-Z][A-Z0-9_]{0,63}) · (\S+) · (sandbox|staging|production) · (\S+)\."
    r"(?: (.*))?$",
    re.DOTALL,
)
CREDENTIAL_STORED = re.compile(r"^Stored in the vault: ([A-Z0-9_, ]+) \((\S+) · (\S+)\)\.")


@dataclass(frozen=True)
class CredentialRequest:
    """The assistant asked for a credential (spec 022 FE-A05); the card is a vault field."""

    message: ChatMessage
    ref: str
    portal: str
    environment: str
    persona: str
    reason: str | None
    stored: bool


def _stored_refs(messages: list[ChatMessage]) -> set[tuple[str, str, str]]:
    found = set()
    for m in messages:
        hit = m.tool_name == "credential_stored" and CREDENTIAL_STORED.match(m.content)
        if hit:
            found |= {(hit[2], hit[3], ref.strip()) for ref in hit[1].split(",")}
    return found


def _entry(m: ChatMessage, stored: set[tuple[str, str, str]]) -> tuple[str, Any]:
    hit = m.tool_name == "request_credential" and CREDENTIAL_NEEDED.match(m.content)
    if not hit:
        return ("message", m)
    ref, portal, env, persona, reason = hit.groups()
    done = (portal, env, ref) in stored
    return ("credential", CredentialRequest(m, ref, portal, env, persona, reason, done))


def timeline(messages: list[ChatMessage], proposals: list[ProposalView]) -> list[tuple[str, Any]]:
    """Messages, credential requests and the assistant's proposals in time order: a proposal
    sits after the message it was made during."""
    stored = _stored_refs(messages)
    entries: list[tuple[str, str, Any]] = [(m.created_at, *_entry(m, stored)) for m in messages]
    entries += [(v.p.created_at, "proposal", v) for v in proposals]
    return [(kind, item) for _, kind, item in sorted(entries, key=lambda e: e[0])]
