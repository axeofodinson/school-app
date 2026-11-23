# @school/core

Pure TypeScript shared by the app: no React, no React Native, no network.
Anything that decides something (scores, mastery, gates, sync) lives here and is
unit-tested in Node with vitest (`npm test` from the repo root).

- `src/grading.ts`: grade-entry rules, ported from the old `src/reporting/grading.js`.
- `src/i18n.ts`: locale-file helpers (key parity, plurals, `%{name}` interpolation).
- `src/db-types.ts`: **generated** Supabase types. Don't edit by hand.

## Regenerating `db-types.ts`

Run after every migration Hassan applies in production. The types describe
**production's** schema: `db/setup.sql` plus every applied `db/0NN_*.sql`, not drafts.

1. Start the local harness DB (TEST_PLAN.md DB-1), load `db/test/supabase_stubs.sql`,
   `db/setup.sql` and the applied migrations in order.
2. Generate (the Supabase CLI v3 reads a plain Postgres URL, no Docker needed):

   ```bash
   npx supabase@3.3.0 gen types typescript \
     --db-url postgresql://postgres@localhost:54329/t --schema public > types.ts
   ```

3. Keep the header comment in `src/db-types.ts`, replace the rest with `types.ts`,
   then `npx prettier --ignore-path /dev/null --write src/db-types.ts`.
4. Stop and delete the harness DB.

Once the dev Supabase project exists, `--project-id <dev ref>` gives the same result
(it also leaves out the pgcrypto helpers the harness installs into `public`).
