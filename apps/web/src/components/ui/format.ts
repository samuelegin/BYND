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

export const shortAddr = (addr: string | undefined, chars = 4): string => {
  if (!addr) return '–';
  if (addr.length <= 2 + chars * 2) return addr;
  return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
};

// Bribe amounts, already decimal-scaled by the token's own decimals() before
// they reach here. Two fixed digits is wrong for these: bribe tokens span
// 18dp stablecoins and 8dp BTC-denominated ones, so a real 0.00042 BTC bribe
// would render as "0.00" and read as nothing. Show enough significant digits
// that a small-unit amount stays visible, without a wall of zeroes on a
// round MUSD figure.
export const formatBribe = (amount: string): string => {
  const num = parseFloat(amount);
  if (isNaN(num)) return '–';
  if (num === 0) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000)     return `${(num / 1_000).toFixed(2)}K`;
  if (num >= 1)         return num.toFixed(2);
  // Sub-1 amounts keep 4 significant digits, so 0.00042 stays 0.00042.
  return num.toPrecision(4).replace(/\.?0+$/, '');
};
