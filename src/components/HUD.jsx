import React from 'react'

export default function HUD({ toMoveLabel, wl0, wl1, wallMode, wallOrient, onToggleWallMode, onSetOrient, onUndo, onReset, onAIMove }){
  return (
    <div className="controls">
      <span className="badge">Turn: {toMoveLabel}</span>
      <span className="badge">Walls P0={wl0} P1={wl1}</span>
      <button onClick={onToggleWallMode}>{wallMode? 'Wall Mode: ON':'Wall Mode: OFF'}</button>
      <button onClick={()=>onSetOrient('H')} className={wallOrient==='H'?'primary':''}>H</button>
      <button onClick={()=>onSetOrient('V')} className={wallOrient==='V'?'primary':''}>V</button>
      <button className="primary" onClick={onAIMove}>AI Move</button>
      <button onClick={onUndo}>Undo</button>
      <button onClick={onReset}>Reset</button>
    </div>
  )
}
