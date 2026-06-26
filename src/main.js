import { createBoard } from './board.js';
import { createEngine } from './engine.js';
import { createLLMGateway } from './llm-gateway.js';
import { characters, defaultCharacter } from './character.js';
import { buildContext, shouldTriggerDialogue } from './dialogue.js';
import { t, getLang, setLang, getAllTranslations } from './i18n.js';

function squareToNotation(sq) {
  const tr = getAllTranslations();
  const file = parseInt(sq);
  const rank = sq.charAt(sq.length - 1);
  return tr.file[file] + tr.rank[rank];
}

// --- DOM refs ---
const boardEl = document.getElementById('board');
const handTopEl = document.getElementById('hand-top');
const handBottomEl = document.getElementById('hand-bottom');
const turnIndicator = document.getElementById('turn-indicator');
const moveCount = document.getElementById('move-count');
const gameStatus = document.getElementById('game-status');
const moveList = document.getElementById('move-list');
const evalBar = document.getElementById('eval-bar');
const evalText = document.getElementById('eval-text');
const dialogueText = document.getElementById('dialogue-text');
const charNameEl = document.getElementById('char-name');
const charSelect = document.getElementById('char-select');
const settingsModal = document.getElementById('settings-modal');
const langSelect = document.getElementById('lang-select');

// --- State ---
let moveNumber = 0;
let enginePlaying = false;
let engineColor = 'gote';
let moveTimeMs = 1000;
let currentEvalCp = 0;
let currentCharId = defaultCharacter;
let boardOrientation = 'sente';
let moveHistory = [];

// --- Core modules ---
const engine = createEngine();
const board = createBoard(boardEl, handTopEl, handBottomEl, onPlayerMove);
const llm = createLLMGateway();

// --- Language ---
langSelect.value = getLang();
langSelect.addEventListener('change', (e) => {
  setLang(e.target.value);
  applyLanguage();
});

function applyLanguage() {
  const lang = getLang();
  document.documentElement.lang = lang === 'ko' ? 'ko' : 'ja';
  document.title = t('title');

  // Hand labels
  const labelTop = document.getElementById('label-top');
  const labelBottom = document.getElementById('label-bottom');
  if (boardOrientation === 'sente') {
    labelTop.textContent = `☖ ${t('gote')}`;
    labelBottom.textContent = `☗ ${t('sente')}`;
  } else {
    labelTop.textContent = `☗ ${t('sente')}`;
    labelBottom.textContent = `☖ ${t('gote')}`;
  }

  // Turn indicator
  if (!enginePlaying && moveNumber === 0) {
    turnIndicator.textContent = t('turnSente');
  }

  // Move count
  moveCount.textContent = t('moveCount')(moveNumber);

  // Buttons
  document.getElementById('btn-reset').textContent = t('reset');
  document.getElementById('btn-flip').textContent = t('flip');
  const btnEngine = document.getElementById('btn-vs-engine');
  if (enginePlaying) {
    btnEngine.textContent = t('stopGame');
    gameStatus.textContent = t('cpuPlaying');
  } else {
    btnEngine.textContent = t('cpuGame');
  }

  // Settings button title
  document.getElementById('btn-settings').title = t('llmSettings');

  // Modal
  document.querySelector('#settings-modal .modal h3').textContent = t('llmSettings');
  const labels = document.querySelectorAll('#settings-modal .form-group label');
  const labelTexts = ['provider', 'endpoint', 'apiKey', 'modelName'];
  labels.forEach((el, i) => { if (labelTexts[i]) el.textContent = t(labelTexts[i]); });
  document.querySelector('#llm-type option[value="openai"]').textContent = t('openaiCompat');
  document.getElementById('btn-test-llm').textContent = t('testConnection');
  document.getElementById('btn-save-llm').textContent = t('save');
  document.getElementById('btn-close-modal').textContent = t('close');

  // Character select options & name
  const tr = getAllTranslations();
  for (const opt of charSelect.options) {
    const charId = opt.value;
    opt.textContent = tr.charNames[charId] || characters[charId]?.name?.[lang] || opt.textContent;
  }
  const char = characters[currentCharId];
  charNameEl.textContent = char.name[lang] || char.name['ja'];

  // Dialogue hint
  if (!llm.isConfigured() && dialogueText.textContent !== '...' && !dialogueText.textContent.startsWith('(')) {
    dialogueText.textContent = t('dialogueHint');
  }
}

applyLanguage();

// --- Engine init ---
async function initEngine() {
  gameStatus.textContent = t('engineLoading');
  try {
    await engine.init();
    gameStatus.textContent = t('engineReady');
    document.getElementById('btn-vs-engine').disabled = false;
    setTimeout(() => {
      if (!enginePlaying) gameStatus.textContent = '';
    }, 2000);
  } catch (e) {
    gameStatus.textContent = t('engineFail');
    console.error('Engine init failed:', e);
  }
}
initEngine();

// --- Character select ---
charSelect.addEventListener('change', (e) => {
  currentCharId = e.target.value;
  const char = characters[currentCharId];
  charNameEl.textContent = char.name[getLang()] || char.name['ja'];
});

// --- LLM Settings Modal ---
document.getElementById('btn-settings').addEventListener('click', () => {
  const cfg = llm.getConfig();
  if (cfg) {
    document.getElementById('llm-type').value = cfg.type || 'claude';
    document.getElementById('llm-endpoint').value = cfg.endpoint || '';
    document.getElementById('llm-apikey').value = cfg.apiKey || '';
    document.getElementById('llm-model').value = cfg.model || '';
  }
  updateEndpointPlaceholder();
  settingsModal.style.display = 'flex';
});

document.getElementById('btn-close-modal').addEventListener('click', () => {
  settingsModal.style.display = 'none';
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) settingsModal.style.display = 'none';
});

document.getElementById('llm-type').addEventListener('change', updateEndpointPlaceholder);

function updateEndpointPlaceholder() {
  const type = document.getElementById('llm-type').value;
  const ep = document.getElementById('llm-endpoint');
  const model = document.getElementById('llm-model');
  if (type === 'claude') {
    ep.placeholder = 'https://api.anthropic.com';
    model.placeholder = 'claude-sonnet-4-20250514';
  } else {
    ep.placeholder = 'https://your-endpoint.com';
    model.placeholder = 'llama3 / gpt-4o-mini etc.';
  }
}

document.getElementById('btn-save-llm').addEventListener('click', () => {
  const cfg = {
    type: document.getElementById('llm-type').value,
    endpoint: document.getElementById('llm-endpoint').value.trim(),
    apiKey: document.getElementById('llm-apikey').value.trim(),
    model: document.getElementById('llm-model').value.trim(),
  };
  if (!cfg.endpoint) {
    if (cfg.type === 'claude') cfg.endpoint = 'https://api.anthropic.com';
    else { showLLMStatus(t('enterEndpoint'), 'error'); return; }
  }
  llm.saveConfig(cfg);
  showLLMStatus(t('saved'), 'success');
});

document.getElementById('btn-test-llm').addEventListener('click', async () => {
  const cfg = {
    type: document.getElementById('llm-type').value,
    endpoint: document.getElementById('llm-endpoint').value.trim() || (document.getElementById('llm-type').value === 'claude' ? 'https://api.anthropic.com' : ''),
    apiKey: document.getElementById('llm-apikey').value.trim(),
    model: document.getElementById('llm-model').value.trim(),
  };
  llm.saveConfig(cfg);
  showLLMStatus(t('testing'), '');
  const ok = await llm.testConnection();
  showLLMStatus(ok ? t('connectionSuccess') : t('connectionFail'), ok ? 'success' : 'error');
});

function showLLMStatus(msg, cls) {
  const el = document.getElementById('llm-status');
  el.textContent = msg;
  el.className = 'llm-status ' + (cls || '');
}

// --- Game controls ---
document.getElementById('btn-reset').addEventListener('click', resetGame);
document.getElementById('btn-flip').addEventListener('click', () => {
  boardOrientation = board.flipBoard();
  const labelTop = document.getElementById('label-top');
  const labelBottom = document.getElementById('label-bottom');
  if (boardOrientation === 'sente') {
    labelTop.textContent = `☖ ${t('gote')}`;
    labelBottom.textContent = `☗ ${t('sente')}`;
  } else {
    labelTop.textContent = `☗ ${t('sente')}`;
    labelBottom.textContent = `☖ ${t('gote')}`;
  }
});

document.getElementById('btn-vs-engine').addEventListener('click', startEngineGame);

function startEngineGame() {
  if (!engine.isReady()) return;
  resetGame();
  enginePlaying = true;
  engineColor = 'gote';
  board.setPlayerColor('sente');
  gameStatus.textContent = t('cpuPlaying');
  const btn = document.getElementById('btn-vs-engine');
  btn.textContent = t('stopGame');
  btn.onclick = stopEngine;

  triggerDialogue({
    type: 'move', moveNumber: 0, isCheck: false, isEnd: false,
    turn: 'sente', piece: null, captured: null, promotion: false,
  }, 0, 0, true);
}

function stopEngine() {
  enginePlaying = false;
  engine.stop();
  board.setPlayerColor('both');
  gameStatus.textContent = '';
  const btn = document.getElementById('btn-vs-engine');
  btn.textContent = t('cpuGame');
  btn.onclick = startEngineGame;
}

document.getElementById('engine-level').addEventListener('input', (e) => {
  const level = parseInt(e.target.value);
  document.getElementById('level-display').textContent = level;
  engine.setLevel(level);
  moveTimeMs = 200 + level * 80;
});

function resetGame() {
  enginePlaying = false;
  engine.stop();
  board.setPlayerColor('both');
  board.reset();
  moveNumber = 0;
  currentEvalCp = 0;
  moveHistory = [];
  moveList.innerHTML = '';
  turnIndicator.textContent = t('turnSente');
  turnIndicator.className = 'turn-indicator sente';
  moveCount.textContent = t('moveCount')(0);
  gameStatus.textContent = '';
  updateEval(0);
}

// --- Move handling ---
async function onPlayerMove(info) {
  const evalBefore = currentEvalCp;
  recordMove(info);
  updateTurnDisplay(info);
  moveHistory.push({ ...info, mover: 'player', moveNumber });

  if (enginePlaying && !info.isEnd && info.turn === engineColor) {
    await engineMove(info, evalBefore);
  } else {
    triggerDialogue(info, evalBefore, currentEvalCp, false, 'player');
  }
}

async function engineMove(playerMoveInfo, evalBeforePlayerMove) {
  const sfen = board.getSfen();
  const result = await engine.go(sfen, moveTimeMs);
  if (!result || !enginePlaying) return;

  const engineEval = engineColor === 'gote' ? -result.eval : result.eval;
  const evalBeforeEngine = currentEvalCp;
  currentEvalCp = engineEval;
  updateEval(currentEvalCp);

  const info = board.applyUsiMove(result.move);
  if (!info) return;

  recordMove(info);
  updateTurnDisplay(info);
  moveHistory.push({ ...info, mover: 'engine', moveNumber });

  triggerDialogue(info, evalBeforeEngine, currentEvalCp, false, 'engine');
}

// --- Dialogue ---
async function triggerDialogue(moveInfo, evalBefore, evalAfter, forceStart, mover) {
  if (!llm.isConfigured()) return;

  const pos = board.getPosition();
  const tr = getAllTranslations();
  const context = forceStart
    ? { trigger: 'game_start', trigger_label: tr.triggerLabels.game_start, turn_number: 0, game_phase: tr.phase.opening, eval_before: 0, eval_after: 0, eval_delta: 0 }
    : buildContext(moveInfo, pos, evalBefore, evalAfter, mover || 'player', moveHistory);

  if (!forceStart && !shouldTriggerDialogue(context)) return;

  const lang = getLang();
  const char = characters[currentCharId];
  const prompt = char.systemPrompt[lang] || char.systemPrompt['ja'];
  dialogueText.textContent = '...';
  dialogueText.classList.add('loading');

  try {
    const result = await llm.generateDialogue(prompt, context);
    const text = typeof result === 'string' ? result : result.text;
    dialogueText.textContent = text;
    dialogueText.classList.remove('loading');

    const statsEl = document.getElementById('dialogue-stats');
    if (statsEl && result.timeMs != null) {
      const timeSec = (result.timeMs / 1000).toFixed(1);
      const tokens = result.tokens;
      let statsText = `${timeSec}s`;
      if (tokens && tokens.total) {
        statsText += ` · ${tokens.total} tok`;
        if (tokens.prompt && tokens.completion) {
          statsText += ` (${tokens.prompt}+${tokens.completion})`;
        }
      }
      statsEl.textContent = statsText;
    }
  } catch (e) {
    console.error('Dialogue generation failed:', e);
    dialogueText.textContent = t('commError');
    dialogueText.classList.remove('loading');
  }
}

// --- UI helpers ---
function recordMove(info) {
  const tr = getAllTranslations();
  moveNumber++;
  const who = info.turn === 'sente' ? 'gote' : 'sente';
  const whoLabel = who === 'sente' ? '☗' : '☖';

  let moveText;
  if (info.type === 'move') {
    const pieceName = tr.piece[info.piece?.role] || '?';
    const dest = squareToNotation(info.to);
    const promText = info.promotion ? tr.promotion : '';
    moveText = `${whoLabel}${dest}${pieceName}${promText}`;
  } else {
    const pieceName = tr.piece[info.piece?.role] || '?';
    const dest = squareToNotation(info.to);
    moveText = `${whoLabel}${dest}${pieceName}${tr.drop}`;
  }

  const entry = document.createElement('div');
  entry.className = `move-entry ${who}`;
  entry.textContent = `${moveNumber}. ${moveText}`;
  moveList.appendChild(entry);
  moveList.scrollTop = moveList.scrollHeight;
  moveCount.textContent = t('moveCount')(moveNumber);
}

function updateTurnDisplay(info) {
  if (info.isEnd) {
    const outcome = info.outcome;
    if (outcome) {
      gameStatus.textContent = outcome.winner === 'sente' ? t('senteWin') : t('goteWin');
    }
    turnIndicator.textContent = t('gameEnd');
    turnIndicator.className = 'turn-indicator';
    if (enginePlaying) stopEngine();
  } else {
    turnIndicator.textContent = info.turn === 'sente' ? t('turnSente') : t('turnGote');
    turnIndicator.className = `turn-indicator ${info.turn}`;
    if (info.isCheck) {
      gameStatus.textContent = enginePlaying ? t('cpuPlayingCheck') : t('check');
    } else if (enginePlaying) {
      gameStatus.textContent = t('cpuPlaying');
    } else {
      gameStatus.textContent = '';
    }
  }
}

function updateEval(cp) {
  if (!evalBar || !evalText) return;
  const clamped = Math.max(-2000, Math.min(2000, cp));
  const pct = 50 + (clamped / 2000) * 50;
  evalBar.style.setProperty('--sente-pct', `${pct}%`);
  evalText.textContent = cp >= 0 ? `+${cp}` : `${cp}`;
}
