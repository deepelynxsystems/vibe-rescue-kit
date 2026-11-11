#!/usr/bin/env python3
"""Record real CLI sessions and render GIFs plus MP4s."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
ASCIINEMA = Path.home() / ".local" / "bin" / "asciinema"
AGG = Path.home() / ".local" / "bin" / "agg"
ENV = os.environ.copy()
ENV["PATH"] = f"{Path.home() / '.local' / 'bin'}:{ENV.get('PATH', '')}"
ENV["TERM"] = "xterm-256color"
ENV.pop("NO_COLOR", None)
ENV["FORCE_COLOR"] = "1"


def run(cmd: list[str], **kwargs) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, env=ENV, **kwargs)


def record(command: str, cast: Path, cols: int = 120, rows: int = 36) -> None:
    run(
        [
            str(ASCIINEMA),
            "rec",
            "--overwrite",
            "--quiet",
            "--cols",
            str(cols),
            "--rows",
            str(rows),
            "-c",
            command,
            str(cast),
        ]
    )


def pace(src: Path, dest: Path, per_line: float, hold: float) -> None:
    raw = [line for line in src.read_text().splitlines() if line.strip()]
    header = json.loads(raw[0])
    events = [json.loads(line) for line in raw[1:]]
    paced = []
    clock = 0.2
    for event in events:
        if len(event) < 3 or event[1] != "o":
            continue
        parts = event[2].splitlines(keepends=True) or [event[2]]
        for part in parts:
            paced.append([round(clock, 3), "o", part])
            clock += per_line
    clock += hold
    paced.append([round(clock, 3), "o", ""])
    with dest.open("w") as handle:
        handle.write(json.dumps(header) + "\n")
        for event in paced:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")


def render(cast: Path, gif: Path, mp4: Path) -> None:
    run(
        [
            str(AGG),
            "--font-size",
            "15",
            "--line-height",
            "1.35",
            "--speed",
            "1",
            "--theme",
            "monokai",
            str(cast),
            str(gif),
        ]
    )
    run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(gif),
            "-vf",
            "fps=12,scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-movflags",
            "+faststart",
            "-pix_fmt",
            "yuv420p",
            str(mp4),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    scan_dir = Path(tempfile.mkdtemp(prefix="vibe-scan-"))
    fix_dir = Path(tempfile.mkdtemp(prefix="vibe-fix-"))
    watch_dir = Path(tempfile.mkdtemp(prefix="vibe-watch-"))
    shutil.copytree(ROOT / "examples" / "broken-spa", scan_dir, dirs_exist_ok=True)
    shutil.copytree(ROOT / "examples" / "broken-spa", fix_dir, dirs_exist_ok=True)
    shutil.copytree(ROOT / "fixtures" / "hardcoded-localhost", watch_dir, dirs_exist_ok=True)

    cli = str(ROOT / "dist" / "cli.js")
    record(f"node {cli} scan {scan_dir}", ASSETS / "scan.cast")
    record(
        f"bash -lc 'node {cli} fix {fix_dir} --yes && echo && node {cli} scan {fix_dir}'",
        ASSETS / "fix.cast",
    )
    record(f"bash {ROOT / 'scripts' / 'demo-watch.sh'} {watch_dir}", ASSETS / "watch.cast", rows=34)

    pace(ASSETS / "scan.cast", ASSETS / "scan.paced.cast", 0.055, 1.5)
    pace(ASSETS / "fix.cast", ASSETS / "fix.paced.cast", 0.04, 1.5)
    pace(ASSETS / "watch.cast", ASSETS / "watch.paced.cast", 0.035, 1.4)

    render(ASSETS / "scan.paced.cast", ASSETS / "scan.gif", ASSETS / "scan.mp4")
    render(ASSETS / "fix.paced.cast", ASSETS / "fix.gif", ASSETS / "fix.mp4")
    render(ASSETS / "watch.paced.cast", ASSETS / "watch.gif", ASSETS / "watch.mp4")

    leaked = (watch_dir / "src" / "leaked.ts").read_text()
    if "sk_test_" in leaked:
        raise SystemExit(f"watch demo did not fix the secret:\n{leaked}")
    if "serverOnlyEnv" not in leaked:
        raise SystemExit(f"watch demo output unexpected:\n{leaked}")
    for name in ("scan", "fix", "watch"):
        gif = (ASSETS / f"{name}.gif").stat().st_size
        mp4 = (ASSETS / f"{name}.mp4").stat().st_size
        print(f"{name}: gif={gif} mp4={mp4}")


if __name__ == "__main__":
    main()
