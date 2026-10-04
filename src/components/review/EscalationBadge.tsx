import clsx from "clsx";
import type { Call } from "@/lib/db/types";
import { Badge } from "@/components/ui";

export function EscalationBadge({ call, className }: { call: Pick<Call, "flag" | "escalation_resolved">; className?: string }) {
  if (call.flag === "escalate") {
    return call.escalation_resolved
      ? <Badge tone="gray">Escalation resolved</Badge>
      : <span className={clsx("inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white", className)}><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />Escalated</span>;
  }
  if (call.flag === "good") return <Badge tone="green">Good</Badge>;
  if (call.flag === "invalid") return <Badge tone="amber">Invalid</Badge>;
  return <Badge tone="gray">No flag</Badge>;
}
