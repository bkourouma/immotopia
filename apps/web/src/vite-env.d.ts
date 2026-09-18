/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the API server, e.g. http://localhost:8001 */
  readonly VITE_API_ORIGIN?: string;
  /** Full REST base URL; defaults to `${VITE_API_ORIGIN}/api` */
  readonly VITE_API_URL?: string;
  /**
   * When `"true"`, the login screen includes the « Comptes par tenant » panel.
   * Compile-time only (Vite inlines it). Local `npm run dev` already shows the
   * panel via `import.meta.env.DEV`.
   */
  readonly VITE_SHOW_DEMO_ACCOUNTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
