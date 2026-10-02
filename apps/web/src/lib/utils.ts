import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimeAgo(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput) return 'Recently';
  const date = new Date(dateInput);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

export function formatSalary(inrLpa: number | null | undefined): string {
  if (!inrLpa) return 'Undisclosed';
  return `₹${inrLpa} LPA eq`;
}
