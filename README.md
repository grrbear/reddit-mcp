# Reddit MCP Server — Remote (HTTP Transport)

Runs on VM105 (arrstack), exposed via Cloudflare tunnel so Claude mobile can reach it anywhere.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /mcp` | Streamable HTTP — primary transport for Claude.ai remote MCP |
| `GET /mcp` | Streamable HTTP GET |
| `GET /sse` | SSE fallback for older MCP clients (Claude Desktop) |
| `POST /messages` | SSE message handler |
| `GET /health` | Health check — monitored by Uptime Kuma |

## Tools

| Tool | What it does |
|---|---|
| `get_subreddit_posts` | Fetch hot/top/new/rising from any subreddit |
| `get_thread` | Full post + comment tree, sorted by best |
| `search_reddit` | Site-wide or subreddit-scoped search |
| `get_reddit_url` | Generate canonical Reddit links |

---

## Deployment on VM105

### 1. Get Reddit API credentials

1. Go to https://www.reddit.com/prefs/apps
2. Click **"create another app"** → type: **script**
3. Copy your **Client ID** and **Client Secret**

### 2. Add credentials to your .env

In `/home/bear/homelab/.env` on VM105, add:

```env
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USERNAME=your_reddit_username
REDDIT_PASSWORD=your_reddit_password
```

### 3. Copy project to VM105

```bash
scp -r reddit-mcp bear@192.168.0.11:/home/bear/homelab/reddit-mcp
```

### 4. Build the image on VM105

```bash
ssh bear@192.168.0.11
cd /home/bear/homelab/reddit-mcp
npm install
npm run build
```

### 5. Add to docker-compose.yml

Paste the contents of `docker-compose.snippet.yml` into your main
`/home/bear/homelab/docker-compose.yml` under `services:`.

Then restart:

```bash
cd /home/bear/homelab
docker compose up -d reddit-mcp
```

### 6. Add Cloudflare Tunnel route

In your Cloudflare Zero Trust dashboard (or via `cloudflared` config on CT101):

Add a public hostname:
- **Subdomain:** `reddit-mcp`
- **Domain:** `quickswoodcapital.com`
- **Service:** `http://192.168.0.11:8767`

### 7. Connect Claude mobile

In Claude.ai settings → Integrations → Add MCP Server:
- **URL:** `https://reddit-mcp.quickswoodcapital.com/mcp`

---

## Example mobile prompts

- *Paste a Reddit URL* → "Make a Spotify playlist from the albums in this thread"
- *"What's hot on r/gratefuldead today?"*
- *"Search Reddit for Dead & Company 2024 setlists and grab any missing shows from slskd"*
- *"Find the top jazz album recommendations from r/jazz this month"*

---

## Uptime Kuma monitoring

Add a new monitor:
- **Type:** HTTP(s)
- **URL:** `https://reddit-mcp.quickswoodcapital.com/health`
- **Interval:** 60s
