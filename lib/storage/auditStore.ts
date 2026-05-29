import type { ProfileData, AuditResult } from '@/lib/engine/types';

/**
 * Self-assessed checklist answers for sections a LinkedIn PDF export
 * physically cannot contain (photo composition, banner presence, activity
 * cadence, recommendations, featured section). Stored alongside the audit
 * record but NEVER folded into the composite score — see
 * `app/audit/result/[auditId]/page.tsx` for the rendering contract.
 */
export interface SelfReport {
  photo: 'yes' | 'somewhat' | 'no' | null;
  banner: 'yes' | 'generic' | 'no' | null;
  activity: 'yes' | 'occasional' | 'no' | null;
  recommendations: 'yes' | '1-2' | 'none' | null;
  featured: 'yes' | 'no' | null;
  submittedAt: string;
}

export interface AuditRecord {
  auditId: string;
  createdAt: string;
  email: string | null;
  emailedAt: string | null;
  profile: ProfileData;
  audit: AuditResult;
  selfReport: SelfReport | null;
  userAgent: string | null;
  ipHash: string | null;
}

export interface AuditStore {
  save(record: AuditRecord): Promise<void>;
  get(auditId: string): Promise<AuditRecord | null>;
  attachEmail(auditId: string, email: string, emailedAt: string): Promise<AuditRecord | null>;
  attachSelfReport(auditId: string, selfReport: SelfReport): Promise<AuditRecord | null>;
}

const RECORD_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

/**
 * In-memory store. Per-instance state, reset on every serverless cold start
 * — useful for local dev and as a fail-open so the /audit page still
 * functions before Vercel KV is provisioned. Production traffic SHOULD
 * land on the KV-backed implementation; the warning emitted by
 * `createAuditStore` makes that misconfiguration visible in logs.
 */
// The Map is parked on globalThis so it survives the Next dev module
// re-evaluation that happens between API-route bundles. Without this, an
// audit POSTed to /api/audit was invisible to /api/audit/email a moment
// later because each route bundle re-instantiated its own empty store.
// In production serverless this is still per-instance memory; KV-backed
// storage is the real solution there (see `createAuditStore`).
interface AuditStoreGlobal {
  __linkedinGradeAuditStore?: Map<string, AuditRecord>;
}
function inMemoryMap(): Map<string, AuditRecord> {
  const g = globalThis as unknown as AuditStoreGlobal;
  if (!g.__linkedinGradeAuditStore) {
    g.__linkedinGradeAuditStore = new Map<string, AuditRecord>();
  }
  return g.__linkedinGradeAuditStore;
}

class InMemoryAuditStore implements AuditStore {
  async save(record: AuditRecord): Promise<void> {
    inMemoryMap().set(record.auditId, record);
  }

  async get(auditId: string): Promise<AuditRecord | null> {
    return inMemoryMap().get(auditId) ?? null;
  }

  async attachEmail(auditId: string, email: string, emailedAt: string): Promise<AuditRecord | null> {
    const existing = inMemoryMap().get(auditId);
    if (!existing) return null;
    const updated: AuditRecord = { ...existing, email, emailedAt };
    inMemoryMap().set(auditId, updated);
    return updated;
  }

  async attachSelfReport(auditId: string, selfReport: SelfReport): Promise<AuditRecord | null> {
    const existing = inMemoryMap().get(auditId);
    if (!existing) return null;
    const updated: AuditRecord = { ...existing, selfReport };
    inMemoryMap().set(auditId, updated);
    return updated;
  }
}

interface KvClient {
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>;
  get<T = unknown>(key: string): Promise<T | null>;
}

/**
 * Vercel KV-backed store. The `@vercel/kv` import is dynamic so the module
 * is safe to import in environments where the package isn't installed yet —
 * if it's missing or the env vars aren't set, the factory falls back to
 * `InMemoryAuditStore` and emits a one-time warning.
 */
class KvAuditStore implements AuditStore {
  constructor(private kv: KvClient) {}

  private key(auditId: string): string {
    return `audit:${auditId}`;
  }

  async save(record: AuditRecord): Promise<void> {
    await this.kv.set(this.key(record.auditId), JSON.stringify(record), {
      ex: RECORD_TTL_SECONDS,
    });
  }

  async get(auditId: string): Promise<AuditRecord | null> {
    const raw = await this.kv.get<string | AuditRecord>(this.key(auditId));
    if (raw == null) return null;
    if (typeof raw === 'string') return JSON.parse(raw) as AuditRecord;
    return raw;
  }

  async attachEmail(auditId: string, email: string, emailedAt: string): Promise<AuditRecord | null> {
    const existing = await this.get(auditId);
    if (!existing) return null;
    const updated: AuditRecord = { ...existing, email, emailedAt };
    await this.save(updated);
    return updated;
  }

  async attachSelfReport(auditId: string, selfReport: SelfReport): Promise<AuditRecord | null> {
    const existing = await this.get(auditId);
    if (!existing) return null;
    const updated: AuditRecord = { ...existing, selfReport };
    await this.save(updated);
    return updated;
  }
}

let cached: AuditStore | null = null;
let warned = false;

/**
 * Singleton accessor. Resolves to the KV-backed store when
 * `KV_REST_API_URL` is set; otherwise falls back to an in-memory store and
 * logs a single warning so the operator can see the misconfiguration.
 */
export async function getAuditStore(): Promise<AuditStore> {
  if (cached) return cached;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const mod = (await import('@vercel/kv')) as { kv: KvClient };
      cached = new KvAuditStore(mod.kv);
      return cached;
    } catch (err) {
      if (!warned) {
        console.warn(
          `[auditStore] @vercel/kv not installed or failed to load (${(err as Error).message}); falling back to in-memory store`,
        );
        warned = true;
      }
    }
  } else if (!warned) {
    console.warn(
      '[auditStore] KV_REST_API_URL not set; using in-memory store (records lost on cold start). Provision Vercel KV for production.',
    );
    warned = true;
  }
  cached = new InMemoryAuditStore();
  return cached;
}

/**
 * Test-only reset hook. Allows the storage layer to be re-seeded between
 * unit tests without leaking state across them.
 */
export function __resetAuditStoreForTests(): void {
  cached = null;
  warned = false;
  const g = globalThis as unknown as AuditStoreGlobal;
  g.__linkedinGradeAuditStore = new Map<string, AuditRecord>();
}
