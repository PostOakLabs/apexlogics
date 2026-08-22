#!/usr/bin/env python3
"""
check_index_sync.py — Apex Logics catalog sync validator
==========================================================
Compares tools/{slug}/index.html subdirs against tools.html tool cards.

AL-HOMESPLIT (2026-07-26): retargeted from index.html (now a curated landing
page showing 8 featured tools) to tools.html (the full 167-tool catalog).

Usage:
  python scripts/check_index_sync.py            # report only
  python scripts/check_index_sync.py --strict   # exit 1 if any missing (for CI)

What it checks:
  1. Every subdirectory in tools/ that contains index.html is referenced in tools.html
  2. Every href in tools.html that points to tools/*/index.html actually exists on disk
  3. Reports a count summary

Exit codes:
  0 — all clean (or only warnings in non-strict mode)
  1 — missing tools found AND --strict flag set (CI failure)
"""

import os
import re
import sys
import argparse

# --- Windows console safety (AL-RECORDFIX, 2026-08-22) -----------------------
# This script prints U+2713 / U+2717 / U+26A0 status marks. On a Windows console
# stdout defaults to cp1252, which cannot encode them, so every clean run died
# with UnicodeEncodeError *after* doing all its work. CI (UTF-8) never saw it.
# Force UTF-8 where the runtime allows it; degrade to ASCII marks where it does
# not. Either way the script must never crash on its own output.
_ASCII_FALLBACK = False
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError, OSError):  # pragma: no cover
    _ASCII_FALLBACK = True


def _mark(glyph, plain):
    """Return glyph if the active stdout encoding can render it, else plain."""
    if _ASCII_FALLBACK:
        return plain
    try:
        glyph.encode(sys.stdout.encoding or "utf-8")
    except (UnicodeEncodeError, LookupError):
        return plain
    return glyph


OK_MARK = _mark("✓", "OK")
BAD_MARK = _mark("✗", "X")
WARN_MARK = _mark("⚠", "!")
DASH = _mark("—", "--")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS_DIR = os.path.join(REPO_ROOT, "tools")
INDEX_PATH = os.path.join(REPO_ROOT, "tools.html")

# Slugs that are intentionally omitted from index.html.
# Edit this list if you deliberately exclude a tool from the homepage.
INTENTIONAL_OMISSIONS = set()

ANSI_RED    = "\033[91m"
ANSI_GREEN  = "\033[92m"
ANSI_YELLOW = "\033[93m"
ANSI_BOLD   = "\033[1m"
ANSI_RESET  = "\033[0m"

def main():
    parser = argparse.ArgumentParser(description="Apex Logics index sync checker")
    parser.add_argument("--strict", action="store_true",
                        help="Exit 1 if any unintentional omissions found (for CI)")
    parser.add_argument("--no-color", action="store_true",
                        help="Disable ANSI colour output")
    args = parser.parse_args()

    if args.no_color:
        for v in ["ANSI_RED", "ANSI_GREEN", "ANSI_YELLOW", "ANSI_BOLD", "ANSI_RESET"]:
            globals()[v] = ""

    print(f"{ANSI_BOLD}Apex Logics {DASH} tools.html sync check{ANSI_RESET}")
    print(f"Tools dir : {TOOLS_DIR}")
    print(f"Index file: {INDEX_PATH}\n")

    # ── 1. Collect all tool slugs (subdirs that contain index.html) ───────────
    all_slugs = sorted(
        d for d in os.listdir(TOOLS_DIR)
        if os.path.isdir(os.path.join(TOOLS_DIR, d))
        and os.path.exists(os.path.join(TOOLS_DIR, d, "index.html"))
    )

    # ── 2. Read index.html ────────────────────────────────────────────────────
    with open(INDEX_PATH, encoding="utf-8", errors="replace") as fh:
        index_html = fh.read()

    # ── 3. Find tool hrefs referenced in index.html ───────────────────────────
    # Match href="tools/{slug}/index.html" patterns
    referenced_hrefs = set(re.findall(r'href="tools/([^/"]+)/index\.html"', index_html))

    # ── 4. Find href targets that don't exist on disk ─────────────────────────
    dead_links = sorted(
        slug for slug in referenced_hrefs
        if not os.path.exists(os.path.join(TOOLS_DIR, slug, "index.html"))
    )

    # ── 5. Find tool slugs not referenced in index.html ──────────────────────
    not_referenced = sorted(
        slug for slug in all_slugs
        if slug not in referenced_hrefs
    )
    unintentional = [s for s in not_referenced if s not in INTENTIONAL_OMISSIONS]
    intentional   = [s for s in not_referenced if s in INTENTIONAL_OMISSIONS]

    # ── Report ─────────────────────────────────────────────────────────────────
    print(f"  Tools on disk   : {len(all_slugs)}")
    print(f"  Cards in index  : {len(referenced_hrefs)}")

    if dead_links:
        print(f"\n{ANSI_RED}{ANSI_BOLD}  {BAD_MARK} Dead links in index.html ({len(dead_links)}) — dir not on disk:{ANSI_RESET}")
        for s in dead_links:
            print(f"    tools/{s}/index.html")
    else:
        print(f"\n{ANSI_GREEN}  {OK_MARK} No dead links in index.html{ANSI_RESET}")

    if unintentional:
        print(f"\n{ANSI_RED}{ANSI_BOLD}  {BAD_MARK} Tools missing from index.html ({len(unintentional)}):{ANSI_RESET}")
        for s in unintentional:
            print(f"    tools/{s}/index.html")
        print(f"\n  Add a card for each missing tool, or add its slug to")
        print(f"  INTENTIONAL_OMISSIONS in scripts/check_index_sync.py.")
    else:
        print(f"{ANSI_GREEN}  {OK_MARK} All tools are represented on the homepage{ANSI_RESET}")

    if intentional:
        print(f"\n{ANSI_YELLOW}  {WARN_MARK} Intentionally omitted ({len(intentional)}):{ANSI_RESET}")
        for s in intentional:
            print(f"    tools/{s}/index.html")

    # ── Summary ────────────────────────────────────────────────────────────────
    print()
    if not unintentional and not dead_links:
        print(f"{ANSI_GREEN}{ANSI_BOLD}  All clear.{ANSI_RESET}")
        return 0
    else:
        issues = len(unintentional) + len(dead_links)
        print(f"{ANSI_RED}{ANSI_BOLD}  {issues} issue(s) found.{ANSI_RESET}")
        return 1 if args.strict else 0

if __name__ == "__main__":
    sys.exit(main())
