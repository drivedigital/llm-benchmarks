import { useId, type ReactNode } from "react";
import { X } from "lucide-react";

export default function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      />
      <div
        className={`relative flex max-h-[85vh] w-full ${wide ? "max-w-3xl" : "max-w-lg"} flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0e1a] shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2
            id={titleId}
            className="flex items-center gap-2 text-base font-semibold text-white"
          >
            {icon}
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
