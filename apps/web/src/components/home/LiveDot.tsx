export function LiveDot({ size = 7 }: { size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="absolute inset-0 animate-[bynd-ping_1.9s_cubic-bezier(0,0,.2,1)_infinite] rounded-full bg-gold opacity-70"
      />
      <span className="relative inline-flex rounded-full bg-gold" style={{ width: size, height: size }} />
    </span>
  );
}
