// components/ui/Modal.tsx
export default function Modal({
  open, onClose, children, className = ""
}: { open: boolean; onClose: () => void; children: React.ReactNode; className?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`absolute left-1/2 top-10 -translate-x-1/2 rounded-2xl bg-card text-foreground shadow-card border border-border ${className}`}
        role="dialog" aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}