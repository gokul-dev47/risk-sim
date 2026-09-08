/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the deployed backend, e.g. https://risk-sim-backend.onrender.com */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
