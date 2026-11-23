# C1 — Generate topic content from a textbook chapter (import JSON)

**Use in:** a Claude chat (claude.ai), not Claude Code. Attach the chapter
(PDF pages or photos). One topic per run works best. **Model:** Opus.

Output goes into the app's Importer (prompt 21), lands as **draft**, and is
reviewed by a teacher before any student sees it.

Paste everything below the line, then fill the bracketed fields.

---

You are writing learning content for Al-Syed High School (Punjab, Pakistan; Punjab Textbook Board; mixed Urdu/English medium). The goal is **deep understanding**: students must learn why an answer is right, why their wrong answer is wrong, and how to apply the idea on their own.

**Book:** [book name, edition] · **Class:** [e.g. Class 9] · **Subject:** [Math] · **Chapter:** [title] · **Topic:** [title] · **Pages:** [x–y]

### Step 1: concepts
Split the topic into 3–6 **concepts**, the smallest teachable ideas a student can be weak at (e.g. "Solving a linear equation with variables on both sides"). Give each a key (`c1`, `c2`…), an English and an Urdu title, and list prerequisite concept keys (inside this topic or described in words for earlier chapters).

### Step 2: lesson blocks
Write the lesson as blocks. Use these types and skip any that don't fit the subject: `objectives, intro, simple, detailed, visual, worked_example, misconception, quick_check, application, summary`. Each block has `concept_id` = a concept key (or null), and `en` and `ur` text in Markdown.
- `simple` = explain like to a 12-year-old; `detailed` = board-exam depth.
- At least 2 `worked_example` blocks with every step shown and the reason for each step.
- At least 2 `misconception` blocks: the common wrong idea, why it feels right, and why it's wrong.
- `visual`: describe the diagram precisely, or give simple SVG.
- One `alternative` explanation per concept (different angle: analogy, visual, or step-by-step walkthrough of the common mistake).
- Math in LaTeX between `$…$`.

### Step 3: questions
Write questions per concept:
- **~30 diagnostic-quality questions across the topic**, covering every concept, **plus ~15 more per concept** so follow-ups never repeat. Aim for about 90 per topic. If that's too many for one reply, do concept by concept and say "continue" between batches.
- Types: mostly `mcq` (4 options, exactly one correct), some `true_false`, `numeric`, `short_text`.
- `difficulty` 1–3 (mix about 40/40/20), `cognitive_level` one of `recall | understand | apply | analyze`. At least a third must be `apply` or `analyze`, including **unfamiliar contexts** (new numbers, new situations), not textbook copies.
- Wrong options must be **plausible mistakes students actually make**, not jokes.
- `explanation` must have: `en`/`ur` explaining why the correct answer is correct, and `why_wrong` per wrong option key explaining that exact mistake.
- `source`: book + page.

### Urdu rules
Natural, simple Urdu that a Punjab student and teacher would actually say; keep common English loanwords (test, formula, graph); never word-for-word machine-style translation. Technical terms: give the Urdu term used in the PTB Urdu-medium book, with the English term in brackets the first time.

### Output format
Return **one JSON code block only**, exactly this shape (DATABASE_DESIGN.md §4):

```json
{"curriculum": "PTB-[edition]", "class": "[Class 9]", "subject": "[Math]",
 "chapter": "[chapter title]",
 "topic": {"title_en": "", "title_ur": ""},
 "concepts": [{"key": "c1", "title_en": "", "title_ur": "", "requires": []}],
 "lesson": {"blocks": [{"type": "simple", "concept_id": "c1", "en": "", "ur": ""}],
            "alternatives": [{"concept_id": "c1", "blocks": []}]},
 "questions": [{"concept": "c1", "type": "mcq", "difficulty": 2, "cognitive_level": "apply",
   "body": {"stem": {"en": "", "ur": ""},
            "options": [{"key": "A", "text": {"en": "", "ur": ""}}]},
   "answer": {"correct": "B"},
   "explanation": {"en": "", "ur": "", "why_wrong": {"A": {"en": "", "ur": ""}}},
   "source": {"book": "", "page": 0}}]}
```
Before the JSON, list in 3–5 bullets anything you were unsure about (a fact, a translation, an ambiguous question) so the reviewing teacher checks it first.
