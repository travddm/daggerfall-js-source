// The session pins' fake WebSocket - ONE home (AUDIT WORLD2 D14: world2 and auditworld carried the same copy). A class
// the session is handed as WebSocketImpl; every instance is kept, `sent` holds the raw strings the session wrote (the
// wire's own shape - t first, the prefix the relay reads), `open()` and `receive()` drive it from the test's side.
//
// RPT1026-SECNET (LINE-STALL): AND THE RUNTIME'S PING IS ANSWERED, as the relay's runtime
// answers it in front of every room (server/src/index.js setWebSocketAutoResponse) - a session that hears no answer to
// its ping reads its line as stalled and holds its poses, so a fake that never answered was a dead line in every pin.
// `pong: false` is that dead line, for the pins of the stall itself.
//
// A welcome given as an object carries the relay's version (`v`) as the real relay stamps every welcome
// (server/src/index.js), so a pin speaks to the relay of its own tree unless it says otherwise. A welcome given as a
// string is sent as written - the way to drive a relay of another version, or one that names none.
import { RELAY_VERSION } from '../src/net/wire.js';

export const RUNTIME_PING = '{"t":"ping"}';
export const RUNTIME_PONG = '{"t":"pong"}';
/** A welcome as the relay of this tree stamps it: `v` added when the frame names none. */
export const stampWelcome = (o) => (o && typeof o === 'object' && o.t === 'welcome' && !('v' in o) ? { ...o, v: RELAY_VERSION } : o);
export function fakeSocketClass({ pong = true } = {}) {
  const sockets = [];
  class FakeWS {
    constructor(url) { this.url = url; this.sent = []; this.closed = null; sockets.push(this); }
    send(s) { this.sent.push(s); if (pong && s === RUNTIME_PING) this.onmessage?.({ data: RUNTIME_PONG }); }
    close(code, reason) { this.closed = { code, reason }; }
    open() { this.onopen?.(); }
    receive(o) { this.onmessage?.({ data: typeof o === 'string' ? o : JSON.stringify(stampWelcome(o)) }); }
    drop(code = 1006, reason = '') { this.onclose?.({ code, reason }); }
  }
  return { FakeWS, sockets };
}
