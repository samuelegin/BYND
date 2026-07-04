import { STEPS } from "./data";

export function HowItWorks() {
  return (
    <section className="max-w-7xl mx-auto px-6 lg:px-8 py-32">
      <div className="mb-16">
        <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-acid font-bold">
          Protocol
        </span>
        <h2 className="text-5xl font-black text-silver mt-2 leading-none">
          How it works.
        </h2>
        <p className="text-silver-dim mt-4 max-w-xl">
          Three steps. One liquid position. Maximum boost yield without the
          lockup tradeoff.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {STEPS.map((step, i) => (
          <div
            key={i}
            className="group relative border border-void-border hover:border-acid/30 transition-all duration-300 clip-corner overflow-hidden"
          >
            {/* Visual block */}
            <div className="relative h-52 bg-void-soft border-b border-void-border flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 grid-bg opacity-40" />
              <img
                src={step.img}
                alt={step.title}
                className="relative z-10 h-full w-full object-cover"
              />
              <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-void-muted group-hover:border-acid/50 transition-colors" />
            </div>

            <div className="p-6 space-y-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[9px] text-acid font-black">
                  {step.num}
                </span>
                <div className="h-px flex-1 bg-void-border" />
              </div>
              <h3 className="text-xl font-black text-silver">{step.title}</h3>
              <p className="font-mono text-[10px] text-silver-dim leading-relaxed">
                {step.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
