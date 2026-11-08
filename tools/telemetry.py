#!/usr/bin/env python3
"""
tools/telemetry.py
Fetches development telemetry from GitHub API (or maintains current metrics)
and updates profile.json telemetry before invoking build_assets.py.

Runs in GitHub Actions via .github/workflows/telemetry.yml or locally.
Pure Python, standard library only.
"""

import json
import os
import ssl
import sys
import urllib.request
from pathlib import Path

USERNAME = "Anonymous-Ekansh"
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
PROFILE_PATH = BASE_DIR / "profile.json"


def fetch_github_telemetry(username: str, token: str = None) -> dict:
    """Queries GitHub API for user repositories and computes language distribution."""
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": f"{username}-telemetry-script",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    url = f"https://api.github.com/users/{username}/repos?per_page=100&type=owner"
    req = urllib.request.Request(url, headers=headers)

    ctx = ssl.create_default_context()
    try:
        response_cm = urllib.request.urlopen(req, timeout=10, context=ctx)
    except Exception:
        # Fallback for local mac dev without system certs installed
        try:
            unverified_ctx = ssl._create_unverified_context()
            response_cm = urllib.request.urlopen(req, timeout=10, context=unverified_ctx)
        except Exception as e:
            print(f"[telemetry] Network/API exception: {e}. Preserving current telemetry.", file=sys.stderr)
            return {}

    try:
        with response_cm as response:
            if response.status != 200:
                print(f"[telemetry] GitHub API returned status {response.status}", file=sys.stderr)
                return {}
            repos = json.loads(response.read().decode("utf-8"))
    except Exception as e:
        print(f"[telemetry] Exception reading API response: {e}. Preserving current telemetry.", file=sys.stderr)
        return {}

    # Calculate languages
    language_counts = {}
    total_repos = len(repos)
    for r in repos:
        if r.get("fork"):
            continue
        lang = r.get("language")
        if lang:
            l_clean = lang.lower()
            language_counts[l_clean] = language_counts.get(l_clean, 0) + 1

    total_with_lang = sum(language_counts.values()) or 1
    sorted_langs = sorted(language_counts.items(), key=lambda x: x[1], reverse=True)

    top_languages = []
    accumulated_pct = 0
    for l_name, count in sorted_langs[:5]:
        pct = round((count / total_with_lang) * 100)
        accumulated_pct += pct
        top_languages.append([l_name, pct])

    other_pct = max(0, 100 - accumulated_pct)
    if other_pct > 0:
        top_languages.append(["other", other_pct])

    return {
        "repo_count": total_repos,
        "languages": top_languages,
    }


def update_profile_telemetry() -> None:
    token = os.environ.get("GITHUB_TOKEN")
    with open(PROFILE_PATH, "r", encoding="utf-8") as f:
        profile_data = json.load(f)

    print(f"[telemetry] Checking GitHub stats for {USERNAME}...")
    api_data = fetch_github_telemetry(USERNAME, token)

    if api_data and api_data.get("languages"):
        print("[telemetry] Updating languages from GitHub API...")
        profile_data["telemetry"]["languages"] = api_data["languages"]

    # Save profile.json
    with open(PROFILE_PATH, "w", encoding="utf-8") as f:
        json.dump(profile_data, f, indent=2)
    print("  ✓ profile.json updated.")

    # Rebuild assets
    from tools.build_assets import build_all
    assets_dir = BASE_DIR / "assets"
    build_all(PROFILE_PATH, assets_dir)


if __name__ == "__main__":
    update_profile_telemetry()
