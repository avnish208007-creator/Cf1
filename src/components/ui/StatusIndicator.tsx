import React from 'react';

interface StatusIndicatorProps {
  status: string;
  variant?: 'neutral' | 'success' | 'warning' | 'error' | 'info';
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  variant = 'neutral',
  className = '',
}) => {
  const dotColors = {
    neutral: 'bg-zinc-400',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-rose-500',
    info: 'bg-indigo-500',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
      <span>{status}</span>
    </span>
  );
};
