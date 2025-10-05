Here’s a **production-ready README rewrite** that’s clean, professional, and ready for public or team use — including sections for **build setup, environment variables, Docker deployment**, and **project structure**. It’s still concise and developer-friendly, like a modern open-source project README.

---

# 🧩 Quoridor — Web UI (React + Vite)

> A fast, lightweight Quoridor implementation with a reusable JavaScript engine, BFS pathfinding, and a time-capped Negamax AI.
> 100% client-side — no backend required.

---

## 📁 Repository Structure

```
quoridor-web-js/
├── README.md
├── package.json
├── vite.config.js
├── index.html
└── src/
    ├── main.jsx              # Entry point
    ├── App.jsx               # Main app shell
    ├── styles.css            # Global styles
    ├── components/           # React UI components
    │   ├── GridBoard.jsx
    │   └── HUD.jsx
    ├── engine/               # Game logic (framework-agnostic)
    │   ├── board.js
    │   ├── gamestate.js
    │   └── types.js
    └── ai/
        └── search.js         # Negamax AI with time control
```

## 🚀 Quick Start (Development)

**Requirements:** Node.js ≥ 18, npm ≥ 9

```bash
# Clone & enter the repo
git clone https://github.com/yourname/quoridor-web-js.git
cd quoridor-web-js

# Install dependencies
npm install

# Start the development server
npm run dev
# Then open the local URL (usually http://localhost:5173)
```

## 🧱 Build for Production

Generate an optimized static bundle with:

```bash
npm run build
```

This will output static assets to the `dist/` folder, ready for deployment on any static host (e.g., GitHub Pages, Netlify, Vercel, Nginx).

You can preview the build locally:

```bash
npm run preview
```

## 🐳 Run with Docker

Build and serve the app in a production-grade container:

```bash
# Build image
docker build -t quoridor-web .

# Run container
docker run -d -p 8080:80 quoridor-web

# Build (optionally pass build-time vars)
docker build -t quoridor-web --build-arg VITE_AI_TIME_MS=1000 --build-arg VITE_DEFAULT_DEPTH=3 .

# Run
docker run -d -p 8080:80 --name quoridor quoridor-web
# Open http://localhost:8080
Access the app at http://localhost:8080
```

## ⚙️ Environment Variables (Optional)

You can override defaults using a `.env` file (Vite convention):

```
VITE_AI_TIME_MS=1000      # AI time cap (ms)
VITE_DEFAULT_DEPTH=3      # Search depth
```

## 🎮 Controls

* **Click a cell** → Move your pawn (Blue starts)
* **Wall Mode** → Toggle H/V and click intersection to place a wall
* **AI Move** → Let the built-in AI play the current turn
* **Undo / Reset** → Revert or start a new game

## 🧠 Architecture Notes

* **Pure JS Engine** in `src/engine/`: independent of React or the DOM, usable for CLI or other front-ends.
* **AI Module** (`src/ai/search.js`): Negamax with alpha-beta pruning, simple move ordering, and a time limit.
* **React Components** render SVG elements for the grid, walls, and pawn positions.

## 🧩 Future Improvements

* 🕹️ Smarter AI (iterative deepening, transposition tables)
* 🌐 Multiplayer backend (WebSocket or WebRTC)
* 📱 Responsive UI / mobile gestures
* 🧪 Unit tests for engine and AI logic (Vitest)

## 🪪 License

MIT © 2025 [Dylan]
