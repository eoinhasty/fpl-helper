// components/squad/PendingPlayerModal.tsx
import * as React from "react";
import Modal from "../ui/Modal";

/** Stands in for PlayerDetailModal while a non-squad player is looked up in the pool */
export default function PendingPlayerModal({ onClose, status }: { onClose: () => void; status: string }) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="player-pending-title"
      widthClass="w-[min(32rem,94vw)]"
      initialFocusRef={closeRef}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div id="player-pending-title" className="text-sm text-muted-foreground" role="status">
          {status}
        </div>
        <button ref={closeRef} type="button" onClick={onClose} className="btn">
          Close
        </button>
      </div>
    </Modal>
  );
}
