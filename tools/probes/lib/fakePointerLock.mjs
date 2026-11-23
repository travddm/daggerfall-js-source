// Pointer lock answered inside the page, so a driven browser never locks the real cursor.
// A real lock (headless too) moves the Windows cursor into the invisible window and clips it there.
// The stand-in keeps the API src/player/pointerLock.js uses: requestPointerLock, pointerLockElement,
// exitPointerLock, `pointerlockchange`, and Escape releasing the lock.
const inPage = () => {
  let held = null;
  const changed = () => document.dispatchEvent(new Event('pointerlockchange'));
  Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get: () => held });
  Element.prototype.requestPointerLock = function requestPointerLock() {
    held = this;
    queueMicrotask(changed);
    return Promise.resolve();
  };
  Document.prototype.exitPointerLock = function exitPointerLock() {
    if (!held) return;
    held = null;
    queueMicrotask(changed);
  };
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && held) document.exitPointerLock();
    },
    true,
  );
};

/** Installs the stand-in on every page `context` opens from now on. */
export async function fakePointerLock(context) {
  await context.addInitScript(inPage);
}
