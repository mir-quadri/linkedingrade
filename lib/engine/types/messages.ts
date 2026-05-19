import type { ProfileData } from './profile';
import type { AuditResult } from './audit';

export type ExtensionMessage =
  | { kind: 'extract-profile-request' }
  | { kind: 'extract-profile-response'; data: ProfileData | null; error?: string }
  | { kind: 'audit-request'; profile: ProfileData }
  | { kind: 'audit-progress'; phase: 'extracting' | 'scoring' | 'judging' | 'finalizing'; message?: string }
  | { kind: 'audit-response'; result: AuditResult }
  | { kind: 'audit-error'; error: string };
