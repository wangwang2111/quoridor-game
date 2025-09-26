import React from 'react'

const startPlayground = () => {
  Sound.unlock()               // user gesture: this click
  setGs(new GameState(9))
  setAiAuto([false, false])
  setMode('PLAYGROUND')
  setHumanSide(null)
  setScene('GAME')
}

const startHumanAI = (humanIs /* 0 or 1 */) => {
  Sound.unlock()               // user gesture: this click
  const ai = [false, false]
  if (humanIs === 0) ai[1] = true
  if (humanIs === 1) ai[0] = true
  setGs(new GameState(9))
  setAiAuto(ai)
  setMode('HUMAN_AI')
  setHumanSide(humanIs)
  setScene('GAME')
}

export default function Menu({ onStartHumanAI, onStartPlayground, onShowTutorial, onQuit }) {
  return (
    <div style={{display:'grid', gap:12}}>
      <button className="primary" onClick={onStartHumanAI}>Human vs AI (autoplay)</button>
      <button onClick={onStartPlayground}>Playground (manual AI moves)</button>
      <button onClick={onShowTutorial}>Tutorial</button>
      <button onClick={onQuit}>Quit</button>
    </div>
  )
}

export function HumanAIChooser({ onChooseBlue, onChooseRed, onBack }) {
  return (
    <div style={{display:'grid', gap:12}}>
      <button className="primary" onClick={onChooseBlue}>Be Blue (P0) — AI is Red</button>
      <button className="primary" onClick={onChooseRed}>Be Red (P1) — AI is Blue</button>
      <button onClick={onBack}>Back</button>
    </div>
  )
}

export function Tutorial({ onBack }) {
  const lines = [
    'Goal: reach the opposite side first.',
    'Each turn: move pawn OR place a wall.',
    'Jump over an adjacent opponent; diagonal allowed when back is blocked.',
    'Walls cannot overlap/cross or remove all paths.',
    'Playground: you may press AI Move to let the bot play one move for the side to move.'
  ]
  return (
    <div style={{display:'grid', gap:10, maxWidth:600}}>
      <h3>How to play</h3>
      {lines.map((t,i)=><div key={i}>{t}</div>)}
      <div><button onClick={onBack}>Back</button></div>
    </div>
  )
}
