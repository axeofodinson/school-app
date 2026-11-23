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
Write the lesson **visual-first**: every concept gets at least one visual block, and text explains the visual rather than the other way round. Text block types: `objectives, intro, simple, detailed, worked_example, misconception, quick_check, application, summary`, each with `concept_id` = a concept key (or null), and `en` and `ur` text in Markdown. Visual block types (exact shapes in DATABASE_DESIGN.md §4, style in DESIGN_SYSTEM.md §7b.3):
- `scene`: a step-through animation. Write one SVG (viewBox, ≤ 400 elements) with a `<g id="…">` per moving part, then 2–8 steps that set each layer's x, y, scale, rotate, opacity, with a short caption per step in both languages. Use this for anything that *changes*: motion, processes, carrying digits, a reaction.
- `chart`: data for a bar/line/pie/scatter chart or table (real numbers from the book).
- `widget`: pick one from `number_line, fraction_bars, function_graph, geometry_shape, angle, balance, probability, motion_graph, circuit` and give its params and a task ("Make the line steeper. What changed?").
- `figure`: a labelled SVG with hotspots. `compare`: wrong idea vs right idea side by side.
- Add a `predict` question (a normal MCQ) before at least one scene or widget per topic.
- Diagram style: 2 px strokes in ink `#1B1A3A`; indigo `#4434D4` = the quantity in focus, saffron `#FFB627` = highlight (fill with ink outline), green `#11865B` = result, clay `#C2412D` = wrong idea, grey `#77729A` = axes and guides. Every label is its own `<text id="…">` (no text in images). No scripts, no external links, no embedded images.
- Every visual block has `alt` in `en` and `ur`.
- `simple` = explain like to a 12-year-old; `detailed` = board-exam depth.
- At least 2 `worked_example` blocks with every step shown and the reason for each step.
- At least 2 `misconception` blocks: the common wrong idea, why it feels right, and why it's wrong.
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
