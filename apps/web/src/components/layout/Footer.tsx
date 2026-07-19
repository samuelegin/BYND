import { useLocation } from "react-router-dom";
import { Logo } from "@/components/ui";
import { DiscordIcon, TelegramIcon, XIcon } from "@/components/ui/BrandIcons";

const FOOT_LINKS = [
  { label: "Terminal", href: "/terminal" },
  { label: "Keeper", href: "/keeper" },
  { label: "Analytics", href: "/analytics" },
  { label: "Docs", href: "https://docs.mezo.org" },
  { label: "Explorer", href: "https://explorer.test.mezo.org" },
  { label: "Mezo Swap", href: "https://app.mezo.org" },
];

const SOCIALS = [
  { icon: XIcon, href: "https://x.com", label: "X" },
  { icon: TelegramIcon, href: "https://t.me", label: "Telegram" },
  { icon: DiscordIcon, href: "https://discord.com", label: "Discord" },
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
      <div className="max-w-[1120px] mx-auto px-5 py-12 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div className="flex items-center gap-3">
          <Logo markOnly height={20} />
          <div className="space-y-0.5">
            <p className="text-sm text-white/60">
              Bynd protocol · Liquid governance for Mezo
            </p>
            <p className="text-xs text-white/[.38]">
              Turn locked veMEZO into liquid veBYND and earn MUSD rewards
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-2">
          <div className="flex items-center gap-6 text-sm text-white/60">
            <a
              href="https://docs.mezo.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/[.87] transition-colors"
            >
              Docs
            </a>
            <a
              href="https://explorer.test.mezo.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/[.87] transition-colors"
            >
              Explorer
            </a>
            <a
              href="https://app.mezo.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/[.87] transition-colors"
            >
              Mezo Swap
            </a>
          </div>
          <p className="text-xs text-white/[.38]">
            veBYND/MEZO liquidity pool seeded at launch · market-based exit via
            secondary liquidity
          </p>
        </div>
      </div>
    </footer>
  );
}
