import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import GridBoard from './components/GridBoard.jsx'
import HUD from './components/HUD.jsx'
import Menu, { HumanAIChooser, Tutorial } from './components/Menu.jsx'
import { GameState } from './engine/gamestate.js'
import { searchWithTime } from './ai/search.js'
import Sound from './audio/sound.js'

/**
 * Tiny confetti for win celebration (no deps).
 * Spawns a canvas, animates colored dots, then removes itself.
 */
function confettiBurst(count = 60){
  const canvas = document.createElement('canvas')
  Object.assign(canvas.style, { position:'fixed', inset:0, pointerEvents:'none', zIndex:30 })
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  const dpi = window.devicePixelRatio || 1
  const resize = ()=>{ canvas.width = innerWidth*dpi; canvas.height = innerHeight*dpi }
  resize(); addEventListener('resize', resize, { once:true })

  const parts = Array.from({length:count}, () => ({
    x: Math.random()*canvas.width,
    y: -Math.random()*80,
    r: 4 + Math.random()*5,
    vx: (Math.random()-.5)*4*dpi,
    vy: (2+Math.random()*3)*dpi,
    g: .12*dpi,
    a: 1,
    c: Math.random()<.5 ? '#4b77ff' : '#ff5d4f'
  }))

  let t = 0
  const step = () => {
    ctx.clearRect(0,0,canvas.width,canvas.height)
    parts.forEach(p => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.a -= .008
      ctx.globalAlpha = Math.max(p.a,0)
      ctx.fillStyle = p.c
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    })
    t += 1
    if (t < 260) requestAnimationFrame(step)
    else document.body.removeChild(canvas)
  }
  requestAnimationFrame(step)
}

export default function App(){
  // ===== Scenes: MENU, HUMAN_AI (chooser), TUTORIAL, GAME =====
  const [scene, setScene] = useState('MENU')

  // ===== Game state (engine) =====
  const [gs, setGs] = useState(() => new GameState(9))

  // ===== UI state (selection, wall mode, previews) =====
  const [wallMode, setWallMode] = useState(false)
  const [wallOrient, setWallOrient] = useState('H')
  const [selectedCell, setSelectedCell] = useState(null)
  const [moveHighlights, setMoveHighlights] = useState([])
  const [pendingAnchor, setPendingAnchor] = useState(null)

  // ===== Autoplay toggles (per player index). In Human vs AI, one is true. =====
  const [aiAuto, setAiAuto] = useState([false, false])

  // ===== Audio UI + mode/role tracking (for win/lose sounds) =====
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(0.6)
  const [mode, setMode] = useState('MENU')          // 'MENU' | 'PLAYGROUND' | 'HUMAN_AI'
  const [humanSide, setHumanSide] = useState(null)  // 0 or 1 in HUMAN_AI; null otherwise

  const pct = Math.round(volume * 100);
  // Keep SoundManager in sync with UI toggles
  useEffect(()=>{ Sound.setMuted(muted) }, [muted])
  useEffect(()=>{ Sound.setVolume(volume) }, [volume])

  // Start/stop background music when entering/leaving the game scene
  useEffect(()=>{
    if (scene === 'GAME') {
      Sound.playBg();
      Sound.unlock();                  // unlock audio on user gesture; start bg loop
    }
    else Sound.stopBg()
  }, [scene])

  // ===== Derived labels =====
  const toMoveLabel = gs.toMove===0 ? 'Blue (P0)' : 'Red (P1)'
  const winner = gs.winner()

  // Shortest-path distances to show in the UI (— when unreachable)
  const fmt = d => (d == null ? '—' : d)
  const d0 = gs.board.bfsDistToGoal(gs.pawns[0], gs.goalRows(0))
  const d1 = gs.board.bfsDistToGoal(gs.pawns[1], gs.goalRows(1))

  // Win celebration confetti
  useEffect(()=>{
    if (winner !== null) confettiBurst(80)
  }, [winner])

  // Human vs AI: play win/lose sound (requires knowing which side is human)
  useEffect(()=>{
    if (winner === null) return
    if (mode === 'HUMAN_AI' && humanSide !== null) {
      if (winner === humanSide) Sound.play('win')
      else Sound.play('lose')
    }
  }, [winner, mode, humanSide])

  // Title suffix that states which side is autoplayed
  const aiLabel = (aiAuto[0] || aiAuto[1])
    ? ` — AI: ${aiAuto[0] && aiAuto[1] ? 'Both' : (aiAuto[0] ? 'Blue (P0)' : 'Red (P1)')}`
    : ''

  const [cellSize, setCellSize] = useState(56)
  const boardShellRef = useRef(null)

  useLayoutEffect(() => {
    const recalc = () => {
      const N = gs.N

      // Available width: the board column (when sidebar stacks, it's full width)
      const shellW = boardShellRef.current?.clientWidth || window.innerWidth
      // Available height: viewport minus header and some breathing room for panels
      const availH = Math.max(320, window.innerHeight - 180)

      // Fit by width & height, clamp to practical touch sizes
      const byW = Math.floor((shellW - 24) / N)
      const byH = Math.floor((availH - 24) / N)
      const fit = Math.max(32, Math.min(72, Math.min(byW, byH)))

      setCellSize(fit)
    }
    recalc()
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [gs.N, scene])

  // Utility: clear UI selection/highlights
  const resetSelection = () => { setSelectedCell(null); setMoveHighlights([]) }

  // Clone engine state while preserving move history (so undo works)
  const cloneFrom = (base) => {
    const s = new GameState(base.N)
    s.restore(base.snapshot())
    s.history = [...base.history]
    return s
  }

  // ======== Human actions ========

  // Commit a pawn move to a highlighted destination
  const doPawnMove = (rc) => {
    try {
      const s = cloneFrom(gs)
      s.apply({ kind:'PAWN', to: rc })
      setGs(s)
      Sound.play('move')             // SFX: pawn move
      resetSelection()
      setPendingAnchor(null)
    } catch {}
  }

  // Clicking a cell: if it's a highlighted target, move; otherwise clear selection
  const onCellClick = (rc) => {
    if (moveHighlights.some(m => m.r===rc.r && m.c===rc.c)) return doPawnMove(rc)
    resetSelection()
  }

  // Clicking a pawn: only the side-to-move can be selected; show legal moves
  const onPawnClick = (rc) => {
    const me = gs.toMove
    const pawn = gs.pawns[me]
    if (pawn.r===rc.r && pawn.c===rc.c) {
      setSelectedCell(rc)
      setMoveHighlights(gs.legalPawnMoves())
    } else {
      resetSelection()
    }
  }

  // Two-click wall placement using anchors
  const onAnchorClick = (r, c) => {
    if (!wallMode) return
    if (pendingAnchor && pendingAnchor.r===r && pendingAnchor.c===c) {
      try {
        const s = cloneFrom(gs)
        s.apply({ kind:'WALL', wall:{ r, c, o: wallOrient } })
        setGs(s)
        Sound.play('wall')           // SFX: wall place
      } catch {}
      setPendingAnchor(null)
      resetSelection()
    } else {
      setPendingAnchor({ r, c })
    }
  }

  // ======== AI integrations ========

  // Let the AI play one move for the side to move (manual trigger or autoplay)
  const onAIMove = () => {
    const s = cloneFrom(gs)
    const mv = searchWithTime(s, 5, 1000)
    if (mv) {
      s.apply(mv)
      setGs(s)
      Sound.play(mv.kind === 'PAWN' ? 'move' : 'wall')  // SFX: based on move type
    }
    setPendingAnchor(null)
    resetSelection()
  }

  /**
   * Autoplay effect (kept as your original 0ms setTimeout version).
   * Fires once per new `gs` value; if it's AI's turn and no winner, schedule AI move.
   * Note: you fixed backtracking in the search (lastMyTurnSquareFromHistory),
   * so we can safely keep this version.
   */
  useEffect(() => {
    if (winner !== null) return
    const side = gs.toMove
    if (aiAuto[side]) {
      const t = setTimeout(() => onAIMove(), 0) // queue for next tick
      return () => clearTimeout(t)
    }
  }, [gs, aiAuto, winner])

  // ======== Undo / Reset ========

  const onUndo = () => {
    const s = cloneFrom(gs)
    s.undo()
    setGs(s)
    setPendingAnchor(null)
    resetSelection()
  }

  const onReset = () => {
    setGs(new GameState(gs.N))
    setPendingAnchor(null)
    resetSelection()
  }

  // ======== Menu actions ========

  // Playground: no autoplay, allow pressing "AI Move" anytime.
  const startPlayground = () => {
    Sound.unlock()                  // unlock audio on user gesture; start bg loop
    setGs(new GameState(9))
    setAiAuto([false, false])
    setMode('PLAYGROUND')
    setHumanSide(null)
    setScene('GAME')
  }

  // Human vs AI: choose human side, enable autoplay for the other side.
  const startHumanAI = (humanIs /* 0 or 1 */) => {
    Sound.unlock()                  // unlock audio on user gesture; start bg loop
    const ai = [false, false]
    if (humanIs === 0) ai[1] = true   // human is Blue => AI is Red
    if (humanIs === 1) ai[0] = true   // human is Red  => AI is Blue
    setGs(new GameState(9))
    setAiAuto(ai)
    setMode('HUMAN_AI')
    setHumanSide(humanIs)
    setScene('GAME')
  }

  // ======== Winner overlay component ========
  const WinOverlay = () => {
    if (winner === null) return null

    // Determine the headline
    let headline;
    if (mode === 'HUMAN_AI' && humanSide !== null) {
      headline = (winner === humanSide) ? 'You Win!' : 'You Lose!'
    } else {
      headline = `Winner: ${winner === 0 ? 'Blue (P0)' : 'Red (P1)'}`
    }

    // Optional: small sublabel showing which side actually won
    const sub = `Winner: ${winner === 0 ? 'Blue (P0)' : 'Red (P1)'}`

    return (
      <div className="overlay">
        <div className="overlay-card">
          <h3 style={{marginBottom: 6}}>{headline}</h3>
          {(mode !== 'HUMAN_AI' || humanSide === null) ? null : (
            <div style={{fontSize: 13, color: '#9aa6b2', marginBottom: 8}}>{sub}</div>
          )}
          <div style={{display:'flex', gap:8, marginTop:8, justifyContent:'center'}}>
            <button className="primary" onClick={onReset}>Play again</button>
            <button onClick={()=>setScene('MENU')}>Menu</button>
          </div>
        </div>
      </div>
    )
  }

  // ======== Render ========
  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <h2>Quoridor{aiLabel}</h2>
        <div className="hdr-controls">
          <label className="mute">
            <input type="checkbox" checked={muted} onChange={e=>setMuted(e.target.checked)} />
            Mute
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            className="split vol"
            style={{ '--p': `${pct}%` }}   // this drives the fill color width
          />
          {scene === 'GAME' && <button className="btn" onClick={()=>setScene('MENU')}>Menu</button>}
        </div>
      </div>

      {/* Scenes */}
      {scene === 'MENU' && (
        <Menu
          onStartHumanAI={()=>setScene('HUMAN_AI')}
          onStartPlayground={startPlayground}
          onShowTutorial={()=>setScene('TUTORIAL')}
          onQuit={()=>window.close?.()}
        />
      )}

      {scene === 'HUMAN_AI' && (
        <HumanAIChooser
          onChooseBlue={()=>startHumanAI(0)}
          onChooseRed={()=>startHumanAI(1)}
          onBack={()=>setScene('MENU')}
        />
      )}

      {scene === 'TUTORIAL' && <Tutorial onBack={()=>setScene('MENU')} />}

      {scene === 'GAME' && (
        <div className="game-layout">
          {/* LEFT: Board */}
          <div className="board-pane" ref={boardShellRef}>
            <GridBoard
              gs={gs}
              cellSize={cellSize}           /* <— use responsive size */
              onCellClick={onCellClick}
              wallMode={wallMode}
              wallOrient={wallOrient}
              onAnchorClick={onAnchorClick}
              selectedCell={selectedCell}
              moveHighlights={moveHighlights}
              pendingAnchor={pendingAnchor}
              onPawnClick={onPawnClick}
            />
            <div className="legend">
              <span><span className="circle" style={{background:'#6aa5ff'}} /> Blue (P0)</span>
              <span><span className="circle" style={{background:'#ff6b61'}} /> Red (P1)</span>
            </div>
          </div>

          {/* RIGHT: Sidebar (always visible on wide screens) */}
          <aside className="side-pane">
            {/* Distances */}
            <div className="panel">
              <div className="panel-title">Shortest to goal</div>
              <div className="dist-row">
                <span className="dot blue" /> <b>Blue:</b> {fmt(d0)}
              </div>
              <div className="dist-row">
                <span className="dot red" /> <b>Red:</b> {fmt(d1)}
              </div>
            </div>

            {/* HUD controls */}
            <div className="panel">
              <HUD
                toMoveLabel={winner!==null? `Winner: ${winner===0? 'Blue':'Red'}` : toMoveLabel}
                wl0={gs.wallsLeft[0]}
                wl1={gs.wallsLeft[1]}
                wallMode={wallMode}
                wallOrient={wallOrient}
                onToggleWallMode={()=>{ setWallMode(v=>!v); setPendingAnchor(null) }}
                onSetOrient={(o)=>{ setWallOrient(o) }}
                onUndo={onUndo}
                onReset={onReset}
                onAIMove={onAIMove}
              />
            </div>
          </aside>

          <WinOverlay/>
        </div>
      )}
    </div>
  )
}