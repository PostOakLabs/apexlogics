# REDIRECTS — Apex Logics

Human log for `repo/.htaccess`. Excluded from deploy (`*.md` rsync exclude), so this file never ships — it exists so the next rename doesn't have to reverse-engineer the `.htaccess` comments.

**Mechanism:** repo-managed `.htaccess`, deployed atomically through the existing `rsync -avz --delete` pipeline (`.github/workflows/deploy.yml`). `.htaccess` is NOT excluded from that rsync, so a committed one ships on every push. `--delete` is active, so this repo copy is the only source of truth — never hand-edit `.htaccess` on the DreamHost server, it will be wiped on the next deploy.

**Standing rule (repo/CLAUDE.md):** renaming or retiring a tool REQUIRES a redirect entry here and in `.htaccess`.

---

## Active redirects

_None yet._ First candidate (the AL-AP2PROSE slug rename `/tools/ap2-advisor-prompt-composer/` → `/tools/advisor-prompt-composer/`) referenced in `AL-REDIRECTS-SPEC.md` did not happen — verified 2026-07-27, live slug is still `ap2-advisor-prompt-composer`. `AL-AP2PROSE` (done, PR #28) turned out to be a different, narrower WU (deleted 4 outbound `ap2-protocol.org` prose links/anchors) — not the rename the spec assumed. No stub to drop as a result.

## P1 survey findings (2026-07-27, AL-REDIRECTS)

Historical retirements checked against `CLAUDE.md`/`COMPLIANCE_HISTORY.md`/`ApexLogics_v8_MasterSpec.md` — none produced a live dead URL:

- **AL-58** — slot intentionally skipped (Score Improvement Dollar Value Engine deferred, never built). No tool page ever existed. No redirect needed.
- **AL-60** — retired, never shipped (concept absorbed into AL-63 Tab 1). No tool page ever existed. No redirect needed.
- **AL-06+16** (`career-resilience-engine`) — MasterSpec changelog shows this pair's status was "Partially Built — migration required" *before* it first shipped 2026-05-17 as the combined tool. AL-06 and AL-16 never had separate live URLs to redirect from.
- **AL-08+14** (`career-transition-suite`) — same pattern: combined status from first ship (2026-05-17), no individual prior URLs.

**Server-side `.htaccess` check:** `curl -I https://apexlogics.org/.htaccess` returns `403`. This is inconclusive — Apache's default `<Files ".ht*">` deny returns 403 whether or not the file exists, so HTTP alone can't confirm or rule out a pre-existing server-side `.htaccess` being silently destroyed by the deploy's `--delete`. Flagging for Tim: if one exists server-side (DreamHost panel default, hand-added rule, etc.), it is being wiped every deploy today. Landing this WU's repo-managed `.htaccess` makes the question moot going forward — the repo copy becomes authoritative either way.

**Trailing-slash behavior:** confirmed live — `https://apexlogics.org/tools/ap2-advisor-prompt-composer` (no trailing slash) → `301` → same URL with trailing slash. This is Apache's native `mod_dir` `DirectorySlash` behavior on a directory request, not something `.htaccess`-dependent; no rule needed to preserve it, and none was added.

## How to add a new redirect

1. Add a `Redirect 301 /old/path/ /new/path/` line to `repo/.htaccess` under the dated block for your WU.
2. Add a row to **Active redirects** above.
3. Gate: `node scripts/check_tools.js`, `node scripts/verify-counts.mjs`, `python scripts/check_index_sync.py` (should pass untouched — no tool HTML changed).
4. Confirm `.htaccess` appears in the workflow's dry-run rsync output before merge.
5. Post-deploy: `curl -I` the old URL, confirm `301` to the right target, and confirm site root still `200`.
