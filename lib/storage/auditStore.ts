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
  /**
   * Attach the email-submit metadata. `userAgent` and `ipHash` are
   * captured here — NOT on the initial save — because the privacy
   * policy ties their collection to the email submit (the moment the
   * user gives explicit consent). Upload-only visitors who never clear
   * the gate must not have their UA / IP hash retained.
   */
  attachEmail(
    auditId: string,
    email: string,
    emailedAt: string,
    userAgent: string | null,
    ipHash: string | null,
  ): Promise<AuditRecord | null>;
  /**
   * Attach the self-assessed checklist and (optionally) the recomputed
   * AuditResult. The recomputed audit is the one whose composite
   * reflects the freshly-submitted self-report — passed in by the route
   * so the storage layer doesn't have to know about scoring. When
   * omitted, the existing stored audit is left untouched (used by the
   * older callers / tests that don't recompute).
   */
  attachSelfReport(
    auditId: string,
    selfReport: SelfReport,
    recomputedAudit?: AuditResult,
  ): Promise<AuditRecord | null>;
}

const RECORD_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const RECORD_TTL_MS = RECORD_TTL_SECONDS * 1000;

/**
 * Has this record passed its 90-day TTL? Compared against `createdAt`
 * (set at audit creation) — `emailedAt` and `selfReport.submittedAt` are
 * later mutations and don't extend the window. The same TTL bound is
 * applied by the KV implementation via `ex`; this helper exists so the
 * in-memory fallback can honour the same retention promise the privacy
 * policy makes ("90 days, automatically deleted").
 */
function isExpired(record: AuditRecord, now: number): boolean {
  const created = Date.parse(record.createdAt);
  if (!Number.isFinite(created)) return false;
  return now - created > RECORD_TTL_MS;
}

/**
 * How many seconds remain in this record's 90-day window, counted from
 * `createdAt` — NOT `now`. The KV implementation passes this to
 * `kv.set(..., { ex })` on attach paths so a late attach doesn't extend
 * retention past the original window. Returns 0 for records we can't
 * parse (the conservative read of the "malformed createdAt is preserved"
 * rule applies on the read side; on the write side, refusing to extend
 * is the equivalent conservative choice).
 *
 * Mirrors the rule the privacy policy advertises: "After 90 days the
 * record — and your email's association with it — are deleted
 * automatically." `attachEmail` and `attachSelfReport` are mutations, not
 * new records, so they must NOT reset the clock.
 */
function remainingTtlSeconds(record: AuditRecord, now: number): number {
  const created = Date.parse(record.createdAt);
  if (!Number.isFinite(created)) return 0;
  const remainingMs = created + RECORD_TTL_MS - now;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 1000);
}

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

/**
 * Lazy-expiry helper. Returns the record for `auditId` if present AND
 * still within its TTL window; otherwise deletes the stale entry and
 * returns null. This mirrors Redis's GET-on-expired semantics on the
 * cheap, so /audit/result/<id> can't reveal a record that should have
 * been swept after 90 days.
 */
function readFresh(auditId: string): AuditRecord | null {
  const map = inMemoryMap();
  const record = map.get(auditId);
  if (!record) return null;
  if (isExpired(record, Date.now())) {
    map.delete(auditId);
    return null;
  }
  return record;
}

/**
 * Opportunistic prune. Walks the Map once and drops every expired
 * record. We piggy-back on `save`: it's the only write path that's
 * already touching the Map for an unrelated reason, so this adds a
 * single scan per audit rather than a setInterval timer that would
 * survive route reloads and leak across HMR cycles. The Map size is
 * bounded by per-instance throughput * 90 days, so the scan is cheap.
 */
function pruneExpired(now: number): void {
  const map = inMemoryMap();
  for (const [id, record] of map) {
    if (isExpired(record, now)) map.delete(id);
  }
}

class InMemoryAuditStore implements AuditStore {
  async save(record: AuditRecord): Promise<void> {
    const map = inMemoryMap();
    pruneExpired(Date.now());
    map.set(record.auditId, record);
  }

  async get(auditId: string): Promise<AuditRecord | null> {
    return readFresh(auditId);
  }

  async attachEmail(
    auditId: string,
    email: string,
    emailedAt: string,
    userAgent: string | null,
    ipHash: string | null,
  ): Promise<AuditRecord | null> {
    const existing = readFresh(auditId);
    if (!existing) return null;
    // Email gate is one-way: refuse to overwrite an already-set email.
    // The route layer also checks this and returns 409, but the store
    // enforces the invariant too so any future caller can't accidentally
    // re-target a gated record.
    if (existing.email) return null;
    const updated: AuditRecord = { ...existing, email, emailedAt, userAgent, ipHash };
    inMemoryMap().set(auditId, updated);
    return updated;
  }

  async attachSelfReport(
    auditId: string,
    selfReport: SelfReport,
    recomputedAudit?: AuditResult,
  ): Promise<AuditRecord | null> {
    const existing = readFresh(auditId);
    if (!existing) return null;
    const updated: AuditRecord = {
      ...existing,
      selfReport,
      audit: recomputedAudit ?? existing.audit,
    };
    inMemoryMap().set(auditId, updated);
    return updated;
  }
}

/**
 * Subset of Upstash / @vercel/kv we use. `set` with `nx: true` returns
 * 'OK' on first write and null when the key already exists — that's the
 * atomic claim the email gate relies on.
 */
interface KvClient {
  set(
    key: string,
    value: string,
    opts?: { ex?: number; nx?: boolean },
  ): Promise<string | null | unknown>;
  get<T = unknown>(key: string): Promise<T | null>;
  del(key: string): Promise<unknown>;
}

/**
 * Vercel KV-backed store. The `@vercel/kv` import is dynamic so the module
 * is safe to import in environments where the package isn't installed yet —
 * if it's missing or the env vars aren't set, the factory falls back to
 * `InMemoryAuditStore` and emits a one-time warning.
 */
export class KvAuditStore implements AuditStore {
  constructor(private kv: KvClient) {}

  private key(auditId: string): string {
    return `audit:${auditId}`;
  }

  /**
   * Per-audit "gate-cleared" claim key. SET NX on this key is the
   * atomic primitive that makes the email gate race-safe: only the
   * first concurrent `/api/audit/email` caller wins; everyone else
   * gets null back from the claim and bails out before touching the
   * main record.
   */
  private claimKey(auditId: string): string {
    return `audit:${auditId}:claim`;
  }

  /**
   * Internal write helper. Initial saves (from `/api/audit`) get the full
   * TTL; attach paths pass an absolute remaining TTL anchored to
   * `createdAt` so a late mutation can't extend the window — that's the
   * Codex P2 fix on this file.
   */
  private async writeWithTtl(record: AuditRecord, ttlSeconds: number): Promise<void> {
    await this.kv.set(this.key(record.auditId), JSON.stringify(record), {
      ex: ttlSeconds,
    });
  }

  async save(record: AuditRecord): Promise<void> {
    await this.writeWithTtl(record, RECORD_TTL_SECONDS);
  }

  async get(auditId: string): Promise<AuditRecord | null> {
    const raw = await this.kv.get<string | AuditRecord>(this.key(auditId));
    if (raw == null) return null;
    if (typeof raw === 'string') return JSON.parse(raw) as AuditRecord;
    return raw;
  }

  async attachEmail(
    auditId: string,
    email: string,
    emailedAt: string,
    userAgent: string | null,
    ipHash: string | null,
  ): Promise<AuditRecord | null> {
    const existing = await this.get(auditId);
    if (!existing) return null;
    // Email gate is one-way: refuse to overwrite an already-set email.
    // The read-then-check below is a fast path; the SET NX claim below
    // is the atomic guard that makes the gate race-safe.
    if (existing.email) return null;
    // Anchor the new EX to the record's original window. If the record
    // is already past 90 days from createdAt, refuse the write — mirrors
    // the in-memory store's `readFresh` semantics.
    const ttl = remainingTtlSeconds(existing, Date.now());
    if (ttl <= 0) return null;

    // Atomic claim. Two concurrent `/api/audit/email` requests for the
    // same fresh audit would both pass the `existing.email` check above
    // (a non-atomic read-then-write) and both proceed to send /
    // persist. SET NX on a per-audit claim key is the single Redis
    // primitive that lets only the first caller win — losers get null
    // here and return without writing or invoking Resend. The claim
    // key takes the same TTL as the record so it can never outlive the
    // data it gates.
    const claimed = await this.kv.set(this.claimKey(auditId), email, {
      ex: ttl,
      nx: true,
    });
    if (claimed !== 'OK') return null;

    const updated: AuditRecord = { ...existing, email, emailedAt, userAgent, ipHash };
    try {
      await this.writeWithTtl(updated, ttl);
    } catch (err) {
      // If the main-record write failed, release the claim so a retry
      // can succeed. Otherwise the audit would be permanently stuck
      // un-emailable, which is worse than the rare-failure case it'd
      // protect against.
      await this.kv.del(this.claimKey(auditId)).catch(() => undefined);
      throw err;
    }
    return updated;
  }

  async attachSelfReport(
    auditId: string,
    selfReport: SelfReport,
    recomputedAudit?: AuditResult,
  ): Promise<AuditRecord | null> {
    const existing = await this.get(auditId);
    if (!existing) return null;
    const ttl = remainingTtlSeconds(existing, Date.now());
    if (ttl <= 0) return null;
    const updated: AuditRecord = {
      ...existing,
      selfReport,
      audit: recomputedAudit ?? existing.audit,
    };
    await this.writeWithTtl(updated, ttl);
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
