export const formatNum = (n: string | number, decimals = 2): string => {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '–';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000)     return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(decimals);
};

export const formatTime = (seconds: number): string => {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
};

// Nigeria (WAT) has no DST and is a fixed UTC+1, but we use the IANA zone
// name rather than a hardcoded offset so this stays correct even if the
// runtime's tz data changes.
export const formatWAT = (unixSeconds: number): string => {
  if (!unixSeconds) return '–';
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(unixSeconds * 1000)) + ' WAT';
};
