const STATS = [
  { label: "Network", value: "Mezo", delta: "Bitcoin L2" },
  { label: "veBYND Staker APR", value: "Live", delta: "Read from chain" },
  { label: "Boost Efficiency", value: "98%", delta: "Target optimisation" },
  { label: "Bribe Tokens", value: "Any", delta: "Multi-ERC-20 harvest" },
];

export function StatsBar() {
  return (
    <section className="border-y border-void-border bg-void-soft">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-void-border">
          {STATS.map((s, i) => (
            <div key={i} className="px-8 py-8">
              <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim font-bold mb-2">
                {s.label}
              </p>
              <p className="text-3xl font-black text-silver">{s.value}</p>
              <p className="font-mono text-[8px] text-acid mt-1">{s.delta}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
