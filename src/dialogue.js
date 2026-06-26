import { getAllTranslations } from './i18n.js';

const PIECE_VALUE = {
  pawn: 1, lance: 3, knight: 3, silver: 5, gold: 5,
  bishop: 8, rook: 10, king: 0,
  tokin: 1, promotedlance: 3, promotedknight: 3,
  promotedsilver: 5, horse: 10, dragon: 12,
};

function classifyTrigger(moveInfo, evalBefore, evalAfter, mover) {
  const tr = getAllTranslations().triggerLabels;

  if (moveInfo.moveNumber <= 1) return { type: 'game_start', label: tr.game_start };
  if (moveInfo.isEnd) return { type: 'game_end', label: moveInfo.outcome?.winner ? tr.game_end_win : tr.game_end };

  if (moveInfo.isCheck && mover === 'engine') return { type: 'engine_check', label: tr.engine_check };
  if (moveInfo.isCheck && mover === 'player') return { type: 'player_check', label: tr.player_check };

  const delta = evalAfter - evalBefore;

  if (delta >= 200) return { type: 'player_good', label: tr.player_good };
  if (delta <= -200) return { type: 'player_mistake', label: tr.player_mistake };

  if (moveInfo.captured && mover === 'engine') return { type: 'engine_capture', label: tr.engine_capture };
  if (moveInfo.captured && mover === 'player') return { type: 'player_capture', label: tr.player_capture };

  if (evalAfter <= -500) return { type: 'engine_crisis', label: tr.engine_crisis };
  if (evalAfter >= 500) return { type: 'engine_advantage', label: tr.engine_advantage };

  return { type: 'normal', label: tr.normal };
}

function detectGamePhase(moveNumber) {
  const tr = getAllTranslations().phase;
  if (moveNumber <= 30) return tr.opening;
  if (moveNumber <= 80) return tr.middle;
  return tr.end;
}

function classifyIntensity(evalDelta, isExchange) {
  const tr = getAllTranslations().intensity;
  const absDelta = Math.abs(evalDelta);
  if (isExchange && absDelta < 100) return tr.calm;
  if (absDelta < 50) return tr.calm;
  if (absDelta < 200) return tr.mild;
  return tr.strong;
}

function detectExchange(moveInfo, moveHistory) {
  if (!moveInfo.captured || moveHistory.length < 2) return null;

  const tr = getAllTranslations();
  const prev = moveHistory[moveHistory.length - 2];

  if (prev && prev.captured && prev.to === moveInfo.to) {
    const tookRole = moveInfo.captured.role;
    const lostRole = prev.captured.role;
    const tookName = tr.piece[tookRole] || '?';
    const lostName = tr.piece[lostRole] || '?';
    const tookVal = PIECE_VALUE[tookRole] || 0;
    const lostVal = PIECE_VALUE[lostRole] || 0;

    if (tookRole === lostRole || Math.abs(tookVal - lostVal) <= 1) {
      return { type: 'equal', description: tr.exchangeEqual(tookName) };
    } else if (tookVal > lostVal) {
      return { type: 'win', description: tr.exchangeWin(tookName, lostName) };
    } else {
      return { type: 'loss', description: tr.exchangeLoss(tookName, lostName) };
    }
  }
  return null;
}

function formatMoveHistory(moveHistory) {
  const tr = getAllTranslations();
  const recent = moveHistory.slice(-6);
  return recent.map((m) => {
    const who = m.mover === 'engine' ? tr.moverEngine : tr.moverPlayer;
    const piece = tr.piece[m.piece?.role] || '?';
    const captured = m.captured ? ` (${tr.piece[m.captured.role] || '?'}↓)` : '';
    const prom = m.promotion ? tr.promotion : '';
    return `${m.moveNumber}. ${who}: ${piece}${prom}${captured}`;
  }).join('\n');
}

function handToList(hand, color) {
  const tr = getAllTranslations();
  const result = [];
  if (!hand) return result;
  const h = hand.color(color);
  for (const [role, count] of h) {
    if (count > 0) {
      const name = tr.piece[role] || role;
      result.push(count > 1 ? `${name}×${count}` : name);
    }
  }
  return result;
}

export function buildContext(moveInfo, pos, evalBefore, evalAfter, mover, moveHistory) {
  const tr = getAllTranslations();
  const trigger = classifyTrigger(moveInfo, evalBefore, evalAfter, mover);
  const capturedPiece = moveInfo.captured ? (tr.piece[moveInfo.captured.role] || '?') : null;
  const exchange = detectExchange(moveInfo, moveHistory || []);
  const evalDelta = evalAfter - evalBefore;
  const intensity = classifyIntensity(evalDelta, !!exchange);

  return {
    turn_number: moveInfo.moveNumber,
    mover: mover === 'engine' ? tr.moverEngine : tr.moverPlayer,
    response_instruction: mover === 'engine' ? tr.instructionEngine : tr.instructionPlayer,
    last_move: moveInfo.type === 'drop'
      ? `${tr.piece[moveInfo.piece?.role] || '?'}${tr.pieceDrop}`
      : `${tr.piece[moveInfo.piece?.role] || '?'}${moveInfo.promotion ? tr.promotion : ''}`,
    captured_piece: capturedPiece,
    capture_description: capturedPiece
      ? (mover === 'engine' ? tr.captureEngine(capturedPiece) : tr.capturePlayer(capturedPiece))
      : null,
    exchange: exchange ? exchange.description : null,
    recent_moves: formatMoveHistory(moveHistory || []),
    eval_before: evalBefore,
    eval_after: evalAfter,
    eval_delta: evalDelta,
    emotion_intensity: intensity,
    is_check: moveInfo.isCheck,
    is_end: moveInfo.isEnd,
    outcome: moveInfo.outcome || null,
    game_phase: detectGamePhase(moveInfo.moveNumber),
    trigger: trigger.type,
    trigger_label: trigger.label,
    player_hand: handToList(pos.hands, 'sente'),
    engine_hand: handToList(pos.hands, 'gote'),
  };
}

export function shouldTriggerDialogue(context) {
  const skipTypes = ['normal'];
  if (skipTypes.includes(context.trigger) && Math.random() > 0.3) return false;
  return true;
}
