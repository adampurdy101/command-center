#!/usr/bin/env python3
"""
MORNING BRIEF  ·  Command Center's proof integration.

Runs on GitHub Actions (~6 AM PT). Reads the inbox over IMAP (read-only),
counts unread + flagged mail, grabs the latest unread subjects, counts open
tasks from Supabase, and writes one row into the `daily_brief` table. The hub
reads that row and flips panel 01 from DEMO to LIVE.

No third-party packages — everything here is in the Python standard library,
so the GitHub Action needs no `pip install` step.

Secrets/config come from environment variables (set as GitHub Actions Secrets):
  GMAIL_ADDRESS              the mailbox to read           (e.g. you@gmail.com)
  GMAIL_APP_PASSWORD         a Google/iCloud "app password" (NOT your login pw)
  SUPABASE_SERVICE_ROLE_KEY  server-side key (bypasses RLS to write the row)
Non-secret config (set in the workflow file):
  SUPABASE_URL               https://<ref>.supabase.co
  CC_USER_ID                 the auth user the brief belongs to (a uuid)
  IMAP_HOST                  optional, defaults to imap.gmail.com
                             (use imap.mail.me.com for iCloud)
"""

import email
import imaplib
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from email.header import decode_header, make_header


def env(name, default=None, required=False):
    val = os.environ.get(name, default)
    if required and not val:
        print(f"ERROR: missing required env var {name}", file=sys.stderr)
        sys.exit(1)
    return val


GMAIL_ADDRESS = env("GMAIL_ADDRESS", required=True)
GMAIL_APP_PASSWORD = env("GMAIL_APP_PASSWORD", required=True)
SUPABASE_URL = env("SUPABASE_URL", required=True).rstrip("/")
SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY", required=True)
USER_ID = env("CC_USER_ID", required=True)
IMAP_HOST = env("IMAP_HOST", "imap.gmail.com")


def decode(s):
    """Decode a possibly MIME-encoded header into plain text."""
    try:
        return str(make_header(decode_header(s or "")))
    except Exception:
        return s or ""


def read_inbox():
    """Return (unread_count, flagged_count, [(from, subject), ...])."""
    M = imaplib.IMAP4_SSL(IMAP_HOST)
    M.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
    M.select("INBOX", readonly=True)  # readonly => nothing gets marked read

    _, unseen = M.search(None, "UNSEEN")
    unread_ids = unseen[0].split()
    unread = len(unread_ids)

    _, flagged = M.search(None, "FLAGGED")
    flagged_count = len(flagged[0].split())

    # newest few unread, for the digest text
    recent = []
    for num in reversed(unread_ids[-5:]):
        _, parts = M.fetch(num, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])")
        if not parts or not parts[0]:
            continue
        msg = email.message_from_bytes(parts[0][1])
        recent.append((decode(msg.get("From", "")), decode(msg.get("Subject", "(no subject)"))))

    M.close()
    M.logout()
    return unread, flagged_count, recent


def sb_request(method, path, body=None, extra_headers=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode()
        return resp.status, raw


def count_open_tasks():
    try:
        _, raw = sb_request(
            "GET",
            f"tasks?user_id=eq.{USER_ID}&done=eq.false&select=id",
        )
        return len(json.loads(raw or "[]"))
    except Exception as e:
        print(f"warn: could not count tasks: {e}", file=sys.stderr)
        return None


def build_digest(unread, flagged, recent, open_tasks):
    today = datetime.now(timezone.utc).astimezone().strftime("%a %b %d, %Y")
    lines = [f"MORNING BRIEF · {today}", ""]
    lines.append(f"MAIL  ·  {unread} unread, {flagged} flagged")
    if recent:
        lines.append("")
        lines.append("LATEST UNREAD:")
        for frm, subj in recent:
            sender = frm.split("<")[0].strip().strip('"') or frm
            lines.append(f"  • {sender[:28]:<28}  {subj[:48]}")
    lines.append("")
    lines.append(f"TASKS ·  {open_tasks if open_tasks is not None else '–'} open")
    lines.append("")
    lines.append("CALENDAR ·  (wires in a later pass)")
    return "\n".join(lines)


def main():
    print(f"[brief] reading {GMAIL_ADDRESS} via {IMAP_HOST} …")
    unread, flagged, recent = read_inbox()
    print(f"[brief] unread={unread} flagged={flagged} recent={len(recent)}")

    open_tasks = count_open_tasks()
    next_event = recent[0][1] if recent else None  # placeholder until calendar is wired
    digest = build_digest(unread, flagged, recent, open_tasks)

    row = {
        "user_id": USER_ID,
        "unread": unread,
        "flagged": flagged,
        "next_event": next_event,
        "open_tasks": open_tasks,
        "digest": digest,
    }
    status, raw = sb_request("POST", "daily_brief", body=row,
                             extra_headers={"Prefer": "return=minimal"})
    print(f"[brief] wrote daily_brief row (HTTP {status})")
    print("[brief] done.")


if __name__ == "__main__":
    try:
        main()
    except imaplib.IMAP4.error as e:
        print(f"ERROR: IMAP login/read failed — check GMAIL_ADDRESS and "
              f"GMAIL_APP_PASSWORD (must be an app password). {e}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.HTTPError as e:
        print(f"ERROR: Supabase write failed (HTTP {e.code}): {e.read().decode()}",
              file=sys.stderr)
        sys.exit(1)
