// components/ui/DataCard.tsx
import Card from "./Card";

export default function DataCard({
  title, loading, error, empty, children, right
}: {
  title: string;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {right}
      </div>
      {error && <div className="text-sm text-destructive">{error}</div>}
      {loading && !error && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!loading && !error && empty && <div className="text-sm text-muted-foreground">No data.</div>}
      {!loading && !error && !empty && children}
    </Card>
  );
}