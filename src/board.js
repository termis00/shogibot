import { Shogiground } from 'shogiground';
import { parseSfen, initialSfen, makeBoardSfen, makeHandsSfen } from 'shogiops/sfen';
import { parseSquareName, makeSquareName, parseUsi, isDrop } from 'shogiops/util';
import { shogigroundMoveDests, shogigroundDropDests, checksSquareNames, moveToSquareNames } from 'shogiops/compat';
import { makeSfen } from 'shogiops/sfen';

const HAND_ROLES = ['rook', 'bishop', 'gold', 'silver', 'knight', 'lance', 'pawn'];

const PROMOTE_MAP = {
  pawn: 'tokin',
  lance: 'promotedlance',
  knight: 'promotedknight',
  silver: 'promotedsilver',
  bishop: 'horse',
  rook: 'dragon',
};

const UNPROMOTE_MAP = Object.fromEntries(
  Object.entries(PROMOTE_MAP).map(([k, v]) => [v, k])
);

function canPromote(role) {
  return role in PROMOTE_MAP;
}

function promotedRole(role) {
  return PROMOTE_MAP[role];
}

function unpromotedRole(role) {
  return UNPROMOTE_MAP[role];
}

function rankOf(squareName) {
  return squareName.charAt(squareName.length - 1);
}

function isInPromotionZone(squareName, color) {
  const rank = rankOf(squareName);
  if (color === 'sente') return rank <= 'c';
  return rank >= 'g';
}

function mustPromote(role, dest, color) {
  const rank = rankOf(dest);
  if (color === 'sente') {
    if (role === 'pawn' || role === 'lance') return rank === 'a';
    if (role === 'knight') return rank <= 'b';
  } else {
    if (role === 'pawn' || role === 'lance') return rank === 'i';
    if (role === 'knight') return rank >= 'h';
  }
  return false;
}

export function createBoard(boardEl, handTopEl, handBottomEl, onMove) {
  let pos = parseSfen('standard', initialSfen('standard')).unwrap();

  const ground = Shogiground(
    {
      sfen: {
        board: makeBoardSfen('standard', pos.board),
        hands: makeHandsSfen('standard', pos.hands),
      },
      orientation: 'sente',
      turnColor: 'sente',
      activeColor: 'both',
      coordinates: { enabled: true, files: 'japanese', ranks: 'japanese' },
      highlight: { lastDests: true, check: true, checkRoles: ['king'] },
      animation: { enabled: true, duration: 250, hands: true },
      hands: { inlined: false, roles: HAND_ROLES },
      movable: {
        free: false,
        dests: shogigroundMoveDests(pos),
        showDests: true,
        events: { after: handleMove },
      },
      droppable: {
        free: false,
        dests: shogigroundDropDests(pos),
        showDests: true,
        events: { after: handleDrop },
      },
      draggable: { enabled: true, showGhost: true, showTouchSquareOverlay: true },
      selectable: { enabled: true },
      promotion: {
        promotesTo: (role) => PROMOTE_MAP[role],
        unpromotesTo: (role) => UNPROMOTE_MAP[role],
        movePromotionDialog: (orig, dest) => {
          const piece = pos.board.get(parseSquareName(orig));
          if (!piece || !canPromote(piece.role)) return false;
          if (mustPromote(piece.role, dest, piece.color)) return false;
          return isInPromotionZone(orig, piece.color) || isInPromotionZone(dest, piece.color);
        },
        forceMovePromotion: (orig, dest) => {
          const piece = pos.board.get(parseSquareName(orig));
          if (!piece || !canPromote(piece.role)) return false;
          return mustPromote(piece.role, dest, piece.color);
        },
      },
      events: {},
    },
    {
      board: boardEl,
      hands: { top: handTopEl, bottom: handBottomEl },
    }
  );

  function handleMove(orig, dest, prom, metadata) {
    const from = parseSquareName(orig);
    const to = parseSquareName(dest);
    const move = { from, to, promotion: prom };

    if (!pos.isLegal(move)) return;

    const captured = pos.board.get(to);
    const movingPiece = pos.board.get(from);
    pos.play(move);
    updateGround();

    if (onMove) {
      onMove({
        type: 'move',
        from: orig,
        to: dest,
        promotion: prom,
        piece: movingPiece,
        captured,
        turn: pos.turn,
        moveNumber: pos.moveNumber,
        isCheck: pos.isCheck(),
        isEnd: pos.isEnd(),
        outcome: pos.outcome(),
      });
    }
  }

  function handleDrop(piece, key, prom, metadata) {
    const to = parseSquareName(key);
    const drop = { role: piece.role, to };

    if (!pos.isLegal(drop)) return;

    pos.play(drop);
    updateGround();

    if (onMove) {
      onMove({
        type: 'drop',
        piece,
        to: key,
        promotion: prom,
        turn: pos.turn,
        moveNumber: pos.moveNumber,
        isCheck: pos.isCheck(),
        isEnd: pos.isEnd(),
        outcome: pos.outcome(),
      });
    }
  }

  let playerColor = 'both';

  function setPlayerColor(color) {
    playerColor = color;
    updateGround();
  }

  function updateGround() {
    const checks = checksSquareNames(pos);
    let activeColor;
    if (pos.isEnd()) {
      activeColor = undefined;
    } else if (playerColor === 'both') {
      activeColor = 'both';
    } else {
      activeColor = pos.turn === playerColor ? playerColor : undefined;
    }
    ground.set({
      sfen: {
        board: makeBoardSfen('standard', pos.board),
        hands: makeHandsSfen('standard', pos.hands),
      },
      turnColor: pos.turn,
      activeColor,
      movable: {
        dests: shogigroundMoveDests(pos),
      },
      droppable: {
        dests: shogigroundDropDests(pos),
      },
      checks: checks.length > 0 ? checks : false,
    });
  }

  function applyUsiMove(usi) {
    const md = parseUsi(usi);
    if (!md || !pos.isLegal(md)) return null;

    const movingPiece = isDrop(md) ? { role: md.role, color: pos.turn } : pos.board.get(md.from);
    const captured = isDrop(md) ? undefined : pos.board.get(md.to);
    const lastDests = moveToSquareNames(md);

    pos.play(md);

    const checks = checksSquareNames(pos);
    ground.set({
      sfen: {
        board: makeBoardSfen('standard', pos.board),
        hands: makeHandsSfen('standard', pos.hands),
      },
      turnColor: pos.turn,
      activeColor: pos.isEnd() ? undefined : (playerColor === 'both' ? 'both' : (pos.turn === playerColor ? playerColor : undefined)),
      lastDests,
      movable: { dests: shogigroundMoveDests(pos) },
      droppable: { dests: shogigroundDropDests(pos) },
      checks: checks.length > 0 ? checks : false,
    });

    return {
      type: isDrop(md) ? 'drop' : 'move',
      piece: movingPiece,
      to: lastDests[lastDests.length - 1],
      from: isDrop(md) ? undefined : lastDests[0],
      promotion: !isDrop(md) && !!md.promotion,
      captured,
      turn: pos.turn,
      moveNumber: pos.moveNumber,
      isCheck: pos.isCheck(),
      isEnd: pos.isEnd(),
      outcome: pos.outcome(),
    };
  }

  function getSfen() {
    return makeSfen(pos);
  }

  function reset() {
    pos = parseSfen('standard', initialSfen('standard')).unwrap();
    updateGround();
    ground.set({ lastDests: undefined });
  }

  function flipBoard() {
    ground.toggleOrientation();
  }

  function getPosition() {
    return pos;
  }

  return { ground, reset, flipBoard, getPosition, setPlayerColor, applyUsiMove, getSfen };
}
