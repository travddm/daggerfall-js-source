// The page's query string, read from the browser once for each change of the URL.
//
// `location.search` is a browser getter, and the online lane and the skin read it many times a frame. In the browser
// the search changes without a new page only through history.pushState, history.replaceState (the boot's
// publishBootParams, the load path, a probe that photographs a frame both ways) and a move through the history
// (popstate). Each of these drops the stored string, so the next read is the URL's answer at once, as a read of the
// getter would be. Any other change to the search is a navigation, which starts a new page.
//
// Outside a browser (node tests, which set a plain object as `location` and change its `search`), nothing is stored:
// every call reads `location.search`.

type HistoryWriter = (...args: unknown[]) => unknown;
type HistoryLike = { pushState?: HistoryWriter; replaceState?: HistoryWriter };
type PageGlobals = {
  location?: { search?: string };
  history?: HistoryLike;
  Location?: abstract new () => unknown;
  addEventListener?: (type: string, listener: () => void) => void;
};

const page = globalThis as unknown as PageGlobals;

let storedSearch: string | null = null;
let watching = false;

function isBrowserLocation(location: unknown): boolean {
  return typeof page.Location === 'function' && location instanceof page.Location;
}

/** Wraps the two history writers so that each drops the stored search. Answers false where there is no history to watch. */
function watchHistory(): boolean {
  const history = page.history;
  if (!history || typeof history.replaceState !== 'function' || typeof history.pushState !== 'function') return false;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method] as HistoryWriter;
    history[method] = function (this: unknown, ...args: unknown[]) {
      try {
        return original.apply(this, args);
      } finally {
        storedSearch = null;
      }
    };
  }
  page.addEventListener?.('popstate', () => {
    storedSearch = null;
  });
  return true;
}

/** The page's `location.search`, or '' on a page without a location. */
export function pageSearch(): string {
  const location = page.location;
  if (!location) return '';
  if (!isBrowserLocation(location)) return location.search ?? '';
  if (!watching) {
    watching = watchHistory();
    if (!watching) return location.search ?? '';
  }
  if (storedSearch === null) storedSearch = location.search ?? '';
  return storedSearch;
}
