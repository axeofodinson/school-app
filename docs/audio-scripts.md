# Audio to make (UI remake, DECISIONS #95)

Three kinds of audio. Only the first two need you; the third is made by a script.

| Kind | How many | Where it plays | Who makes it |
|---|---|---|---|
| A. Kid voice lines | 5 lines × English + Urdu = **10 clips** | PG–Class 5 only, outside tests/exams | You (ElevenLabs website or app) |
| B. Sound effects | **3 clips** (replace the synthesised placeholders) | Kid taps, quiz sent, finishing a paper | You (ElevenLabs Sound Effects), optional |
| C. Question read-aloud | one clip per junior maths question × 2 languages | The speaker button on PG–5 questions | `scripts/audio/generate-prereader-audio.mjs` (already built, prompt 16) |

Rules the app already follows, so the clips don't need to: sounds never play in a
test or exam (ExamMode), never on teacher/admin screens, never when the student turns
**Settings → Sounds** off, and at 60 % volume. A clip that is missing simply doesn't
play; the words are always on screen too.

---

## A. Kid voice lines (10 clips)

**Voice:** one warm, friendly adult voice for all lines (the same voice in both
languages if it speaks Urdu well; otherwise a native Urdu voice for the Urdu set).
Slow and clear, smiling, like a nursery teacher. Not sing-song, not shouting.
In ElevenLabs: stability ≈ 50 %, similarity ≈ 75 %, style 0–15 %, speed 0.9.
Model: `eleven_v3` (or Multilingual v2) for Urdu.

**Format:** MP3, mono, 22–44 kHz, 32–64 kbps. Each clip under 60 KB (≈ 2–4 s).
Trim silence at both ends (≤ 0.1 s).

**File names matter.** Save each file exactly as shown, then:

```bash
# from the repo root, after copying the files in:
#   apps/mobile/assets/voice/en/<name>.mp3
#   apps/mobile/assets/voice/ur/<name>.mp3
node scripts/audio/build-voice-manifest.mjs
```

The script wires them into the app (it prints how many it found). Commit the mp3s
and the updated `manifest.ts`; a new build (or web deploy) carries them.

| File name | When it plays | English (say exactly) | Urdu (say exactly) |
|---|---|---|---|
| `welcomeBack.mp3` | Kid opens Home, nothing waiting (once per app start) | "Welcome back! Let's learn something new." | "خوش آمدید! چلو، آج کچھ نیا سیکھیں۔" |
| `testOpen.mp3` | Kid opens Home and a quiz is waiting (once per app start) | "A quiz is waiting for you. Tap the yellow button to start!" | "تمہارے لیے ایک کوئز تیار ہے۔ شروع کرنے کے لیے پیلے بٹن پر ہاتھ لگاؤ!" |
| `missedOne.mp3` | Kid taps Finish with a question left blank | "Oops, you missed one. Go back, or tap Finish again." | "اوہو، ایک سوال رہ گیا۔ واپس جاؤ، یا دوبارہ ختم پر ہاتھ لگاؤ۔" |
| `allDone.mp3` | Kid finishes a picture quiz and it is sent | "You did it! Your stars are saved." | "شاباش! تم نے کر دکھایا۔ تمہارے ستارے محفوظ ہو گئے۔" |
| `willSend.mp3` | Kid finishes with no internet (it sends later) | "You did it! Your answers will go to your teacher soon." | "شاباش! تمہارے جواب جلد ہی ٹیچر تک پہنچ جائیں گے۔" |

Urdu check before recording: these are my first drafts in the casual kid register the
app uses ("ہاتھ لگاؤ", "شاباش"). Ask a PG/primary teacher to read them once; change
the words in this table if they do, and record what they approve. "Yellow button" in
`testOpen` refers to the saffron "A test is open" banner on Home.

---

## B. Sound effects (3 clips, optional upgrade)

The app ships with small synthesised placeholders (`apps/mobile/assets/sfx/*.wav`,
made by `scripts/generate-sfx.mjs`). To replace them, generate in **ElevenLabs →
Sound Effects** with the prompts below, pick the best of the four takes, trim, and
save as **WAV, mono, 22 kHz, 16-bit** with the same name (overwrite the file).
Keep each under 50 KB. Loudness: gentle; they play at 60 % volume over speech.

| File | When | Length | Prompt to paste |
|---|---|---|---|
| `pop.wav` | A kid taps a picture tile; a student taps Start on Home | 0.15–0.25 s | "Soft, rounded bubble pop, wooden toy xylophone tick, single short friendly UI tap sound, no reverb, children's app" |
| `ding.wav` | A quiz is sent | 0.5–0.8 s | "Gentle two-note rising chime, warm marimba, positive confirmation sound for a children's learning app, clean, no reverb tail" |
| `tada.wav` | A kid finishes a picture quiz | 1.0–1.5 s | "Short cheerful celebration flourish, playful marimba and soft glockenspiel arpeggio ending on a sparkle, children's game success jingle, not loud" |

If you'd rather keep MP3, tell the next session: the three `require(...)` lines in
`apps/mobile/ui/sound.tsx` need the new extension.

---

## C. Question read-aloud (made by the script, not by hand)

Each junior maths picture question gets its own clip in both languages, made from
the question's own text, so you never write these by hand. The generator is ready
(prompt 16); it needs a run where the ElevenLabs key is set:

1. Run `db/030` on the **dev** project (SQL Editor) if you haven't.
2. In the `school-app` cloud environment (it has `ELEVENLABS_API_KEY`; its network must
   allow `api.elevenlabs.io`) with dev's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`:
   - `node scripts/audio/generate-prereader-audio.mjs` (dry run: lists the questions and the credit cost)
   - `node scripts/audio/generate-prereader-audio.mjs --sample` (clips into `scripts/audio/out/`; listen to the Urdu ones)
   - `node scripts/audio/generate-prereader-audio.mjs --write --project <dev ref>`
3. Use the same voice as part A (`--voice <id>`) so the app sounds like one person.

By default it takes up to 10 junior **maths** picture questions (`--limit`,
`--subjects math,numeracy,ginti,riyazi`). On the dev test data
(`pg-play-quizzes-dev.sql`) that is the "Numbers & Shapes" quiz; add
`--subjects numeracy,literacy` to include "Letters & Sounds" too. The dry run prints
the exact list and credit cost before anything is spent.
