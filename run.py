from quoridor_engine import GameState, Move, negamax

gs = GameState(N=9)
print(gs.legal_moves()[:10])        # peek
score, best = negamax(gs, depth=3, alpha=float("-inf"), beta=float("inf"))
gs.apply(best)
