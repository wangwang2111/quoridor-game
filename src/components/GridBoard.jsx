import React from 'react'

export default function GridBoard({
  gs,
  cellSize = 56,
  onCellClick,
  wallMode,
  wallOrient,
  onAnchorClick,
  selectedCell,
  moveHighlights,
  pendingAnchor,
  onPawnClick,
}) {
  const N = gs.N
  const w = cellSize * N + 2
  const h = cellSize * N + 2

  // Colors (match your theme variables where possible)
  const WALL_P0 = '#395bd9'
  const WALL_P1 = '#c44739'

  // ---- Bone geometry (derived from cellSize) ----
  const WALL_THICK = Math.max(6, Math.round(cellSize * 0.18))  // bar thickness
  const CAP_R      = Math.round(WALL_THICK * 0.75)             // end-cap radius
  const PREVIEW_DASH = '8 6'

  // Tiny component that draws a “bone” between (x1,y1) and (x2,y2)
  function WallBone({ x1, y1, x2, y2, color, preview = false }) {
    const dx = x2 - x1, dy = y2 - y1
    const L = Math.hypot(dx, dy)
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI
    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2
    const barW = Math.max(0, L - CAP_R * 2) // center bar shortened so caps don't overlap

    if (preview) {
      return (
        <g opacity={0.9}>
          <g transform={`translate(${cx},${cy}) rotate(${angle})`}>
            <rect
              x={-barW / 2}
              y={-WALL_THICK / 2}
              width={barW}
              height={WALL_THICK}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeDasharray={PREVIEW_DASH}
              rx={WALL_THICK / 2}
              ry={WALL_THICK / 2}
            />
          </g>
          <circle
            cx={x1}
            cy={y1}
            r={CAP_R}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeDasharray={PREVIEW_DASH}
          />
          <circle
            cx={x2}
            cy={y2}
            r={CAP_R}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeDasharray={PREVIEW_DASH}
          />
        </g>
      )
    }

    return (
      <g className="wall">
        <g transform={`translate(${cx},${cy}) rotate(${angle})`}>
          <rect
            x={-barW / 2}
            y={-WALL_THICK / 2}
            width={barW}
            height={WALL_THICK}
            fill={color}
            rx={WALL_THICK / 2}
            ry={WALL_THICK / 2}
          />
        </g>
        <circle cx={x1} cy={y1} r={CAP_R} fill={color} />
        <circle cx={x2} cy={y2} r={CAP_R} fill={color} />
      </g>
    )
  }

  // ----- grid cells -----
  const cells = []
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const x = c * cellSize + 1
      const y = r * cellSize + 1
      const isSel = selectedCell && selectedCell.r === r && selectedCell.c === c
      const isHi = moveHighlights?.some((m) => m.r === r && m.c === c)
      const cls = `cell ${isHi ? 'cell--highlight' : ''} ${isSel ? 'cell--selected' : ''}`
      cells.push(
        <g key={`cell-${r}-${c}`}>
          <rect
            className={cls}
            x={x}
            y={y}
            width={cellSize}
            height={cellSize}
            fill="#151a24"                 // dark board tile; your CSS can override via .cell
            stroke="#2a3548"
            strokeWidth={1}
            onClick={() => onCellClick?.({ r, c })}
          />
          {isHi && (
            <circle
              className="move-dot"
              cx={x + cellSize / 2}
              cy={y + cellSize / 2}
              r={cellSize * 0.12}
              fill="#7aa2ff"
              opacity="0.95"
              pointerEvents="none"
            />
          )}
        </g>
      )
    }

  // ----- placed walls (bone style, owned color) -----
  const walls = []

  // Horizontal walls: center along seam between rows r and r+1 from col c..c+2
  gs.board.hWalls.forEach((k) => {
    const [r, c] = k.split(',').map(Number)
    const y = (r + 1) * cellSize + 1
    const x1 = c * cellSize + 1
    const x2 = (c + 2) * cellSize + 1
    const owner = gs.board.hOwners?.get?.(k) ?? 0
    const color = owner === 0 ? WALL_P0 : WALL_P1
    walls.push(<WallBone key={`h-${k}`} x1={x1} y1={y} x2={x2} y2={y} color={color} />)
  })

  // Vertical walls: center along seam between cols c and c+1 from row r..r+2
  gs.board.vWalls.forEach((k) => {
    const [r, c] = k.split(',').map(Number)
    const x = (c + 1) * cellSize + 1
    const y1 = r * cellSize + 1
    const y2 = (r + 2) * cellSize + 1
    const owner = gs.board.vOwners?.get?.(k) ?? 0
    const color = owner === 0 ? WALL_P0 : WALL_P1
    walls.push(<WallBone key={`v-${k}`} x1={x} y1={y1} x2={x} y2={y2} color={color} />)
  })

  // ----- anchors (click to preview/place) -----
  const anchors = []
  for (let r = 0; r < N - 1; r++)
    for (let c = 0; c < N - 1; c++) {
      const x = (c + 1) * cellSize + 1
      const y = (r + 1) * cellSize + 1
      const isPending = pendingAnchor && pendingAnchor.r === r && pendingAnchor.c === c
      const dashColor = gs.toMove === 0 ? WALL_P0 : WALL_P1

      anchors.push(
        <g key={`a-${r}-${c}`}>
          <circle
            className={`anchor-dot ${wallMode ? '' : 'anchor-dot--muted'}`}
            cx={x}
            cy={y}
            r={6}
            fill={wallMode ? '#7c8597' : '#7c8597'}
            opacity={wallMode ? 0.95 : 0.35}
          />
          {wallMode && isPending && (
            wallOrient === 'H' ? (
              <WallBone
                x1={x - cellSize}
                y1={y}
                x2={x + cellSize}
                y2={y}
                color={dashColor}
                preview
              />
            ) : (
              <WallBone
                x1={x}
                y1={y - cellSize}
                x2={x}
                y2={y + cellSize}
                color={dashColor}
                preview
              />
            )
          )}
          {/* Click target for placing at this anchor */}
          <rect
            x={x - 10}
            y={y - 10}
            width={20}
            height={20}
            fill="transparent"
            onClick={() => wallMode && onAnchorClick?.(r, c)}
          />
        </g>
      )
    }

  // ----- pawns -----
  const [p0, p1] = gs.pawns
  const p0x = p0.c * cellSize + 1 + cellSize / 2
  const p0y = p0.r * cellSize + 1 + cellSize / 2
  const p1x = p1.c * cellSize + 1 + cellSize / 2
  const p1y = p1.r * cellSize + 1 + cellSize / 2

  const pawnStroke = (r, c) =>
    selectedCell && selectedCell.r === r && selectedCell.c === c ? '#7aa2ff' : 'none'

  const pawns = (
    <>
      <circle
        className="pawn"
        cx={p0x}
        cy={p0y}
        r={cellSize * 0.33}
        fill="var(--p0)"
        stroke={pawnStroke(p0.r, p0.c)}
        strokeWidth={2}
        onClick={() => onPawnClick?.({ r: p0.r, c: p0.c })}
      />
      <circle
        className="pawn"
        cx={p1x}
        cy={p1y}
        r={cellSize * 0.33}
        fill="var(--p1)"
        stroke={pawnStroke(p1.r, p1.c)}
        strokeWidth={2}
        onClick={() => onPawnClick?.({ r: p1.r, c: p1.c })}
      />
    </>
  )

  return (
    <div className="panel board-pane">
      <svg className="grid-wrap" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {cells}
        {walls}
        {anchors}
        {pawns}
      </svg>
    </div>
  )
}
