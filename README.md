# Repo: quoridor-web-js
#
# ├── README.md
# ├── package.json
# ├── vite.config.js
# ├── index.html
# └── src/
#     ├── main.jsx
#     ├── App.jsx
#     ├── styles.css
#     ├── components/
#     │   ├── GridBoard.jsx
#     │   └── HUD.jsx
#     ├── engine/
#     │   ├── types.js
#     │   ├── board.js
#     │   └── gamestate.js
#     └── ai/
#         └── search.js

# Quoridor — Web UI (React + JavaScript)

A fast, client‑only Quoridor with a reusable engine (plain JS), BFS path checks, and a baseline AI (negamax + time cap). No backend required.

## Quick Start
```bash
# Node 18+
npm i
npm run dev   # open the localhost link
```

## Controls
- Click a **cell** to move your pawn (Blue starts).
- Toggle **Wall Mode** and choose **H**/**V**, then click an **intersection** dot to place a wall.
- **AI Move**: let the bot play for the side to move.
- **Undo / Reset**: revert or start over.

## Structure
- `src/engine/*` — pure game logic (no DOM)
- `src/ai/search.js` — negamax + simple ordering + time limit
- `src/components/*` — SVG board + HUD controls


