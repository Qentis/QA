import type { Priority } from '../types';

export const PRIORITY_META: Record<
  Priority,
  { label: string; shortLabel: string; textColor: string; dotColor: string }
> = {
  low: {
    label: 'Низкий',
    shortLabel: 'Low',
    textColor: 'text-zinc-400',
    dotColor: 'bg-zinc-400',
  },
  normal: {
    label: 'Обычный',
    shortLabel: 'Normal',
    textColor: 'text-blue-400',
    dotColor: 'bg-blue-400',
  },
  high: {
    label: 'Высокий',
    shortLabel: 'High',
    textColor: 'text-amber-400',
    dotColor: 'bg-amber-400',
  },
  urgent: {
    label: 'Срочный',
    shortLabel: 'Urgent',
    textColor: 'text-red-400',
    dotColor: 'bg-red-400',
  },
};

export function formatShortDateTime(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const time = date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) {
    return `сегодня, ${time}`;
  }

  return `${date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  })}, ${time}`;
}

export function isSafeHttpUrl(raw?: string): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
