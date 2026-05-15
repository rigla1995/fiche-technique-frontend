/// <reference types="vite/client" />

declare module '*.css' {
  const css: string;
  export default css;
}

interface ImportMeta {
  readonly env: Record<string, string | undefined>;
}

declare module 'react-dom/client' {
  export { createRoot, hydrateRoot } from 'react-dom';
}
