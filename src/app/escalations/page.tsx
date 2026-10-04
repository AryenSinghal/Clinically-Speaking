import { EscalationQueue } from "@/components/review/EscalationQueue";
import { PageHeader } from "@/components/ui";
import { getCurrentStudy } from "@/lib/study";

export const dynamic = "force-dynamic";

export default async function EscalationsPage({ searchParams }: { searchParams: Promise<{ study?: string | string[] }> }) {
  const sp = await searchParams;
  // Same resolution as every other page and the nav badge: ?study=, else the most recent study.
  const study = await getCurrentStudy(sp.study).catch(() => null);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Safety"
        title="Escalation queue"
        subtitle="Calls where the participant gave an unexpected answer or raised a safety concern. Review the call, follow up, then mark it resolved."
      />
      <EscalationQueue studyId={study?.id ?? null} />
    </div>
  );
}
