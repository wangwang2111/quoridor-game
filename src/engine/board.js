import { keyCell } from './types.js'

export class Board {
  constructor(N = 9){
    this.N = N
    this.hWalls = new Set()        // keys: "r,c"
    this.vWalls = new Set()
    // NEW: ownership maps -> 0 or 1
    this.hOwners = new Map()       // key -> player index
    this.vOwners = new Map()
  }

  // NEW: helpers to detect half-overlap (same-orientation sharing one segment)
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

  _blockedEdge(a,b){
    const ar=a.r, ac=a.c, br=b.r, bc=b.c
    if (ar === br){
      if (Math.abs(ac-bc)!==1) return true
      const cmin = Math.min(ac, bc)
      if (this.vWalls.has(`${ar},${cmin}`) || this.vWalls.has(`${ar-1},${cmin}`)) return true
      return false
    }
    if (ac === bc){
      if (Math.abs(ar-br)!==1) return true
      const rmin = Math.min(ar, br)
      if (this.hWalls.has(`${rmin},${ac}`) || this.hWalls.has(`${rmin},${ac-1}`)) return true
      return false
    }
    return true
  }

  neighbors(p){
    const N = this.N
    const cand=[]
    if (p.r>0) cand.push({r:p.r-1,c:p.c})
    if (p.r+1<N) cand.push({r:p.r+1,c:p.c})
    if (p.c>0) cand.push({r:p.r,c:p.c-1})
    if (p.c+1<N) cand.push({r:p.r,c:p.c+1})
    return cand.filter(q=>!this._blockedEdge(p,q))
  }

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
      const dist = this._reconstructDist(parent, start, u)  // helper below
      const next = (cur.r===start.r && cur.c===start.c) ? start : cur
      return { dist, next }   // next is the first move along a shortest path
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
}
