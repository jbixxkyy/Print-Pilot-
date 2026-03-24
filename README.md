# Flashforge API Server Node Copy

This is a separate Node/Express rewrite created beside the Rust project. The Rust version is untouched.

## Run

1. Copy `config.example.json` to `config.json`
2. Fill in your printer IP, serial number, and check code
3. Run `npm install`
4. Run `npm run dev`
5. Open `http://localhost:8080`

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
