import { keyCell } from './types.js'

/**
 * Board representation for Quoridor.
 * Walls are indexed by their anchor (r row,c col) and orientation:
 *   - Horizontal wall "H" at (r,c) spans between rows r..r+1 and columns c..c+1 (two cells wide).
 *   - Vertical wall "V" at (r,c) spans between cols c..c+1 and rows r..r+1 (two cells high).
 *
 * This class provides:
 *   - legality checks (no overlap/cross/half-overlap),
 *   - neighbor generation that respects walls,
 *   - BFS shortest-distance helpers,
 *   - A* shortest-distance helpers.
 */
export class Board {
  constructor(N = 9){
    this.N = N
    this.hWalls = new Set()        // keys: "r,c"
    this.vWalls = new Set()
    // Ownership maps (optional cosmetic): 0 or 1
    this.hOwners = new Map()       // key -> player index
    this.vOwners = new Map()
  }

  /* ---------------------------
   * Overlap / legality helpers
   * --------------------------- */

  // Detect half-overlap (same-orientation sharing one segment)
  _hHalfOverlap(r, c) {
    // H at (r,c) spans columns [c, c+1]; neighbors at c-1 or c+1 would overlap one segment
    return this.hWalls.has(`${r},${c-1}`) || this.hWalls.has(`${r},${c+1}`)
  }
  _vHalfOverlap(r, c) {
    // V at (r,c) spans rows [r, r+1]; neighbors at r-1 or r+1 would overlap one segment
    return this.vWalls.has(`${r-1},${c}`) || this.vWalls.has(`${r+1},${c}`)
  }

  wallLegal(w){
    const { r,c,o } = w
    if (!(0 <= r && r < this.N-1 && 0 <= c && c < this.N-1)) return false

    if (o === 'H') {
      // exact overlap
      if (this.hWalls.has(`${r},${c}`)) return false
      // crossing at same anchor
      if (this.vWalls.has(`${r},${c}`)) return false
      // prevent half-overlap with adjacent H walls
      if (this._hHalfOverlap(r, c)) return false
    } else {
      if (this.vWalls.has(`${r},${c}`)) return false
      if (this.hWalls.has(`${r},${c}`)) return false
      // prevent half-overlap with adjacent V walls
      if (this._vHalfOverlap(r, c)) return false
    }
    return true
  }

  // owner is optional for tentative placements (legality probes)
  placeWall(w, owner /* 0|1 | undefined */){
    if (!this.wallLegal(w)) throw new Error('Illegal wall placement')
    const key = `${w.r},${w.c}`
    if (w.o === 'H') {
      this.hWalls.add(key)
      if (owner !== undefined) this.hOwners.set(key, owner)
    } else {
      this.vWalls.add(key)
      if (owner !== undefined) this.vOwners.set(key, owner)
    }
  }

  removeWall(w){
    const key = `${w.r},${w.c}`
    if (w.o === 'H') {
      this.hWalls.delete(key)
      this.hOwners.delete(key) // safe even if no entry
    } else {
      this.vWalls.delete(key)
      this.vOwners.delete(key)
    }
  }

  /* ---------------------------
   * Movement / graph utilities
   * --------------------------- */

  // Return true if edge a->b is blocked by any wall. (Orthogonal neighbors only.)
  _blockedEdge(a,b){
    const ar=a.r, ac=a.c, br=b.r, bc=b.c
    if (ar === br){
      if (Math.abs(ac-bc)!==1) return true
      const cmin = Math.min(ac, bc)
      // vertical segment at (row=ar or ar-1, col=cmin) blocks horizontal movement
      if (this.vWalls.has(`${ar},${cmin}`) || this.vWalls.has(`${ar-1},${cmin}`)) return true
      return false
    }
    if (ac === bc){
      if (Math.abs(ar-br)!==1) return true
      const rmin = Math.min(ar, br)
      // horizontal segment at (row=rmin, col=ac or ac-1) blocks vertical movement
      if (this.hWalls.has(`${rmin},${ac}`) || this.hWalls.has(`${rmin},${ac-1}`)) return true
      return false
    }
    return true // diagonals not allowed
  }

  // 4-neighborhood that respects walls
  neighbors(p){
    const N = this.N
    const cand=[]
    if (p.r>0) cand.push({r:p.r-1,c:p.c})
    if (p.r+1<N) cand.push({r:p.r+1,c:p.c})
    if (p.c>0) cand.push({r:p.r,c:p.c-1})
    if (p.c+1<N) cand.push({r:p.r,c:p.c+1})
    return cand.filter(q=>!this._blockedEdge(p,q))
  }

  /* ---------------------------
   * BFS shortest paths
   * --------------------------- */

  // Unweighted shortest distance to any row in goalRows; returns number of steps or null
  bfsDistToGoal(start, goalRows){
    const seen = new Set([keyCell(start)])
    const q = [[start,0]]
    while(q.length){
      const [u,d] = q.shift()
      if (goalRows.has(u.r)) return d
      for (const v of this.neighbors(u)){
        const k = keyCell(v)
        if (!seen.has(k)){ seen.add(k); q.push([v,d+1]) }
      }
    }
    return null
  }

  // Unweighted shortest path: returns { dist, next } where next is the first step along a shortest path
  bfsNextStepToGoal(start, goalRows){
    const key = (p)=>`${p.r},${p.c}`
    const seen = new Set([key(start)])
    const q = [start]
    const parent = new Map()  // key(child) -> parent cell

    while(q.length){
      const u = q.shift()
      if (goalRows.has(u.r)){
        // reconstruct first step from start
        let cur = u
        let prev = parent.get(key(cur))
        while (prev && !(prev.r===start.r && prev.c===start.c)){
          cur = prev
          prev = parent.get(key(cur))
        }
        const dist = this._reconstructDist(parent, start, u)
        const next = (cur.r===start.r && cur.c===start.c) ? start : cur
        return { dist, next }
      }
      for (const v of this.neighbors(u)){
        const kv = key(v)
        if (!seen.has(kv)){
          seen.add(kv); parent.set(kv, u); q.push(v)
        }
      }
    }
    return { dist: null, next: null }
  }

  // helper to compute distance from parent map
  _reconstructDist(parent, start, end){
    const key = (p)=>`${p.r},${p.c}`
    let d = 0, cur = end
    while (true){
      const p = parent.get(key(cur))
      if (!p) break
      d += 1
      cur = p
    }
    return d
  }

  pathExistsFor(start, goalRows){
    return this.bfsDistToGoal(start, goalRows) !== null
  }

  /* ---------------------------
   * A* shortest paths (NEW)
   * --------------------------- */

  /**
   * Heuristic: admissible estimate of steps from (r,c) to the closest goal row.
   * For Quoridor, horizontal position doesn't reduce the minimum number of *row*
   * crossings needed, so |r - g| is admissible; we take the min over all goal rows.
   */
  _hToGoal(p, goalRows){
    if (!goalRows || goalRows.size === 0) return 0
    let best = Infinity
    for (const g of goalRows){ best = Math.min(best, Math.abs(p.r - g)) }
    return best
  }

  /**
   * A* distance to any row in goalRows. Returns the minimal number of steps, or null if unreachable.
   * - Edges are unit cost (1 per move).
   * - f(n) = g(n) + h(n) where h is _hToGoal (admissible/consistent here).
   */
  astarDistToGoal(start, goalRows){
    const key = (p)=>`${p.r},${p.c}`
    const gScore = new Map([[key(start), 0]])
    const fScore = new Map([[key(start), this._hToGoal(start, goalRows)]])
    const open = new MinPQ()
    open.push(key(start), fScore.get(key(start)))

    const seen = new Set()

    while(!open.empty()){
      const uKey = open.pop()                 // node with smallest f
      if (seen.has(uKey)) continue
      seen.add(uKey)

      const [ur, uc] = uKey.split(',').map(Number)
      const u = { r: ur, c: uc }
      if (goalRows.has(u.r)) return gScore.get(uKey) ?? null

      const gu = gScore.get(uKey) ?? Infinity
      for (const v of this.neighbors(u)){
        const vKey = key(v)
        const tentative = gu + 1              // unit edge cost
        if (tentative < (gScore.get(vKey) ?? Infinity)){
          gScore.set(vKey, tentative)
          const fv = tentative + this._hToGoal(v, goalRows)
          fScore.set(vKey, fv)
          open.push(vKey, fv)
        }
      }
    }
    return null
  }

  /**
   * A* path to any goal row. Returns:
   *   { dist, next }
   * where:
   *   - dist is the shortest number of steps (or null if unreachable)
   *   - next is the *first* step from `start` along an optimal path (or null)
   */
  astarNextStepToGoal(start, goalRows){
    const key = (p)=>`${p.r},${p.c}`
    const gScore = new Map([[key(start), 0]])
    const fScore = new Map([[key(start), this._hToGoal(start, goalRows)]])
    const cameFrom = new Map() // childKey -> parent cell
    const open = new MinPQ()
    const closed = new Set()

    open.push(key(start), fScore.get(key(start)))

    while(!open.empty()){
      const uKey = open.pop()
      if (closed.has(uKey)) continue
      closed.add(uKey)

      const [ur, uc] = uKey.split(',').map(Number)
      const u = { r: ur, c: uc }

      // Reached any goal row cell
      if (goalRows.has(u.r)){
        // Reconstruct the first step along the path from start -> u
        let cur = u
        let prev = cameFrom.get(key(cur))
        while (prev && !(prev.r===start.r && prev.c===start.c)){
          cur = prev
          prev = cameFrom.get(key(cur))
        }
        const dist = this._astarReconstructDist(cameFrom, start, u)
        const next = (cur.r===start.r && cur.c===start.c) ? start : cur
        return { dist, next }
      }

      const gu = gScore.get(uKey) ?? Infinity
      for (const v of this.neighbors(u)){
        const vKey = key(v)
        const tentative = gu + 1
        if (tentative < (gScore.get(vKey) ?? Infinity)){
          gScore.set(vKey, tentative)
          cameFrom.set(vKey, u)
          const fv = tentative + this._hToGoal(v, goalRows)
          fScore.set(vKey, fv)
          open.push(vKey, fv)
        }
      }
    }
    return { dist: null, next: null }
  }

  _astarReconstructDist(cameFrom, start, end){
    const key = (p)=>`${p.r},${p.c}`
    let d = 0, cur = end
    while (true){
      const p = cameFrom.get(key(cur))
      if (!p) break
      d += 1
      cur = p
    }
    return d
  }
}

/* ---------------------------
 * Tiny Min-Priority Queue for A*
 * (binary heap keyed by f-score)
 * --------------------------- */
class MinPQ {
  constructor(){ this._a = [] }            // array of [key, priority]
  empty(){ return this._a.length === 0 }
  push(key, pri){
    this._a.push([key, pri]); this._siftUp(this._a.length-1)
  }
  pop(){
    if (this._a.length === 0) return null
    const top = this._a[0][0]
    const last = this._a.pop()
    if (this._a.length){
      this._a[0] = last
      this._siftDown(0)
    }
    return top
  }
  _siftUp(i){
    while (i>0){
      const p = ((i-1)|0) >> 1
      if (this._a[p][1] <= this._a[i][1]) break
      ;[this._a[p], this._a[i]] = [this._a[i], this._a[p]]
      i = p
    }
  }
  _siftDown(i){
    const n = this._a.length
    while (true){
      let l = i*2+1, r = l+1, s = i
      if (l<n && this._a[l][1] < this._a[s][1]) s = l
      if (r<n && this._a[r][1] < this._a[s][1]) s = r
      if (s === i) break
      ;[this._a[s], this._a[i]] = [this._a[i], this._a[s]]
      i = s
    }
  }
}
