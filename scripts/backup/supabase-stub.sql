-- Minimal stand-in for the Supabase bits db/setup.sql needs, for LOCAL harness only.
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create or replace function auth.role() returns text language sql as $$ select 'anon'::text $$;
