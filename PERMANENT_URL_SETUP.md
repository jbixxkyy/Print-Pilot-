# Permanent URL Setup (Cloudflare Tunnel)

This gives you one stable URL for your Print Pilot server, from anywhere.

## 1) Use a domain you control

- `printpilot.com` is already owned by someone else.
- Use your own domain, for example:
  - `printpilot-control.com`
  - `printpilotapp.net`

## 2) Add the domain to Cloudflare

1. Create/sign in to Cloudflare.
2. Add your domain.
3. Update nameservers at your registrar to the Cloudflare nameservers.
4. Wait until Cloudflare shows the domain as active.

## 3) Install cloudflared on your PC

Download and install:
https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

Then verify:

```powershell
cloudflared --version
```

## 4) Create a named tunnel (one-time)

Run:

```powershell
cloudflared tunnel login
cloudflared tunnel create print-pilot
cloudflared tunnel route dns print-pilot app.yourdomain.com
cloudflared tunnel token print-pilot
```

Copy the token output from the last command.

## 5) Put token in local project file

In this project folder:

1. Copy `.env.tunnel.example` to `.env.tunnel`
2. Set:

```text
CF_TUNNEL_TOKEN=your_token_here
```

## 6) Start with one click

Run:

```text
start-permanent-url.bat
```

This launches:
- your Node server on port `8080`
- your permanent Cloudflare tunnel

Keep both windows open while using the site.

## 7) Use your permanent URL

Open:

```text
https://app.yourdomain.com
```

You can reuse this exact URL every time.

---

## Optional hardening (recommended)

- Keep your app login password strong in `config.json`.
- Keep `.env.tunnel` private (already in `.gitignore`).
- If you ever rotate credentials, run:

```powershell
cloudflared tunnel token print-pilot
```

and update `.env.tunnel`.
