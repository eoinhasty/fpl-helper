// components/ui/DataCard.tsx
import Card from "./Card";
import { Skeleton } from "./Skeleton";

export default function DataCard({
  title,
  loading,
  error,
  empty,
  emptyMessage,
  children,
  right,
  notice,
  loadingContent,
}: {
  title: string;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: React.ReactNode;
  right?: React.ReactNode;
  /** Shown under the title in every state, unlike children */
  notice?: React.ReactNode;
  /** Replaces the generic skeleton, for cards whose content has a distinct shape */
  loadingContent?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {right}
      </div>
      {notice}
      {error && <div className="text-sm text-destructive">{error}</div>}
      {loading &&
        !error &&
        (loadingContent ?? (
          <div className="mt-1 space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      {!loading && !error && empty && <div className="text-sm text-muted-foreground">{emptyMessage ?? "No data."}</div>}
      {!loading && !error && !empty && children}
    </Card>
  );
}
