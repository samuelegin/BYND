import { useId } from 'react';

export function RoutingDiagram() {
  const gradId = useId();

  return (
    <div className="relative rounded-panel border border-white/[.08] bg-surface-1 px-4 py-4 shadow-[0_24px_60px_rgba(0,0,0,.35)]">
      <svg
        className="block h-auto w-full"
        viewBox="0 0 520 430"
        role="img"
        aria-label="Fragmented locked veMEZO converges into an aggregated boost block, which routes to the highest-yielding gauges and mints liquid veBYND."
      >
        <defs>
          <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="258" y1="200" x2="258" y2="150">
            <stop offset="0" stopColor="#B78A3F" />
            <stop offset="1" stopColor="#F0C983" />
          </linearGradient>
        </defs>

        <text x="66" y="40" textAnchor="middle" className="fill-white/[.38] font-mono text-[11px] tracking-[.08em]">veMEZO</text>
        <text x="442" y="52" textAnchor="middle" className="fill-white/[.38] font-mono text-[11px] tracking-[.08em]">gauges</text>

        <g fill="none" stroke="#E5B567" strokeWidth="1.4" opacity=".5">
          <path className="bynd-flow" d="M92,78  C150,78  150,180 200,180" />
          <path className="bynd-flow f2" d="M92,148 C150,148 160,180 200,180" />
          <path className="bynd-flow f3" d="M92,218 C150,218 160,180 200,180" />
          <path className="bynd-flow f4" d="M92,288 C150,288 150,180 200,180" />
        </g>

        <g fill="#242426" stroke="rgba(255,255,255,.14)" strokeWidth="1" strokeDasharray="3 3">
          <rect x="46" y="64" width="40" height="28" rx="8" />
          <rect x="46" y="134" width="40" height="28" rx="8" />
          <rect x="46" y="204" width="40" height="28" rx="8" />
          <rect x="46" y="274" width="40" height="28" rx="8" />
        </g>

        <g fill="none" stroke="#E5B567" strokeWidth="1.7" opacity=".7">
          <path className="bynd-flow" d="M316,180 C360,180 360,96  396,96" />
          <path className="bynd-flow f2" d="M316,180 L396,180" />
          <path className="bynd-flow f3" d="M316,180 C360,180 360,264 396,264" />
        </g>
        <path className="bynd-flow f2" d="M258,226 L258,344" fill="none" stroke="#E5B567" strokeWidth="1.7" opacity=".7" />

        <rect x="200" y="134" width="116" height="92" rx="18" fill="#242426" stroke="#E5B567" strokeOpacity=".4" />
        <g fill="none" stroke={`url(#${gradId})`} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M258,198 L258,176" />
          <path d="M258,176 L244,158" />
          <path d="M258,176 L272,158" />
        </g>
        <circle cx="244" cy="158" r="3.2" fill="#F0C983" />
        <circle cx="272" cy="158" r="3.2" fill="#F0C983" />
        <text x="258" y="216" textAnchor="middle" className="fill-gold font-mono text-[11px] tracking-[.03em]">boost block</text>

        <g fill="#242426" stroke="rgba(255,255,255,.10)" strokeWidth="1">
          <rect x="396" y="76" width="92" height="40" rx="12" />
          <rect x="396" y="160" width="92" height="40" rx="12" />
          <rect x="396" y="244" width="92" height="40" rx="12" />
        </g>
        <text x="442" y="101" textAnchor="middle" className="fill-gold font-mono text-sm font-medium">31.4%</text>
        <text x="442" y="185" textAnchor="middle" className="fill-gold font-mono text-sm font-medium">24.8%</text>
        <text x="442" y="269" textAnchor="middle" className="fill-gold font-mono text-sm font-medium">18.2%</text>

        <rect x="198" y="344" width="120" height="42" rx="13" fill="#E5B567" />
        <text x="258" y="370" textAnchor="middle" className="fill-[#2A1E08] font-mono text-[15px] font-semibold tracking-[.02em]">veBYND</text>
      </svg>
    </div>
  );
}
