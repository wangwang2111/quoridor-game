import { GameState } from '../engine/gamestate.js'

function lastMyTurnSquareFromHistory(history, me){
  if (!history || history.length < 2) return null
  const snap = history[history.length - 2]   // before my previous turn
  return snap?.pawns?.[me] ?? null
}

function sameCell(a,b){ return a && b && a.r===b.r && a.c===b.c }

function recentMySquares(history, me, k=6){
  const squares = []
  // history[i] is the snapshot BEFORE move i
  for (let i = history.length - 2; i >= 0 && squares.length < k; i -= 2){
    const snap = history[i]
    if (snap?.pawns?.[me]) squares.push(snap.pawns[me])
  }
  return squares
}

function orderedMoves(state){
  const me = state.toMove, you = 1 - me
  const myGoal = state.goalRows(me), oppGoal = state.goalRows(you)

  // compute these ONCE from true game history
  const backSquare = (state.history.length >= 2) ? state.history[state.history.length-2]?.pawns?.[me] : null
  const recent = recentMySquares(state.history, me, 6)
  const sp = state.shortestPathNext(me)  // {dist,next}

  const scored = []
  for (const mv of state.legalMoves()){
    const snap = state.snapshot()
    state.apply(mv, /*recordHistory=*/false)

    const dMe  = state.board.bfsDistToGoal(state.pawns[me],  myGoal) ?? 99
    const dYou = state.board.bfsDistToGoal(state.pawns[you], oppGoal) ?? 99

    let score = (dYou - dMe)

    if (mv.kind === 'PAWN'){
      const dest = state.pawns[me]

      // 1) Big nudge to follow the shortest-path first step
      if (sp.next && sameCell(dest, sp.next)) score += 2.0

      // 2) Anti-backtrack (last-turn square)
      if (backSquare && sameCell(dest, backSquare)) score -= 1.5

      // 3) Avoid recently-visited pockets (k-step)
      if (recent.some(s => sameCell(s, dest))) score -= 0.7
    }

    state.restore(snap)
    scored.push([score, mv])
  }

  scored.sort((a,b)=>b[0]-a[0])
  return scored.map(([,m])=>m)
}

function posKey(state){
  return JSON.stringify({ p: state.pawns, h: [...state.board.hWalls], v: [...state.board.vWalls], tm: state.toMove })
}

function negamax(state, depth, alpha, beta, seen){
  const k = posKey(state)
  if (seen.has(k)) return [-0.001 * depth, null]
  seen.add(k)

  const w = state.winner()
  if (w !== null){ seen.delete(k); return [(w===state.toMove ? 1e6 : -1e6), null] }
  if (depth === 0){ seen.delete(k); return [ state.evaluate(), null ] }

  let bestVal=-Infinity, bestMove=null
  for (const mv of orderedMoves(state)){
    const snap = state.snapshot()
    state.apply(mv, /*recordHistory=*/false)
    const [vc] = negamax(state, depth-1, -beta, -alpha, seen)
    const val = -vc
    state.restore(snap)
    if (val>bestVal){ bestVal=val; bestMove=mv }
    if (bestVal>alpha) alpha=bestVal
    if (alpha>=beta) break
  }
  seen.delete(k)
  return [bestVal, bestMove]
}

export function searchWithTime(state, maxDepth=7, timeLimitMs=3500){
  const me = state.toMove
  if (state.wallsLeft[me] <= 0){
    const { next } = state.shortestPathNext(me)
    if (next){
      // ensure it’s legal: it will be unless opponent occupies it
      const legal = state.legalPawnMoves().some(p=>p.r===next.r && p.c===next.c)
      if (legal) return { kind:'PAWN', to: next }
    }
  }
  const start = performance.now()
  let best=null
  for (let d=1; d<=maxDepth; d++){
    const [_, mv] = negamax(state, d, -Infinity, Infinity, new Set())
    if (mv) best=mv
    if (performance.now()-start > timeLimitMs) break
  }
  return best ?? state.legalMoves()[0]
}
