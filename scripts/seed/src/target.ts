// Target guard: the seed and remove scripts write and delete in bulk, so they
// refuse any database that is not provably local or an allow-listed dev
// Supabase project. Production is refused by name, whatever else is set.

/** The production project ref (docs/environment.md). Never seed or remove here. */
export const PRODUCTION_REFS = ['invggaerwfsoslsibwwo'] as const;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface TargetEnv {
  SEED_DATABASE_URL?: string;
  /** Comma-separated Supabase project refs that are dev projects. */
  SEED_ALLOWED_REFS?: string;
  /** https://<ref>.supabase.co of the dev project (docs/environment.md); its ref is allowed. */
  DEV_SUPABASE_URL?: string;
}

export type Target =
  | { ok: true; kind: 'local' | 'supabase-dev'; label: string; connectionString: string }
  | { ok: false; reason: string };

function refFromSupabaseUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const m = /^([a-z0-9]{20})\.supabase\.(co|in)$/.exec(host);
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}

/** Project ref from a Postgres URL: db.<ref>.supabase.co or user postgres.<ref> (pooler). */
export function supabaseRef(u: URL): string | null {
  const direct = /^db\.([a-z0-9]{20})\.supabase\.(co|in)$/.exec(u.hostname);
  if (direct) return direct[1]!;
  const user = /^[a-z_]+\.([a-z0-9]{20})$/.exec(decodeURIComponent(u.username));
  if (user && /\.supabase\.(com|co)$/.test(u.hostname)) return user[1]!;
  return null;
}

export function resolveTarget(env: TargetEnv): Target {
  const raw = env.SEED_DATABASE_URL?.trim();
  if (!raw) {
    return {
      ok: false,
      reason:
        'SEED_DATABASE_URL is not set. Point it at local Postgres or the DEV Supabase project (see scripts/seed/README.md).',
    };
  }
  const lowered = raw.toLowerCase();
  for (const ref of PRODUCTION_REFS) {
    if (lowered.includes(ref)) {
      return { ok: false, reason: `refusing: ${ref} is the PRODUCTION project` };
    }
  }
  // Unix-socket form (postgresql://user@/db?host=/var/run/postgresql) has an
  // empty host, which URL() rejects; parse it with a placeholder host.
  const socketForm = /^postgres(ql)?:\/\/[^/@]*@\//.test(raw);
  let u: URL;
  try {
    u = new URL(socketForm ? raw.replace('@/', '@socket.invalid/') : raw);
  } catch {
    return {
      ok: false,
      reason: 'SEED_DATABASE_URL is not a URL (postgresql://user:pass@host:port/db)',
    };
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') {
    return { ok: false, reason: `unsupported protocol ${u.protocol}` };
  }
  // A unix socket: postgresql://user@/db?host=/var/run/postgresql
  const socketHost = u.searchParams.get('host');
  if (socketForm && socketHost?.startsWith('/')) {
    return { ok: true, kind: 'local', label: `local socket ${socketHost}`, connectionString: raw };
  }
  if (LOCAL_HOSTS.has(u.hostname)) {
    return {
      ok: true,
      kind: 'local',
      label: `local ${u.hostname}:${u.port || 5432}`,
      connectionString: raw,
    };
  }
  const ref = supabaseRef(u);
  if (!ref) {
    return {
      ok: false,
      reason: `refusing: ${u.hostname} is neither local nor a recognisable Supabase dev host`,
    };
  }
  const allowed = new Set(
    (env.SEED_ALLOWED_REFS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const devRef = refFromSupabaseUrl(env.DEV_SUPABASE_URL);
  if (devRef) allowed.add(devRef);
  for (const prod of PRODUCTION_REFS) allowed.delete(prod);
  if (!allowed.has(ref)) {
    return {
      ok: false,
      reason: `refusing: Supabase project ${ref} is not on the dev allow-list (DEV_SUPABASE_URL or SEED_ALLOWED_REFS)`,
    };
  }
  return {
    ok: true,
    kind: 'supabase-dev',
    label: `Supabase dev project ${ref}`,
    connectionString: raw,
  };
}
