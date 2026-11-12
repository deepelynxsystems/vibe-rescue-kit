#!/usr/bin/env python3
"""Render the README diagrams in docs/assets. Brand colors match deepelynx.com."""

from pathlib import Path
import html

OUT = Path(__file__).resolve().parents[1] / "docs" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

BG = "#0f1216"
BG2 = "#13171c"
SURFACE = "#191e25"
LINE = "#2b323c"
FG = "#eef1f5"
MUTED = "#9aa4b1"
CORAL = "#ff6b3d"
MINT = "#3ddc9a"
FONT = "ui-sans-serif, system-ui, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def eyes(x: int, y: int, h: int = 28) -> str:
    w = max(8, round(h * 0.36))
    gap = max(6, round(h * 0.28))
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{w // 2}" fill="{CORAL}"/>'
        f'<rect x="{x + w + gap}" y="{y}" width="{w}" height="{h}" rx="{w // 2}" fill="{CORAL}"/>'
    )


def hero() -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 560" role="img" aria-labelledby="title desc">
  <title id="title">vibe-rescue-kit by deepelynx</title>
  <desc id="desc">Automatic, verified fixes for the failures AI vibe-coding tools leave behind.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0c0f13"/>
      <stop offset="0.55" stop-color="{BG}"/>
      <stop offset="1" stop-color="#1a140f"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.86" cy="0.08" r="0.7">
      <stop offset="0" stop-color="{CORAL}" stop-opacity="0.38"/>
      <stop offset="1" stop-color="{CORAL}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0H0V32" fill="none" stroke="#ffffff" stroke-opacity="0.035"/>
    </pattern>
  </defs>
  <rect width="1280" height="560" fill="url(#bg)"/>
  <rect width="1280" height="560" fill="url(#glow)"/>
  <rect width="1280" height="560" fill="url(#grid)"/>
  {eyes(72, 58, 34)}
  <text x="148" y="84" fill="{FG}" font-family="{FONT}" font-size="28" font-weight="650">deepelynx</text>
  <text x="292" y="84" fill="{MUTED}" font-family="{FONT}" font-size="22">/ vibe-rescue-kit</text>
  <text x="72" y="210" fill="{FG}" font-family="{FONT}" font-size="76" font-weight="720">Rescue the vibe.</text>
  <text x="72" y="268" fill="{MUTED}" font-family="{FONT}" font-size="26">Detect the failure. Apply the fix. Keep it only if verification passes.</text>
  <g font-family="{FONT}" font-size="16" font-weight="650">
    <rect x="72" y="312" width="168" height="40" rx="20" fill="{SURFACE}" stroke="{LINE}"/>
    <text x="96" y="338" fill="{CORAL}">01  detect</text>
    <rect x="252" y="312" width="140" height="40" rx="20" fill="{SURFACE}" stroke="{LINE}"/>
    <text x="276" y="338" fill="{FG}">02  fix</text>
    <rect x="404" y="312" width="168" height="40" rx="20" fill="{SURFACE}" stroke="{LINE}"/>
    <text x="428" y="338" fill="{MINT}">03  verify</text>
    <rect x="584" y="312" width="196" height="40" rx="20" fill="{SURFACE}" stroke="{LINE}"/>
    <text x="608" y="338" fill="{FG}">04  keep or roll back</text>
  </g>
  <text x="72" y="500" fill="{MUTED}" font-family="{MONO}" font-size="16">vibe-rescue scan   ·   vibe-rescue fix --yes</text>
  <text x="72" y="528" fill="{CORAL}" font-family="{FONT}" font-size="15" font-weight="650">built by deepelynx  ·  deepelynx.com</text>
  <g>
    <rect x="860" y="150" width="360" height="280" rx="18" fill="{SURFACE}" stroke="{LINE}"/>
    <rect x="860" y="150" width="360" height="42" rx="18" fill="#20262e"/>
    <rect x="860" y="176" width="360" height="16" fill="#20262e"/>
    <circle cx="886" cy="171" r="5" fill="#ff6b3d"/>
    <circle cx="904" cy="171" r="5" fill="#e2b340"/>
    <circle cx="922" cy="171" r="5" fill="#3ddc9a"/>
    <text x="884" y="230" fill="{MUTED}" font-family="{MONO}" font-size="13">vibe-rescue fix</text>
    <text x="884" y="262" fill="{MINT}" font-family="{MONO}" font-size="14">leaked-secrets  fixed</text>
    <text x="884" y="288" fill="{MINT}" font-family="{MONO}" font-size="14">supabase-rls  fixed</text>
    <text x="884" y="314" fill="{MINT}" font-family="{MONO}" font-size="14">spa-rewrites  fixed</text>
    <text x="884" y="348" fill="{FG}" font-family="{MONO}" font-size="13">7 rules changed files</text>
    <text x="884" y="372" fill="{FG}" font-family="{MONO}" font-size="13">0 rolled back</text>
    <text x="884" y="404" fill="{MUTED}" font-family="{MONO}" font-size="12">vibe-rescue-kit by deepelynx</text>
  </g>
</svg>
'''


def flow() -> str:
    boxes = [
        (40, "Detect", "A rule reads the project\nand reports findings.", CORAL),
        (300, "Fix", "The rule edits files.\nOriginals are snapshotted.", FG),
        (560, "Verify", "The same rule runs again.\nThe finding must be gone.", MINT),
        (820, "Keep", "Changes stay.\nA backup is saved.", MINT),
    ]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 420" role="img" aria-labelledby="ftitle">',
        f'<title id="ftitle">detect, fix, verify, keep or roll back</title>',
        f'<rect width="1100" height="420" rx="24" fill="{BG}"/>',
        f'<text x="40" y="48" fill="{FG}" font-family="{FONT}" font-size="22" font-weight="700">How a fix is allowed to land</text>',
    ]
    for x, title, body, color in boxes:
        parts.append(f'<rect x="{x}" y="80" width="220" height="150" rx="16" fill="{SURFACE}" stroke="{LINE}"/>')
        parts.append(f'<text x="{x + 20}" y="118" fill="{color}" font-family="{FONT}" font-size="22" font-weight="720">{title}</text>')
        y = 152
        for line in body.split("\n"):
            parts.append(f'<text x="{x + 20}" y="{y}" fill="{MUTED}" font-family="{FONT}" font-size="14">{esc(line)}</text>')
            y += 22
    for x in (260, 520, 780):
        parts.append(f'<path d="M{x} 155 H{x + 36}" stroke="{CORAL}" stroke-width="2" fill="none"/>')
        parts.append(f'<path d="M{x + 30} 149 l8 6 l-8 6" fill="{CORAL}"/>')
    parts.append(f'<rect x="300" y="270" width="480" height="110" rx="16" fill="#241612" stroke="{CORAL}"/>')
    parts.append(f'<text x="324" y="310" fill="{CORAL}" font-family="{FONT}" font-size="20" font-weight="720">Rollback</text>')
    parts.append(f'<text x="324" y="340" fill="{FG}" font-family="{FONT}" font-size="15">If verification fails, every file that rule touched is restored from the snapshot.</text>')
    parts.append(f'<text x="324" y="362" fill="{MUTED}" font-family="{FONT}" font-size="14">The report says what failed. The rest of the project is left as it was.</text>')
    parts.append(f'<path d="M670 230 V270" stroke="{CORAL}" stroke-width="2" fill="none"/>')
    parts.append(f'<path d="M664 262 l6 8 l6 -8" fill="{CORAL}"/>')
    parts.append("</svg>")
    return "\n".join(parts)


def card(slug: str, title: str, before: list[str], after: list[str]) -> str:
    def lines(items: list[str], x: int, color: str) -> str:
        out = []
        y = 148
        for line in items:
            out.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="{MONO}" font-size="15">{esc(line)}</text>')
            y += 26
        return "\n".join(out)

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 300" role="img" aria-labelledby="t-{slug}">
  <title id="t-{slug}">{esc(title)} before and after</title>
  <rect width="1080" height="300" rx="20" fill="{BG}"/>
  <text x="28" y="42" fill="{CORAL}" font-family="{MONO}" font-size="13">{esc(slug)}</text>
  <text x="28" y="70" fill="{FG}" font-family="{FONT}" font-size="22" font-weight="700">{esc(title)}</text>
  <rect x="28" y="92" width="500" height="180" rx="14" fill="{SURFACE}" stroke="#5a2c22"/>
  <rect x="552" y="92" width="500" height="180" rx="14" fill="{SURFACE}" stroke="#1d5c45"/>
  <text x="48" y="116" fill="{CORAL}" font-family="{FONT}" font-size="12" font-weight="700">BEFORE</text>
  <text x="572" y="116" fill="{MINT}" font-family="{FONT}" font-size="12" font-weight="700">AFTER</text>
  {lines(before, 48, "#f3c4b5")}
  {lines(after, 572, "#d7f8ea")}
</svg>
'''


CARDS = {
    "leaked-secrets": (
        "Leaked secrets leave the client bundle",
        ['const key = "sk_test_…"', "import.meta.env.VITE_SERVICE_ROLE", ".env            # not gitignored"],
        ['serverOnlyEnv("STRIPE_SECRET_KEY")', "# value moved into gitignored .env", ".env.example     # empty, rotate it"],
    ),
    "supabase-rls": (
        "RLS is a migration, not a live query",
        ["create table public.notes (…);", "-- no enable row level security", "-- no policy"],
        ["alter table public.notes", "  enable row level security;", 'policy vibe_rescue_deny_all  using (false)'],
    ),
    "missing-env": (
        "Referenced env vars get a startup check",
        ["process.env.API_TOKEN", "# absent from .env.example", "# absent from .env"],
        ["API_TOKEN=          # .env.example", "node .vibe-rescue/check-env.mjs", "Missing environment variables"],
    ),
    "spa-rewrites": (
        "Deep links survive a refresh",
        ["GET /notes/42", "host has no rewrite", "404  index.html never loads"],
        ['vercel.json   /(.*) -> /index.html', 'netlify.toml  /*  200', "public/_redirects  /* /index.html 200"],
    ),
    "hardcoded-localhost": (
        "Client URLs come from the environment",
        ['fetch("http://localhost:3000/api")', 'const supa = "http://localhost:54321"'],
        ["fetch(`${import.meta.env.VITE_API_BASE_URL}/api`)", "import.meta.env.VITE_SUPABASE_URL", "VITE_API_BASE_URL=http://localhost:3000"],
    ),
    "import-paths": (
        "Imports match disk and package.json",
        ['from "./components/button"', 'from "date-fns"   # not a dependency'],
        ['from "./components/Button"', '"date-fns": "*"   # then npm install'],
    ),
    "webhook-signature": (
        "Stripe webhooks check the signature",
        ["const body = await req.json();", "if (body.type === \"checkout.session…\")", "# signature never read"],
        ["stripe.webhooks.constructEvent(…)", "STRIPE_WEBHOOK_SECRET", "invalid signature -> 400"],
    ),
}


def main() -> None:
    (OUT / "hero.svg").write_text(hero())
    (OUT / "flow.svg").write_text(flow())
    folder = OUT / "before-after"
    folder.mkdir(exist_ok=True)
    for slug, (title, before, after) in CARDS.items():
        raw = card(slug, title, before, after)
        # The first text y was rewritten only on the first occurrence of each column
        # because replace() hits every y="118" inside that column string. Good.
        (folder / f"{slug}.svg").write_text(raw)
    print(f"wrote assets in {OUT}")


if __name__ == "__main__":
    main()
