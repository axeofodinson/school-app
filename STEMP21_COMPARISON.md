# STEMP21_COMPARISON.md — STEMP21 offer vs the Al-Syed LMS design

Written 2026-11-23 after Hassan's meeting with STEMP21 Pakistan.
**Decision taken:** absorb STEM projects into the school's own LMS (§5).

> **Evidence limits.** stemp21.com and the Play Store are blocked from the
> environment this was written in, so STEMP21 facts come from public search
> snippets plus what Hassan reported from the meeting. Anything not in a
> source below is marked **unconfirmed**. Fill the gaps with the demo
> checklist (§6) before signing anything.

## 1. What STEMP21 offers

| Offer | Status | Source |
|---|---|---|
| STEM curriculum for **Grades 1–8**, aligned to Single National Curriculum, Common Core and Cambridge | Public claim | [stemp21.com](https://stemp21.com/) |
| STEM lab / kits | Public claim + meeting | [stemp21.com/stemp-lab](https://stemp21.com/stemp-lab/) |
| Structured teacher training + STEM certification; unique ID per teacher | Public claim | [stemp21.com](https://stemp21.com/home-modified/) |
| App: role-based (Teacher / Admin / Sub-admin); assign projects by grade; assess projects; personalised remarks; communication and record-keeping | Public claim | [Play Store: com.stamp.stemp](https://play.google.com/store/apps/details?id=com.stamp.stemp) |
| Project framework organised by UN SDG themes ("six projects per SDG theme") | Third-party school | [SZABIST ZAB-ed](https://szabistzabed.org/stemp21/) |
| Curriculum is mainly **Scratch programming books**: each book has 20 guided Scratch projects + 20 "STEMP challenges", with SLOs and SDG alignment | Public claim | [stemp21.com](https://stemp21.com/) |
| Computer lab ratio **1 laptop per 30 students** (collaborative programming) | Public claim | [stemp21.com/stemp-lab](https://stemp21.com/stemp-lab/) |
| "**Training LMS**" listed as a working area (no feature details published) | Public claim | [stemp21.com](https://stemp21.com/) |
| District-scale teacher STEM certification (Attock, public schools, Mar 2025) + robotics kits to schools | News | [Dawn](https://www.dawn.com/news/1899213), [Minute Mirror](https://minutemirror.com.pk/attock-becomes-pakistans-first-district-to-certify-public-school-teachers-in-stem-education-through-stemp21-372009/) |
| Lab installations in Punjab schools (e.g. a school in Phalia) | Video title | [YouTube](https://www.youtube.com/watch?v=NoN8uuve_s4) |
| Product intro video: curriculum, computer lab, teacher training | Video listing (contents not viewable from here) | [YouTube](https://www.youtube.com/watch?v=WJN1ZxzJhgk), [YouTube](https://www.youtube.com/watch?v=gP6q3ZVh7wI) |
| **Full student LMS** (student logins, lessons, quizzes) | Reported in meeting; **unconfirmed**. Public material names only a *Training* LMS, which suggests it is for **teacher training**, not students | — |
| Urdu, offline, Punjab board / matric, exams, parent access, data export/API, pricing after free period | **Unconfirmed** | — |

The public app description mentions only **teacher/admin roles** and **project assessment**, and the website's LMS is a "**Training LMS**". Together these suggest STEMP21's software is for **teachers** (training, certification, and grading student projects), not a student learning platform. Confirm this in a demo.

**What this means for Al-Syed:**
- STEMP21's content is mostly **Scratch coding projects**, so students need a Scratch environment. Scratch 3 runs in Chrome on Chromebooks; an offline Scratch editor exists for Windows. Our LMS should **link out** to the Scratch project and collect the `.sb3` file or a screenshot as evidence (the `project-evidence` bucket in `db/022`), rather than embedding Scratch.
- One laptop per 30 students works only for group work. On the school's Chromebooks, students can work in pairs or alone, so the team feature in `db/022` should allow any team size the teacher chooses.

## 2. Feature comparison

✅ = covered · ⚠️ = partial · ❌ = not covered · ❓ = unconfirmed

| Capability | STEMP21 | Al-Syed design | Notes |
|---|---|---|---|
| Ready STEM / robotics project content | ✅ | ❌ (no content yet) | STEMP21's real strength |
| Lab, kits, teacher training | ✅ | ❌ | Not software, so the school can't build these |
| Project assignment + rubric assessment | ✅ | ✅ designed (`db/022`) | |
| Grade coverage | Grades 1–8 | **PG–10, incl. matric** | |
| Board subjects (Math, Science, English, Urdu, Islamiat…) | ❓ | ✅ | STEMP21 is STEM-only as far as public material says |
| Punjab Textbook Board alignment | ❓ (SNC/Cambridge stated) | ✅ (curriculum versions) | |
| Urdu UI + Nastaleeq + RTL | ❓ | ✅ (already built in today's app) | |
| Student logins on shared Chromebooks | ❓ | ✅ (admission no + PIN exists; QR planned) | |
| Concept-level weakness detection | ❓ | ✅ (`concepts`, `concept_mastery`) | |
| Follow-ups, gates, spaced revision | ❓ | ✅ designed | The pedagogical core of the Al-Syed design |
| Server-run surprise exams + live monitor | ❓ | ✅ RPCs drafted and smoke-tested | |
| Offline practice / offline exams | ❓ | ✅ designed | Classrooms have no Wi-Fi |
| Printable A4 worksheets | ❓ | ✅ planned | |
| Grades with audit history | ❓ | ✅ live today (`db/013`) | |
| Attendance, messaging, push | ❓ | ✅ live today | |
| Parent access | ❓ | ⚠️ planned (Phase 8) | |
| Teacher/admin console | ✅ | ✅ live today | |
| Data owned by the school, exportable | ❓ | ✅ own Supabase DB | |
| Works today | ✅ | ⚠️ partly (old app); LMS is months of work | |
| Cost | Benefits now; later ❓ | Free tier + developer time | |

## 3. Where STEMP21 is stronger
- **Content and materials that exist today.** Projects, kits, lab design and teacher training. This is the hardest part, and the Al-Syed plan has no STEM content at all.
- **Teacher training and certification.** These are human programmes, and software can't replace them.
- **A working product now,** while the Al-Syed LMS is still being designed.

## 4. Where the Al-Syed design is stronger
- **Scope.** Every subject from PG to matric, Punjab board, not only Grades 1–8 STEM.
- **Learning model.** Concept-level diagnosis → follow-ups → mastery gates → 7/30-day retention checks. Nothing public suggests STEMP21 does this.
- **Exams.** Server-timed surprise exams with a live teacher view and automatic follow-ups.
- **Local reality.** Urdu/Nastaleeq, shared Chromebooks, no classroom Wi-Fi, Rs 150 Play Store users.
- **One place for everything.** Grades, attendance, messages and learning in one app, with one login per student.
- **Ownership.** The school owns the data and the roadmap, with no vendor lock-in.

## 5. Verdict and plan

**They complement each other.** STEMP21's value is **content, kits and training**. The school's LMS is a **platform for every subject**. Running two student platforms would split logins, grades and data, and teachers would have to enter marks twice.

Recommended:
1. **Accept STEMP21's curriculum, kits and training.**
2. **Run STEM projects inside the school's LMS** with the generic projects module (`db/022_stem_projects.sql`, Phase 7):
   - a project catalogue (en/ur, grade band, SDG theme, materials/kit list, step-by-step blocks, linked STEM concepts);
   - rubrics with criteria and levels, optionally tagged to concepts;
   - assigning a project creates an `assessments` row with type `project`, so due dates and class scoping are reused;
   - teams, so one score can apply to the whole team before individual adjustments;
   - rubric totals go through the existing `record_grade()` audit;
   - evidence uploads (photos, video, documents) to a private bucket;
   - rubric criteria tagged to a concept count as "applied in a new context" evidence for mastery.
3. **Licence first.** STEMP21's projects and rubrics are their intellectual property. The module is generic, and the DB **refuses** a `source='stemp21'` project without a `licence_note` (verified in smoke test). Load their content only with written permission, otherwise teachers enter their own projects.
4. If STEMP21 requires their app for the benefits, keep it for STEM only and ask for a **CSV/API export** of project scores so results can be imported into the school's grades.

Draft migration verified on a throwaway local Postgres (`db/test/022_smoke.sql`):
- applies cleanly and can be re-run;
- the licence check holds;
- a project assessment must link a project;
- a whole-team score graded both members;
- an individual correction was written to the grade history;
- an over-maximum score and a student trying to score were both rejected;
- a student sees only their own rubric rows.

## 6. Demo checklist (ask STEMP21)

**Their LMS**
1. Can **students** log in themselves, or is the app teacher/admin only? Is the "Training LMS" for teachers only?
1a. Do students do the Scratch projects in Scratch Online or the offline editor? Can project files (`.sb3`) be submitted into our app?
2. Which subjects beyond STEM? Any Punjab board / matric (Class 9–10) content?
3. Is there an Urdu interface? Can it show Urdu (Nastaleeq) content?
4. Does it work **offline** or on weak Wi-Fi? On Chromebooks? On Windows browsers?
5. Can several students share one device (fast switch, no data leakage)?
6. Quizzes/exams: timed? Randomised? Live teacher view? Instant results?
7. Does it diagnose weak concepts and assign follow-up work, or only record scores?
8. Parent access?

**Data and integration**
9. Who owns student data? Where is it stored (country)? What is shared with STEMP21?
10. Can we **export** students' project scores (CSV) or use an **API**?
11. Can our own app be the place students see STEMP21 projects?
12. Do we get a licence to load your projects, rubrics and images into our app? Under what terms?
13. Do you need our student list? Which fields?

**Commercial**
14. What is free, and for how long? Price per student/year afterwards?
15. Any exclusivity or minimum commitment?
16. What happens to our data if we stop?
17. How many kits, and who maintains or replaces them?

**Teaching**
18. Hours per week of STEM the curriculum expects, per grade?
19. Teacher training schedule and certification cost?
20. Do Grades 9–10 get anything, or does it stop at Grade 8?
21. Can we see a sample project with its rubric?
22. Can we get a demo login for a teacher **and** a student?
