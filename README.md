# Business Manager

Inventory, orders, customers, suppliers, finance, and reporting in one app.

## Run locally

```sh
npm ci
npm run dev
```

By default, business data is stored in this browser's local storage. It is not
shared with other users or synchronized across devices. Optional Firebase and
server-backed features require their respective configuration from `.env.example`.

## GitHub Pages

The `Deploy to GitHub Pages` workflow builds the app and deploys `dist` whenever
changes are pushed to `main`. Enable GitHub Pages for the repository with
**GitHub Actions** as the build and deployment source.

GitHub Pages hosts the static app only. Features requiring the Express backend,
such as AI, admin APIs, and Google Sheets, need a separately hosted backend.
