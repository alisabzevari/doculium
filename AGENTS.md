# Doculium — Agent Guide

## Project Overview

Doculium is an AI-powered document management PWA. Users import documents (PDF, images, text) from local storage or Dropbox, AI analyzes them (classification, summarization, action items), and they can chat with documents. Data is stored in IndexedDB with optional Turso (libSQL) cloud sync.

## Tech Stack

| Area      | Technology                                          |
| --------- | --------------------------------------------------- |
| Language  | TypeScript (strict, ES2023, `verbatimModuleSyntax`) |
| UI        | Lit 3.3 (Web Components, Light DOM only)            |
| Build     | Vite 6.4                                            |
| CSS       | Tailwind CSS 4 + DaisyUI 5                          |
| Client DB | Dexie.js 4 (IndexedDB)                              |
| Cloud DB  | Turso / libSQL (`@libsql/client`)                   |
| AI API    | OpenAI-compatible REST + WebLLM (`@mlc-ai/web-llm`) |
| PDF       | pdfjs-dist 5                                        |
| PWA       | vite-plugin-pwa + Workbox                           |
| Routing   | `@lit-labs/router` 0.1                              |
| Icons     | lucide                                              |
| Runtime   | Node.js 24.7 (see `.tool-versions`)                 |

**No testing, linting, or formatting tools are configured.**

## Project Structure

```
src/
├── main.ts                 # App entry: imports components, handles shared config
├── app-shell.ts            # Root component: sidebar, router, PWA banner
├── sw.ts                   # Service Worker (Workbox injectManifest)
├── ai/                     # AI layer: types, provider factory, OpenAI/WebLLM impls, analyzer
├── components/             # Reusable Lit components (Light DOM, no Shadow)
├── pages/                  # Route-level page components
│   ├── dashboard-page.ts
│   ├── library-page.ts
│   ├── document-detail.ts
│   ├── settings-page.ts
│   └── share-page.ts
├── db/                     # Dexie schema, document-store, config-store, turso-sync
├── services/               # analysis-queue, bulk-import, storage/(local|dropbox|registry)
├── utils/                  # pdf-parser, share-config, file-naming, date-utils, router
└── styles/global.css       # Tailwind + DaisyUI global styles
```

## Key Conventions

- **No Shadow DOM** — all components use `createRenderRoot() { return this; }` for Light DOM
- **Lit decorators** — `@customElement`, `@state()`, `@property()`, `@query()`
- **Imports** always include `.ts` extension (required by `verbatimModuleSyntax`)
- **Type imports** use `import type { ... }`
- **Navigation** — `window.dispatchEvent(new CustomEvent('navigate', { detail: { path } }))`
- **Events** — child-to-parent via `CustomEvent` with `bubbles: true, composed: true`
- **Async init** — `async connectedCallback()` for data loading
- **File naming** — pages: `{name}-page.ts`, components: `{kebab-name}.ts`, stores: `{name}-store.ts`

## Running the Project

```bash
npm run dev                  # Vite dev server with COOP/COEP headers
npm run build                # tsc + vite build
npm run preview              # vite preview
```

- Dev server requires COOP/COEP headers (SharedArrayBuffer for WebLLM)
- PDF.js cmaps/fonts served from `/pdfjs-cmaps/` and `/pdfjs-stdfonts/`
- pdfjs-dist and @mlc-ai/web-llm are split into separate Vite chunks
- `.env` has defaults for AI provider, Turso, theme (checked into repo — contains real creds)

## Architecture Notes

- **Provider pattern** — AI (`AIProvider`) and Storage (`StorageProvider`) use factory/registry pattern
- **Analysis queue** — sequential processing via `analysisJobs` Dexie table → improve text → AI analysis → optional file organization (`{year}/{category}/{filename}`)
- **Turbo sync** — bidirectional, "last writer wins" on `updatedAt`, with recovery phase for missing records
- **Dexie DB** — 6 tables: `documents`, `actionItems`, `categories`, `analysisJobs`, `chatMessages`, `pendingDeletions`
- **Settings** — persisted in localStorage under `doculium-settings` (AI config, Turso, theme, prompts)
- **Storage config** — persisted in localStorage under `doculium-storage-config`

## Good Reference Files

- **Pages**: `dashboard-page.ts` — typical Lit page with state, events, service calls
- **Components**: `document-card.ts` — properties, events, async methods
- **Services**: `analysis-queue.ts` — async service with progress callback
- **DB ops**: `document-store.ts` — Dexie CRUD patterns
