import { parseUsi, isDrop, squareFile, squareRank } from 'shogiops/util';
import { getAllTranslations } from '../i18n.js';

const RANK_LETTERS = ['a','b','c','d','e','f','g','h','i'];

function usiToKif(usiMove, pos) {
  const tr = getAllTranslations();
  const md = parseUsi(usiMove);
  if (!md) return usiMove;

  if (isDrop(md)) {
    const file = squareFile(md.to) + 1;
    const rankIdx = squareRank(md.to);
    const pieceName = tr.piece[md.role] || md.role;
    return `${tr.file[file] || file}${tr.rank[RANK_LETTERS[rankIdx]] || ''}${pieceName}${tr.drop}`;
  }

  const piece = pos.board.get(md.from);
  if (!piece) return usiMove;

  const file = squareFile(md.to) + 1;
  const rankIdx = squareRank(md.to);
  const pieceName = tr.piece[piece.role] || piece.role;
  const prom = md.promotion ? tr.promotion : '';

  return `${tr.file[file] || file}${tr.rank[RANK_LETTERS[rankIdx]] || ''}${pieceName}${prom}`;
}

export function parsePV(analysis, pos) {
  if (!analysis || !analysis.pv || analysis.pv.length === 0) return null;

  const pvKif = [];
  let simPos = pos.clone();

  for (const usiMove of analysis.pv.slice(0, 5)) {
    const kif = usiToKif(usiMove, simPos);
    pvKif.push(kif);

    const md = parseUsi(usiMove);
    if (md && simPos.isLegal(md)) {
      simPos.play(md);
    } else {
      break;
    }
  }

  return {
    depth: analysis.depth || 0,
    score: analysis.score ?? null,
    mate: analysis.mate ?? null,
    pv_usi: analysis.pv.slice(0, 5),
    pv_kif: pvKif,
    best_move_kif: pvKif[0] || null,
  };
}
