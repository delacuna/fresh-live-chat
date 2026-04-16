# Fresh Live Chat

**Spoiler filter for game stream chats on YouTube**

[日本語版 README はこちら](README.ja.md)

---

Fresh Live Chat is a Chrome extension that automatically detects and hides spoilers, foreshadowing, and gameplay advice from YouTube game stream chats — so you can watch at your own pace without fear of having your experience ruined.

Filtering is handled in two stages: instant keyword matching for obvious spoilers, followed by Claude AI context analysis for subtler cases. No account required — just install and play.

---

## Screenshots

| Popup UI | Spoiler blocked | Revealed on click |
|----------|----------------|-------------------|
| ![Popup UI](docs/screenshots/fresh-live-chat-popup.png) | ![Blocked](docs/screenshots/fresh-live-chat-blocked.png) | ![Revealed](docs/screenshots/fresh-live-chat-revealed.png) |

---

## Features

**2-Stage AI Filtering**
- Stage 1 (instant): Fast keyword matching that catches obvious spoilers immediately
- Stage 2 (AI): Claude AI reads context to distinguish genuine spoilers from innocent comments
- Double-layer design minimizes both false positives and missed spoilers

**Archive & Live Support**
- Filters chat replays on archived (VOD) streams
- Also works on live streams in real time

**Genre Templates**
- Select a genre (RPG, Mystery, Action-Horror, etc.) to improve detection accuracy without needing a game-specific database
- Detects gameplay advice and instruction-style comments that can also ruin the experience

**Progress-Aware Filtering**
- Register how far you've progressed in the game, and Fresh Live Chat won't hide comments about content you've already seen
- Automatically distinguishes spoilers ahead of your progress from content you've already seen

**Auto Game Detection from Video Title**
- Automatically infers the game being played from the video title for smarter AI judgment

**Custom Block Words**
- Build your own block list for any words or phrases you want to hide instantly

**3 Filter Strength Levels**
- Strict: Block spoilers, foreshadowing, and gameplay advice
- Standard: Block clear spoilers and foreshadowing only (default)
- Lenient: Block only explicit spoilers

---

## Installation

### From Chrome Web Store

> Chrome Web Store URL — coming soon

### Local Build (Development)

```bash
# 1. Clone the repository
git clone https://github.com/delacuna/fresh-live-chat.git
cd fresh-live-chat

# 2. Install dependencies
pnpm install

# 3. Build the extension
pnpm build

# 4. Load in Chrome
#    Open chrome://extensions → Enable "Developer mode" → "Load unpacked"
#    Select the apps/chrome-ext/dist/ folder
```

---

## How to Use

1. Open any YouTube game stream page
2. Click the Fresh Live Chat icon in the top-right corner of your browser
3. Select your game title or genre
4. Settings apply instantly — Fresh Live Chat works automatically from that point on

---

## Privacy

- **All data stored locally**: Settings and cached results are stored only in your browser
- **Chat content is never logged**: Comment text is sent to the AI service for judgment, but is never stored or recorded
- **No API key needed**: Fresh Live Chat manages API access through a secure proxy
- **No account required**: Install and use immediately

[Full Privacy Policy](https://github.com/delacuna/fresh-live-chat/blob/main/docs/privacy-policy.md)

---

## For Developers

### Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript |
| Extension UI | React + Vite |
| Build system | Turborepo + pnpm workspaces |
| Proxy | Cloudflare Workers (Hono) |
| AI | Anthropic Claude API (Haiku) |

### Directory Structure

```
apps/
  chrome-ext/       # Chrome Extension (content scripts + popup UI)
  proxy/            # Lightweight API proxy (Cloudflare Workers)
packages/
  shared/           # Shared types and utilities
  knowledge-base/   # Game-specific spoiler data (JSON) + genre templates
```

### Build

```bash
pnpm install        # Install all dependencies
pnpm build          # Build all packages and apps
```

### Run Proxy Locally

```bash
cd apps/proxy
pnpm wrangler dev   # Starts local proxy at http://localhost:8787
```

Configure the proxy URL in the extension popup under the settings if needed.

---

## License

MIT

---

## Issues & Feedback

Please report bugs or feature requests via [GitHub Issues](https://github.com/delacuna/fresh-live-chat/issues).
