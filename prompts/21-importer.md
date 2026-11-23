# 21 — Content importer (JSON → draft) with validation report

**Model:** Opus · **Phase:** 2 · **Depends on:** 20 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **21** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- DATABASE_DESIGN.md §4 (import file shape)
- LMS_AUDIT §1.2 rows for 5.2
- prompts/C1-generate-topic-content.md (the producer of import files)

## Goal
Hassan (or a teacher) uploads one topic JSON file and gets a clear report; valid items land as drafts.

## Do
- `packages/core/importer`: schema validation (zod), exactly one correct key present in options, cognitive_level + concept present, en+ur presence (warning, not pass), difficulty 1–3, duplicate detection (normalised stem hash + trigram similarity against the bank), LaTeX → SVG pre-render (bundled MathJax/KaTeX in Node or in the browser).
- Upload screen (web): drop a file → dry-run report (errors, warnings, duplicates) → confirm import → `import_batches` row + drafts (origin=ai or human).
- Retire a whole batch.

## Don't
- Don't auto-approve anything.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- core importer + tests with good/bad fixtures, features/importer

## Done when
- [ ] Bad fixtures produce the expected errors; a good file imports N drafts with versions = 1.
- [ ] Re-importing the same file flags duplicates instead of duplicating.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **21** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
