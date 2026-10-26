# Manhwa Checker 📖⚡

A fast, mobile-first, personal Progressive Web App (PWA) to track your reading progress on Asura Scans. Tap **Check**, instantly see which titles have new readable chapters, and open them in new tabs with one tap.

Hosted on **GitHub Pages** (no build step, zero dependencies) backed by a tiny, free **Cloudflare Worker** CORS proxy.

---

## Features

- **One-Tap Check**: Scans the latest releases and highlights available chapters.
- **Smart Locked/Premium Detection**:
  - Distinguishes free chapters from locked / early-access / sign-in chapters.
  - Automatically steps down to the latest *actually readable* chapter.
  - Caches readability in-session to stay polite and fast.
- **Quick Open & Mark as Read**:
  - Tap card or **Open** to jump straight to your next unread chapter (`read + 1`) in a new tab.
  - **Mark all as read** to fast-forward without opening tabs.
  - **Open all**: Opens the next chapter for every pending title in parallel.
- **5-Second Undo Toast**:
  - Easily revert any accidental chapter progression with a single tap.
- **Reliable Storage**:
  - Saved in browser `localStorage` under `manhwa-checker:v1`.
  - JSON **Export** and **Import** (with Merge or Replace options).
- **Mobile-First & PWA**:
  - Installable to iOS / Android home screens.
  - Offline-ready app shell cached via Service Worker.
  - Large, touch-friendly tap targets (steppers ≥ 44px).
  - Dark / Light / System auto-switching theme.

---

## Repository Structure

```text
├── index.html            # Main HTML document & accessible modals
├── styles.css            # Mobile-first CSS with theme variables
├── app.js                # Vanilla ES module app logic & Asura parser
├── sw.js                 # Service worker for offline app-shell caching
├── manifest.webmanifest  # PWA manifest with relative paths
├── icons/                # App icons
│   ├── icon.svg          # Master SVG vector icon
│   ├── icon-192.png      # 192x192 PWA icon
│   ├── icon-512.png      # 512x512 PWA icon
│   └── icon-maskable.png # 512x512 Android maskable icon
├── worker/               # Cloudflare Worker CORS proxy
│   ├── index.js          # Proxy worker with 60s cache & strict allowlist
│   └── wrangler.toml     # Wrangler deployment configuration
└── README.md             # Documentation & deployment guide
```

---

## 1. Deploy the Cloudflare Worker

Because browsers block direct requests to Asura Scans due to CORS policies, a minimal Cloudflare Worker acts as a lightweight proxy. The free tier is more than sufficient.

### Prerequisites
- Node.js installed locally (or deploy directly via the Cloudflare dashboard).
- A free Cloudflare account ([cloudflare.com](https://dash.cloudflare.com)).

### Deployment via Wrangler CLI

1. Open your terminal in the `worker/` directory:
   ```bash
   cd worker
   ```
2. Log in to Cloudflare:
   ```bash
   npx wrangler login
   ```
3. (Optional) Configure `wrangler.toml`:
   If you want to restrict CORS requests strictly to your GitHub Pages origin instead of `*`, update `ALLOWED_ORIGIN` in `worker/wrangler.toml`:
   ```toml
   [vars]
   ALLOWED_ORIGIN = "https://yourusername.github.io"
   ```
4. Deploy the worker:
   ```bash
   npx wrangler deploy
   ```
5. Copy your deployed Worker URL outputted by Wrangler, for example:
   ```text
   https://manhwa-checker-proxy.<your-subdomain>.workers.dev
   ```

*(Alternative: You can also copy `worker/index.js` and paste it into the Cloudflare Dashboard web editor under Workers & Pages > Create Application > Quick Edit).*

---

## 2. Configure Worker URL in the Web App

You have two options:
1. **In the Web UI (Recommended)**:
   - Open the web app in your browser.
   - Click the **⚙️ Settings** icon in the header.
   - Paste your Cloudflare Worker URL into the input field and click **Save Settings**.
2. **In Code**:
   - Edit the top of `app.js`:
     ```javascript
     export const DEFAULT_WORKER_URL = "https://your-worker.<subdomain>.workers.dev";
     ```

---

## 3. Deploy to GitHub Pages

Because Manhwa Checker is built with plain HTML, CSS, and vanilla JS, deployment takes seconds:

1. Push this repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Manhwa Checker"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
2. In your GitHub repository:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, choose **Deploy from a branch**.
   - Select **Branch**: `main` and folder `/ (root)`.
   - Click **Save**.
3. In ~1 minute, your app will be live at:
   ```text
   https://<your-username>.github.io/<repo-name>/
   ```

*Note: All paths (`manifest.webmanifest`, `sw.js`, icons, CSS, scripts) use relative paths (`./`), so the app runs smoothly under any sub-path.*

---

## 4. Install as a PWA on Your Phone

- **iOS (Safari)**:
  1. Open the site in Safari.
  2. Tap the **Share** button (box with upward arrow).
  3. Scroll down and tap **Add to Home Screen**.
- **Android (Chrome / Brave / Firefox)**:
  1. Open the site in Chrome.
  2. Tap the three dots menu (top right) or look for the **Install App** / **Add to Home screen** banner.
  3. Tap **Install**.

---

## 5. Maintenance: If Asura Scans Changes Layout

Asura Scans is built with Astro. The app parses data using a two-tier strategy in `app.js`:

| Target Function | Location | Purpose |
|-----------------|----------|---------|
| `parseLatestReleases(html)` | [`app.js`](file:///c:/Users/admin/OneDrive/Books/app.js) | Extracts series names, URLs (`/comics/...`), and latest chapter numbers from the homepage. Primary parser reads Astro's `<astro-island>` props; fallback uses DOM selectors. |
| `checkChapterReadability(workerUrl, seriesPath, chapterNum)` | [`app.js`](file:///c:/Users/admin/OneDrive/Books/app.js) | Checks whether a chapter is readable. Inspects `ChapterReader` Astro props (`isLocked`, `isPremium`, `unlockTime`) and chapter images (`cdn.asurascans.com/asura-images/chapters/...`). |

If Asura updates component names or HTML structure in the future, updating the selectors or regexes inside these two functions will immediately restore functionality.
