#!/usr/bin/env python3
"""Dry-run audit for dead i18n (setLang) blocks in Apex Logics public HTML.
Ported from AINumbers/I18N-AUDIT-i18n_audit.py for AL-I18N-NEUTRALIZE (2026-07-27).
Logic unchanged; only ROOT repointed. See CLAUDE.md / AL-I18N-NEUTRALIZE-SPEC.md.

Classifies each file:
  SAFE   - every visible `en` dict value exactly matches a static text node,
           so the on-load setLang('en') is a true no-op -> safe to excise.
  REVIEW - some en value is absent, or a static element is longer/different
           (setLang would change rendered text on load) -> hand-review.
  NO_I18N- has setLang but no parseable en dict (shouldn't happen; flagged).

Never edits anything. Prints summary + writes i18n_report.tsv.
"""
import os, re, sys, html
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = r"C:\dev\Claude\Projects\Apex Logics\repo"
EXCLUDE = re.compile(r"(?:^|[\\/])(?:\.wt|\.claude|node_modules|archive|tests?|worktree)", re.I)

# en-keys that set VISIBLE text (compared). Cosmetic keys (direction/lang) skipped.
SKIP_KEYS = {"dir", "lang_dir"}

def iter_html():
    for dp, dn, fn in os.walk(ROOT):
        if EXCLUDE.search(dp):
            dn[:] = [d for d in dn if not EXCLUDE.search(os.path.join(dp, d))]
            continue
        for f in fn:
            if f.endswith(".html"):
                p = os.path.join(dp, f)
                if not EXCLUDE.search(p):
                    yield p

def _balanced(src, i):
    """src[i]=='{' -> return inner body up to matching close."""
    depth, j = 0, i
    while j < len(src):
        c = src[j]
        if c == "{": depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return src[i+1:j]
        j += 1
    return None

def find_en_object(src):
    """Derive dict var from setLang body (`VAR[lang]`), then extract its en{} values.
    Returns (dict_of_en_values or None, dict_decl_start_idx or None)."""
    dictname = None
    sl = re.search(r"function\s+setLang\s*\([^)]*\)\s*\{", src)
    if sl:
        body = _balanced(src, sl.end() - 1) or ""
        dm = re.search(r"([A-Za-z_]\w*)\s*\[\s*(?:lang|l)\s*\]", body)
        if dm:
            dictname = dm.group(1)
    decl = None
    if dictname:
        decl = re.search(r"(?:var|const|let)\s+" + re.escape(dictname) + r"\s*=\s*\{", src)
    if not decl:
        for c in re.finditer(r"(?:var|const|let)\s+\w+\s*=\s*\{", src):
            tail = src[c.end()-1:]
            inner = _balanced(src, c.end()-1) or ""
            if re.match(r"\s*['\"]?en['\"]?\s*:\s*\{", inner):
                decl = c
                break
    if not decl:
        return None, None
    outer = _balanced(src, decl.end() - 1)
    if outer is None:
        return None, decl.start()
    enm = re.search(r"['\"]?en['\"]?\s*:\s*\{", outer)
    if not enm:
        return None, decl.start()
    body = _balanced(outer, enm.end() - 1)
    if body is None:
        return None, decl.start()
    vals = {}
    for km in re.finditer(r"(?:([A-Za-z_]\w*)|['\"]([\w\-.]+)['\"])\s*:\s*(['\"])((?:\\.|(?!\3).)*)\3", body):
        key = km.group(1) or km.group(2)
        raw = km.group(4)
        val = raw.replace("\\'", "'").replace('\\"', '"').replace("\\n", "\n")
        vals[key] = val
    return (vals or None), decl.start()

def setlang_mutates_text(src):
    """True if setLang body writes visible text (textContent/innerHTML/.value)."""
    sl = re.search(r"function\s+setLang\s*\([^)]*\)\s*\{", src)
    if not sl:
        return False
    body = _balanced(src, sl.end() - 1) or ""
    return bool(re.search(r"\.(?:textContent|innerHTML)\s*=|\.value\s*=", body))

def invocation_kind(src):
    """How setLang fires on load: 'always' | 'guarded' | 'none'."""
    if re.search(r"saved\s*!==?\s*'en'\s*\)\s*setLang", src) or \
       re.search(r"if\s*\(\s*saved\s*&&\s*saved\s*!==?\s*'en'", src):
        return "guarded"
    if re.search(r"\bsetLang\s*\(\s*(?:'en'|\"en\"|saved|s|l|lang)\s*\)", src):
        return "always"
    return "none"

def excise_span_lines(src):
    """Line numbers (1-based) of i18n region: from dict-or-comment start to the
    setLang() invocation on load. For reporting the surgical cut only."""
    lines = src.splitlines()
    start = end = None
    for n, ln in enumerate(lines, 1):
        if start is None and (re.search(r"//\s*.*i18n", ln) or re.search(r"const\s+(?:T|TRANSLATIONS)\s*=", ln)):
            start = n
        if start is not None and re.search(r"\bsetLang\s*\(\s*(?:'en'|\"en\"|saved|l|lang)\s*\)", ln) and n >= start:
            if "function setLang" not in ln:
                end = n
    return start, end

def static_text_nodes(src, dict_start):
    """All visible text nodes with <script>/<style> removed, html-unescaped."""
    noscript = re.sub(r"<script\b.*?</script>", " ", src, flags=re.S | re.I)
    noscript = re.sub(r"<style\b.*?</style>", " ", noscript, flags=re.S | re.I)
    nodes = []
    for tm in re.finditer(r">([^<]+)<", noscript):
        t = html.unescape(tm.group(1))
        t = re.sub(r"\s+", " ", t).strip()
        if t:
            nodes.append(t)
    return nodes

def norm(s):
    return re.sub(r"\s+", " ", html.unescape(s)).strip()

def fold(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())

def classify(vals, nodes):
    nodeset = set(nodes)
    foldset = {fold(n) for n in nodes}
    mism = []
    for k, v in vals.items():
        if k in SKIP_KEYS:
            continue
        vn = norm(v)
        if not vn:
            continue
        if vn in nodeset:
            continue
        if fold(vn) in foldset:
            mism.append((k, "COSMETIC", vn[:60], ""))
            continue
        longer = [n for n in nodes if vn and vn in n and n != vn]
        if longer:
            mism.append((k, "TRUNCATES", vn[:60], longer[0][:80]))
        else:
            mism.append((k, "ABSENT", vn[:60], ""))
    return mism

def main():
    files = sorted(iter_html())
    rows = []
    safe = review = noi18n = 0
    for p in files:
        with open(p, encoding="utf-8", errors="replace") as fh:
            src = fh.read()
        if "function setLang" not in src and "setLang(" not in src:
            continue
        vals, ds = find_en_object(src)
        rel = os.path.relpath(p, ROOT).replace("\\", "/")
        s, e = excise_span_lines(src)
        inv = invocation_kind(src)
        if not vals:
            if not setlang_mutates_text(src):
                safe += 1
                rows.append(("SAFE", rel, s, e, f"inv={inv}; setLang only toggles .lang-btn/dir, no text mutation"))
            else:
                noi18n += 1
                rows.append(("NO_I18N", rel, s, e, f"inv={inv}; mutates text but en dict unparsed"))
            continue
        if inv != "always":
            safe += 1
            rows.append(("SAFE", rel, s, e, f"inv={inv}; setLang not called on load ({len(vals)} en vals)"))
            continue
        mism = classify(vals, static_text_nodes(src, ds))
        if mism:
            review += 1
            n = len(mism)
            absents = [(k, w) for k, w, _, _ in mism if w == "ABSENT"]
            navabs = any(k.startswith("nav") or k.startswith("footer") for k, _ in absents)
            if not absents:
                bucket = "R1_trunc_only" if any(w == "TRUNCATES" for _, w, _, _ in mism) else "R0_cosmetic"
            elif len(absents) <= 2 and not navabs:
                bucket = "R2_absent_few"
            elif navabs and len(absents) <= 3:
                bucket = "R3_nav_rename"
            else:
                bucket = "R4_absent_many"
            detail = "; ".join(f"{k}:{why}[{val}]" for k, why, val, _ in mism)
            rows.append(("REVIEW", rel, s, e, f"{bucket}; n={n}; inv=always; " + detail))
        else:
            safe += 1
            rows.append(("SAFE", rel, s, e, f"inv=always; {len(vals)} en values all match static"))

    outdir = os.path.dirname(os.path.abspath(__file__))
    rep = os.path.join(outdir, "i18n_report.tsv")
    with open(rep, "w", encoding="utf-8") as fh:
        fh.write("status\tfile\texcise_start\texcise_end\tdetail\n")
        for r in rows:
            fh.write("\t".join(str(x) for x in r) + "\n")

    print(f"scanned public html with setLang: {len(rows)}")
    print(f"  SAFE   (no-op, auto-excise ok): {safe}")
    print(f"  REVIEW (render changes on cut): {review}")
    print(f"  NO_I18N(unparsed, inspect)    : {noi18n}")
    print(f"\nreport: {rep}")
    from collections import Counter
    bc = Counter()
    for st, rel, s, e, d in rows:
        if st == "REVIEW":
            bc[d.split(";", 1)[0]] += 1
    print("\n--- REVIEW sub-buckets (WU scoping) ---")
    labels = {
        "R0_cosmetic": "punct/space/case-only diffs -> excise, ~safe (eyeball)",
        "R1_trunc_only": "static already richer -> excise, static wins (low risk)",
        "R2_absent_few": "1-2 injected strings -> port into static, then excise",
        "R3_nav_rename": "nav/footer label reconcile (about.html type)",
        "R4_absent_many": "hero+body heavy (hubs) -> port several, then excise",
    }
    for b, c in sorted(bc.items(), key=lambda x: -x[1]):
        print(f"  {b:16} {c:3}  {labels.get(b,'')}")
if __name__ == "__main__":
    main()
