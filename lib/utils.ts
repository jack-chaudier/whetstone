export function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function sessionDate(iso: string): string {
  return localDate(new Date(iso));
}

export function shiftDate(days: number, from = new Date()): string {
  const date = new Date(from);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function weekdayForDate(date: string): number {
  return new Date(`${date}T12:00:00`).getDay();
}

export function uid(prefix: string): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

export function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Morning. The work is where you left it.';
  if (hour < 18) return 'Afternoon. One clear edge is enough.';
  return 'Evening. Nothing heroic is required.';
}
