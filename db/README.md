# db/ — database source of truth

These SQL files define the Supabase (Postgres) backend. They are the **source of
truth**; the app is built to match them, not the other way around. Never edit an
already-applied file to change an applied object — add a new numbered migration
(`03_*.sql`, `04_*.sql`, …) instead.

| File | Purpose |
| --- | --- |
| `01_schema.sql` | Tables, types, constraints, indexes. |
| `02_policies.sql` | Row-Level Security: enable RLS + role-based policies. |

## Run order (Supabase → SQL Editor)

Run these **in order**, one script per query, in your project's SQL Editor
(Dashboard → SQL Editor → New query → paste → Run):

1. **`01_schema.sql`** — creates the tables. Must succeed before policies.
2. **`02_policies.sql`** — enables RLS and installs the role-based policies.
   Running this before the schema exists will error.
3. **Promote your own account to `developer` (one-time).**
   First sign in through the app (or create your auth user in
   Dashboard → Authentication → Users) so a `profiles` row exists for you —
   new accounts default to the `pending` role with no access. Then run, adjusting
   the column/table names to match the schema you pasted:

   ```sql
   update public.profiles
   set    role = 'developer'
   where  id = (
     select id from auth.users
     where  email = 'axeofodinson@gmail.com'
   );
   ```

   Verify:

   ```sql
   select p.role
   from   public.profiles p
   join   auth.users u on u.id = p.id
   where  u.email = 'axeofodinson@gmail.com';
   -- expect: developer
   ```

> If your `profiles` table keys off a different column than `id`/`auth.users.id`,
> adjust the `where` clause to match the schema in `01_schema.sql`. This is the
> only manual privilege grant — every other role change happens in-app under RLS.
