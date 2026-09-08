/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the API server, e.g. http://localhost:8001 */
  readonly VITE_API_ORIGIN?: string;
  /** Full REST base URL; defaults to `${VITE_API_ORIGIN}/api` */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
