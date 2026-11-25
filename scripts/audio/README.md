# Read-aloud clips (prompt 16)

`generate-prereader-audio.mjs` makes ElevenLabs clips for junior (PG–5) maths
tap_image questions and stores them in the private `question-audio` bucket
(`db/030`), then sets `questions.body.audio` (DECISIONS #90–91).

Needs (environment secrets, never in the app or in chat):
`ELEVENLABS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (dev project first).
Optional: `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL` (default `eleven_v3`, which covers Urdu).
The environment's network must allow `api.elevenlabs.io` and the Supabase host.

```bash
npm ci                                                          # once
node scripts/audio/generate-prereader-audio.mjs                 # dry run: which questions, chars, credits
node scripts/audio/generate-prereader-audio.mjs --sample        # clips into scripts/audio/out/ to listen to
node scripts/audio/generate-prereader-audio.mjs --write --project <ref>   # upload + set body.audio
```

Options: `--limit 10`, `--max-grade 5`, `--subjects math,numeracy,ginti,riyazi`,
`--voice <id>`, `--model <id>`, `--no-language-code` (if a model rejects `language_code`).
Re-running is safe: clips that are up to date are skipped; new wording makes a new clip.
`scripts/audio/out/` (samples + `report.json`) is git-ignored.
