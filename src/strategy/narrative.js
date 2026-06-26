import { getAllTranslations } from '../i18n.js';

export function createNarrative() {
  let flowTags = [];
  let turnSummaries = [];
  let dialogueHistory = [];
  let openingType = null;

  function addFlowTag(tag) {
    if (!flowTags.includes(tag)) {
      flowTags.push(tag);
    }
  }

  function addTurnSummary(turnNumber, summary) {
    turnSummaries.push({ turn: turnNumber, summary });
    if (turnSummaries.length > 20) {
      turnSummaries = turnSummaries.slice(-20);
    }
  }

  function addDialogue(text) {
    dialogueHistory.push(text);
    if (dialogueHistory.length > 6) {
      dialogueHistory = dialogueHistory.slice(-6);
    }
  }

  function setOpeningType(type) {
    if (!openingType && type) openingType = type;
  }

  function deriveOpeningType(posClass) {
    if (openingType) return;
    const s = posClass.sente_strategy;
    const g = posClass.gote_strategy;
    if (s && g) {
      openingType = `${s} vs ${g}`;
    }
  }

  function generateTurnSummary(turnNumber, moveKif, trigger, posClass, evalDelta, capturedPiece, isCheck) {
    const tr = getAllTranslations();
    const parts = [];

    if (moveKif) parts.push(moveKif);

    if (trigger === 'player_good') parts.push(tr.triggerLabels?.player_good || '호수');
    else if (trigger === 'player_mistake') parts.push(tr.triggerLabels?.player_mistake || '악수');
    else if (trigger === 'engine_check' || trigger === 'player_check') parts.push(tr.triggerLabels?.[trigger] || '왕수');

    if (capturedPiece) {
      const pieceName = tr.piece?.[capturedPiece] || capturedPiece;
      parts.push(`${pieceName}↓`);
    }

    if (posClass) {
      if (posClass.sente_castle) addFlowTag(`${posClass.sente_castle}`);
      if (posClass.gote_castle) addFlowTag(`${posClass.gote_castle}`);
      if (posClass.sente_strategy) addFlowTag(`${posClass.sente_strategy}`);
      if (posClass.gote_strategy) addFlowTag(`${posClass.gote_strategy}`);
    }

    const summary = parts.join(', ');
    addTurnSummary(turnNumber, summary);
    return summary;
  }

  function getContext() {
    return {
      opening_type: openingType,
      flow_tags: flowTags.slice(-10),
      recent_turns: turnSummaries.slice(-4),
      previous_dialogue: dialogueHistory.slice(-3),
    };
  }

  function reset() {
    flowTags = [];
    turnSummaries = [];
    dialogueHistory = [];
    openingType = null;
  }

  return {
    addFlowTag,
    addTurnSummary,
    addDialogue,
    setOpeningType,
    deriveOpeningType,
    generateTurnSummary,
    getContext,
    reset,
  };
}
