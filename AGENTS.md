# AGENTS.md

## Project Overview

Raycast extension for uploading clipboard images to any S3-compatible endpoint (MinIO, etc.) and browsing upload history. Two commands: a no-view uploader and a view-based history browser.

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
├── upload-image.tsx    # "no-view" command — reads clipboard, uploads, copies URL
├── recent-uploads.tsx  # "view" command — React List of upload history
└── lib/
    ├── s3.ts           # S3 client factory, key generation, URL builder
    ├── s3.test.ts      # Tests for s3 utilities
    ├── history.ts      # Upload history with storage adapter pattern
    └── history.test.ts # Tests for history manager
```

**Data flow (upload):** Clipboard → `file://` URI → `fileUriToPath` → read file → `generateKey` (date/UUID path) → `uploadToS3` via `@aws-sdk/client-s3` → `buildObjectUrl` → copy URL to clipboard → save to history via `createHistoryManager`.

**Key generation:** `{YYYY}/{MM}/{DD}/{uuid}.{ext}` — uses `crypto.randomUUID()`, extension derived from MIME type.

**History:** JSON array stored in Raycast `LocalStorage` under key `"upload-history"`. Capped at `recentImageCount` entries (default 50), newest first.

## Key Patterns

- **Storage adapter pattern:** `history.ts` takes a `StorageAdapter` interface (`getItem`/`setItem`) so it's testable without Raycast's `LocalStorage`. Commands inject the real adapter; tests inject a plain object mock.
- **S3 config via preferences:** All S3 credentials come from Raycast preferences defined in `package.json`. The `Preferences` interface is manually duplicated in each command file — `raycast-env.d.ts` auto-generates `ExtensionPreferences` from the manifest but the commands define their own local interface.
- **`forcePathStyle: true`** on S3Client — required for self-hosted/S3-compatible endpoints that don't support virtual-hosted-style URLs.
- **Region is hardcoded** to `"us-east-1"` in `createS3Client` — this is a placeholder since most S3-compatible backends ignore it.

## Testing

- Test runner: vitest (config in `vitest.config.ts`, test files match `src/**/*.test.ts`)
- Tests use dynamic `await import()` per test to get fresh module state (important for `vi.setSystemTime` in s3 tests)
- History tests use a hand-rolled mock storage (`createMockStorage`) instead of a library
- No test covers the command files themselves (upload-image.tsx, recent-uploads.tsx) — only the lib/ modules

## Conventions

- TypeScript strict mode, ES2022 target, React JSX transform
- Linting via `@raycast/eslint-config` (extends `@raycast`)
- No formatter configured in tooling (prettier is a devDependency but no script uses it)
- Command files are `.tsx`, lib files are `.ts`
- `package.json` is the Raycast extension manifest (commands, preferences, metadata all defined there)
- `raycast-env.d.ts` is auto-generated from `package.json` — never edit manually

## Gotchas

- The `extensionFromMime` map in `s3.ts` does not include `image/webp` or `image/bmp` — these fall through to the `"png"` default, even though `upload-image.tsx` has them in `MIME_MAP`. If you add a new image format, update both maps.
- `Clipboard.read()` returns a `file://` URI, not a path — `file-uri-to-path` converts it. Don't use the URI directly with `fs.readFile`.
- `uploadWithoutAsking` is a checkbox preference but typed as `boolean` in the Preferences interface. Other preferences typed as `string` (including `recentImageCount`) need `parseInt`.
- S3 object URL is constructed client-side as `{endpoint}/{bucket}/{key}` — there's no presigned URL or redirect. The bucket and objects must be publicly accessible for the URL to work.
