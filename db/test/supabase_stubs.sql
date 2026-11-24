do $$ begin create role anon; exception when others then null; end $$; do $$ begin create role authenticated; exception when others then null; end $$; do $$ begin create role service_role; exception when others then null; end $$;
create schema auth; create schema storage; create schema extensions;
create table auth.users (id uuid primary key, email text, encrypted_password text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, instance_id uuid, aud text, role text, email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text, email_change text, email_change_token_new text, is_sso_user boolean default false, deleted_at timestamptz);
create table auth.identities (id uuid, user_id uuid, identity_data jsonb, provider text, provider_id text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
create publication supabase_realtime;
-- Added in prompt 04 (seed): 009's login sync touches these on real Supabase.
alter table auth.users add column if not exists banned_until timestamptz;
create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
