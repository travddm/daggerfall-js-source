// Preload for `node --require`: caps how many files fs.promises.readFile has open at once. Vite reads the ~7,600
// vendor/layered-armor PNGs together, which exceeds the open-file limit on Windows (EMFILE). Used by pagesSite.mjs.
const fs = require('node:fs');
const nodeModule = require('node:module');

const MAX_OPEN = 64;
const original = fs.promises.readFile;
const waiting = [];
let open = 0;

function next() {
  while (open < MAX_OPEN && waiting.length > 0) {
    const { args, resolve, reject } = waiting.shift();
    open += 1;
    original
      .apply(fs.promises, args)
      .then(resolve, reject)
      .finally(() => {
        open -= 1;
        next();
      });
  }
}

fs.promises.readFile = (...args) =>
  new Promise((resolve, reject) => {
    waiting.push({ args, resolve, reject });
    next();
  });
nodeModule.syncBuiltinESMExports();
