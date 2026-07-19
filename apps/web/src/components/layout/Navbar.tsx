import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import { Logo } from '@/components/ui';
import { useWallet } from '@/hooks/useWallet';

const NAV_LINKS = [
  { href: '/',          label: 'Home'      },
  { href: '/terminal',  label: 'Terminal'  },
  { href: '/keeper',    label: 'Keeper'    },
  { href: '/analytics', label: 'Analytics' },
];

export function Navbar() {
  const location = useLocation();
  const pathname = location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);

  const headerRef = useRef<HTMLElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 });
  const [glow, setGlow] = useState({ x: 0, y: 0, opacity: 0 });

  const {
    isConnected, isConnecting, address,
    btcAddress,
    isCorrectNetwork, isSwitching,
    connect, disconnect, switchToMatsnet,
    formatAddress,
  } = useWallet();

  function moveTo(key: string) {
    const el = linkRefs.current[key];
    if (!el) return;
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth, opacity: 1 });
  }

  useEffect(() => {
    moveTo(pathname);
    const onResize = () => moveTo(pathname);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const cap = capRef.current;
    if (!cap) return;
    const onMove = (e: MouseEvent) => {
      const r = cap.getBoundingClientRect();
      setGlow({ x: e.clientX - r.left, y: e.clientY - r.top, opacity: 1 });
    };
    const onLeave = () => setGlow((g) => ({ ...g, opacity: 0 }));
    cap.addEventListener('mousemove', onMove);
    cap.addEventListener('mouseleave', onLeave);
    return () => {
      cap.removeEventListener('mousemove', onMove);
      cap.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [mobileOpen]);

  return (
    <header ref={headerRef} className="fixed top-5 left-0 right-0 z-50 px-5">
      <nav
        ref={capRef}
        className="relative mx-auto flex max-w-[1080px] items-center justify-between gap-3.5 rounded-full border border-white/[.08] bg-[#1a1a1d]/55 py-2 pl-5 pr-2 backdrop-blur-[14px] backdrop-saturate-[1.3] shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_12px_34px_rgba(0,0,0,.45)]"
        aria-label="Primary"
      >
        <span
          className="pointer-events-none absolute top-0 z-0 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-300"
          style={{
            background: 'radial-gradient(circle, rgba(229,181,103,.11), transparent 70%)',
            left: glow.x,
            top: glow.y,
            opacity: glow.opacity,
          }}
          aria-hidden="true"
        />

        <Link to="/" className="relative z-10 flex shrink-0 items-center" aria-label="Bynd home">
          <Logo />
        </Link>

        <div ref={linksRef} className="relative z-10 hidden min-[721px]:flex gap-0.5">
          <span
            className="pointer-events-none absolute top-0 h-full rounded-full bg-white/[.06] transition-[left,width,opacity] duration-[.34s] ease-[cubic-bezier(.4,0,.2,1)]"
            style={{ left: indicator.left, width: indicator.width, opacity: indicator.opacity }}
            aria-hidden="true"
          />
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              ref={(el) => { linkRefs.current[link.href] = el; }}
              to={link.href}
              onMouseEnter={() => moveTo(link.href)}
              onMouseLeave={() => moveTo(pathname)}
              className={clsx(
                'relative z-[1] rounded-full px-4 py-2.5 text-sm transition-colors',
                pathname === link.href ? 'text-gold' : 'text-white/60 hover:text-white/90'
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="relative z-10 hidden min-[721px]:flex shrink-0 items-center gap-2">
          {isConnected && (
            isCorrectNetwork ? (
              <div className="flex items-center gap-2 rounded-full border border-white/[.08] bg-surface-1 px-3 py-1.5">
                <LiveDot />
                <span className="font-mono text-[10px] uppercase tracking-widest text-white/60">Matsnet</span>
              </div>
            ) : (
              <button
                onClick={switchToMatsnet}
                disabled={isSwitching}
                className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
              >
                {isSwitching ? 'Switching…' : 'Switch to Matsnet'}
              </button>
            )
          )}

          {isConnected ? (
            <div className="flex items-center gap-2">
              <div className="hidden flex-col items-end lg:flex">
                <span className="font-mono text-[12px] text-white/[.87]">{formatAddress(address)}</span>
                {btcAddress && <span className="font-mono text-[10px] text-white/60">BTC: {formatAddress(btcAddress)}</span>}
              </div>
              <button
                onClick={() => disconnect()}
                className="rounded-full border border-white/[.12] px-4 py-2 text-sm text-white/[.87] transition-colors hover:bg-surface-1"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => connect()}
              disabled={isConnecting}
              className="inline-flex items-center gap-1.5 rounded-full bg-gold px-[18px] py-2.5 text-sm font-semibold text-gold-ink transition-[transform,background] duration-200 hover:-translate-y-px hover:bg-gold-bright disabled:opacity-50"
            >
              {isConnecting ? 'Connecting…' : 'Connect passport'}
              <ArrowRight size={15} />
            </button>
          )}
        </div>

        <button
          className="relative z-10 flex h-[42px] w-[42px] items-center justify-center rounded-full border border-white/[.08] bg-white/[.05] text-white/[.87] min-[721px]:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-sheet"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      <div
        id="mobile-sheet"
        className="mx-auto max-w-[1080px] overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: mobileOpen ? 420 : 0 }}
      >
        <div className="mt-2.5 rounded-[20px] border border-white/[.08] bg-[#1a1a1d]/72 p-2 backdrop-blur-[14px]">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              onClick={() => setMobileOpen(false)}
              className={clsx(
                'block rounded-xl px-4 py-3 text-[15px] transition-colors',
                pathname === link.href ? 'text-gold' : 'text-white/60 hover:bg-white/5 hover:text-white/[.87]'
              )}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 border-t border-white/[.08] pt-3 px-1">
            {isConnected ? (
              <button
                onClick={() => disconnect()}
                className="w-full rounded-xl border border-white/[.12] px-4 py-2.5 text-center text-sm text-white/[.87] transition-colors hover:bg-surface-1"
              >
                Disconnect ({formatAddress(address)})
              </button>
            ) : (
              <button
                onClick={() => connect()}
                disabled={isConnecting}
                className="w-full rounded-xl bg-gold px-4 py-2.5 text-center text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-50"
              >
                {isConnecting ? 'Connecting…' : 'Connect Mezo passport'}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-[7px] w-[7px]">
      <span className="absolute inline-flex h-full w-full animate-[bynd-ping_1.9s_cubic-bezier(0,0,.2,1)_infinite] rounded-full bg-gold opacity-70" />
      <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-gold" />
    </span>
  );
}
