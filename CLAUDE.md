# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BynD is a non-custodial boost coordination layer for Mezo. Users deposit veMEZO NFTs into a vault, which locks them permanently at 4yr max, routes aggregated boost power to the highest-yielding gauges each epoch, and mints liquid **veBYND** (ERC-20) 1:1 in return. veBYND can be staked for a share of gauge bribes (any ERC-20) and the auto-compounding veMEZO rebase, or sold on the secondary market for instant exit.

Repo is a **pnpm workspace + Turborepo monorepo**:
```
apps/web/            Vite + React frontend (@bynd/web)
packages/contracts/  Solidity + Hardhat (@bynd/contracts)
```

## Commands

Install once from repo root — pnpm hoists everything into a single store:
```bash
pnpm install
```

Root scripts fan out to both workspaces via Turborepo:
```bash
pnpm dev      # turbo run dev
pnpm build    # turbo run build
pnpm compile  # turbo run compile (contracts only)
pnpm test     # turbo run test
pnpm lint     # turbo run lint
```

Target a single workspace with `--filter`:
```bash
pnpm --filter @bynd/web dev
pnpm --filter @bynd/web build       # tsc && vite build
pnpm --filter @bynd/web lint        # eslint .
pnpm --filter @bynd/contracts test  # hardhat test
pnpm --filter @bynd/contracts compile
```

Run a single contract test file directly (from `packages/contracts`):
```bash
npx hardhat test test/ByNd.test.ts
```

### Local end-to-end dev loop (two terminals, from repo root)
```bash
# Terminal 1
pnpm --filter @bynd/contracts node          # hardhat node, forked from Mezo testnet RPC

# Terminal 2
pnpm --filter @bynd/contracts deploy:local
pnpm --filter @bynd/web sync-addresses      # writes deployed addresses into apps/web
pnpm --filter @bynd/web dev
```
Import Hardhat Account #0 into MetaMask (never use this key for real funds) and add the Hardhat Local network (RPC `http://127.0.0.1:8545`, chain ID `31337`). On chain ID `31337` only, the UI exposes a **Skip Epoch** button that fast-forwards the EVM clock so the epoch flow doesn't require waiting 7 real days.

### Matsnet (chain ID `31611`)
Frontend talks directly to the live contracts on Matsnet (addresses in the README / `apps/web/.env`). Redeploying is only needed if the contracts change:
```bash
pnpm --filter @bynd/contracts deploy:matsnet   # requires DEPLOYER_PRIVATE_KEY in packages/contracts/.env
```
After a redeploy, addresses must be pasted manually into `apps/web/.env` (see `apps/web/.env.example`) — `sync-addresses` only works against the local Hardhat deployment.

Gauge weighting before an epoch vote:
```bash
cd packages/contracts && pnpm hardhat run scripts/optimiseGauges.ts --network matsnet
```

## Architecture

### Contracts (`packages/contracts/contracts/`)

Four contracts, one epoch cycle:
- **`ByNdVault`** — custodies deposited veMEZO NFTs, mints `VeBYND` 1:1, keeps every position at max 4yr lock, runs `claimRebases()` (compounds Mezo's veMEZO rebase back into locked balance — no liquid payout, no epoch gate).
- **`VeBYND`** — the liquid ERC-20 receipt token.
- **`ByNdStaking`** — Synthetix-style multi-reward-token staking (any number of simultaneous ERC-20 reward tokens, not just MUSD). `claimAll()` claims everything in one tx.
- **`ByNdVoter`** — epoch executor: `extendLocks()` (once/epoch), `castVotes()` (routes boost to top-ROI gauges, opens ~4hrs before epoch end), `harvestAndDistribute()` (sweeps every bribe token from every gauge, pays 99% to stakers via `ByNdStaking.notifyRewardAmount`, 1% bounty to whoever called it).

All four epoch steps are permissionless — any wallet can call them; the caller of `harvestAndDistribute()` earns the bounty. `packages/contracts/scripts/deploy.ts` deploys all four and wires roles/distributor/RewardsDistributor together; `scripts/optimiseGauges.ts` ranks live gauges by `claimable / totalWeight` ROI and calls `setGauges()` with proportional weights. Mocks for local dev live in `contracts/mocks/` (`MockVeMEZO`, `MockERC20`, `MockValidatorsVoter`).

### Frontend (`apps/web/src/`)

React + Vite, wallet via **Mezo Passport** (`@mezo-org/passport`) wrapping wagmi v2 / viem / RainbowKit, targeting Mezo Matsnet only (`MATSNET_CHAIN_ID`, see `lib/passport.ts`). `lib/contracts.ts` centralizes contract addresses (from `VITE_MATSNET_*` env vars) and every ABI fragment used by the app — this is the file to touch when a contract's interface changes. `hooks/useWallet.ts` and `hooks/useProtocol.ts` wrap connection state and on-chain reads/writes respectively; components consume protocol data through these rather than calling wagmi directly.

Routing (`App.tsx`) is flat: `/` (Home), `/terminal` (deposit/stake/vote flows), `/analytics`, `/keeper`. Each route's UI lives under `components/<route-name>/` (`home/`, `terminal/`, `keeper/`, `analytics/`), with shared chrome in `components/layout/` (`Navbar`, `Footer`) and generic UI primitives in `components/ui/`. `components/modals/` holds the transaction modals (deposit/stake/unstake/withdraw/claim/harvest/cast-votes), each pairing a form with `TxBlock` for tx status.

`main.tsx` is the actual app entry — it wires `WagmiProvider` → `QueryClientProvider` → `PassportProvider` → `RainbowKitProvider` → `BrowserRouter` → `<App />`. **`App.tsx` is only meaningful when rendered through `main.tsx`**; don't add a second competing render tree in `main.tsx` — route/layout logic (including the `isHome` conditional that toggles the noise/scanline overlay and bottom ticker) belongs in `App.tsx`.

Brand SVGs (wordmark, mark, favicon, the routing-engine diagram) live in `apps/web/assets/` and are pulled into components via Vite `?raw` imports (see `components/ui/Logo.tsx`, `components/home/RoutingDiagram.tsx`) rather than duplicated as hand-drawn markup — don't delete that folder, it's a build-time dependency, not just reference material. `components/home/motion.ts` holds the canonical `framer-motion` reveal/stagger/viewport variants matching the design system's easing below; reuse them instead of inventing new ones.

Legacy Tailwind color tokens (`acid`, `void`, `silver`, etc., in `tailwind.config.cjs`) are aliased to the new gold/dark palette rather than removed, so pages not yet redesigned to the new system (Terminal/Analytics/Keeper) still render in the correct palette without a rewrite. New landing-page-style work should use the new token names (`bg`, `surface`, `gold`) directly.

## Frontend design system

Source of truth for all new frontend UI. A guide for building new pages in Bynd's dark, gold-accented identity. Follow this exactly so every page reads as one product. When a choice isn't covered here, prefer the quieter option and keep the accent scarce.

### What Bynd is (ground every page in this)

Bynd is a liquid wrapper for vote-escrowed MEZO. It **pools** fragmented, locked veMEZO into one permanent **aggregated boost block**, **routes** that boost to the highest-yielding gauges each epoch, and **mints** liquid **veBYND** — an ERC-20 claim you can stake, trade, or exit anytime.

The identity is built on one idea: **Bynd = beyond**, and the lowercase **y** is a *yield-routing fork*. Capital enters at the descender, forks at a junction, and branches out to gauge nodes. Reuse this "routing" metaphor everywhere: sliding indicators that *route* to what you point at, flows that travel toward a destination, sources that converge on veBYND.

Vocabulary is real and specific — use it precisely: `veMEZO`, `veBYND`, `MUSD`, `gauge`, `boost block`, `bribe`, `epoch`, `keeper`, `Mezo`, `Matsnet`.

### Color — dark theme (from Material dark-surface guidance)

Never pure black. Elevate by **lightening** the surface, not by adding shadow. One desaturated accent, used sparingly.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#121212` | Page / base surface |
| `surface-1` | `#1C1C1E` | Cards, navbar, panels (≈1dp) |
| `surface-2` | `#242426` | Nested / higher elevation, hovered cards |
| `gold` | `#E5B567` | The accent (see discipline rule) |
| `gold-bright` | `#F0C983` | Hover state of gold fills |
| `gold-deep` | `#B78A3F` | Low end of the gold gradient |
| `gold-ink` | `#2A1E08` | Text/icon **on** a gold fill |
| text high | `rgba(255,255,255,.87)` | Body / headings |
| text mid | `rgba(255,255,255,.60)` | Supporting copy |
| text disabled | `rgba(255,255,255,.38)` | Hints, captions, labels |
| hairline | `rgba(255,255,255,.08)` | Default borders / dividers |
| hairline-strong | `rgba(255,255,255,.12)` | Hover borders |

**Accent discipline (important).** Gold is the only chromatic color on the page. Spend it *only* on: numeric values (APR, %, TVL), the single primary CTA per view, the active state of nav/tabs, live indicators, the minted `veBYND` output, and the key routing flow lines. Everything else is white-on-dark at the three emphasis levels. If gold appears in more than a few places per screen, remove some.

Gradient (for the fork mark and mint accents), bottom→top: `#A9803A → #E5B567 → #F4D293`.

### Typography

Two families, two jobs. Weights: **400** and **500** for UI, **600** for display headings. Sentence case everywhere — never Title Case, never ALL CAPS except the small tracked mono labels below.

- **Space Grotesk** — display + body. Headings `clamp(28px,4vw,40px)` weight 600, letter-spacing `-.02em`. Body 15–17px, line-height ~1.6.
- **IBM Plex Mono** — data and system texture. Use it for: numeric values and percentages, token symbols (`veMEZO`, `veBYND`), function names (`vote()`, `harvest()`), and small eyebrow/tag labels (uppercase, `letter-spacing:.1–.14em`, 11px, `text-disabled`). This mono/display split is a core part of the look — a number in the display font reads wrong.

Load: `Space Grotesk 400;500;600` and `IBM Plex Mono 400;500`.

### Layout & spacing

- Content max-width **1120px**, navbar capsule max-width **1080px**, centered with 20px side padding.
- Section vertical rhythm: ~**100px** top padding per section; rely on spacing, not dividers, to separate sections. The footer is the only hairline-topped block.
- Radii: **12px** controls/buttons, **18px** cards, **20px** panels, **999px** pills.
- Borders are always `1px solid hairline`. On single-sided accents, set radius to 0.

### Motion

Two reveal systems, plus a few signature interactions. **Respect `prefers-reduced-motion` on everything** — reduced-motion users see final states with no animation.

- **Entrance reveal** (above the fold, on load): fade + 16px rise, staggered.
- **Scroll reveal** (everything below the fold): `IntersectionObserver` adds an `is-in` class → fade + 20px rise, `threshold ~.18`, fire once. Stagger children by ~80ms. Provide a `<noscript>` / reduced-motion fallback that shows content.
- **Sliding indicator** (the routing motif): a pill that animates `left`/`width` to the hovered nav link or the active tab (`cubic-bezier(.4,0,.2,1)`, ~.34s). Reuse this for any segmented control.
- **Cursor glow**: a faint radial gold light tracking the pointer inside the glass navbar. Subtle, decorative, disabled under reduced motion.
- **Flow dashes**: `stroke-dasharray` + animated `stroke-dashoffset` on routing diagrams to show direction of capital.

`framer-motion` equivalents (defined in `apps/web/src/components/home/motion.ts`):

```ts
export const reveal = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } },
};
export const stagger  = { show: { transition: { staggerChildren: 0.08 } } };
export const viewport = { once: true, amount: 0.2 };
```

### Component recipes

Build new UI from these. All sit on `bg`; cards/panels use `surface-1`.

- **Glass-capsule navbar** — sticky pill, `surface-1` at ~55% alpha with `backdrop-filter: blur(14px) saturate(1.3)`, hairline border, inset top highlight. Logo left, links center (with sliding gold-tinted pill), one gold CTA right, hamburger under ~720px.
- **Buttons** — *Primary*: gold fill, `gold-ink` text, 12px radius, hover `gold-bright` + `translateY(-1px)`; one per view. *Ghost*: transparent, hairline-strong border, text-high, hover `surface-1`.
- **Card** — `surface-1`, hairline, 18–20px radius; hover: `translateY(-3px)`, border → hairline-strong, bg → `surface-2`. Transition ~.25s.
- **Stat strip** — bordered `surface-1` row split by hairline dividers; label (13px, text-disabled) over value (mono, 16px). Stacks to 1 column ≤640px.
- **Segmented tabs** — pill container `surface-1`, sliding gold-tinted indicator, active tab text gold. Swap panel content with a 200ms fade.
- **Comparison table** — first column = dimension; "worse" column gets a muted `✕` and text-disabled cells; "Bynd" column gets a gold `✓`, emphasized text, and a faint gold column wash (`rgba(229,181,103,.05)`) so the eye lands on the win.
- **Numbered step / process** — small mono number in a gold-tinted circle, title (18–19px), body (text-mid). Only number things that are truly a sequence; connect vertical flows with a 1px hairline through the circles.
- **Routing diagram** — the signature. Left = fragmented dashed chips; center = boost block with the fork glyph inside; right = gauge pills with mono APYs; bottom = solid-gold `veBYND` pill. Gold flow dashes travel source→destination. See `apps/web/assets/routing-engine.svg`.
- **Ambient tile field** — sparse grid of 45°-rotated rounded diamonds with muted icons; light a *few* gold as "active gauges"; fade the bottom into `bg`.
- **Footer** — hairline top border, centered: fork mark + `bynd`, link row, round social buttons (`white/8`, hover → gold fill + `gold-ink`), copyright in text-disabled.

### Iconography

Inline stroke SVG or `lucide-react`. Stroke width **1.6–1.75**, `currentColor`, round caps/joins. Sizes: 16–20px inline, 30–32px for feature/hero icons. Icons inherit gold only inside a gold-tinted container; otherwise text-mid/disabled.

Brand/social icons (X, Telegram, Discord, etc.) are the exception — use the actual filled brand glyph (see `components/ui/BrandIcons.tsx`), not a stroke approximation, and verify path data against an authoritative source (e.g. simple-icons) rather than reproducing from memory.

### Voice & copy

Sentence case, active voice, plain verbs. Name things by what the user controls. Say what something does; don't sell it. Avoid `leverage`, `seamless`, `unlock`, `empower`, `simply`, `just`, and exclamation marks. Keep the protocol vocabulary exact. A control keeps its name through the whole flow (button "Stake" → toast "Staked"). Errors say what happened and what to do, no apology.

Examples in-voice: "Initialize system", "Open terminal", "Route to gauges", "Exit anytime", "Keeper-run". Token symbols always render in mono.

### Stack integration

**Tailwind** (`tailwind.config.cjs` → `theme.extend`):

```js
colors: {
  bg: '#121212',
  surface: { 1: '#1C1C1E', 2: '#242426' },
  gold: { DEFAULT: '#E5B567', bright: '#F0C983', deep: '#B78A3F', ink: '#2A1E08' },
},
fontFamily: {
  display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
  mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
},
borderRadius: { card: '18px', panel: '20px' },
```

Text emphasis with Tailwind: `text-white/[.87]`, `text-white/60`, `text-white/[.38]`. Hairlines: `border-white/[.08]`, hover `border-white/[.12]`.

**Logo** — `apps/web/assets/bynd-logo.svg` (wordmark) and `bynd-mark.svg` (icon), pulled in via `components/ui/Logo.tsx`. The wordmark letters use `currentColor`, so set the surrounding text color: white on dark, `#121212` on light. The gold fork is fixed. Favicon: `apps/web/assets/favicon.svg`, rasterized into `apps/web/public/favicon.{ico,png}` and `apple-touch-icon.png` for browsers that ignore the SVG `<link>`.

**Reduced motion** — global guard already shipped in `apps/web/src/styles/globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

### Do / Don't

**Do:** keep gold scarce and meaningful · elevate surfaces by lightening · put every number, %, token symbol, and function name in mono · reuse the routing/sliding motif · respect reduced motion · write sentence-case, hype-free copy.

**Don't:** use pure black · add drop shadows to create depth · introduce a second accent color · use Title Case or ALL CAPS (except small tracked mono labels) · number things that aren't a real sequence · let any section rely on JS for its content to be readable.

### New-page checklist

1. Wrap page content at max-width 1120, 20px padding, ~100px section rhythm.
2. Reuse the glass-capsule navbar and footer unchanged.
3. Every section heading: Space Grotesk 600, sentence case; eyebrows/tags in mono.
4. One primary gold CTA per view; everything else ghost/quiet.
5. Numbers, %, token symbols, function names → mono; values → gold.
6. Add `reveal` (framer-motion) with `whileInView`, `viewport={{ once:true, amount:.2 }}`.
7. Cards `surface-1` + hairline + hover lift; panels 20px radius.
8. Check the page at 360px, keyboard focus is visible, reduced-motion is honored.
9. If a diagram is involved, make it *mean* something (route → destination), not decorate.
