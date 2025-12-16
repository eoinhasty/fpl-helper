// components/ui/Badge.tsx
export default function Badge({ className = "", children, title }: { className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center px-2 py-0.5 rounded-full border border-border bg-card text-xs ${className}`}>
      {children}
    </span>
  );
}