#!/usr/bin/env python3
"""
tools/build_assets.py
Pure Python script to generate minimalist, editorial monochrome SVG panels
for user Anonymous-Ekansh (Ekansh Jain).
Reads profile.json (single source of truth) and writes every SVG twice:
  - assets/X.svg (light palette)
  - assets/dark/X.svg (dark palette)

Live telemetry (languages by source bytes, 12-month contribution series and the
counters) is read from assets/telemetry.json when tools/telemetry.py has written
it; profile.json holds the starter values and the fallback.

Strictly idempotent. No external dependencies.
"""

import json
import os
import sys
from html import escape as html_escape
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
TELEMETRY_JSON = BASE_DIR / "assets" / "telemetry.json"

# --- PALETTES (baked in, no CSS variables) ---
PALETTE_LIGHT = {
    "bone": "#333333",
    "muted": "#777777",
    "dim": "#9A9A9A",
    "rule": "#C4C4C4",
    "accent": "#000000",
    "ghost": "#D4D4D4",
    "bg": "none",
}

PALETTE_DARK = {
    "bone": "#E6E6E6",
    "muted": "#8C8C8C",
    "dim": "#666666",
    "rule": "#3A3A3A",
    "accent": "#FFFFFF",
    "ghost": "#2C2C2C",
    "bg": "none",
}

FONT_STACK = 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace'

# Starter values measured from the cloned repos; tools/telemetry.py replaces them with
# live source-byte percentages in assets/telemetry.json.
DEFAULT_LANGUAGES = [
    ["typescript", 43],
    ["python", 16],
    ["css", 14],
    ["html", 13],
    ["javascript", 12],
    ["sql", 2],
]

DEFAULT_COUNTERS = [
    ["19", "REPOSITORIES"],
    ["10", "PROJECTS DOCUMENTED"],
    ["5", "LIVE DEPLOYMENTS"],
    ["∞", "TABS OPEN RIGHT NOW"],
]


def xml_escape(text: str) -> str:
    """Escapes text for safe embedding in XML/SVG."""
    if not isinstance(text, str):
        text = str(text)
    return (
        html_escape(text, quote=True)
        .replace("'", "&#39;")
    )


def wrap_text(text: str, limit: int) -> list:
    """Hard-wraps on spaces so a long line can never be clipped by the 1000px canvas."""
    words = str(text).split(" ")
    out, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > limit:
            out.append(current)
            current = word
        else:
            current = candidate
    if current:
        out.append(current)
    return out or [""]


def delay(i: int) -> str:
    """Returns CSS class name for staggered animation delay."""
    return f"d{i}"


def generate_delays(max_steps: int = 24) -> str:
    """Generates staggered delay CSS classes."""
    rules = []
    for i in range(1, max_steps + 1):
        sec = round(i * 0.08, 2)
        rules.append(f"    .{delay(i)} {{ animation-delay: {sec}s; }}")
    return "\n".join(rules)


def wrap(height: int, aria_label: str, body: str, palette: dict, extra_css: str = "") -> str:
    """
    Shared SVG wrapper ensuring strict conformance to design system:
    - viewBox 0 0 1000 height
    - content bounds x=48..952
    - palette baked in directly
    - motion: rise (0.7s), fade, line-draw (1.4s), blinking block cursor, pulsing dot
    - prefers-reduced-motion disabled
    """
    return f"""<svg viewBox="0 0 1000 {height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="{xml_escape(aria_label)}">
  <style>
    .mono {{ font-family: {FONT_STACK}; }}
    .draw {{ stroke-dasharray: 1000; stroke-dashoffset: 1000; animation: draw 1.4s cubic-bezier(.6,0,.2,1) forwards; }}
    @keyframes draw {{ to {{ stroke-dashoffset: 0; }} }}
    .rise {{ opacity: 0; animation: rise 0.7s cubic-bezier(.2,.7,.2,1) forwards; }}
    @keyframes rise {{ from {{ opacity: 0; transform: translateY(8px); }} to {{ opacity: 1; transform: translateY(0); }} }}
    .fade {{ opacity: 0; animation: fade 0.6s ease forwards; }}
    @keyframes fade {{ to {{ opacity: 1; }} }}
    .cursor {{ animation: blink 1s step-end infinite; }}
    @keyframes blink {{ 0%, 100% {{ opacity: 1; }} 50% {{ opacity: 0; }} }}
    .dot {{ animation: pulse 2.4s ease-in-out infinite; }}
    @keyframes pulse {{ 0%, 100% {{ opacity: 1; }} 50% {{ opacity: .35; }} }}
    .ring {{ animation: ping 2.4s ease-out infinite; }}
    @keyframes ping {{ 0% {{ transform: scale(.4); opacity: .8; }} 80%, 100% {{ transform: scale(2.6); opacity: 0; }} }}
    .bar {{ transform: scaleX(0); animation: grow 1.2s cubic-bezier(.2,.7,.2,1) forwards; }}
    @keyframes grow {{ to {{ transform: scaleX(1); }} }}
    .spark {{ stroke-dasharray: 700; stroke-dashoffset: 700; animation: draw 2.2s cubic-bezier(.6,0,.2,1) .4s forwards; }}
    .tick {{ animation: pulse 2.4s ease-in-out infinite; }}
{generate_delays()}
{extra_css}
    @media (prefers-reduced-motion: reduce) {{
      .draw, .rise, .fade, .cursor, .dot, .ring, .bar, .spark, .tick {{
        animation: none !important;
        stroke-dashoffset: 0 !important;
        transform: none !important;
        opacity: 1 !important;
      }}
      .ring {{ opacity: 0 !important; }}
    }}
  </style>
{body}
</svg>
"""


def build_header(data: dict, palette: dict) -> str:
    """Builds top editorial header panel (1000x400)."""
    h = data.get("header", {})
    name = "Ekansh Jain"
    index = h.get("index", "PORTFOLIO — INDEX Nº 001")
    place = "INDIA"
    subtitle = h.get("subtitle", "Full Stack Engineer — building products people actually need")
    status = "status ▸ open to SWE internships · early-stage startup roles · product engineering · fintech"
    pillars = h.get("pillars", ["FULL-STACK SYSTEMS", "APPLIED AI & AGENTS", "FINTECH"])
    tag = h.get("tag", "B.TECH CS")

    pillars_str = "  ·  ".join(pillars)

    body = f"""  <!-- Top Header Rule -->
  <line class="draw {delay(1)}" x1="48" y1="58" x2="952" y2="58" stroke="{palette['rule']}" stroke-width="1"/>
  <g class="fade {delay(1)}">
    <text class="mono" fill="{palette['muted']}" x="48" y="44" font-size="11" letter-spacing="3.5">{xml_escape(index)}</text>
    <text class="mono" fill="{palette['muted']}" x="952" y="44" font-size="11" letter-spacing="3.5" text-anchor="end">{xml_escape(place)}</text>
  </g>

  <!-- Large Editorial Title with Rise Animation -->
  <g class="rise {delay(2)}">
    <text fill="{palette['bone']}" class="mono" x="46" y="174" font-size="84" font-weight="600" letter-spacing="-3">{xml_escape(name)}</text>
  </g>

  <!-- Subtitle -->
  <g class="fade {delay(3)}">
    <text fill="{palette['muted']}" class="mono" x="48" y="216" font-size="19" letter-spacing="0.2">{xml_escape(subtitle)}</text>
  </g>

  <!-- Status row and prompt with blinking block cursor -->
  <g class="fade {delay(4)}">
    <text fill="{palette['accent']}" class="mono" x="48" y="268" font-size="12.5" letter-spacing="0.5">{xml_escape(status)}</text>
  </g>
  <g class="fade {delay(5)}">
    <text fill="{palette['dim']}" class="mono" x="48" y="298" font-size="13">~/ekansh $</text>
    <rect class="cursor" x="146" y="284" width="9" height="17" fill="{palette['accent']}"/>
  </g>

  <!-- Bottom Divider Rule at y=342 & Pillars Row -->
  <line class="draw {delay(6)}" x1="48" y1="342" x2="952" y2="342" stroke="{palette['rule']}" stroke-width="1"/>
  <g class="fade {delay(7)}">
    <text fill="{palette['muted']}" class="mono" x="48" y="374" font-size="11.5" letter-spacing="3">{xml_escape(pillars_str)}</text>
    <text fill="{palette['muted']}" class="mono" x="952" y="374" font-size="11.5" letter-spacing="3" text-anchor="end">{xml_escape(tag)}</text>
  </g>"""
    return wrap(400, f"{name} — {subtitle}", body, palette)


def build_section_divider(num_str: str, name: str, palette: dict) -> str:
    """
    Builds a section divider panel s01..s07 (1000x92):
    - ghost number ("01") x=48 y=68 size 52
    - accent UPPERCASE label x=128 y=58 size 14 letter-spacing 6
    - right-aligned path "~/01-whoami" at x=952
    - drawing rule from the end of the label to x=830 at y=53.
    """
    label = name.upper()
    path_str = f"~/{num_str}-{name.lower()}"

    # In monospace font, char width ~ 8.4px, spacing 6px between chars
    label_width = (len(label) * 8.4) + ((len(label) - 1) * 6)
    line_x1 = int(128 + label_width + 36)

    body = f"""  <g class="fade {delay(1)}">
    <text class="mono" x="48" y="68" font-size="52" font-weight="700" fill="{palette['ghost']}">{xml_escape(num_str)}</text>
    <text class="mono tick" x="128" y="58" font-size="14" font-weight="600" fill="{palette['accent']}" letter-spacing="6">{xml_escape(label)}</text>
    <text class="mono" x="952" y="58" font-size="11" fill="{palette['muted']}" letter-spacing="2" text-anchor="end">{xml_escape(path_str)}</text>
  </g>
  <line class="draw {delay(2)}" x1="{line_x1}" y1="53" x2="830" y2="53" stroke="{palette['rule']}" stroke-width="1"/>"""
    return wrap(92, f"Section {num_str} — {label}", body, palette)


def build_whoami(data: dict, palette: dict) -> str:
    """
    Builds whoami panel with height computed from content.
    - L1 (bone, 16px): "B.Tech CS undergrad, building full-stack products people actually use — since I was 14."
    - L2 (bone, 16px): "stack: Next.js · TypeScript · React Native · Node.js · PostgreSQL · Supabase."
    - L3 (muted, 15px): "I think in systems: SQL schema design, row-level security, cross-platform Expo routing, server-side caching layers."
    - Faint rule
    - Labeled rows (label muted 11px letter-spacing 2.5 at x=48; value 15px at x=190):
        FOCUS        Full-Stack Systems · Health-Tech · Fintech · Algo Trading
        BUILDING     a stealth health-tech startup · PolyIntel prediction-market terminal
        STATUS       open to SWE internships · early-stage startup roles · product engineering   (accent)
        COMMUNITIES  Breeze · SNIoE Business Conclave · TEDxSNU · ACM · Finvest
    Each line rises in with a stagger. No age, no CGPA, no graduation date.
    """
    whoami = data.get("whoami", {})
    lines = whoami.get("lines", [
        "B.Tech CS undergrad, building full-stack products people actually use — since I was 14.",
        "stack: Next.js · TypeScript · React Native · Node.js · PostgreSQL · Supabase.",
        "I think in systems: SQL schema design, row-level security, cross-platform Expo routing, server-side caching layers."
    ])
    rows = whoami.get("rows", [
        ["FOCUS", "Full-Stack Systems · Health-Tech · Fintech · Algo Trading"],
        ["BUILDING", "a stealth health-tech startup · PolyIntel prediction-market terminal"],
        ["STATUS", "open to SWE internships · early-stage startup roles · product engineering"],
        ["COMMUNITIES", "Breeze · SNIoE Business Conclave · TEDxSNU · ACM · Finvest"]
    ])

    body_parts = []
    curr_y = 32
    step = 1

    # Lead summary lines, wrapped so nothing runs past x=952
    flat = []
    for idx, line in enumerate(lines):
        for piece in wrap_text(line, 92):
            flat.append((idx, piece))

    for idx, line in flat:
        if idx < 2:
            fill_col = palette["bone"]
            f_size = 16
        else:
            fill_col = palette["muted"]
            f_size = 15

        body_parts.append(
            f'  <text class="mono rise {delay(step)}" x="48" y="{curr_y}" font-size="{f_size}" fill="{fill_col}">{xml_escape(line)}</text>'
        )
        curr_y += 28
        step += 1

    # Faint rule
    curr_y += 2
    body_parts.append(
        f'  <line class="rise {delay(step)}" x1="48" y1="{curr_y}" x2="952" y2="{curr_y}" stroke="{palette["rule"]}" stroke-width="1" opacity="0.4"/>'
    )
    curr_y += 34
    step += 1

    # Labeled rows (x=48 for label, x=190 for value)
    for row in rows:
        label, text = row[0], row[1]
        text_fill = palette["accent"] if label.upper() == "STATUS" else palette["bone"]
        body_parts.append(
            f'  <text class="mono rise {delay(step)}" x="48" y="{curr_y}" font-size="11" fill="{palette["muted"]}" letter-spacing="2.5">{xml_escape(label)}</text>'
        )
        body_parts.append(
            f'  <text class="mono rise {delay(step)}" x="190" y="{curr_y}" font-size="15" fill="{text_fill}">{xml_escape(text)}</text>'
        )
        curr_y += 34
        step += 1

    total_height = curr_y - 10
    return wrap(total_height, "whoami — bio, focus, building, status, communities", "\n".join(body_parts), palette)


def build_projects(data: dict, palette: dict) -> str:
    """
    Builds projects panel: one 110px block per project.
    - Title "NN / NAME" (17px bold)
    - Two description lines (12px bone, each <=122 characters)
    - Tags line (11px muted)
    - Rule at y=104
    """
    projects = data.get("projects", [])
    body_parts = ['  <g class="mono">']

    curr_y = 20
    step = 1

    for idx, p in enumerate(projects):
        name = p.get("name", "")
        desc = p.get("desc", [])
        tags = p.get("tags", "")

        # Check line lengths (<= 122 characters)
        for line_idx, dline in enumerate(desc):
            if len(dline) > 122:
                print(
                    f"[WARNING] Project '{name}' desc line {line_idx + 1} exceeds 122 chars ({len(dline)} chars): '{dline}'",
                    file=sys.stderr,
                )

        # Translate on the outer group: the rise animation owns `transform` on the inner one,
        # so putting both on the same element would collapse every block onto y=0.
        body_parts.append(f'    <g transform="translate(0, {curr_y})">')
        body_parts.append(f'      <g class="rise {delay(step)}">')
        # Title "NN / NAME"
        body_parts.append(f'      <text x="48" y="24" font-size="17" font-weight="700" fill="{palette["bone"]}" letter-spacing="0.8">{xml_escape(name)}</text>')

        # Two description lines (12px bone)
        desc_line_1 = desc[0] if len(desc) > 0 else ""
        desc_line_2 = desc[1] if len(desc) > 1 else ""
        body_parts.append(f'      <text x="48" y="49" font-size="12" fill="{palette["bone"]}">{xml_escape(desc_line_1)}</text>')
        body_parts.append(f'      <text x="48" y="68" font-size="12" fill="{palette["bone"]}">{xml_escape(desc_line_2)}</text>')

        # Tags line (11px muted)
        body_parts.append(f'      <text x="48" y="87" font-size="11" fill="{palette["muted"]}" letter-spacing="0.4">{xml_escape(tags)}</text>')

        # Rule at y=104
        body_parts.append(f'      <line x1="48" y1="104" x2="952" y2="104" stroke="{palette["rule"]}" stroke-width="1"/>')
        body_parts.append('      </g>')
        body_parts.append('    </g>')

        curr_y += 110
        step += 1

    body_parts.append('  </g>')
    total_height = curr_y + 10
    return wrap(total_height, f"Ten projects by {data.get('name', 'Ekansh Jain')}", "\n".join(body_parts), palette)


# --- shared helpers for the data-driven panels --------------------------------------


def text_el(x, y, size, fill, value, ls=None, weight=None, anchor=None, cls=None, style=None, opacity=None):
    """One monospace text line with only the attributes it needs."""
    attrs = [f'x="{x}"', f'y="{y}"', f'font-size="{size}"', f'fill="{fill}"']
    if ls is not None:
        attrs.append(f'letter-spacing="{ls}"')
    if weight is not None:
        attrs.append(f'font-weight="{weight}"')
    if anchor:
        attrs.append(f'text-anchor="{anchor}"')
    if style:
        attrs.append(f'style="{style}"')
    if opacity is not None:
        attrs.append(f'opacity="{opacity}"')
    klass = "mono" if not cls else f"mono {cls}"
    return f'  <text class="{klass}" ' + " ".join(attrs) + f'>{xml_escape(value)}</text>'


def date_letterspacing(value: str, width: float = 140.0) -> float:
    """Keeps long date ranges inside the timeline's date column (x=48..196)."""
    chars = max(1, len(value))
    per_char = 6.6  # 11px monospace advance
    room = width - chars * per_char
    if chars <= 1:
        return 2.0
    return max(0.4, min(2.0, room / (chars - 1)))


def load_telemetry(data: dict) -> dict:
    """assets/telemetry.json wins; profile.json holds the starter values and fallback."""
    configured = data.get("telemetry", {}) or {}
    out = {
        "caption": configured.get("caption", "TELEMETRY — WHAT THE HANDS ARE DOING"),
        "languages": configured.get("languages") or DEFAULT_LANGUAGES,
        "series": configured.get("series") or [],
        "counters": configured.get("counters") or DEFAULT_COUNTERS,
    }
    if not TELEMETRY_JSON.exists():
        return out
    try:
        live = json.loads(TELEMETRY_JSON.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"[WARNING] assets/telemetry.json unreadable ({exc}); using profile.json", file=sys.stderr)
        return out
    if not isinstance(live, dict):
        return out
    if isinstance(live.get("languages"), list) and live["languages"]:
        out["languages"] = live["languages"]
    if isinstance(live.get("series"), list) and live["series"]:
        out["series"] = live["series"]
    if isinstance(live.get("counters"), list) and len(live["counters"]) >= 4:
        out["counters"] = live["counters"]
    return out


def series_values(series: list) -> list:
    """Accepts plain monthly numbers or the older {x,y} point objects."""
    values = []
    for item in series:
        raw = item.get("y") if isinstance(item, dict) else item
        try:
            values.append(float(raw))
        except (TypeError, ValueError):
            values.append(0.0)
    return values[-12:]


def build_telemetry(data: dict, palette: dict) -> str:
    """1000x330: languages (left), 12-month contributions (middle), counters (right)."""
    live = load_telemetry(data)
    caption = live["caption"]

    langs = []
    for row in live["languages"][:6]:
        try:
            langs.append((str(row[0]), float(row[1])))
        except (TypeError, ValueError, IndexError):
            continue
    counters = live["counters"][:4]
    values = series_values(live["series"])

    body = [
        f'  <line x1="48" y1="40" x2="952" y2="40" stroke="{palette["rule"]}"/>',
        text_el(48, 28, 11, palette["muted"], caption, ls=3.5),
        text_el(952, 28, 11, palette["muted"], "FIG. 02", ls=3.5, anchor="end"),
        f'  <line x1="360" y1="64" x2="360" y2="304" stroke="{palette["rule"]}" stroke-width="1" opacity="0.4"/>',
        f'  <line x1="688" y1="64" x2="688" y2="304" stroke="{palette["rule"]}" stroke-width="1" opacity="0.4"/>',
    ]

    # LEFT — language distribution by source bytes
    body.append(text_el(48, 78, 10, palette["dim"], "LANGUAGE DISTRIBUTION · BY SOURCE BYTES", ls=1.2))
    top_pct = max([pct for _, pct in langs], default=0.0) or 1.0
    for idx, (name, pct) in enumerate(langs):
        y = 112 + idx * 32
        width = max(3, int(round((pct / top_pct) * 200)))
        fill = palette["accent"] if idx == 0 else palette["bone"]
        body.append(text_el(48, y, 11, palette["bone"], name))
        body.append(
            f'  <rect class="bar {delay(idx + 1)}" style="transform-origin: 48px 0;" '
            f'x="48" y="{y + 8}" width="{width}" height="6" fill="{fill}"/>'
        )
        body.append(text_el(340, y + 14, 10, palette["muted"], f"{int(round(pct))}%", anchor="end"))

    # MIDDLE — contributions, last 12 months
    body.append(text_el(392, 78, 10, palette["dim"], "CONTRIBUTIONS · LAST 12 MONTHS", ls=2.4))
    x0, x1 = 392.0, 656.0
    top_y, base_y = 112.0, 248.0
    body.append(f'  <line x1="392" y1="252" x2="656" y2="252" stroke="{palette["rule"]}"/>')

    if values:
        peak = max(values) or 1.0
        span = max(1, len(values) - 1)
        points = []
        for i, value in enumerate(values):
            px = x0 + (x1 - x0) * (i / span)
            py = base_y - (value / peak) * (base_y - top_y)
            points.append((px, py))
        polyline = " ".join(f"{px:.1f},{py:.1f}" for px, py in points)
        body.append(
            f'  <polyline class="spark" points="{polyline}" stroke="{palette["accent"]}" stroke-width="1.8" fill="none"/>'
        )
        last_x, last_y = points[-1]
        body.append(
            f'  <circle class="ring" style="transform-origin: {last_x:.1f}px {last_y:.1f}px;" '
            f'cx="{last_x:.1f}" cy="{last_y:.1f}" r="4" stroke="{palette["accent"]}" fill="none"/>'
        )
        body.append(f'  <circle cx="{last_x:.1f}" cy="{last_y:.1f}" r="2.8" fill="{palette["accent"]}"/>')
        total = int(round(sum(values)))
        peak_int = int(round(peak))
        body.append(text_el(392, 288, 10.5, palette["muted"], f"peak {peak_int} / month · total {total}", ls=0.5))
        body.append(text_el(656, 288, 10, palette["dim"], f"{len(values)} mo", anchor="end", ls=1.5))
    else:
        body.append(
            f'  <line x1="392" y1="200" x2="656" y2="200" stroke="{palette["muted"]}" '
            f'stroke-width="1" stroke-dasharray="1 7" stroke-linecap="round" opacity="0.7"/>'
        )
        body.append(text_el(392, 184, 10.5, palette["muted"], "awaiting first live run", ls=0.6))
        body.append(text_el(392, 288, 10.5, palette["dim"], "series empty · run telemetry", ls=0.5))

    # RIGHT — counters
    cnt_y = 120
    for idx, counter in enumerate(counters):
        num, label = str(counter[0]), str(counter[1])
        fill = palette["accent"] if num == "∞" else palette["bone"]
        body.append(text_el(720, cnt_y, 44, fill, num, weight=700))
        # The label sits beside the numeral: a 44px line box leaves no room above or below
        # without eating into the neighbouring counter.
        body.append(text_el(800, cnt_y - 6, 10, palette["muted"], label, ls=1.6))
        cnt_y += 58

    aria = "Telemetry — languages by source bytes, contributions over the last 12 months, counters"
    return wrap(330, aria, "\n".join(body), palette)


def build_experience(data: dict, palette: dict) -> str:
    """Timeline: date column, rule with one dot per entry, title and a single description line."""
    entries = data.get("experience", [])
    pitch = 74
    top = 42
    last_y = top + pitch * max(0, len(entries) - 1)
    height = last_y + 46

    body = [
        f'  <line x1="196" y1="24" x2="196" y2="{last_y + 14}" stroke="{palette["rule"]}" stroke-width="1" opacity="0.35"/>'
    ]

    for idx, entry in enumerate(entries):
        y = top + idx * pitch
        when = str(entry.get("when", ""))
        title = str(entry.get("title", ""))
        text = str(entry.get("text", ""))

        dot_fill = palette["accent"] if idx == 0 else palette["dim"]
        dot_r = 3.6 if idx == 0 else 2.6
        body.append(f'  <circle cx="196" cy="{y - 4}" r="{dot_r}" fill="{dot_fill}"/>')
        body.append(text_el(48, y, 11, palette["muted"], when, ls=date_letterspacing(when)))
        body.append(text_el(222, y, 15, palette["bone"], title, weight=600))
        if text:
            body.append(text_el(222, y + 20, 12, palette["muted"], text))

    aria = "Experience — " + ", ".join(str(e.get("title", "")) for e in entries[:3])
    return wrap(height, aria, "\n".join(body), palette)


def build_stack(data: dict, palette: dict) -> str:
    """Label column, thin rule, value column. Text only, 32px pitch, staggered rise."""
    rows = data.get("stack", [])
    top = 34
    pitch = 32
    last_y = top + pitch * max(0, len(rows) - 1)
    height = last_y + 30

    body = [
        f'  <line x1="138" y1="8" x2="138" y2="{last_y + 10}" stroke="{palette["rule"]}" stroke-width="1" opacity="0.4"/>'
    ]
    for idx, row in enumerate(rows):
        label = str(row[0])
        value = str(row[1])
        y = top + idx * pitch
        body.append(text_el(48, y, 12, palette["muted"], label, ls=2, cls=f"rise {delay(idx + 1)}"))
        body.append(text_el(154, y, 15, palette["bone"], value, cls=f"rise {delay(idx + 1)}"))

    aria = "Tech arsenal — " + ", ".join(str(r[0]) for r in rows)
    return wrap(height, aria, "\n".join(body), palette)


def build_focus(data: dict, palette: dict) -> str:
    """Current focus as a thin-bordered terminal window with NOW.YML in the title bar."""
    focus = data.get("focus", {}) or {}
    title = str(focus.get("title", "NOW.YML"))
    prompt = str(focus.get("prompt", "ekansh@focus:~$ cat now.yml"))
    groups = [
        ("LEARNING", focus.get("learning", [])),
        ("BUILDING", focus.get("building", [])),
        ("EXPLORING", focus.get("exploring", [])),
    ]

    body = []
    step = 0

    def anim(y):
        nonlocal step
        style = f"animation-delay: {round(step * 0.09, 2)}s"
        step += 1
        return style

    # window: measured backwards from the content height below
    prompt_y = 66
    y = prompt_y + 30
    layout = []
    for key, items in groups:
        layout.append((y, key, None))
        y += 24
        for item in items:
            layout.append((y, key, str(item)))
            y += 24
        y += 10
    end_y = y + 6
    height = end_y + 34

    body.append(
        f'  <rect x="0.75" y="0.75" width="998.5" height="{height - 1.5}" rx="3" '
        f'stroke="{palette["rule"]}" stroke-width="1.5" fill="none"/>'
    )
    body.append(f'  <line x1="1" y1="38" x2="999" y2="38" stroke="{palette["rule"]}" stroke-width="1"/>')
    for i, cx in enumerate((22, 36, 50)):
        body.append(f'  <circle cx="{cx}" cy="19" r="3.4" fill="{palette["dim"]}" opacity="{0.9 - i * 0.18}"/>')
    body.append(text_el(978, 23, 10, palette["muted"], title, ls=2, anchor="end"))

    body.append(
        text_el(24, prompt_y, 13, palette["accent"], prompt, cls="fade", style=anim(prompt_y))
    )

    for line_y, key, item in layout:
        if item is None:
            body.append(text_el(24, line_y, 11, palette["muted"], key, ls=2.4, cls="rise", style=anim(line_y)))
        else:
            body.append(
                text_el(28, line_y, 13, palette["accent"], "▸", opacity=0.75, cls="rise", style=anim(line_y))
            )
            body.append(text_el(44, line_y, 13, palette["bone"], item, cls="rise", style=anim(line_y)))

    body.append(text_el(24, end_y, 13, palette["dim"], "~$", cls="fade", style=anim(end_y)))
    body.append(
        f'  <rect class="cursor" x="48" y="{end_y - 13}" width="8" height="16" fill="{palette["accent"]}"/>'
    )

    aria = "Current focus — learning, building, exploring"
    return wrap(height, aria, "\n".join(body), palette)


def build_footer(data: dict, palette: dict) -> str:
    """Footer status strip with a pulsing indicator."""
    footer = data.get("footer", {})
    status = footer.get("status", "STATUS — BUILDING")
    line = footer.get("line", "shipping first, polishing second, sleeping eventually")
    right = footer.get("right", "iamekansh.netlify.app  ·  India  ·  © 2026")

    body = f"""  <line class="draw {delay(1)}" x1="48" y1="24" x2="952" y2="24" stroke="{palette['rule']}" stroke-width="1"/>
  <!-- Status Ring & Dot -->
  <circle class="ring" cx="60" cy="64" r="5" stroke="{palette['accent']}" stroke-width="1" fill="none" style="transform-origin: 60px 64px;"/>
  <circle class="dot" cx="60" cy="64" r="4" fill="{palette['accent']}"/>

  <!-- Status Text -->
  <text class="mono" x="84" y="62" font-size="12" font-weight="600" letter-spacing="3" fill="{palette['bone']}">{xml_escape(status)}</text>
  <text class="mono" x="84" y="82" font-size="11" letter-spacing="1.5" fill="{palette['muted']}">{xml_escape(line)}</text>
  <text class="mono" x="952" y="66" font-size="14" letter-spacing="1" text-anchor="end" fill="{palette['muted']}">{xml_escape(right)}</text>"""
    return wrap(110, f"{status} — {line}", body, palette)


def build_all(profile_path: Path, output_dir: Path) -> None:
    """Renders all light and dark SVGs idempotently."""
    with open(profile_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    light_dir = output_dir
    dark_dir = output_dir / "dark"
    light_dir.mkdir(parents=True, exist_ok=True)
    dark_dir.mkdir(parents=True, exist_ok=True)

    # Panel definitions: (filename, generator_func)
    panels = [
        ("header.svg", lambda p: build_header(data, p)),
        ("s01.svg", lambda p: build_section_divider("01", "whoami", p)),
        ("whoami.svg", lambda p: build_whoami(data, p)),
        ("s02.svg", lambda p: build_section_divider("02", "projects", p)),
        ("projects.svg", lambda p: build_projects(data, p)),
        ("s03.svg", lambda p: build_section_divider("03", "arena", p)),
        ("s04.svg", lambda p: build_section_divider("04", "telemetry", p)),
        ("telemetry.svg", lambda p: build_telemetry(data, p)),
        ("s05.svg", lambda p: build_section_divider("05", "route", p)),
        ("experience.svg", lambda p: build_experience(data, p)),
        ("s06.svg", lambda p: build_section_divider("06", "stack", p)),
        ("stack.svg", lambda p: build_stack(data, p)),
        ("s07.svg", lambda p: build_section_divider("07", "focus", p)),
        ("focus.svg", lambda p: build_focus(data, p)),
        ("footer.svg", lambda p: build_footer(data, p)),
    ]

    print(f"[build_assets] Reading {profile_path}...")
    for filename, fn in panels:
        # Generate light
        light_svg = fn(PALETTE_LIGHT)
        light_path = light_dir / filename
        light_path.write_text(light_svg, encoding="utf-8")

        # Generate dark
        dark_svg = fn(PALETTE_DARK)
        dark_path = dark_dir / filename
        dark_path.write_text(dark_svg, encoding="utf-8")

        print(f"  ✓ {filename} (light & dark)")

    print(f"[build_assets] Completed successfully: {len(panels)} panels rendered.")


if __name__ == "__main__":
    build_all(BASE_DIR / "profile.json", BASE_DIR / "assets")
