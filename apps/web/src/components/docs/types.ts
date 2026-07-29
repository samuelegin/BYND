import type { LucideIcon } from 'lucide-react';

export type DocBlock =
  | { type: 'h2'; id: string; text: string }
  | { type: 'h3'; id: string; text: string }
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'steps'; items: { title: string; body: string }[] }
  | { type: 'callout'; tone: 'info' | 'warning' | 'success'; title?: string; text: string }
  | { type: 'code'; code: string; lang?: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'cards'; items: { icon?: LucideIcon; title: string; body: string }[] }
  | { type: 'kv'; items: { label: string; value: string }[] };

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  blocks: DocBlock[];
}

export interface DocGroup {
  label: string;
  pages: DocPage[];
}

// ── Tiny builder helpers — keep the content file below readable ───────────
export const h2 = (id: string, text: string): DocBlock => ({ type: 'h2', id, text });
export const h3 = (id: string, text: string): DocBlock => ({ type: 'h3', id, text });
export const p = (text: string): DocBlock => ({ type: 'p', text });
export const list = (items: string[], ordered = false): DocBlock => ({ type: 'list', items, ordered });
export const steps = (items: { title: string; body: string }[]): DocBlock => ({ type: 'steps', items });
export const callout = (tone: 'info' | 'warning' | 'success', text: string, title?: string): DocBlock =>
  ({ type: 'callout', tone, text, title });
export const code = (code: string, lang = 'solidity'): DocBlock => ({ type: 'code', code, lang });
export const table = (headers: string[], rows: string[][]): DocBlock => ({ type: 'table', headers, rows });
export const cards = (items: { icon?: LucideIcon; title: string; body: string }[]): DocBlock => ({ type: 'cards', items });
export const kv = (items: { label: string; value: string }[]): DocBlock => ({ type: 'kv', items });
