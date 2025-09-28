import { GameState } from '../engine/gamestate.js'

/**
 * Return the square I was on at the *start of my previous turn*.
 * history[i] stores a snapshot taken BEFORE move i is applied.
 * For example, if it's my turn now, history[history.length-2] is the
 * snapshot right before my last turn (two plies ago).
 */
function lastMyTurnSquareFromHistory(history, me){
  if (!history || history.length < 2) return null
  const snap = history[history.length - 2]   // before my previous turn
  return snap?.pawns?.[me] ?? null
}

/** Cell equality helper. */
function sameCell(a,b){ return a && b && a.r===b.r && a.c===b.c }

/**
 * Collect my last k starting squares (one per my turn) from history.
 * This is used to discourage cycling inside pockets by penalizing moves
 * that revisit very recent positions.
 */
function recentMySquares(history, me, k=6){
  const squares = []
  // history[i] is the snapshot BEFORE move i
  // Step back two at a time to land on "my-turn starts".
  for (let i = history.length - 2; i >= 0 && squares.length < k; i -= 2){
    const snap = history[i]
    if (snap?.pawns?.[me]) squares.push(snap.pawns[me])
  }
  return squares
}

/**
 * Move ordering is crucial for alpha–beta efficiency and to reduce “ping-pong”.
 * Heuristics used:
 *   - Primary: (dYou - dMe) after making the move (prefer shortening my path and
 *     lengthening opponent’s).
 *   - Prefer stepping onto the *first* node of my current shortest path (sp.next).
 *   - Penalize stepping back to the square I started from last turn (anti-backtrack).
 *   - Penalize revisiting any of my last k starting squares (avoid pocket loops).
 *
 * NOTE: We apply the move with recordHistory=false since this is a lookahead;
 *       then we restore from snapshot — the real state never changes.
 */
function orderedMoves(state){
  const me = state.toMove, you = 1 - me
  const myGoal = state.goalRows(me), oppGoal = state.goalRows(you)

  // Compute these ONCE from true game history (not from hypothetical states)
  const backSquare = (state.history.length >= 2)
    ? state.history[state.history.length-2]?.pawns?.[me]
    : null
  const recent = recentMySquares(state.history, me, 6)

  // shortestPathNext(me) should return { dist, next } where `next` is the
  // first step on *a* shortest path given current walls/pawns
  const sp = state.shortestPathNext(me)  // {dist, next}

  const scored = []
  for (const mv of state.legalMoves()){
    const snap = state.snapshot()
    state.apply(mv, /*recordHistory=*/false)

    // Distances AFTER the move (BFS shortest path lengths)
    const dMe  = state.board.astarDistToGoal(state.pawns[me],  myGoal) ?? 99
    const dYou = state.board.astarDistToGoal(state.pawns[you], oppGoal) ?? 99

    // Base score: improve my distance vs opponent’s
    let score = (dYou - dMe)

    if (mv.kind === 'PAWN'){
      const dest = state.pawns[me]

      // (1) Nudge towards the first step on my current shortest path.
      if (sp.next && sameCell(dest, sp.next)) score += 2.0

      // (2) Anti-backtrack: don’t step back to where I started last turn.
      if (backSquare && sameCell(dest, backSquare)) score -= 1.5

      // (3) Anti-pocket: avoid recently visited my-turn starts.
      if (recent.some(s => sameCell(s, dest))) score -= 0.7
    }

    state.restore(snap)
    scored.push([score, mv])
  }

  // High to low — better moves first improves alpha–beta pruning.
  scored.sort((a,b)=>b[0]-a[0])
  return scored.map(([,m])=>m)
}

/**
 * Unique key for repetition detection.
 * Includes: pawn positions, sets of walls, and side-to-move.
 * If a key repeats during search, we penalize slightly to break local cycles.
 */
function posKey(state){
  return JSON.stringify({
    p: state.pawns,
    h: [...state.board.hWalls],
    v: [...state.board.vWalls],
    tm: state.toMove
  })
}

/**
 * NEGAMAX with Alpha–Beta pruning (+ simple repetition avoidance).
 *
 * Negamax is mathematically equivalent to minimax in zero-sum games, but
 * simpler to implement: every node is a "max" node and we flip signs when
 * changing turns. The alpha–beta bounds are also negated when descending.
 *
 *   negamax(state, depth, alpha, beta):
 *     for each move:
 *       value = -negamax(child, depth-1, -beta, -alpha)
 *       keep best value, update alpha, prune if alpha >= beta
 *
 * Repetition handling:
 *   - Maintain a `seen` set of position keys along the current path.
 *   - If we encounter a key again, return a tiny negative value proportional
 *     to remaining depth (discourages cycles but doesn’t nuke the branch).
 */
function negamax(state, depth, alpha, beta, seen){
  const k = posKey(state)
  if (seen.has(k)) return [-0.001 * depth, null]  // tiny penalty to break loops
  seen.add(k)

  // Terminal / horizon checks
  const w = state.winner()
  if (w !== null){ seen.delete(k); return [(w===state.toMove ? 1e6 : -1e6), null] }
  if (depth === 0){ seen.delete(k); return [ state.evaluate(), null ] }

  let bestVal=-Infinity, bestMove=null
  for (const mv of orderedMoves(state)){
    const snap = state.snapshot()
    state.apply(mv, /*recordHistory=*/false)

    // Flip perspective with negation; also flip alpha/beta bounds.
    const [vc] = negamax(state, depth-1, -beta, -alpha, seen)
    const val = -vc

    state.restore(snap)

    if (val>bestVal){ bestVal=val; bestMove=mv }
    if (bestVal>alpha) alpha=bestVal
    if (alpha>=beta) break  // alpha–beta cutoff
  }
  seen.delete(k)
  return [bestVal, bestMove]
}

/**
 * Iterative deepening + time guard.
 *
 * - If I have **no walls left**, try a fast-path: step to the first node of my
 *   current shortest path if that step is legal — this often beats doing a full
 *   search in late phases.
 * - Otherwise, deepen the negamax search from depth=1..maxDepth, keeping the
 *   best move seen so far, and stop if timeLimitMs is exceeded.
 *
 * Returns: the best move found (or a legal fallback if none).
 */
export function searchWithTime(state, maxDepth=5, timeLimitMs=2500){
  const me = state.toMove

  // Fast path in wall-less endgames: follow the first step of shortest path.
  if (state.wallsLeft[me] <= 0){
    const { next } = state.shortestPathNext(me)
    if (next){
      // Make sure it’s actually legal (e.g., not occupied by opponent after a jump case).
      const legal = state.legalPawnMoves().some(p=>p.r===next.r && p.c===next.c)
      if (legal) return { kind:'PAWN', to: next }
    }
  }

  // Iterative deepening with a wall-clock time guard.
  const start = performance.now()
  let best=null
  for (let d=1; d<=maxDepth; d++){
    const [_, mv] = negamax(state, d, -Infinity, Infinity, new Set())
    if (mv) best=mv
    if (performance.now()-start > timeLimitMs) break
  }

  // Always return a legal move.
  return best ?? state.legalMoves()[0]
}
