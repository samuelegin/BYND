import React, { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { getAddresses, isDeployed, MATSNET_CHAIN_ID } from '@/lib/contracts';

const EXPLORER = 'https://explorer.test.mezo.org/address/';

const ROWS: { key: keyof ReturnType<typeof getAddresses>; label: string; note: string }[] = [
  { key: 'ByNdVault',   label: 'ByNdVault',   note: 'Custody + deposit/mint entrypoint' },
  { key: 'ByNdVoter',   label: 'ByNdVoter',   note: 'Voting, harvest & distribute' },
  { key: 'ByNdStaking', label: 'ByNdStaking', note: 'Stake veBYND, claim rewards' },
  { key: 'VeBYND',      label: 'VeBYND',      note: 'Liquid ERC-20 receipt token' },
  { key: 'VeMEZO',      label: 'VeMEZO',      note: 'External — Mezo\'s vote-escrow NFT' },
];

function AddressRow({ label, note, address }: { label: string; note: string; address: string }) {
  const [copied, setCopied] = useState(false);
  const deployed = isDeployed(address);

  const handleCopy = async () => {
    if (!deployed) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="font-mono text-sm text-white/[.87]">{label}</p>
        <p className="mt-0.5 text-xs text-white/[.38]">{note}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="font-mono text-[12.5px] text-white/60">
          {deployed ? address : 'Not deployed in this build'}
        </span>
        {deployed && (
          <>
            <button
              onClick={handleCopy}
              aria-label="Copy address"
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/[.38] transition-colors hover:bg-white/[.06] hover:text-white/[.87]"
            >
              {copied ? <Check size={13} className="text-gold" /> : <Copy size={13} />}
            </button>
            <a
              href={`${EXPLORER}${address}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View on explorer"
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/[.38] transition-colors hover:bg-white/[.06] hover:text-white/[.87]"
            >
              <ExternalLink size={13} />
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export function ContractsTable() {
  const addrs = getAddresses(MATSNET_CHAIN_ID);
  return (
    <div className="rounded-control border border-void-border bg-bg divide-y divide-void-border">
      {ROWS.map((row) => (
        <AddressRow key={row.key} label={row.label} note={row.note} address={addrs[row.key]} />
      ))}
    </div>
  );
}
