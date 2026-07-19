import routingEngine from '../../../assets/routing-engine.svg?raw';

export function RoutingDiagram() {
  return (
    <div
      className="relative rounded-panel border border-white/[.08] bg-surface-1 px-4 py-4 shadow-[0_24px_60px_rgba(0,0,0,.35)] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: routingEngine }}
    />
  );
}
