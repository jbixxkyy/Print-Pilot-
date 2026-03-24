# Flashforge API Server Node Copy

This is a separate Node/Express rewrite created beside the Rust project. The Rust version is untouched.

## Run

1. Copy `config.example.json` to `config.json`
2. Fill in your printer IP, serial number, and check code
3. Run `npm install`
4. Run `npm run dev`
5. Open `http://localhost:8080`

## Permanent Public URL (same link every time)

Use Cloudflare Tunnel with your own domain/subdomain.

1. Follow `PERMANENT_URL_SETUP.md` once.
2. Copy `.env.tunnel.example` to `.env.tunnel` and paste your tunnel token.
3. Run `start-permanent-url.bat`.

After setup, you always use the same URL (example: `https://app.yourdomain.com`).

## Free Public URL (no domain needed)

This is fully free but the URL changes each time you start it.

1. Run `npm install`
2. Double-click `start-free-url.bat`
3. Copy the `https://...` URL from the tunnel window

Keep both terminal windows open while you use the app remotely.

## Orca Upload Bridge (Orca -> Website -> Printer)

This server now exposes an OctoPrint-compatible upload bridge:

- `GET /octoprint/api/version`
- `POST /octoprint/api/files/local`

Use in Orca as:

1. Host type: `OctoPrint`
2. URL: `https://your-url` (do not add `/octoprint` manually if Orca appends `/api/...`)
3. API key: value from `config.json -> auth.slicerApiKey`

If your Orca profile needs a custom path base, use:

- Base URL: `https://your-url/octoprint`

Optional printer selection:

- Add `?printerId=main` to the bridge URL if you run multiple printers.

## Implemented in this copy

- Static frontend split into `public/index.html`, `public/styles.css`, and `public/app.js`
- Express server entry point in `src/server.js`
- TCP printer commands on port `8899`
- Printer routes for:
  - list printers
  - names
  - info
  - status
  - temperatures
  - progress
  - head-position
  - files
  - files-debug
  - detail
  - file-thumbnail
  - start-file
  - upload-file
  - delete-file
  - set-temperature
  - nozzle-temperature
  - bed-temperature
  - pause
  - resume
  - snapshot
  - camera

## Main files

- `src/server.js`: app entry point
- `src/routes/printers.js`: HTTP routes
- `src/printerClient.js`: raw printer TCP/HTTP/camera logic
- `src/lib/parse.js`: parser helpers for printer responses
- `src/config.js`: config loading
- `public/index.html`: UI markup
- `public/styles.css`: UI styles
- `public/app.js`: browser logic

## Mapping from Rust version

- Rust `main.rs` -> `src/server.js`
- Rust `routes/api.rs` -> `src/routes/printers.js`
- Rust `printer.rs` + `socket.rs` -> `src/printerClient.js` + `src/lib/parse.js`
- Rust `config.rs` -> `src/config.js`
- Rust `routes/ui.rs` -> `public/index.html` + `public/styles.css` + `public/app.js`

## Remaining gaps

- Notifications/watcher loop are not ported yet
- Error handling is simpler than the Rust version
- Camera snapshot parsing is more basic than the Rust implementation
- This has not been validated against your printer yet until dependencies are installed and it is run locally
