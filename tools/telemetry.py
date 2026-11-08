#!/usr/bin/env python3
"""
tools/telemetry.py
Pulls live development telemetry from the GitHub GraphQL API and writes
assets/telemetry.json, then rebuilds every SVG panel.

  { "languages": [["typescript", 43], ...],     # top six by source bytes
    "series":    [3, 7, 12, ...],               # monthly contribution sums, oldest -> newest
    "counters":  [["19", "REPOSITORIES"], ...] } # four counters, last one is static

Failure policy: a failed or partial call never overwrites good data with empty data.
The previous assets/telemetry.json stays exactly as it was, and the SVGs are rebuilt
from it (or from the starter values in profile.json when no file exists yet).

Runs in GitHub Actions via .github/workflows/telemetry.yml, or locally:
    GITHUB_TOKEN=ghp_xxx python3 tools/telemetry.py
Standard library only.
"""

import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

USERNAME = "Anonymous-Ekansh"
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

PROFILE_PATH = BASE_DIR / "profile.json"
TELEMETRY_PATH = BASE_DIR / "assets" / "telemetry.json"
ASSETS_DIR = BASE_DIR / "assets"
GRAPHQL_URL = "https://api.github.com/graphql"
MONTHS = 12

QUERY = """
query Telemetry($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    repositories(
      first: 100
      ownerAffiliations: OWNER
      privacy: PUBLIC
      isFork: false
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      totalCount
      nodes {
        languages(first: 12, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name } }
        }
      }
    }
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}
"""


def _post_graphql(token: str, variables: dict) -> dict:
    """POSTs the telemetry query. Returns {} on any failure (caller keeps old data)."""
    payload = json.dumps({"query": QUERY, "variables": variables}).encode("utf-8")
    request = urllib.request.Request(
        GRAPHQL_URL,
        data=payload,
        headers={
            "Authorization": f"bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": f"{USERNAME}-telemetry",
        },
        method="POST",
    )

    for context in (ssl.create_default_context(), ssl._create_unverified_context()):
        try:
            with urllib.request.urlopen(request, timeout=20, context=context) as response:
                body = json.loads(response.read().decode("utf-8"))
            if body.get("errors"):
                print(f"[telemetry] GraphQL errors: {body['errors']}", file=sys.stderr)
                return {}
            return body.get("data") or {}
        except urllib.error.HTTPError as exc:
            print(f"[telemetry] GitHub returned HTTP {exc.code}: {exc.read()[:200]!r}", file=sys.stderr)
            return {}
        except Exception as exc:  # noqa: BLE001 - network/cert variance on local macOS
            print(f"[telemetry] request failed ({exc}); retrying insecurely", file=sys.stderr)
            continue
    return {}


def monthly_series(calendar: dict) -> list:
    """Collapses contribution days into MONTHS monthly totals, oldest first."""
    totals = {}
    for week in calendar.get("weeks", []) or []:
        for day in week.get("contributionDays", []) or []:
            date = day.get("date")
            count = day.get("contributionCount")
            if not date or not isinstance(count, int):
                continue
            totals[date[:7]] = totals.get(date[:7], 0) + count

    if not totals:
        return []

    # Build a contiguous window so a quiet month still occupies a slot.
    now = datetime.now(timezone.utc)
    keys = []
    year, month = now.year, now.month
    for _ in range(MONTHS):
        keys.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    keys.reverse()
    return [totals.get(key, 0) for key in keys]


def language_rows(repositories: dict) -> list:
    """Sums language bytes across public non-fork repos; top six, percent of all bytes."""
    sizes = {}
    for node in repositories.get("nodes", []) or []:
        for edge in (node or {}).get("languages", {}).get("edges", []) or []:
            name = ((edge or {}).get("node") or {}).get("name")
            size = (edge or {}).get("size") or 0
            if not name or size <= 0:
                continue
            key = str(name).lower()
            sizes[key] = sizes.get(key, 0) + int(size)

    total = sum(sizes.values())
    if total <= 0:
        return []

    ranked = sorted(sizes.items(), key=lambda item: item[1], reverse=True)[:6]
    return [[name, int(round(size * 100 / total))] for name, size in ranked]


def counters_for(repositories: dict, profile: dict) -> list:
    """Repo count from GitHub; projects and deployments from the profile."""
    repos = repositories.get("totalCount")
    projects = len(profile.get("projects", []) or [])
    telemetry_cfg = profile.get("telemetry", {}) or {}
    deployments = telemetry_cfg.get("live_deployments", 5)

    return [
        [str(repos) if isinstance(repos, int) else "19", "REPOSITORIES"],
        [str(projects) if projects else "10", "PROJECTS DOCUMENTED"],
        [str(deployments), "LIVE DEPLOYMENTS"],
        ["∞", "TABS OPEN RIGHT NOW"],
    ]


def read_previous() -> dict:
    if not TELEMETRY_PATH.exists():
        return {}
    try:
        data = json.loads(TELEMETRY_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def update_telemetry() -> int:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    previous = read_previous()

    merged = {
        "languages": previous.get("languages") or [],
        "series": previous.get("series") or [],
        "counters": previous.get("counters") or [],
        "updated_at": previous.get("updated_at"),
    }
    changed = False

    if not token:
        print("[telemetry] GITHUB_TOKEN is not set; keeping the previous telemetry.", file=sys.stderr)
    else:
        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=364)).replace(day=1)
        data = _post_graphql(
            token,
            {
                "login": USERNAME,
                "from": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "to": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        )
        user = (data or {}).get("user") or {}
        repositories = user.get("repositories") or {}
        calendar = (user.get("contributionsCollection") or {}).get("contributionCalendar") or {}

        if repositories:
            langs = language_rows(repositories)
            if langs:
                merged["languages"] = langs
                changed = True
            merged["counters"] = counters_for(repositories, profile)
            changed = True

        series = monthly_series(calendar)
        # Never publish an empty series: a zero-filled window with no activity is a failure.
        if series and sum(series) > 0:
            merged["series"] = series
            changed = True
        elif series:
            print("[telemetry] contribution series came back empty; keeping the previous one.", file=sys.stderr)

        if changed:
            merged["updated_at"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        else:
            print("[telemetry] no usable data returned; keeping the previous telemetry.", file=sys.stderr)

    if merged["languages"] or merged["series"] or merged["counters"]:
        TELEMETRY_PATH.parent.mkdir(parents=True, exist_ok=True)
        previous_text = TELEMETRY_PATH.read_text(encoding="utf-8") if TELEMETRY_PATH.exists() else None
        new_text = json.dumps(merged, indent=2, ensure_ascii=False) + "\n"
        if new_text != previous_text:
            TELEMETRY_PATH.write_text(new_text, encoding="utf-8")
            print(f"[telemetry] wrote {TELEMETRY_PATH.relative_to(BASE_DIR)}")
        else:
            print("[telemetry] telemetry.json unchanged")
    else:
        print("[telemetry] no telemetry available yet; leaving assets/telemetry.json absent.", file=sys.stderr)

    from tools.build_assets import build_all

    build_all(PROFILE_PATH, ASSETS_DIR)
    return 0


if __name__ == "__main__":
    sys.exit(update_telemetry())
