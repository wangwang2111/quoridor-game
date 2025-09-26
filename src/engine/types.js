// JSDoc typedefs for clarity (no TS build needed)
/** @typedef {{r:number,c:number}} Coord */
/** @typedef {{r:number,c:number,o:'H'|'V'}} Wall */
// Moves are plain objects: { kind:'PAWN', to:Coord } | { kind:'WALL', wall:Wall }

export const keyCell = (p) => `${p.r},${p.c}`
export const keyWall = (w) => `${w.r},${w.c},${w.o}`