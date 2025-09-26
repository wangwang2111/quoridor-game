import { Board } from './board.js'

export class GameState {
  constructor(N=9){
    this.board = new Board(N)
    this.N = N
    this.pawns = [ {r:0,c:Math.floor(N/2)}, {r:N-1,c:Math.floor(N/2)} ]
    this.wallsLeft = [10,10]
    this.toMove = 0 // 0: Blue, 1: Red
    this.history = []
  }

  shortestPathNext(me = this.toMove){
    const { dist, next } = this.board.bfsNextStepToGoal(this.pawns[me], this.goalRows(me))
    return { dist, next } // next may be null if blocked (shouldn’t happen due to legality checks)
  }

  goalRows(p){ return p===0 ? new Set([this.N-1]) : new Set([0]) }
  inBounds(p){ return 0<=p.r && p.r<this.N && 0<=p.c && p.c<this.N }

  legalPawnMoves(){
    const me=this.toMove, you=1-me
    const myp=this.pawns[me], opp=this.pawns[you]
    const nbrs=this.board.neighbors(myp)
    const out=[]
    for (const q of nbrs){
      if (q.r===opp.r && q.c===opp.c){
        const dr=opp.r-myp.r, dc=opp.c-myp.c
        const dest={r:opp.r+dr, c:opp.c+dc}
        if (this.inBounds(dest) && !this.board._blockedEdge(opp,dest)) out.push(dest)
        else {
          for (const d of [{r:-1,c:0},{r:1,c:0},{r:0,c:-1},{r:0,c:1}]){
            const side={r:opp.r+d.r, c:opp.c+d.c}
            if (!this.inBounds(side)) continue
            if (!this.board._blockedEdge(opp,side) && !this.board._blockedEdge(myp,opp)) out.push(side)
          }
        }
      } else out.push(q)
    }
    // dedup
    const seen=new Set(), uniq=[]
    for (const m of out){ const k=`${m.r},${m.c}`; if (!seen.has(k)){ seen.add(k); uniq.push(m) } }
    return uniq
  }

  legalWallMoves(){
    const me=this.toMove
    if (this.wallsLeft[me]<=0) return []
    const N=this.N, cand=[]
    for(let r=0;r<N-1;r++) for(let c=0;c<N-1;c++) for(const o of ['H','V']){
      const w={r,c,o}
      if (!this.board.wallLegal(w)) continue
      // probe: place temporarily WITHOUT owner
      this.board.placeWall(w)                 // owner omitted
      const ok = this.board.pathExistsFor(this.pawns[0], this.goalRows(0)) &&
                 this.board.pathExistsFor(this.pawns[1], this.goalRows(1))
      this.board.removeWall(w)
      if (ok) cand.push(w)
    }
    return cand
  }

  // change signature: default is true so UI/undo work the same
  apply(mv, recordHistory = true){
    if (recordHistory) this.history.push(this.snapshot())

    if (mv.kind==='PAWN'){
      const legal = this.legalPawnMoves().some(p=>p.r===mv.to.r && p.c===mv.to.c)
      if (!legal) throw new Error('Illegal pawn move')
      this.pawns[this.toMove] = {...mv.to}
    } else {
      const w=mv.wall
      const me = this.toMove
      if (this.wallsLeft[me] <= 0) throw new Error('No walls left')
      if (!this.board.wallLegal(w)) throw new Error('Illegal wall placement')
      this.board.placeWall(w, me)  // owner recorded
      const ok = this.board.pathExistsFor(this.pawns[0], this.goalRows(0)) &&
                this.board.pathExistsFor(this.pawns[1], this.goalRows(1))
      if (!ok){ this.board.removeWall(w); throw new Error('Wall blocks all paths') }
      this.wallsLeft[me] -= 1
    }
    this.toMove = 1 - this.toMove
  }


  legalMoves(){
    return [
      ...this.legalPawnMoves().map(to=>({kind:'PAWN', to})),
      ...this.legalWallMoves().map(wall=>({kind:'WALL', wall})),
    ]
  }

  snapshot(){
    return {
      pawns: JSON.parse(JSON.stringify(this.pawns)),
      h: new Set(this.board.hWalls),
      v: new Set(this.board.vWalls),
      // NEW: persist ownership so colors survive undo/redo
      hOwn: Array.from(this.board.hOwners.entries()),  // [ [ "r,c", owner ], ... ]
      vOwn: Array.from(this.board.vOwners.entries()),
      wl: [...this.wallsLeft],
      tm: this.toMove,
    }
  }

  restore(s){
    this.pawns = JSON.parse(JSON.stringify(s.pawns))
    this.board.hWalls = new Set(s.h)
    this.board.vWalls = new Set(s.v)
    // NEW: rebuild owner maps
    this.board.hOwners = new Map(s.hOwn ?? [])
    this.board.vOwners = new Map(s.vOwn ?? [])
    this.wallsLeft = [...s.wl]
    this.toMove = s.tm
  }

  undo(){ const s=this.history.pop(); if (s) this.restore(s) }

  winner(){
    if (this.pawns[0].r===this.N-1) return 0
    if (this.pawns[1].r===0) return 1
    return null
  }

  evaluate(me = this.toMove){
    const you = 1 - me
    const dMe = this.board.bfsDistToGoal(this.pawns[me], this.goalRows(me))
    const dYou = this.board.bfsDistToGoal(this.pawns[you], this.goalRows(you))
    if (dMe==null || dYou==null) return 0
    // good if my path is shorter and I have more walls:
    return (dYou - dMe) * 10 + (this.wallsLeft[me] - this.wallsLeft[you]) * 0.5
  }
}