from __future__ import annotations
from dataclasses import dataclass
from typing import List, Tuple, Optional, Iterable, Set, Dict
import heapq

# ------------------------------------------------------------
# Quoridor core engine
# - 9x9 board by default
# - Legal pawn moves incl. jumps & diagonal side-steps
# - Legal wall placement with overlap/cross checks
# - A* shortest path and reachability checks
# - GameState apply/undo, Zobrist-lite hash, Negamax stub
# ------------------------------------------------------------

Coord = Tuple[int, int]  # (row, col)
Wall = Tuple[int, int, str]  # (r, c, orient) orient in {"H","V"}

@dataclass(frozen=True)
class Move:
    kind: str  # 'PAWN' or 'WALL'
    to: Optional[Coord] = None
    wall: Optional[Wall] = None

    @staticmethod
    def pawn(to: Coord) -> 'Move':
        return Move(kind='PAWN', to=to)

    @staticmethod
    def wall(r: int, c: int, orient: str) -> 'Move':
        assert orient in ("H", "V")
        return Move(kind='WALL', wall=(r, c, orient))


class Board:
    """
    Represents the movement graph with walls on a N x N grid of cells.
    Walls are placed on the lattice between cells and block two adjacent edges:
    - Horizontal wall (H) at (r,c) blocks vertical moves between rows r and r+1
      for columns c and c+1.
    - Vertical wall (V) at (r,c) blocks horizontal moves between cols c and c+1
      for rows r and r+1.

    Valid wall anchors: 0 <= r < N-1, 0 <= c < N-1.
    """

    def __init__(self, N: int = 9):
        self.N = N
        # store walls as sets for O(1) checks
        self.h_walls: Set[Tuple[int, int]] = set()  # (r,c) for H
        self.v_walls: Set[Tuple[int, int]] = set()  # (r,c) for V

    # ---------------------------- Wall rules ----------------------------
    def wall_legal(self, w: Wall) -> bool:
        r, c, o = w
        if not (0 <= r < self.N - 1 and 0 <= c < self.N - 1):
            return False
        if o == 'H':
            # overlap existing H or touch overlap? overlapping means same (r,c)
            if (r, c) in self.h_walls:
                return False
            # crossing check (a V at same (r,c) crosses)
            if (r, c) in self.v_walls:
                return False
        else:  # 'V'
            if (r, c) in self.v_walls:
                return False
            if (r, c) in self.h_walls:
                return False
        # Also prevent placing alongside to form an illegal 2-length extension?
        # In standard Quoridor, placing two H walls adjacent along same row is allowed;
        # only overlapping and crossing are illegal. We'll keep it simple and allow adjacency.
        return True

    def place_wall(self, w: Wall) -> None:
        assert self.wall_legal(w), f"Illegal wall placement: {w}"
        r, c, o = w
        if o == 'H':
            self.h_walls.add((r, c))
        else:
            self.v_walls.add((r, c))

    def remove_wall(self, w: Wall) -> None:
        r, c, o = w
        if o == 'H':
            self.h_walls.discard((r, c))
        else:
            self.v_walls.discard((r, c))

    # ---------------------------- Movement graph ----------------------------
    def _blocked_edge(self, a: Coord, b: Coord) -> bool:
        """Return True if movement between a and b is blocked by a wall."""
        ar, ac = a
        br, bc = b
        # horizontal move
        if ar == br:
            if abs(ac - bc) != 1:
                return True  # non-adjacent
            cmin = min(ac, bc)
            # edge lies between columns cmin and cmin+1 at row ar
            # blocked by a Vertical wall that spans rows ar-1..ar at col cmin
            # Our V wall at (r,c) blocks horizontal moves between (r,c)-(r,c+1) and (r+1,c)-(r+1,c+1)
            # So to block moving between (ar, cmin)-(ar, cmin+1), need V at (ar-1, cmin) or (ar, cmin) ?
            # Actually the segment between cells at row ar is shared by V at (ar-1,cmin) (upper segment) or V at (ar,cmin) (lower segment).
            # But Quoridor V wall of length 2 blocks both those segments simultaneously. That implies movement at row ar is blocked if there's V at (ar-1,cmin) OR V at (ar,cmin).
            if (ar, cmin) in self.v_walls or (ar - 1, cmin) in self.v_walls:
                return True
            return False
        # vertical move
        if ac == bc:
            if abs(ar - br) != 1:
                return True
            rmin = min(ar, br)
            # blocked by a Horizontal wall at (rmin, ac) or (rmin, ac-1)
            if (rmin, ac) in self.h_walls or (rmin, ac - 1) in self.h_walls:
                return True
            return False
        return True  # non-orthogonal

    def neighbors(self, p: Coord) -> List[Coord]:
        r, c = p
        N = self.N
        cand = []
        if r > 0:
            cand.append((r - 1, c))
        if r + 1 < N:
            cand.append((r + 1, c))
        if c > 0:
            cand.append((r, c - 1))
        if c + 1 < N:
            cand.append((r, c + 1))
        return [q for q in cand if not self._blocked_edge(p, q)]

    # ---------------------------- Shortest paths ----------------------------
    def astar_dist_to_goal(self, start: Coord, goal_rows: Set[int]) -> Optional[int]:
        """A* shortest path length from start to any row in goal_rows. Returns None if no path."""
        N = self.N
        def h(p: Coord) -> int:
            # Manhattan distance to nearest goal row (lower bound)
            r, _ = p
            return min(abs(r - gr) for gr in goal_rows)

        openq: List[Tuple[int, int, Coord]] = []
        g: Dict[Coord, int] = {start: 0}
        f0 = h(start)
        heapq.heappush(openq, (f0, 0, start))
        closed: Set[Coord] = set()

        while openq:
            f, gcost, u = heapq.heappop(openq)
            if u in closed:
                continue
            ur, _ = u
            if ur in goal_rows:
                return gcost
            closed.add(u)
            for v in self.neighbors(u):
                nv = gcost + 1
                if nv < g.get(v, 1_000_000):
                    g[v] = nv
                    heapq.heappush(openq, (nv + h(v), nv, v))
        return None

    def path_exists_for(self, start: Coord, goal_rows: Set[int]) -> bool:
        return self.astar_dist_to_goal(start, goal_rows) is not None


class GameState:
    """
    Full game state: board, pawn positions, remaining walls, player-to-move.
    Players indexed 0 and 1.
    Goals: player 0 aims for last row (N-1); player 1 aims for row 0.
    """

    def __init__(self, N: int = 9):
        self.board = Board(N)
        self.N = N
        self.pawns: List[Coord] = [(0, N // 2), (N - 1, N // 2)]  # P0 top center, P1 bottom center
        self.walls_left: List[int] = [10, 10]
        self.to_move: int = 0
        self._hash: int = 0  # simple rolling hash (not full Zobrist)

    # ---------------------------- Helpers ----------------------------
    def goal_rows(self, player: int) -> Set[int]:
        return {self.N - 1} if player == 0 else {0}

    def in_bounds(self, p: Coord) -> bool:
        r, c = p
        return 0 <= r < self.N and 0 <= c < self.N

    # ---------------------------- Legal move gen ----------------------------
    def legal_pawn_moves(self) -> List[Coord]:
        me = self.to_move
        you = 1 - me
        myp = self.pawns[me]
        opp = self.pawns[you]
        nbrs = self.board.neighbors(myp)
        moves: List[Coord] = []
        for q in nbrs:
            if q == opp:
                # try jumping over if possible
                dr = opp[0] - myp[0]
                dc = opp[1] - myp[1]
                dest = (opp[0] + dr, opp[1] + dc)
                if self.in_bounds(dest) and not self.board._blocked_edge(opp, dest):
                    moves.append(dest)
                else:
                    # side steps: diagonals around the opponent
                    # check perpendicular directions from opp
                    for d in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        side = (opp[0] + d[0], opp[1] + d[1])
                        if not self.in_bounds(side):
                            continue
                        if d[0] != 0 and myp[1] != opp[1]:
                            continue  # ensure it's actually a perpendicular move context
                        if d[1] != 0 and myp[0] != opp[0]:
                            continue
                        if not self.board._blocked_edge(opp, side):
                            if not self.board._blocked_edge(myp, opp):
                                moves.append(side)
            else:
                moves.append(q)
        # Deduplicate in rare cases
        uniq = []
        seen = set()
        for m in moves:
            if m not in seen:
                seen.add(m)
                uniq.append(m)
        return uniq

    def legal_wall_moves(self) -> List[Wall]:
        me = self.to_move
        if self.walls_left[me] <= 0:
            return []
        N = self.N
        cand: List[Wall] = []
        for r in range(N - 1):
            for c in range(N - 1):
                for o in ("H", "V"):
                    w = (r, c, o)
                    if not self.board.wall_legal(w):
                        continue
                    # tentatively place and verify both players still have a path
                    self.board.place_wall(w)
                    ok = (
                        self.board.path_exists_for(self.pawns[0], self.goal_rows(0)) and
                        self.board.path_exists_for(self.pawns[1], self.goal_rows(1))
                    )
                    self.board.remove_wall(w)
                    if ok:
                        cand.append(w)
        return cand

    def legal_moves(self) -> List[Move]:
        moves = [Move.pawn(p) for p in self.legal_pawn_moves()]
        moves += [Move(kind='WALL', wall=w) for w in self.legal_wall_moves()]
        return moves

    # ---------------------------- Apply / Undo ----------------------------
    def apply(self, mv: Move) -> None:
        if mv.kind == 'PAWN':
            assert mv.to in self.legal_pawn_moves(), f"Illegal pawn move: {mv.to}"
            me = self.to_move
            self.pawns[me] = mv.to  # move pawn
        else:
            assert mv.wall is not None
            w = mv.wall
            assert w in self.legal_wall_moves(), f"Illegal wall move: {w}"
            self.board.place_wall(w)
            self.walls_left[self.to_move] -= 1
        self.to_move ^= 1

    # (Optional) lightweight undo by snapshot pattern
    def snapshot(self) -> Tuple:
        return (
            tuple(self.pawns),
            tuple(sorted(self.board.h_walls)),
            tuple(sorted(self.board.v_walls)),
            tuple(self.walls_left),
            self.to_move,
        )

    def restore(self, snap: Tuple) -> None:
        (pawns, hws, vws, wl, tm) = snap
        self.pawns = list(pawns)
        self.board.h_walls = set(hws)
        self.board.v_walls = set(vws)
        self.walls_left = list(wl)
        self.to_move = tm

    # ---------------------------- Terminal & Eval ----------------------------
    def winner(self) -> Optional[int]:
        if self.pawns[0][0] == self.N - 1:
            return 0
        if self.pawns[1][0] == 0:
            return 1
        return None

    def evaluate(self) -> float:
        # A* distance difference + wall count bias
        d0 = self.board.astar_dist_to_goal(self.pawns[0], self.goal_rows(0))
        d1 = self.board.astar_dist_to_goal(self.pawns[1], self.goal_rows(1))
        # distances should exist by rules; but None if malformed
        if d0 is None or d1 is None:
            return 0.0
        return (d1 - d0) * 10.0 + (self.walls_left[0] - self.walls_left[1]) * 0.5


# ---------------------------- Negamax + Alpha-Beta (stub) ----------------------------

def ordered_moves(state: GameState) -> List[Move]:
    moves = state.legal_moves()
    # Heuristic ordering: moves that improve dist diff first; walls that worsen opp dist
    me = state.to_move
    you = 1 - me
    my_goal = state.goal_rows(me)
    opp_goal = state.goal_rows(you)

    def wall_delta(w: Wall) -> int:
        state.board.place_wall(w)
        dme = state.board.astar_dist_to_goal(state.pawns[me], my_goal)
        dy = state.board.astar_dist_to_goal(state.pawns[you], opp_goal)
        state.board.remove_wall(w)
        if dme is None or dy is None:
            return -999
        # prefer increasing opponent distance and not hurting own distance
        return (dy - dme)

    scored: List[Tuple[int, Move]] = []
    # Baseline current distances
    dme0 = state.board.astar_dist_to_goal(state.pawns[me], my_goal) or 0
    dy0 = state.board.astar_dist_to_goal(state.pawns[you], opp_goal) or 0

    for mv in moves:
        if mv.kind == 'PAWN':
            snap = state.snapshot()
            state.apply(mv)
            dme1 = state.board.astar_dist_to_goal(state.pawns[you], opp_goal)  # after move, opp to move
            dy1 = state.board.astar_dist_to_goal(state.pawns[me], my_goal)
            state.restore(snap)
            # Reinterpret to same perspective: approximate by pre-move diff
            score = (dy0 - dme0)
            scored.append((score, mv))
        else:
            scored.append((wall_delta(mv.wall), mv))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [m for _, m in scored]


def negamax(state: GameState, depth: int, alpha: float, beta: float) -> Tuple[float, Optional[Move]]:
    winner = state.winner()
    if winner is not None:
        return (1e6 if winner == state.to_move else -1e6), None
    if depth == 0:
        return state.evaluate(), None

    best_val = float('-inf')
    best_move: Optional[Move] = None

    for mv in ordered_moves(state):
        snap = state.snapshot()
        state.apply(mv)
        val, _ = negamax(state, depth - 1, -beta, -alpha)
        val = -val
        state.restore(snap)

        if val > best_val:
            best_val = val
            best_move = mv
        if best_val > alpha:
            alpha = best_val
        if alpha >= beta:
            break

    return best_val, best_move


# ---------------------------- Quick demo ----------------------------
if __name__ == "__main__":
    gs = GameState(N=9)
    print("Initial legal pawn moves:", gs.legal_pawn_moves())
    print("Initial legal wall moves (count):", len(gs.legal_wall_moves()))

    # Try a simple search
    val, mv = negamax(gs, depth=2, alpha=float('-inf'), beta=float('inf'))
    print("Search suggests:", mv, "val=", val)
