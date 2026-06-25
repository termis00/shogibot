import { createBoard } from './board.js';
import { createEngine } from './engine.js';

const PIECE_KANJI = {
  pawn: '歩', lance: '香', knight: '桂', silver: '銀', gold: '金',
  bishop: '角', rook: '飛', king: '玉',
  tokin: 'と', promotedlance: '成香', promotedknight: '成桂',
  promotedsilver: '成銀', horse: '馬', dragon: '龍',
};

const FILE_KANJI = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
const RANK_KANJI = { a: '一', b: '二', c: '三', d: '四', e: '五', f: '六', g: '七', h: '八', i: '九' };

function squareToJapanese(sq) {
  const file = parseInt(sq);
  const rank = sq.charAt(sq.length - 1);
  return FILE_KANJI[file] + RANK_KANJI[rank];
}

const boardEl = document.getElementById('board');
const handTopEl = document.getElementById('hand-top');
const handBottomEl = document.getElementById('hand-bottom');
const turnIndicator = document.getElementById('turn-indicator');
const moveCount = document.getElementById('move-count');
const gameStatus = document.getElementById('game-status');
const moveList = document.getElementById('move-list');
const evalBar = document.getElementById('eval-bar');
const evalText = document.getElementById('eval-text');

let moveNumber = 0;
let enginePlaying = false;
let engineColor = 'gote';
let moveTimeMs = 1000;

const engine = createEngine();
const board = createBoard(boardEl, handTopEl, handBottomEl, onPlayerMove);

async function initEngine() {
  gameStatus.textContent = 'エンジン読み込み中...';
  try {
    await engine.init();
    gameStatus.textContent = 'エンジン準備完了';
    document.getElementById('btn-vs-engine').disabled = false;
    setTimeout(() => {
      if (!enginePlaying) gameStatus.textContent = '';
    }, 2000);
  } catch (e) {
    gameStatus.textContent = 'エンジン読み込み失敗';
    console.error('Engine init failed:', e);
  }
}

initEngine();

document.getElementById('btn-reset').addEventListener('click', resetGame);
document.getElementById('btn-flip').addEventListener('click', () => board.flipBoard());

document.getElementById('btn-vs-engine').addEventListener('click', () => {
  if (!engine.isReady()) return;
  resetGame();
  enginePlaying = true;
  engineColor = 'gote';
  board.setPlayerColor('sente');
  gameStatus.textContent = 'CPU対局中';
  document.getElementById('btn-vs-engine').textContent = '対局中止';
  document.getElementById('btn-vs-engine').onclick = stopEngine;
});

function stopEngine() {
  enginePlaying = false;
  engine.stop();
  board.setPlayerColor('both');
  gameStatus.textContent = '';
  const btn = document.getElementById('btn-vs-engine');
  btn.textContent = 'CPU対局';
  btn.onclick = () => {
    if (!engine.isReady()) return;
    resetGame();
    enginePlaying = true;
    engineColor = 'gote';
    board.setPlayerColor('sente');
    gameStatus.textContent = 'CPU対局中';
    btn.textContent = '対局中止';
    btn.onclick = stopEngine;
  };
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
  moveList.innerHTML = '';
  turnIndicator.textContent = '先手の番';
  turnIndicator.className = 'turn-indicator sente';
  moveCount.textContent = '0手目';
  gameStatus.textContent = '';
  updateEval(0);
}

async function onPlayerMove(info) {
  recordMove(info);
  updateTurnDisplay(info);

  if (enginePlaying && !info.isEnd && info.turn === engineColor) {
    await engineMove();
  }
}

async function engineMove() {
  const sfen = board.getSfen();
  const result = await engine.go(sfen, moveTimeMs);
  if (!result || !enginePlaying) return;

  const info = board.applyUsiMove(result.move);
  if (!info) return;

  updateEval(engineColor === 'gote' ? -result.eval : result.eval);
  recordMove(info);
  updateTurnDisplay(info);
}

function recordMove(info) {
  moveNumber++;

  const who = info.turn === 'sente' ? 'gote' : 'sente';
  const whoLabel = who === 'sente' ? '☗' : '☖';

  let moveText;
  if (info.type === 'move') {
    const pieceKanji = PIECE_KANJI[info.piece?.role] || '?';
    const destJp = squareToJapanese(info.to);
    const promText = info.promotion ? '成' : '';
    moveText = `${whoLabel}${destJp}${pieceKanji}${promText}`;
  } else {
    const pieceKanji = PIECE_KANJI[info.piece?.role] || '?';
    const destJp = squareToJapanese(info.to);
    moveText = `${whoLabel}${destJp}${pieceKanji}打`;
  }

  const entry = document.createElement('div');
  entry.className = `move-entry ${who}`;
  entry.textContent = `${moveNumber}. ${moveText}`;
  moveList.appendChild(entry);
  moveList.scrollTop = moveList.scrollHeight;

  moveCount.textContent = `${moveNumber}手目`;
}

function updateTurnDisplay(info) {
  if (info.isEnd) {
    const outcome = info.outcome;
    if (outcome) {
      const winner = outcome.winner === 'sente' ? '先手' : '後手';
      gameStatus.textContent = `${winner}の勝ち！`;
    }
    turnIndicator.textContent = '対局終了';
    turnIndicator.className = 'turn-indicator';
    if (enginePlaying) stopEngine();
  } else {
    const nextTurn = info.turn === 'sente' ? '先手' : '後手';
    turnIndicator.textContent = `${nextTurn}の番`;
    turnIndicator.className = `turn-indicator ${info.turn}`;

    if (info.isCheck) {
      gameStatus.textContent = enginePlaying ? 'CPU対局中 — 王手！' : '王手！';
    } else if (enginePlaying) {
      gameStatus.textContent = 'CPU対局中';
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
  const display = cp >= 0 ? `+${cp}` : `${cp}`;
  evalText.textContent = display;
}
