import { chooseAction } from './bot.js';
self.onmessage = e => {
  const { state, level, id } = e.data;
  const t0 = performance.now();
  const action = chooseAction(state, level);
  self.postMessage({ id, action, ms: performance.now() - t0 });
};
