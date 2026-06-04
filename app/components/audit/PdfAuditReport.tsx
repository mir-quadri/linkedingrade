import type { AuditResult } from '@/lib/engine/types';
import { selectGradedPdfSections } from '@/lib/engine/scoring';
import type { SelfReport } from '@/lib/storage/auditStore';

import SectionGradeList from './SectionGradeList';
import ExtensionCallout from './ExtensionCallout';
import WinsAndFixes from './WinsAndFixes';
import SelfAssessedBlock from './SelfAssessedBlock';

interface Props {
  auditId: string;
  audit: AuditResult;
  selfReport: SelfReport | null;
}

/**
 * Body of the focused 4-section PDF "Sample Audit": the 4 graded section
 * cards (Headline, About, Current Experience, Career Arc), the consolidated
 * 8-section extension callout, top wins / highest-leverage fixes (already
 * scoped to the 4 graded sections by the engine), and the reframed
 * self-check block.
 *
 * Shared by the in-page audit flow and the permanent result page so both
 * render the same report.
 */
export default function PdfAuditReport({ auditId, audit, selfReport }: Props) {
  const graded = selectGradedPdfSections(audit.sections);
  return (
    <>
      <SectionGradeList sections={graded} />
      <ExtensionCallout />
      <WinsAndFixes wins={audit.wins} fixes={audit.fixes} />
      <SelfAssessedBlock auditId={auditId} initial={selfReport} />
    </>
  );
}
