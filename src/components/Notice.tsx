import { X } from "@phosphor-icons/react";

type NoticeVariant = "warning" | "info" | "success" | "error";

/* Single alert language: accent = attention, dashed = neutral info,
   hay green = success, nohay red = error. */
const VARIANT_CLS: Record<NoticeVariant, string> = {
  warning: "border-accent bg-card text-ink",
  info: "border-dashed border-line bg-card text-ink-soft",
  success: "border-hay-ink bg-hay-bg text-hay-ink",
  error: "border-nohay-ink bg-nohay-bg text-nohay-ink",
};

type NoticeProps = {
  variant?: NoticeVariant;
  onDismiss?: () => void;
  className?: string;
  children: React.ReactNode;
};

export default function Notice({
  variant = "info",
  onDismiss,
  className = "",
  children,
}: NoticeProps) {
  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-2 rounded-md border-2 px-3 py-2 ${VARIANT_CLS[variant]} ${className}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar aviso"
          className="shrink-0 font-bold"
        >
          <X size={14} weight="bold" aria-hidden />
        </button>
      )}
    </div>
  );
}
