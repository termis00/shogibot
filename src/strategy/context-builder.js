import { getAllTranslations } from '../i18n.js';
import { parsePV } from './pv-parser.js';
import { classifyPosition } from './position-classifier.js';
import { getLang } from '../i18n.js';
function sqKeyToKif(sqKey) {
  if (!sqKey) return '';
  const tr = getAllTranslations();
  const file = parseInt(sqKey);
  const rank = sqKey.charAt(sqKey.length - 1);
  return (tr.file[file] || file) + (tr.rank[rank] || '');
}

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

  if (delta <= -200) return { type: 'player_good', label: tr.player_good };
  if (delta >= 200) return { type: 'player_mistake', label: tr.player_mistake };

  if (moveInfo.captured && mover === 'engine') return { type: 'engine_capture', label: tr.engine_capture };
  if (moveInfo.captured && mover === 'player') return { type: 'player_capture', label: tr.player_capture };

  if (evalAfter <= -500) return { type: 'engine_crisis', label: tr.engine_crisis };
  if (evalAfter >= 500) return { type: 'engine_advantage', label: tr.engine_advantage };

  return { type: 'normal', label: tr.normal };
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

function detectGamePhase(moveNumber, pos) {
  const tr = getAllTranslations().phase;
  if (moveNumber <= 30) return tr.opening;
  if (moveNumber <= 80) return tr.middle;
  return tr.end;
}

export function buildRichContext(moveInfo, pos, evalBefore, evalAfter, mover, moveHistory, engineColor, analysis, narrative) {
  const tr = getAllTranslations();
  const lang = getLang();

  const sign = engineColor === 'sente' ? 1 : -1;
  const engineEvalBefore = evalBefore * sign;
  const engineEvalAfter = evalAfter * sign;
  const evalDelta = engineEvalAfter - engineEvalBefore;

  const trigger = classifyTrigger(moveInfo, engineEvalBefore, engineEvalAfter, mover);
  const capturedPiece = moveInfo.captured ? (tr.piece[moveInfo.captured.role] || '?') : null;
  const exchange = detectExchange(moveInfo, moveHistory || []);
  const intensity = classifyIntensity(evalDelta, !!exchange);
  const playerColor = engineColor === 'sente' ? 'gote' : 'sente';

  const posClass = classifyPosition(pos, lang);

  if (narrative) {
    narrative.deriveOpeningType(posClass);
  }

  let engineAnalysis = null;
  if (analysis && analysis.pv) {
    const pvData = parsePV(analysis, pos);
    if (pvData) {
      engineAnalysis = {
        depth: pvData.depth,
        best_move_kif: pvData.best_move_kif,
        best_pv_kif: pvData.pv_kif,
        score: pvData.score != null ? pvData.score * sign : null,
        mate: pvData.mate != null ? pvData.mate * sign : null,
      };
    }
  }

  const destKif = moveInfo.to ? sqKeyToKif(moveInfo.to) : '';
  const moveKif = moveInfo.type === 'drop'
    ? `${destKif}${tr.piece[moveInfo.piece?.role] || '?'}${tr.pieceDrop}`
    : `${destKif}${tr.piece[moveInfo.piece?.role] || '?'}${moveInfo.promotion ? tr.promotion : ''}`;

  if (narrative) {
    narrative.generateTurnSummary(
      moveInfo.moveNumber,
      moveKif,
      trigger.type,
      posClass,
      evalDelta,
      moveInfo.captured?.role,
      moveInfo.isCheck
    );
  }

  const narrativeCtx = narrative ? narrative.getContext() : null;

  const context = {
    game_narrative: narrativeCtx ? {
      opening_type: narrativeCtx.opening_type,
      phase: detectGamePhase(moveInfo.moveNumber, pos),
      flow_tags: narrativeCtx.flow_tags,
      recent_turns: narrativeCtx.recent_turns,
      previous_dialogue: narrativeCtx.previous_dialogue,
    } : null,
    this_move: {
      turn: moveInfo.moveNumber,
      mover: mover === 'engine' ? tr.moverEngine : tr.moverPlayer,
      response_instruction: mover === 'engine' ? tr.instructionEngine : tr.instructionPlayer,
      move: moveKif,
      captured_piece: capturedPiece,
      capture_description: capturedPiece
        ? (mover === 'engine' ? tr.captureEngine(capturedPiece) : tr.capturePlayer(capturedPiece))
        : null,
      exchange: exchange ? exchange.description : null,
      is_check: moveInfo.isCheck,
      is_end: moveInfo.isEnd,
      outcome: moveInfo.outcome || null,
    },
    engine_analysis: engineAnalysis,
    positional_factors: {
      sente_castle: posClass.sente_castle,
      gote_castle: posClass.gote_castle,
      sente_strategy: posClass.sente_strategy,
      gote_strategy: posClass.gote_strategy,
      tension_points: posClass.tension_points,
    },
    eval: {
      before: engineEvalBefore,
      after: engineEvalAfter,
      delta: evalDelta,
      emotion_intensity: intensity,
    },
    sides: {
      engine_side: tr.engineSide(engineColor),
      player_side: tr.playerSide(playerColor),
    },
    hands: {
      player: handToList(pos.hands, playerColor),
      engine: handToList(pos.hands, engineColor),
    },
    trigger: trigger.type,
    trigger_label: trigger.label,
  };

  return context;
}

export function shouldTriggerDialogue(context) {
  const trigger = context.trigger;
  if (trigger === 'normal' && Math.random() > 0.3) return false;
  return true;
}
