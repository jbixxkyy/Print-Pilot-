FLASHFORGE NODE COPY

This folder is a separate rewrite target. It does not change the Rust project.

What is now in place:
- Separate frontend files in public\
- Separate backend files in src\
- Core printer TCP routes on port 8899
- Printer HTTP routes on port 8898 for detail, thumbnails, start, delete, and upload
- Camera snapshot and camera stream proxy routes
- Basic browser UI to test the new Node backend

Main files:
- src\server.js: app entry point
- src\routes\printers.js: HTTP routes
- src\printerClient.js: printer TCP, HTTP, and camera logic
- src\lib\parse.js: parser helpers
- src\config.js: config loading
- public\index.html: UI markup
- public\styles.css: UI styles
- public\app.js: browser logic
- config.example.json: example config

Next steps:
1. Copy config.example.json to config.json.
2. Run npm install.
3. Run npm run dev.
4. Test against your printer.

Still not ported:
- notifications/watcher loop
- full parity validation against real hardware
