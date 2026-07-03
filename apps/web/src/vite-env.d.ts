/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MATSNET_VAULT:   string;
  readonly VITE_MATSNET_STAKING: string;
  readonly VITE_MATSNET_VOTER:   string;
  readonly VITE_MATSNET_VEBYND:  string;
  readonly VITE_MATSNET_VEMEZO:  string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
