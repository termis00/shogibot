export function createEngine() {
  let sf = null;
  let ready = false;
  let resolveReady;
  const readyPromise = new Promise((r) => (resolveReady = r));

  let bestmoveResolve = null;
  let currentEval = 0;

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

      if (line.startsWith('info') && line.includes(' cp ')) {
        const match = line.match(/\bcp\s+(-?\d+)/);
        if (match) currentEval = parseInt(match[1], 10);
      }

      if (line.startsWith('bestmove')) {
        const move = line.split(/\s+/)[1];
        if (bestmoveResolve) {
          bestmoveResolve({ move, eval: currentEval });
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
