'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import { Button, LiveDot, Badge } from '@/components/ui';
import { useWallet } from '@/hooks/useWallet';

const NAV_LINKS = [
  { href: '/',          label: 'Home'      },
  { href: '/terminal',  label: 'Terminal'  },
  { href: '/keeper',    label: 'Keeper'    },
  { href: '/analytics', label: 'Analytics' },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const {
    isConnected, isConnecting, address,
    btcAddress, networkFamily,
    chainId,
    isCorrectNetwork, isSwitching,
    connect, disconnect, switchToMatsnet,
    formatAddress,
  } = useWallet();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-void-border bg-void/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <img src="/logo.svg" alt="BYND logo" className="w-7 h-7" />
            <span className="font-mono text-[11px] uppercase tracking-[0.3em] font-black text-silver group-hover:text-acid transition-colors">
              BYND
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  'font-mono text-[9px] uppercase tracking-widest px-4 py-2 transition-colors',
                  pathname === link.href
                    ? 'text-acid border-b border-acid'
                    : 'text-silver-dim hover:text-silver'
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right: network badge + wallet button */}
          <div className="hidden md:flex items-center gap-3">

            {/* Network badge */}
            {isConnected && (
              isCorrectNetwork ? (
                <div className="flex items-center gap-2 px-3 py-1.5 border border-void-border bg-void">
                  <LiveDot active={true} />
                  <span className="font-mono text-[8px] uppercase tracking-widest text-silver-dim">
                    {chainId === 31337 ? 'Hardhat Local' : 'Matsnet'}
                  </span>
                </div>
              ) : (
                <button
                  onClick={switchToMatsnet}
                  disabled={isSwitching}
                  className="flex items-center gap-2 px-3 py-1.5 border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  <LiveDot active={false} />
                  <span className="font-mono text-[8px] uppercase tracking-widest text-red-400 font-bold">
                    {isSwitching ? 'Switching…' : 'Switch to Matsnet'}
                  </span>
                </button>
              )
            )}

            {/* Wallet button */}
            {isConnected ? (
              <div className="flex items-center gap-2">
                {/* Show BTC address if bitcoin wallet, EVM address otherwise */}
                <div className="flex flex-col items-end">
                  <span className="font-mono text-[9px] font-black text-silver">
                    {formatAddress(address)}
                  </span>
                  {btcAddress && networkFamily === 'bitcoin' && (
                    <span className="font-mono text-[7px] text-silver-dim">
                      BTC: {formatAddress(btcAddress)}
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={disconnect}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={connect}
                isLoading={isConnecting}
              >
                Connect Passport
              </Button>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-silver-dim hover:text-silver transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-void-border bg-void-soft">
          <div className="px-6 py-4 space-y-1">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  'block font-mono text-[9px] uppercase tracking-widest px-3 py-3 transition-colors',
                  pathname === link.href ? 'text-acid' : 'text-silver-dim hover:text-silver'
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 border-t border-void-border">
              {isConnected ? (
                <Button variant="ghost" size="sm" fullWidth onClick={disconnect}>
                  Disconnect ({formatAddress(address)})
                </Button>
              ) : (
                <Button variant="primary" size="sm" fullWidth onClick={connect} isLoading={isConnecting}>
                  Connect Mezo Passport
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
