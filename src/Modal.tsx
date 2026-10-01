import { useEffect, useRef, useId, type ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
  busy,
  active = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy: boolean;
  active?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    (
      (lastFocus.current?.isConnected ? lastFocus.current : null) ??
      dialog.querySelector<HTMLElement>("[data-autofocus]") ??
      dialog.querySelector<HTMLElement>("input, select, textarea")
    )?.focus();
    return () => {
      if (dialog.contains(document.activeElement)) {
        lastFocus.current = document.activeElement as HTMLElement;
      }
      dialog.close();
      previous?.focus();
    };
  }, [active]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
          disabled={busy}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
