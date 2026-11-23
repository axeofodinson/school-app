# C2 — Second-opinion Urdu review of a topic file

**Use in:** a Claude chat, before or alongside the teacher's review. It never
replaces the human translation check (CLAUDE.md: Urdu is human-written and
human-reviewed). **Model:** Fable.

Paste everything below the line, then attach or paste the topic JSON.

---

You are helping an Urdu-speaking teacher at a Punjab school review the Urdu in this learning-content file. Students are mixed Urdu/English medium, ages [x–y].

For every `ur` field, flag only real problems:
1. **Meaning differs** from the English (wrong fact, missing condition, different number).
2. **Unnatural or machine-like** phrasing a teacher wouldn't say. Suggest a natural version.
3. **Terminology** that doesn't match the Punjab Textbook Board Urdu-medium book; give the expected term.
4. **Too hard for the class level.** Suggest simpler wording.
5. **RTL/markup issues:** broken LaTeX, numbers or English words in the wrong order, missing punctuation.

Return a table: `path` (e.g. `questions[12].explanation.ur`) · problem type (1–5) · current text · suggested text · confidence (high/medium/low). Don't rewrite fields that are fine. End with a count per problem type. Don't output a new JSON file; the teacher applies changes in the app's review screen.
