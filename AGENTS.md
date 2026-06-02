# AGENTS.md

## Project Overview

Raycast extension for uploading clipboard images to any S3-compatible endpoint (MinIO, etc.) and browsing upload history. Two commands: both view-based — an uploader with a confirmation/preview UI and a history browser.

## Commands

```bash
npm run build      # ray build — production build
npm run dev        # ray develop — open in Raycast with hot reload
npm test           # vitest run — run all tests once
npm run test:watch # vitest — watch mode
npm run lint       # ray lint (uses @raycast/eslint-config)
npm run fix-lint   # ray lint --fix
```

Build/lint commands (`ray build`, `ray lint`) require the Raycast CLI and only work on macOS. Tests run anywhere via vitest.

## Architecture

```
src/
├── upload-image.tsx    # "view" command — preview, confirm, upload, copies URL
├── recent-uploads.tsx  # "view" command — React List of upload history
└── lib/
    ├── mime.ts         # Static MIME maps + magic-byte detection
    ├── mime.test.ts    # Tests for MIME utilities
    ├── s3.ts           # S3 client factory, key generation, URL builder
    ├── s3.test.ts      # Tests for s3 utilities
    ├── history.ts      # Upload history with storage adapter pattern
    └── history.test.ts # Tests for history manager
```

**Data flow (upload):** Clipboard → `file://` URI → `url.fileURLToPath` → read file → `generateKey` (UUID + extension) → `uploadToS3Optimistic` builds URL synchronously, kicks off async upload via `performUpload` (with reused S3Client) → URL copied to clipboard immediately → upload awaited → history saved → success toast → `popToRoot`.

**Key generation:** `{uuid}.{ext}` — uses `crypto.randomUUID()`, extension derived from MIME type via `extensionFromMime` in `lib/mime.ts`.

**History:** JSON array stored in Raycast `LocalStorage` under key `"upload-history"`. Capped at `recentImageCount` entries (default 50), newest first. JSON.parse errors are caught and return empty array. Out-of-bounds index in remove() is a no-op.

## Key Patterns

- **Storage adapter pattern:** `history.ts` takes a `StorageAdapter` interface (`getItem`/`setItem`) so it's testable without Raycast's `LocalStorage`. Commands inject the real adapter; tests inject a plain object mock. The history manager is created once per command in a `useRef`.
- **S3 config via preferences:** All S3 credentials come from Raycast preferences defined in `package.json`. The auto-generated `Preferences.UploadImage` and `Preferences.RecentUploads` types from `raycast-env.d.ts` are used directly — no manual Preference interfaces.
- **`forcePathStyle: true`** on S3Client — required for self-hosted/S3-compatible endpoints that don't support virtual-hosted-style URLs. The `buildObjectUrl` function has a `pathStyle` parameter (default `true`) for URL-style parity.
- **Region is hardcoded** to `"us-east-1"` in `createS3Client` — this is a placeholder since most S3-compatible backends ignore it.
- **S3Client is reused** across uploads via a ref in the command component, avoiding TLS handshake overhead per upload.

## Testing

- Test runner: vitest (config in `vitest.config.ts`, test files match `src/**/*.test.{ts,tsx}`)
- MIME tests in `mime.test.ts` cover extension-to-MIME, MIME-to-extension, content-based (magic byte) detection, and edge cases (no extension, unknown types)
- History tests use a hand-rolled mock storage (`createMockStorage`) with `_getRaw` accessor for direct assertion
- No test covers the command files themselves (upload-image.tsx, recent-uploads.tsx) — only the lib/ modules: mime, s3, history

## Conventions

- TypeScript strict mode, ES2022 target, React JSX transform
- Linting via `@raycast/eslint-config` (extends `@raycast`)
- No formatter configured in tooling
- Command files are `.tsx`, lib files are `.ts`
- `package.json` is the Raycast extension manifest (commands, preferences, metadata all defined there)
- `raycast-env.d.ts` is auto-generated from `package.json` — never edit manually

## Gotchas

- `Clipboard.read()` returns a `file://` URI, not a path — `url.fileURLToPath` converts it. Don't use the URI directly with `fs.readFile`.
- Textfield preferences like `recentImageCount` are strings — must `parseInt` before use. Checkbox preferences (e.g. `uploadWithoutAsking`) are booleans natively.
- S3 object URL is constructed client-side as `{endpoint}/{bucket}/{key}` (path-style, default) or `{bucket}.{endpoint}/{key}` (virtual-hosted, `pathStyle: false`). There's no presigned URL or redirect. The bucket and objects must be publicly accessible for the URL to work.
- The upload follows an optimistic pattern: URL is copied to clipboard immediately, but the history entry and success toast only appear after the S3 PUT completes.
