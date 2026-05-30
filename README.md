# raycast-image-uploader

A Raycast extension that uploads clipboard images to an S3-compatible endpoint and manages upload history.

## Architecture

Clipboard image → `file://` URI → read from disk → upload to S3 (`{uuid}.{ext}` key) → public URL copied to clipboard → saved to local history.

```
src/
├── upload-image.tsx      # no-view command — upload clipboard image
├── recent-uploads.tsx    # view command — browse upload history
└── lib/
    ├── s3.ts             # S3 client, key generation, URL builder
    └── history.ts        # upload history (LocalStorage-backed)
```

## Commands

### Upload Image
Copies an image from your clipboard, uploads it to your configured S3 bucket, and puts the URL into your clipboard.

If "Upload Without Asking" is disabled (default), you'll see a confirmation dialog before the upload starts.

### Recent Uploads
Browse your recently uploaded images. Select one to copy or paste its URL.

## Configuration

| Preference | Description |
|---|---|
| S3 Endpoint | URL of your S3-compatible endpoint (e.g. `http://100.x.x.x:9000`) |
| Bucket Name | Target S3 bucket |
| Access Key ID | S3 access key |
| Secret Access Key | S3 secret key |
| Upload Without Asking | Skip confirmation dialog (default: off) |
| Recent Image Count | Number of uploads to keep in history (default: 50) |

## Development

```bash
npm install
npm run dev        # open in Raycast with hot reload
npm run build      # production build
npm test           # run unit tests
npm run lint       # check linting
```
