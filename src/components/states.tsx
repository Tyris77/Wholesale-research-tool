interface LoadingProps { label?: string }
export function Loading({ label = 'Loading…' }: LoadingProps) {
  return (
    <div className="state-block loading-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

interface ErrorBannerProps { message: string; onRetry?: () => void }
export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="error-banner" role="alert">
      <span>⚠️ {message}</span>
      {onRetry && (
        <button type="button" className="ghost-button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

interface EmptyProps { message: string }
export function Empty({ message }: EmptyProps) {
  return <div className="state-block empty-state">{message}</div>;
}
