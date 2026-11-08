#!/usr/bin/env python3
"""
tools/build_assets.py
Pure Python script to generate minimalist, editorial monochrome SVG panels
for user Anonymous-Ekansh (Ekansh Jain).
Reads profile.json (single source of truth) and writes every SVG twice:
  - assets/X.svg (light palette)
  - assets/dark/X.svg (dark palette)

Strictly idempotent. No external dependencies.
"""

import json
import os
import sys
from html import escape as html_escape
from pathlib import Path

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


def xml_escape(text: str) -> str:
    """Escapes text for safe embedding in XML/SVG."""
    if not isinstance(text, str):
        text = str(text)
    return (
        html_escape(text, quote=True)
        .replace("'", "&#39;")
    )


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
    subtitle = "Full-stack engineer — products people actually need."
    status = "status ▸ open to SWE internships · early-stage startup roles · product engineering · fintech"
    pillars = h.get("pillars", ["FULL-STACK SYSTEMS", "APPLIED AI & AGENTS", "QUANT & FINTECH"])
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

    # Lead summary lines
    for idx, line in enumerate(lines):
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
    """Builds projects panel and validates line lengths (warning on >122 chars)."""
    projects = data.get("projects", [])
    body_parts = ['  <g class="mono">']

    curr_y = 28
    step = 1

    for idx, p in enumerate(projects):
        name = p.get("name", "")
        desc = p.get("desc", [])
        tags = p.get("tags", "")
        repo = p.get("repo", "")

        # Check line lengths
        for line_idx, dline in enumerate(desc):
            if len(dline) > 122:
                print(
                    f"[WARNING] Project '{name}' desc line {line_idx + 1} exceeds 122 chars ({len(dline)} chars): '{dline}'",
                    file=sys.stderr,
                )

        body_parts.append(f'    <g class="rise {delay(step)}" transform="translate(0, {curr_y})">')
        # Title and repo
        body_parts.append(f'      <text x="48" y="24" font-size="17" font-weight="700" fill="{palette["bone"]}" letter-spacing="0.8">{xml_escape(name)}</text>')
        if repo:
            body_parts.append(f'      <text x="952" y="24" font-size="12" fill="{palette["dim"]}" letter-spacing="1" text-anchor="end">github.com/{xml_escape(repo)}</text>')

        # Desc lines
        line_offset = 48
        for dline in desc[:2]:
            body_parts.append(f'      <text x="48" y="{line_offset}" font-size="13" fill="{palette["muted"]}">{xml_escape(dline)}</text>')
            line_offset += 20

        # Tags
        body_parts.append(f'      <text x="48" y="{line_offset + 2}" font-size="11" fill="{palette["dim"]}" letter-spacing="1">{xml_escape(tags)}</text>')

        # Rule between projects
        body_parts.append(f'      <line x1="48" y1="{line_offset + 18}" x2="952" y2="{line_offset + 18}" stroke="{palette["rule"]}" stroke-width="1" opacity="0.6"/>')
        body_parts.append('    </g>')

        curr_y += 122
        step += 1

    body_parts.append('  </g>')
    total_height = curr_y + 16
    return wrap(total_height, f"Projects by {data.get('name', 'Anonymous-Ekansh')}", "\n".join(body_parts), palette)


def build_telemetry(data: dict, palette: dict) -> str:
    """Builds telemetry panel with animated language bars, shipping velocity, and counters."""
    telem = data.get("telemetry", {})
    caption = telem.get("caption", "TELEMETRY — WHAT THE REPOSITORIES ARE DOING")
    languages = telem.get("languages", [])
    series_label = telem.get("series_label", "SHIPPING VELOCITY · 2024 → 2026")
    series = telem.get("series", [])
    counters = telem.get("counters", [])

    body_parts = []

    # Header line
    body_parts.append(f'  <line x1="48" y1="40" x2="952" y2="40" stroke="{palette["rule"]}"/>')
    body_parts.append(f'  <text fill="{palette["muted"]}" class="mono" x="48" y="28" font-size="11" letter-spacing="3.5">{xml_escape(caption)}</text>')
    body_parts.append(f'  <text fill="{palette["muted"]}" class="mono" x="952" y="28" font-size="11" letter-spacing="3.5" text-anchor="end">FIG. 02</text>')

    # Vertical separators
    body_parts.append(f'  <line x1="360" y1="64" x2="360" y2="304" stroke="{palette["rule"]}" stroke-width="1" opacity="0.4"/>')
    body_parts.append(f'  <line x1="688" y1="64" x2="688" y2="304" stroke="{palette["rule"]}" stroke-width="1" opacity="0.4"/>')

    # Column 1: Language distribution
    body_parts.append(f'  <text fill="{palette["dim"]}" class="mono" x="48" y="78" font-size="10" letter-spacing="2.5">LANGUAGE DISTRIBUTION · EST.</text>')
    body_parts.append('  <g class="mono" font-size="11">')
    lang_y = 108
    for idx, lang_item in enumerate(languages[:6]):
        lname = lang_item[0]
        lpct = lang_item[1]
        bar_w = int((lpct / 100.0) * 600)  # max width ~220
        fill_color = palette["accent"] if idx == 0 else palette["bone"]
        step = idx + 1
        body_parts.append(f'    <text fill="{palette["bone"]}" x="48" y="{lang_y}">{xml_escape(lname)}</text>')
        body_parts.append(f'    <rect class="bar {delay(step)}" style="transform-origin: 48px 0;" x="48" y="{lang_y + 8}" width="{bar_w}" height="6" fill="{fill_color}"/>')
        body_parts.append(f'    <text fill="{palette["muted"]}" x="{48 + bar_w + 10}" y="{lang_y + 15}" font-size="10">{lpct}%</text>')
        lang_y += 36
    body_parts.append('  </g>')

    # Column 2: Shipping velocity sparkline
    body_parts.append(f'  <text fill="{palette["dim"]}" class="mono" x="392" y="78" font-size="10" letter-spacing="2.5">{xml_escape(series_label)}</text>')
    body_parts.append(f'  <line x1="392" y1="252" x2="656" y2="252" stroke="{palette["rule"]}"/>')

    # Points string
    points_str = " ".join([f"{pt['x']},{pt['y']}" for pt in series])
    if points_str:
        body_parts.append(f'  <polyline class="spark" points="{points_str}" stroke="{palette["accent"]}" stroke-width="1.8" fill="none"/>')

    # Sparkline circles & labels
    latest_pt = series[-2] if len(series) >= 2 else series[-1]
    for idx, pt in enumerate(series):
        is_highlight = (pt == latest_pt)
        circle_fill = palette["accent"] if is_highlight else palette["bone"]
        body_parts.append(f'  <circle class="fade {delay(idx + 6)}" cx="{pt["x"]}" cy="{pt["y"]}" r="2.8" fill="{circle_fill}"/>')
        if pt.get("label"):
            body_parts.append(f'  <text fill="{palette["dim"]}" class="mono" x="{pt["x"] - 6}" y="272" font-size="9.5" letter-spacing="1.5">{xml_escape(pt["label"])}</text>')

    # Pulsing dot & ping on current marker
    if latest_pt:
        body_parts.append(f'  <circle class="ring" style="transform-origin: {latest_pt["x"]}px {latest_pt["y"]}px;" cx="{latest_pt["x"]}" cy="{latest_pt["y"]}" r="4" stroke="{palette["accent"]}" fill="none"/>')

    body_parts.append(f'  <text fill="{palette["muted"]}" class="mono fade {delay(14)}" x="392" y="300" font-size="10" letter-spacing="1.5">trend — <tspan fill="{palette["accent"]}">accelerating</tspan></text>')

    # Column 3: Counters
    body_parts.append('  <g>')
    cnt_y = 118
    for idx, c in enumerate(counters[:4]):
        num, clabel = c[0], c[1]
        cfill = palette["accent"] if num == "∞" else palette["bone"]
        body_parts.append(f'    <g class="rise {delay(idx + 4)}">')
        body_parts.append(f'      <text fill="{cfill}" class="mono" x="720" y="{cnt_y}" font-size="44" font-weight="700">{xml_escape(num)}</text>')
        body_parts.append(f'      <text fill="{palette["muted"]}" class="mono" x="792" y="{cnt_y - 6}" font-size="10" letter-spacing="2">{xml_escape(clabel)}</text>')
        body_parts.append('    </g>')
        cnt_y += 60
    body_parts.append('  </g>')

    return wrap(336, caption, "\n".join(body_parts), palette)


def build_experience(data: dict, palette: dict) -> str:
    """Builds experience timeline panel."""
    exp = data.get("experience", [])
    body_parts = [
        f'  <line x1="140" y1="12" x2="140" y2="{len(exp) * 88 + 30}" stroke="{palette["rule"]}" stroke-width="1" opacity="0.4"/>'
    ]

    curr_y = 42
    step = 1
    for item in exp:
        when = item.get("when", "")
        title = item.get("title", "")
        text = item.get("text", "")

        body_parts.append(f'  <g class="rise {delay(step)}">')
        body_parts.append(f'    <text class="mono" x="48" y="{curr_y}" font-size="11.5" font-weight="600" fill="{palette["accent"]}" letter-spacing="1.5">{xml_escape(when)}</text>')
        body_parts.append(f'    <text class="mono" x="156" y="{curr_y}" font-size="15" font-weight="600" fill="{palette["bone"]}">{xml_escape(title)}</text>')
        body_parts.append(f'    <text class="mono" x="156" y="{curr_y + 24}" font-size="13.5" fill="{palette["muted"]}">{xml_escape(text)}</text>')
        body_parts.append('  </g>')

        curr_y += 86
        step += 1

    total_height = curr_y + 16
    return wrap(total_height, "Experience — Technical Leadership, Academics, Chapters", "\n".join(body_parts), palette)


def build_stack(data: dict, palette: dict) -> str:
    """Builds technical stack panel."""
    stack = data.get("stack", [])
    body_parts = [
        f'  <line x1="154" y1="10" x2="154" y2="{len(stack) * 36 + 20}" stroke="{palette["rule"]}" stroke-width="1" opacity="0.4"/>'
    ]

    curr_y = 34
    step = 1
    for item in stack:
        label = item[0]
        text = item[1]
        body_parts.append(f'  <text class="mono rise {delay(step)}" x="48" y="{curr_y}" font-size="11.5" fill="{palette["muted"]}" letter-spacing="2">{xml_escape(label)}</text>')
        body_parts.append(f'  <text class="mono rise {delay(step)}" x="170" y="{curr_y}" font-size="14.5" fill="{palette["bone"]}">{xml_escape(text)}</text>')
        curr_y += 36
        step += 1

    total_height = curr_y + 14
    return wrap(total_height, "Technical Stack — Languages, Full Stack, Data, Systems, Tooling", "\n".join(body_parts), palette)


def build_focus(data: dict, palette: dict) -> str:
    """Builds current focus panel with terminal-style YAML look."""
    focus = data.get("focus", {})
    learning = focus.get("learning", [])
    building = focus.get("building", [])
    exploring = focus.get("exploring", [])

    body_parts = []
    curr_y = 36
    step = 1

    # Terminal prompt header
    body_parts.append(f'  <g class="fade {delay(step)}">')
    body_parts.append(f'    <text class="mono" x="48" y="{curr_y}" font-size="13" fill="{palette["dim"]}">anonymous@ekansh:~$ <tspan fill="{palette["bone"]}">cat focus.yaml</tspan></text>')
    body_parts.append('  </g>')
    curr_y += 30
    step += 1

    categories = [
        ("learning", learning),
        ("building", building),
        ("exploring", exploring),
    ]

    for cat_name, cat_items in categories:
        body_parts.append(f'  <text class="mono rise {delay(step)}" x="48" y="{curr_y}" font-size="13" font-weight="600" fill="{palette["accent"]}">{xml_escape(cat_name)}:</text>')
        curr_y += 24
        step += 1
        for it in cat_items:
            body_parts.append(f'  <text class="mono rise {delay(step)}" x="72" y="{curr_y}" font-size="13" fill="{palette["muted"]}">- {xml_escape(it)}</text>')
            curr_y += 24
            step += 1
        curr_y += 6

    total_height = curr_y + 10
    return wrap(total_height, "Current Focus — learning, building, exploring", "\n".join(body_parts), palette)


def build_footer(data: dict, palette: dict) -> str:
    """Builds footer status panel with pulsing indicator."""
    footer = data.get("footer", {})
    status = footer.get("status", "STATUS — SHIPPING")
    line = footer.get("line", "compiling ideas into high-throughput systems, usually after midnight")
    right = footer.get("right", "iamekansh.netlify.app  ·  Delhi NCR, IN  ·  © 2026")

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
    base_dir = Path(__file__).resolve().parent.parent
    prof_path = base_dir / "profile.json"
    assets_dir = base_dir / "assets"
    build_all(prof_path, assets_dir)
