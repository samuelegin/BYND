import { useLocation } from "react-router-dom";
import { Github, MessageCircle, Send, Twitter } from "lucide-react";
import { Logo } from "@/components/ui";

const FOOT_LINKS = [
  { label: "Terminal", href: "/terminal" },
  { label: "Keeper", href: "/keeper" },
  { label: "Analytics", href: "/analytics" },
  { label: "Docs", href: "https://docs.mezo.org" },
  { label: "Explorer", href: "https://explorer.test.mezo.org" },
  { label: "Mezo Swap", href: "https://app.mezo.org" },
];

const SOCIALS = [
  { icon: Github, href: "https://github.com", label: "GitHub" },
  { icon: Twitter, href: "https://twitter.com", label: "Twitter" },
  { icon: Send, href: "https://t.me", label: "Telegram" },
  { icon: MessageCircle, href: "https://discord.com", label: "Discord" },
];

export function Footer() {
  const location = useLocation();
  const isHome = location.pathname === "/";

  if (isHome) {
    return (
      <footer className="border-t border-white/[.08] py-16">
        <div className="mx-auto flex max-w-[1120px] flex-col items-center gap-[30px] px-5 text-center">
          <Logo />

          <nav
            className="flex flex-wrap items-center justify-center gap-x-[30px] gap-y-3.5"
            aria-label="Footer"
          >
            {FOOT_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target={l.href.startsWith("http") ? "_blank" : undefined}
                rel={
                  l.href.startsWith("http") ? "noopener noreferrer" : undefined
                }
                className="text-sm text-white/60 transition-colors hover:text-white/[.87]"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            {SOCIALS.map((s) => {
              const Icon = s.icon;
              return (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white/[.08] text-white/60 transition-colors hover:bg-gold hover:text-gold-ink"
                >
                  <Icon size={16} />
                </a>
              );
            })}
          </div>

          <p className="text-[13px] text-white/[.38]">
            © 2026 Bynd Protocol. Liquid governance for Mezo.
          </p>
        </div>
      </footer>
    );
  }

  return (
    <footer className="mb-8 mt-32 border-t border-void-border">
      <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div className="space-y-1">
          <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-void-muted font-bold">
            BYND Protocol // Liquid Governance for Mezo
          </p>
          <p className="font-mono text-[8px] text-void-muted">
            Turn locked veMEZO into liquid veBYND and earn MUSD rewards
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-6 font-mono text-[8px] text-void-muted uppercase tracking-widest">
            <a
              href="https://docs.mezo.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-silver transition-colors"
            >
              Docs
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-silver transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://explorer.test.mezo.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-silver transition-colors"
            >
              Explorer
            </a>
            <a
              href="https://app.mezo.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-silver transition-colors"
            >
              Mezo Swap
            </a>
          </div>
          <p className="font-mono text-[7px] text-void-muted">
            veBYND/MEZO liquidity pool seeded at launch · Market-based exit via
            secondary liquidity
          </p>
        </div>
      </div>
    </footer>
  );
}
