import React from 'react';

export interface ToastItem {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'cyan';
  icon?: string;
}

export interface ToastContextValue {
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'cyan', icon?: string) => void;
}

export const ToastContext = React.createContext<ToastContextValue>({
  showToast: () => {},
});

export const useToast = () => React.useContext(ToastContext);

export const ToastContainer: React.FC<{ toasts: ToastItem[]; onDismiss: (id: string) => void }> = ({
  toasts,
  onDismiss,
}) => {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2 pointer-events-none">
      {toasts.map((toast) => {
        let colorClasses = 'bg-dark-card border-brand-500/50 text-brand-300';
        let defaultIcon = 'fa-circle-info';
        if (toast.type === 'success') {
          colorClasses = 'bg-dark-card border-accent-emerald/50 text-accent-emerald';
          defaultIcon = 'fa-circle-check';
        } else if (toast.type === 'warning') {
          colorClasses = 'bg-dark-card border-accent-amber/50 text-accent-amber';
          defaultIcon = 'fa-triangle-exclamation';
        } else if (toast.type === 'cyan') {
          colorClasses = 'bg-dark-card border-accent-cyan/50 text-accent-cyan';
          defaultIcon = 'fa-bolt';
        }

        return (
          <div
            key={toast.id}
            onClick={() => onDismiss(toast.id)}
            className={`pointer-events-auto cursor-pointer px-4 py-2.5 rounded-xl border text-xs font-semibold shadow-2xl flex items-center gap-2.5 glass-panel transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${colorClasses}`}
          >
            <i className={`fa-solid ${toast.icon || defaultIcon} text-sm`}></i>
            <span>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
};
