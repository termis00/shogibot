import { squareFile, squareRank, parseCoordinates } from 'shogiops/util';
import { getAllTranslations } from '../i18n.js';

function findPieceSquares(board, color, role) {
  const sqs = board.role(role).intersect(board.color(color));
  return Array.from(sqs);
}

function sqF(sq) { return squareFile(sq) + 1; }
function sqR(sq) { return squareRank(sq) + 1; }

function mirrorSq(sq) {
  const f = squareFile(sq);
  const r = squareRank(sq);
  return parseCoordinates(8 - f, 8 - r);
}

function normalize(squares, color) {
  if (color === 'sente') return squares;
  return squares.map(mirrorSq);
}

function detectCastle(board, color) {
  const kings = findPieceSquares(board, color, 'king');
  if (kings.length === 0) return null;

  const king = normalize(kings, color)[0];
  const kf = sqF(king);
  const kr = sqR(king);

  const golds = normalize(findPieceSquares(board, color, 'gold'), color);
  const silvers = normalize(findPieceSquares(board, color, 'silver'), color);
  const allDef = [...golds, ...silvers];

  function has(pieces, file, rank) {
    return pieces.some(sq => sqF(sq) === file && sqR(sq) === rank);
  }

  function near(pieces, file, rank, dist = 1) {
    return pieces.some(sq => Math.abs(sqF(sq) - file) <= dist && Math.abs(sqR(sq) - rank) <= dist);
  }

  // anaguma: king at 1九, surrounded by gold/silver
  if (kf <= 3 && kr >= 8) {
    if (kf === 1 && kr === 9) {
      const adj = allDef.filter(sq => Math.abs(sqF(sq) - 1) <= 1 && Math.abs(sqR(sq) - 9) <= 1);
      if (adj.length >= 2) return 'anaguma';
    }

    if (near(golds, kf + 1, kr, 1) && near(silvers, kf + 1, kr - 1, 1)) {
      if (has(golds, kf + 1, kr) || has(golds, kf, kr - 1)) {
        const silverAbove = silvers.some(sq => sqR(sq) <= kr - 1 && Math.abs(sqF(sq) - kf) <= 2);
        if (silverAbove) return 'takamino';
        return 'mino';
      }
    }
  }

  // yagura: king at file 7-8, rank 8-9
  if (kf >= 7 && kr >= 8) {
    const adjG = golds.filter(sq => Math.abs(sqF(sq) - kf) <= 1 && Math.abs(sqR(sq) - kr) <= 1);
    const adjS = silvers.filter(sq => Math.abs(sqF(sq) - kf) <= 2 && Math.abs(sqR(sq) - kr) <= 1);
    if (adjG.length >= 1 && adjS.length >= 1) return 'yagura';
  }

  // funa: king at file 5-7, rank 8-9
  if (kf >= 5 && kf <= 7 && kr >= 8) {
    const adj = allDef.filter(sq => Math.abs(sqF(sq) - kf) <= 1 && sqR(sq) >= 8);
    if (adj.length >= 1) return 'funa';
  }

  return null;
}

function detectStrategy(board, color) {
  const rooks = findPieceSquares(board, color, 'rook');
  const dragons = findPieceSquares(board, color, 'dragon');
  const allRooks = [...rooks, ...dragons];

  if (allRooks.length === 0) return null;

  const normRooks = normalize(allRooks, color);
  const rookFile = sqF(normRooks[0]);

  const silvers = normalize(findPieceSquares(board, color, 'silver'), color);
  const silverAdvanced = silvers.some(sq => sqF(sq) <= 3 && sqR(sq) <= 6);

  if (rookFile === 2 || rookFile === 1) {
    if (silverAdvanced) return 'bougin';
    return 'ibisha';
  }
  if (rookFile === 8) return 'mukaibisha';
  if (rookFile === 5) return 'nakabisha';
  if (rookFile === 6) return 'shikenbisha';
  if (rookFile === 7) return 'sankenbisha';
  if (rookFile === 3 || rookFile === 4) return 'ibisha';

  return null;
}

function detectTensionPoints(board) {
  const tr = getAllTranslations();
  const points = [];

  for (let file = 0; file < 9; file++) {
    let sentePawnRank = null;
    let gotePawnRank = null;
    for (let rank = 0; rank < 9; rank++) {
      const sq = parseCoordinates(file, rank);
      if (sq == null) continue;
      const piece = board.get(sq);
      if (piece && (piece.role === 'pawn' || piece.role === 'tokin')) {
        if (piece.color === 'sente' && (sentePawnRank === null || rank < sentePawnRank)) sentePawnRank = rank;
        if (piece.color === 'gote' && (gotePawnRank === null || rank > gotePawnRank)) gotePawnRank = rank;
      }
    }
    if (sentePawnRank !== null && gotePawnRank !== null && Math.abs(sentePawnRank - gotePawnRank) <= 2) {
      points.push(`${file + 1}${tr.tensionPawnFace || '筋歩対峙'}`);
    }
  }

  return points;
}

const CASTLE_NAMES = {
  ko: { mino: '미노', takamino: '고미노', yagura: '야구라', funa: '후나', anaguma: '아나구마' },
  ja: { mino: '美濃', takamino: '高美濃', yagura: '矢倉', funa: '舟囲い', anaguma: '穴熊' },
};

const STRATEGY_NAMES = {
  ko: { ibisha: '거비차', bougin: '봉은', shikenbisha: '사간비차', nakabisha: '나카비차', mukaibisha: '무카이비차', sankenbisha: '삼간비차' },
  ja: { ibisha: '居飛車', bougin: '棒銀', shikenbisha: '四間飛車', nakabisha: '中飛車', mukaibisha: '向かい飛車', sankenbisha: '三間飛車' },
};

export function classifyPosition(pos, lang = 'ko') {
  const board = pos.board;
  const castleNames = CASTLE_NAMES[lang] || CASTLE_NAMES.ko;
  const stratNames = STRATEGY_NAMES[lang] || STRATEGY_NAMES.ko;

  const senteCastle = detectCastle(board, 'sente');
  const goteCastle = detectCastle(board, 'gote');
  const senteStrategy = detectStrategy(board, 'sente');
  const goteStrategy = detectStrategy(board, 'gote');
  const tensionPoints = detectTensionPoints(board);

  return {
    sente_castle: senteCastle ? castleNames[senteCastle] : null,
    gote_castle: goteCastle ? castleNames[goteCastle] : null,
    sente_strategy: senteStrategy ? stratNames[senteStrategy] : null,
    gote_strategy: goteStrategy ? stratNames[goteStrategy] : null,
    tension_points: tensionPoints,
  };
}
