export function createEngine() {
  let sf = null;
  let ready = false;
  let resolveReady;
  const readyPromise = new Promise((r) => (resolveReady = r));

  let bestmoveResolve = null;
  let currentEval = 0;
  let lastInfo = null;

  function parseInfoLine(line) {
    const result = {};
    const depthMatch = line.match(/\bdepth\s+(\d+)/);
    if (depthMatch) result.depth = parseInt(depthMatch[1], 10);

    const cpMatch = line.match(/\bcp\s+(-?\d+)/);
    if (cpMatch) result.score = parseInt(cpMatch[1], 10);

    const mateMatch = line.match(/\bmate\s+(-?\d+)/);
    if (mateMatch) result.mate = parseInt(mateMatch[1], 10);

    const pvMatch = line.match(/\bpv\s+(.+)$/);
    if (pvMatch) result.pv = pvMatch[1].trim().split(/\s+/);

    return result;
  }

  async function init() {
    sf = await Stockfish({
      locateFile: (file) => `/lib/${file}`,
    });

    sf.addMessageListener((line) => {
      if (line === 'readyok') {
        if (!ready) {
          ready = true;
          resolveReady();
        }
      }

      if (line.startsWith('info') && (line.includes(' cp ') || line.includes(' mate '))) {
        const parsed = parseInfoLine(line);
        if (parsed.pv && parsed.depth) {
          if (!lastInfo || parsed.depth >= lastInfo.depth) {
            lastInfo = parsed;
          }
        }
        if (parsed.score != null) currentEval = parsed.score;
      }

      if (line.startsWith('bestmove')) {
        const move = line.split(/\s+/)[1];
        if (bestmoveResolve) {
          bestmoveResolve({ move, eval: currentEval, analysis: lastInfo });
          bestmoveResolve = null;
        }
      }
    });

    sf.postMessage('usi');
    sf.postMessage('setoption name USI_Variant value shogi');
    sf.postMessage('isready');

    await readyPromise;
  }

  function setLevel(level) {
    if (!sf) return;
    sf.postMessage(`setoption name Skill Level value ${level}`);
  }

  function go(sfen, moveTimeMs = 1000) {
    return new Promise((resolve) => {
      currentEval = 0;
      lastInfo = null;
      bestmoveResolve = resolve;
      sf.postMessage(`position sfen ${sfen}`);
      sf.postMessage(`go movetime ${moveTimeMs}`);
    });
  }

  function stop() {
    if (sf) sf.postMessage('stop');
  }

  function quit() {
    if (sf) {
      sf.postMessage('quit');
      sf.terminate();
      sf = null;
    }
  }

  return { init, setLevel, go, stop, quit, isReady: () => ready };
}
