#!/usr/bin/env python3
"""
neutralize_lang.py — Apex Logics port (AL-I18N-NEUTRALIZE, 2026-07-27).
Ported from AINumbers/repo/scripts/neutralize_lang.py. Logic unchanged;
only the storage key (ain_lang -> apex_lang) and toggle container
(lang-bar -> lang-inner) are repointed per AL-I18N-NEUTRALIZE-SPEC.md §2.

The toggle generation embeds `const TRANSLATIONS={};` + a named
`function setLang(){...}` inside a <script> that also holds real tool logic.
Removing those constructs needs a real JS parser (a regex brace-counter breaks
on regex/template literals — proven, ~18% breakage). So this pass does the SAFE
thing that satisfies the actual rule:

  1. remove the visible toggle: <div class="lang-inner">...</div>  (DOM-depth
     balanced — pure HTML, no JS parsing)
  2. kill client storage: sessionStorage.setItem('apex_lang', ...);  -> removed
     sessionStorage.getItem('apex_lang')[||'en'] -> 'en'

Result: no visible language toggle, zero client storage, English-only (English is
already the default content). The dead TRANSLATIONS/setLang JS remains as inert
bloat (English-pinned; nothing calls it from the UI) per Tim's 2026-07-27 decision
3 (AL-I18N-NEUTRALIZE-SPEC.md §0.1) — a later pass may address it. This pass
CANNOT break a page: it never removes a JS construct, only the HTML div and
standalone storage statements.

SAFETY: dry-run by default; --write to apply. Writes only if the result has no
`class="lang-inner"` and no `sessionStorage...apex_lang` left. LF/CRLF preserved.
Run the JS-syntax gate (check_tools.js) after --write.
"""
import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
WRITE = "--write" in sys.argv

RESIDUAL = re.compile(r'class="lang-inner"|sessionStorage\s*\.\s*\w+Item\(\s*[\'"]apex_lang')


def match_div(s, i):
    """i at a '<div' that opens a block -> index past its matching '</div>'."""
    depth = 0
    tag = re.compile(r"<div\b|</div>")
    while True:
        m = tag.search(s, i)
        if not m:
            return -1
        if m.group(0) == "</div>":
            depth -= 1
            if depth == 0:
                return m.end()
        else:
            depth += 1
        i = m.end()


def neutralize(s):
    # 1. remove the lang-inner UI div (DOM-balanced)
    while True:
        m = re.search(r'<div class="lang-inner"', s)
        if not m:
            break
        end = match_div(s, m.start())
        if end == -1:
            break
        j = end + 1 if (end < len(s) and s[end] == "\n") else end
        s = s[:m.start()] + s[j:]
    # 2. drop sessionStorage.setItem('apex_lang', ...) statements
    s = re.sub(r"sessionStorage\s*\.\s*setItem\(\s*['\"]apex_lang['\"][^)]*\)\s*;?", "", s)
    # 3. neutralize reads to English
    s = re.sub(r"sessionStorage\s*\.\s*getItem\(\s*['\"]apex_lang['\"]\s*\)\s*\|\|\s*['\"]en['\"]", "'en'", s)
    s = re.sub(r"sessionStorage\s*\.\s*getItem\(\s*['\"]apex_lang['\"]\s*\)", "'en'", s)
    return s


HIT = re.compile(r'class="lang-inner"|apex_lang')
SCAN_DIRS = ("tools", "guides", "chaingraph")


def targets():
    out = []
    for name in os.listdir(REPO):
        p = REPO / name
        if p.suffix == ".html" and p.is_file():
            out.append(p)
    for d in SCAN_DIRS:
        base = REPO / d
        if not base.is_dir():
            continue
        for dp, dn, fn in os.walk(base):
            for f in fn:
                if f.endswith(".html"):
                    out.append(Path(dp) / f)
    result = []
    for p in out:
        try:
            src = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        if HIT.search(src):
            result.append(p)
    return result


def main():
    clean = dirty = wrote = 0
    review = []
    for path in targets():
        src = path.read_text(encoding="utf-8", newline="")
        out = neutralize(src)
        if out == src:
            continue
        rel = path.relative_to(REPO)
        if RESIDUAL.search(out):
            dirty += 1
            review.append(str(rel))
            continue
        clean += 1
        if WRITE:
            path.write_text(out, encoding="utf-8", newline="")
            wrote += 1
    mode = "WROTE" if WRITE else "DRY-RUN"
    print(f"{mode} — clean: {clean}, needs-review: {dirty}")
    for r in review[:40]:
        print("  review: " + r)
    sys.exit(0)


if __name__ == "__main__":
    main()
