# AGENTS.md

## Project Overview

Raycast extension for uploading clipboard files (images, PDFs, documents, archives, text — anything the pasteboard carries) to any S3-compatible endpoint (MinIO, etc.) and browsing upload history. Two commands: both view-based — an uploader with a confirmation/preview UI and a history browser.

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
    ├── mime.ts           # Static MIME maps + magic-byte detection
    ├── mime.test.ts      # Tests for MIME utilities
    ├── s3.ts             # S3 client factory, key generation, URL builder
    ├── s3.test.ts        # Tests for s3 utilities
    ├── history.ts        # Upload history with storage adapter pattern
    ├── history.test.ts   # Tests for history manager
    ├── text-preview.ts   # Streaming text preview fetch with a byte cap
    ├── text-preview.test.ts # Tests for the preview fetch and cap
    ├── recent-count.ts   # Parses the recents preference with a safe fallback
    ├── recent-count.test.ts # Tests for preference parsing
    ├── clipboard.ts      # Normalizes Clipboard.read().file to a filesystem path
    ├── clipboard.test.ts # Tests for clipboard path resolution
    ├── clipboard-file.ts # Writes the clipboard payload (any type) to a temp file via osascript (macOS)
    ├── clipboard-file.test.ts # Tests for clipboard payload extraction
    └── upload-pipeline.test.ts # Composes extraction → detection → key → history for the upload path
```

**Data flow (upload):** Clipboard → `Clipboard.read().file` (a `file://` URL or a plain path, normalized by `clipboardFileToPath`) → read file → `generateKey` (UUID + extension) → `uploadToS3` PUTs the object via `performUpload` (with reused S3Client) → on success, URL copied to clipboard → history saved → success toast → `popToRoot`. On failure nothing is copied or recorded, and the previous clipboard contents are preserved. When `Clipboard.read()` returns no `file` (a screenshot, or any file *content* copied from an app rather than a file reference), `extractClipboardFileToTempFile` writes the pasteboard payload to a temp file via `osascript`, keeping its original type, and that temp directory is removed in a `finally`.

**Key generation:** `{uuid}.{ext}` — uses `crypto.randomUUID()`. The extension comes from the source path via `extensionFromPath` when it is usable, otherwise from the MIME type via `extensionFromMime` in `lib/mime.ts`. This keeps types missing from the MIME table (`.psd`, `.sketch`, ...) from collapsing to `.bin`.

**History:** JSON array stored in Raycast `LocalStorage` under key `"upload-history"`. Capped at the "Recent Uploads Count" preference (5/10/25/50/100, default 50), enforced when an entry is added, newest first. The list renders every stored entry, so lowering the preference does not shrink existing history until the next upload. JSON.parse errors and non-array payloads return an empty array. Out-of-bounds index in remove() is a no-op.

## Key Patterns

- **Storage adapter pattern:** `history.ts` takes a `StorageAdapter` interface (`getItem`/`setItem`) so it's testable without Raycast's `LocalStorage`. Commands inject the real adapter; tests inject a plain object mock. The history manager is created once per command in a `useRef`.
- **S3 config via preferences:** All S3 credentials come from Raycast preferences defined in `package.json`. The auto-generated `Preferences.UploadImage` and `Preferences.RecentUploads` types from `raycast-env.d.ts` are used directly — no manual Preference interfaces.
- **`forcePathStyle: true`** on S3Client — required for self-hosted/S3-compatible endpoints that don't support virtual-hosted-style URLs. The `buildObjectUrl` function has a `pathStyle` parameter (default `true`) for URL-style parity.
- **Region is hardcoded** to `"us-east-1"` in `createS3Client` — this is a placeholder since most S3-compatible backends ignore it.
- **S3Client is reused** across uploads via a ref in the command component, avoiding TLS handshake overhead per upload.
- **Copy after upload:** `uploadToS3` in `lib/s3.ts` resolves with the URL only after the PUT succeeds. The command then copies the URL, records history, and shows the success toast. A failed upload never exposes a dead URL and leaves the clipboard untouched.
- **Streaming text preview fetch:** `fetchTextPreview()` in `lib/text-preview.ts` uses `ReadableStream.getReader()` to accumulate chunks and aborts once `maxSize` (default `MAX_PREVIEW_SIZE`, 5 MB) is exceeded. This prevents OOM from servers that omit `content-length` or use chunked transfer encoding. The cap is injectable so tests can exercise it without allocating megabytes.
- **Sanitized error messages:** Full errors are logged via `console.error` but user-facing toasts show a generic message ("Check your S3 configuration and try again.") to prevent leaking internal paths, AWS endpoint URLs, or access key IDs in screenshots.
- **Markdown injection prevention:** All file content previews are wrapped in fenced code blocks (` ``` `) regardless of file extension, preventing untrusted file content from rendering as markdown links, images, or other syntax.
- **Faithful clipboard payload selection:** `CLIPBOARD_FILE_SCRIPT` (in `clipboard-file.ts`) runs three isolated stages so a failure in one still leaves the others usable: an existing file on the pasteboard (Finder copy, drag, promised file), then rich payloads, then an AppKit rasterize fallback. Payload classification uses `UTType` conformance (falling back to a static UTI→extension table) and picks the most faithful payload: a real document (PDF, DOCX, ZIP, ...) beats a rendered image, which beats plain text, since copying from a web page puts the image *and* its URL as text on the pasteboard. Only `public.tiff` renderings are re-encoded to PNG, since raw TIFF is needlessly large and must never be written under a `.png` name.

## Testing

- Test runner: vitest (config in `vitest.config.ts`, test files match `src/**/*.test.{ts,tsx}`)
- `upload-pipeline.test.ts` composes the real lib functions in the order the upload command calls them (extract → detect → key → history) and asserts what a PDF, an unmapped extension, an image, plain text, an archive, and a no-extension payload record in history. It is the closest testable seam to the command files.
- `text-preview.test.ts` covers the streaming size cap, non-ok responses, missing bodies, abort-signal forwarding, and reader cancellation. `recent-count.test.ts` covers every dropdown preset plus missing, non-numeric, zero, and negative values.
- MIME tests in `mime.test.ts` cover extension-to-MIME, MIME-to-extension, content-based (magic byte) detection, and edge cases (no extension, unknown types)
- History tests use a hand-rolled mock storage (`createMockStorage`) with `_getRaw` accessor for direct assertion
- No test covers the command files themselves (upload-image.tsx, recent-uploads.tsx) — only the lib/ modules: mime, s3, history, clipboard, clipboard-file

## Conventions

- TypeScript strict mode, ES2022 target, React JSX transform
- Linting via `@raycast/eslint-config` (extends `@raycast`)
- No formatter configured in tooling
- Command files are `.tsx`, lib files are `.ts`
- `package.json` is the Raycast extension manifest (commands, preferences, metadata all defined there)
- `raycast-env.d.ts` is auto-generated from `package.json` — never edit manually. Off macOS it can be regenerated against the bundled generator: `node -e "const {generateTypeScriptDefinitions}=require('./node_modules/@raycast/api/dist/utils/generate-typeScript-definitions.js'); generateTypeScriptDefinitions(require('./package.json'), [])"`.

## Gotchas

- `Clipboard.read()` returns `file` as either a `file://` URL or a plain filesystem path, depending on how the content reached the clipboard. `url.fileURLToPath` throws `TypeError: Invalid URL` on a plain path, so always route through `clipboardFileToPath` in `lib/clipboard.ts`, which only converts actual file URLs.
- `Clipboard.read()` returns `file` as either a `file://` URL or a plain filesystem path, depending on how the content reached the clipboard. `url.fileURLToPath` throws `TypeError: Invalid URL` on a plain path, so always route through `clipboardFileToPath` in `lib/clipboard.ts`, which only converts actual file URLs.
- `Clipboard.read()` does NOT expose file *contents*; it only reports `text`, `html`, and a file reference. A screenshot (Cmd+Ctrl+Shift+4) and a PDF copied from Preview both arrive as pasteboard data with no `file`, so `Clipboard.read()` returns `{ text: "" }`. Such payloads are written out natively by `lib/clipboard-file.ts` via `osascript` (JXA). This is macOS-only and returns `null` if the pasteboard has no usable payload. Because the payload keeps its own type, a copied PDF lands in history as `{uuid}.pdf`, not as a rasterized PNG.
- Dropdown preferences like `recentImageCount` are string literals (`"5" | "10" | ...`) — still `parseInt` before use. Checkbox preferences (e.g. `uploadWithoutAsking`) are booleans natively.
- S3 object URL is constructed client-side as `{endpoint}/{bucket}/{key}` (path-style, default) or `{bucket}.{endpoint}/{key}` (virtual-hosted, `pathStyle: false`). There's no presigned URL or redirect. The bucket and objects must be publicly accessible for the URL to work.
- The upload is not optimistic: the URL is copied only after the S3 PUT completes, and a failure releases the in-memory file buffer without clearing the clipboard.
- File content previews are always wrapped in fenced code blocks to prevent markdown injection — even `.md` files render as raw code rather than rendered markdown.
- `fetchTextPreview` (`lib/text-preview.ts`) uses a streaming reader with a 5 MB cap. `r.text()` is never used directly, as S3 may omit `content-length` or use chunked encoding.
