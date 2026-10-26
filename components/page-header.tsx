import type { ReactNode } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

export function PageHeader({ title, description, actions, meta }: {
  title: string; description?: string; actions?: ReactNode; meta?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">{meta}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, description, action, icon }: {
  title: string; description?: string; action?: ReactNode; icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <span className="mb-3 inline-flex text-muted" aria-hidden="true">{icon}</span>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mx-auto mt-1.5 max-w-sm text-xs leading-6 text-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function PageLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="正在加载内容" aria-busy="true" className="space-y-3 py-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-14 rounded-xl border border-line bg-surface" aria-hidden="true">
          <div className="ml-4 mt-4 h-2.5 w-2/5 rounded bg-line" />
        </div>
      ))}
      <span className="sr-only">正在加载内容</span>
    </div>
  );
}

export function PageError({ message, onRetry }: { message: string; onRetry?: () => void | Promise<void> }) {
  return (
    <div role="alert" className="page-error">
      <AlertCircle size={17} className="shrink-0 text-danger" aria-hidden="true" />
      <p className="min-w-0 flex-1 break-words text-sm leading-6">{message}</p>
      {onRetry && <button type="button" onClick={onRetry} className="btn-ghost"><RotateCcw size={14} />重试</button>}
    </div>
  );
}
