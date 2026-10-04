import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { RecruitmentClient } from "@/components/recruitment/RecruitmentClient";
import { getCurrentStudy } from "@/lib/study";
import { listCandidates } from "@/lib/recruitment/candidates";

export const dynamic = "force-dynamic";

export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const study = await getCurrentStudy(sp.study);
  if (!study) {
    return (
      <EmptyState
        title="No study yet"
        body="Recruitment is driven by the study protocol. Upload a protocol first, then come back to find and screen candidates."
        action={<Link href="/setup" className="inline-flex rounded-lg bg-violet-700 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-800">Go to setup</Link>}
      />
    );
  }
  const candidates = await listCandidates(study.id);
  return (
    <div>
      <PageHeader
        eyebrow="Recruitment"
        title="Find and screen participants"
        subtitle={<>{study.title}{study.site ? ` · ${study.site.name}, ${study.site.city}, ${study.site.state}` : " · no site set (defaulting to Boston)"}{!study.details && <span className="block text-amber-700">Protocol details are not extracted yet, so scoring uses defaults.</span>}</>}
      />
      <RecruitmentClient study={study} initialCandidates={candidates} />
    </div>
  );
}
