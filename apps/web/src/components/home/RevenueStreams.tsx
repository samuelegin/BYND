import { REVENUE_STREAMS } from "./data";

export function RevenueStreams() {
  return (
    <section className="border-t border-void-border bg-void-soft">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-24">
        <div className="mb-12">
          <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-acid font-bold">
            Revenue
          </span>
          <h2 className="text-4xl font-black text-silver mt-2 leading-none">
            Three revenue streams.
            <br />
            <span className="text-acid">All flow to veBYND stakers.</span>
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {REVENUE_STREAMS.map((r, i) => {
            const Icon = r.icon;
            return (
              <div
                key={i}
                className="border border-void-border p-6 clip-corner hover:border-acid/20 transition-colors space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 border border-acid/30 bg-acid/5 flex items-center justify-center">
                    <Icon size={18} strokeWidth={1.5} className="text-acid" />
                  </div>
                  <span className="font-mono text-[7px] uppercase tracking-widest text-acid border border-acid/30 px-2 py-0.5">
                    {r.tag}
                  </span>
                </div>
                <h3 className="font-mono text-[11px] font-black text-silver uppercase tracking-wider">
                  {r.title}
                </h3>
                <p className="font-mono text-[9px] text-silver-dim leading-relaxed">
                  {r.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
