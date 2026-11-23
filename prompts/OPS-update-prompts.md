# OPS — Update the plan and prompt library from Hassan's notes

**Model:** Opus · **When:** whenever Hassan changes his mind, answers open questions, or shares new information (e.g. a vendor meeting).

Paste everything below the line into a new Claude Code session, then write your notes under "My notes".

---

You are maintaining the planning docs and the session prompt library for the Al-Syed school app. Read `CLAUDE.md`, `prompts/README.md`, `MODULE_STATUS.md`, `DECISIONS.md` and `LMS_AUDIT.md` (§6 build order, §7 open questions).

## Do
1. Turn my notes into decisions: add numbered entries to `DECISIONS.md` (newest first, with the reason); mark answered questions in `LMS_AUDIT.md` §7 as **answered** with the answer.
2. Find every prompt in `prompts/` affected (scope, order, blockers, model) and edit it. Add new prompt files using the same template if new work appeared; mark dropped prompts as `~~struck~~` in the index instead of deleting them.
3. Update `prompts/README.md`: order, blockers and the changelog at the bottom (date + one line per change).
4. Update `MODULE_STATUS.md` and any affected doc (ARCHITECTURE, DATABASE_DESIGN, TEST_PLAN).
5. If a change conflicts with `CLAUDE.md` rules, tell me before changing the rule; if I confirm, update `CLAUDE.md` too.
6. Ask me directly (multiple-choice questions) about anything ambiguous before editing.

## Don't
- Don't write app code or SQL in this session.

## Finish
Commit and push; reply with a short list of what changed and which prompt to run next.

## My notes
[write here]
