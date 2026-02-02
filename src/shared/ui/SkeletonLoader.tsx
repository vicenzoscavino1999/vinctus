import type { ComponentType } from 'react';

type SkeletonContentGridProps = {
  count?: number;
};

type SkeletonLineProps = {
  width?: string;
};

type EmptyStateProps = {
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  message: string;
};

type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
};

// Skeleton Loader Components
export const SkeletonCard = () => (
  <div className="skeleton-card">
    <div className="flex items-center gap-3 mb-4">
      <div className="skeleton-avatar" />
      <div className="flex-1">
        <div className="skeleton-text w-1/2" />
        <div className="skeleton-text w-1/3" />
      </div>
    </div>
    <div className="skeleton h-4 mb-3" />
    <div className="skeleton h-4 mb-3" />
    <div className="skeleton h-4 w-2/3" />
  </div>
);

export const SkeletonContentGrid = ({ count = 4 }: SkeletonContentGridProps) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-premium">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);

export const SkeletonLine = ({ width = '100%' }: SkeletonLineProps) => (
  <div className="skeleton-text" style={{ width }} />
);

// Empty State Component
export const EmptyState = ({ icon: Icon, title, message }: EmptyStateProps) => (
  <div className="empty-state">
    {Icon && (
      <div className="empty-state-icon">
        <Icon size={48} strokeWidth={0.5} />
      </div>
    )}
    <h3 className="text-lg font-light text-neutral-400 mb-2">{title}</h3>
    <p className="text-sm text-neutral-600 max-w-sm">{message}</p>
  </div>
);

// Error State Component
export const ErrorState = ({ message, onRetry }: ErrorStateProps) => (
  <div className="error-state">
    <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
      <span className="text-red-400 text-xl">!</span>
    </div>
    <h3 className="text-lg font-light text-neutral-400 mb-2">Algo salió mal</h3>
    <p className="text-sm text-neutral-600 mb-4">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="text-xs uppercase tracking-widest text-white bg-neutral-800 px-4 py-2 rounded hover:bg-neutral-700 transition-colors btn-premium"
      >
        Reintentar
      </button>
    )}
  </div>
);
