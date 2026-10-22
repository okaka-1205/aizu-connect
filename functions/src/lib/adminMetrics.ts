export const percentage = (value: number, total: number) =>
  total > 0 ? Math.round((value / total) * 1_000) / 10 : 0;

export const utcDateKey = (date: Date) => date.toISOString().slice(0, 10);

export const recentUtcDateKeys = (days: number, now = new Date()) =>
  Array.from({length: Math.max(0, days)}, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - index);
    return utcDateKey(date);
  });
