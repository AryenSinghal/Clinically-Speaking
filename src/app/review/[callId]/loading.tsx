import { Card, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-2"><Skeleton className="h-8 w-72" /><Skeleton className="h-4 w-96 max-w-full" /></div>
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid gap-5 lg:grid-cols-[5fr_6fr]">
        <div className="space-y-3"><Card><Skeleton className="h-16 w-full" /></Card><Card><div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-3/4" />)}</div></Card></div>
        <Card><div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div></Card>
      </div>
    </main>
  );
}
