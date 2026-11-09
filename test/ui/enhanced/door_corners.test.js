// THE FRONT DOOR'S CORNERS: SUPPORT1's band and DOOR-FIT.
//
// The door carries the profile mark top-right, over a stage whose wordmark can reach under it. Here: the corners' band -
// the door's stage starting below the mark wherever the wordmark reaches under it - derived from the mark's own numbers
// rather than restated, so a mark that grows without its band fails here; and DOOR-FIT, the door that never cuts itself
// off. SUPPORT1 also stood two support icons top-left; they asked for support and are
// removed, with their tests. In a real browser: tools/doorCornersProbe.mjs (the logo's own pixels under the mark, a
// caption at its bound among them; and DOOR-FIT's top, last row and centring, at 192 sizes on both skins).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENHANCED_CSS } from '../../../src/ui/enhanced/enhancedStyle.js';
import { OUTSET } from '../../../src/ui/enhanced/enhancedFrame.js';

/** A rule's body in the skin, by its exact selector at the start of a line (inside a media block or not). */
function rule(sel, css = ENHANCED_CSS) {
  const m = css.match(new RegExp(`(?:^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`));
  assert.ok(m, `${sel} is styled`);
  return m[1];
}
/** A length a rule declares, in px. */
function px(body, prop) {
  const m = body.match(new RegExp(`(?:^|[;{\\s])${prop}: (\\d+)px`));
  assert.ok(m, `${prop} is declared in px: ${body}`);
  return Number(m[1]);
}
/** The body of the one @media block whose condition is exactly `cond` and which holds `sel`. */
function mediaRule(cond, sel) {
  const blocks = [...ENHANCED_CSS.matchAll(/@media ([^{]+) \{\n([\s\S]*?)\n\}/g)].filter(
    (m) => m[1] === cond && m[2].includes(`${sel} {`),
  );
  assert.equal(blocks.length, 1, `one @media ${cond} block styles ${sel}`);
  return rule(sel, `\n${blocks[0][2]}`);
}

test("SUPPORT1: the corners' band - the door's stage starts below the profile mark wherever the wordmark reaches under it, and every number is the mark's own", () => {
  const stage = '.px-home:not(.px-over) > .px-stage:not(.px-acctstage)';
  // THE PROFILE'S reach from the right: its offset, the portrait, the gap, the caption at the door's bound, the Plus
  // frame's outset beyond it. The bound is in PIXELS: the caption's own 14ch and 22ch are the font's (158px in
  // Pixelify Sans), and a reach that is the font's cannot be the band's
  const profile = rule('.px-profile');
  const name = rule('.px-home:not(.px-over) .px-profilename').match(/max-width: min\(14ch, (\d+)px\);/);
  const line = rule('.px-home:not(.px-over) .px-profilesub').match(/max-width: min\(22ch, (\d+)px\);/);
  assert.ok(name && line, 'both caption lines are bounded in px on the door');
  const caption = Math.max(Number(name[1]), Number(line[1]));
  assert.equal(caption, 140, 'a new player\'s "No character yet" (123px) stands whole under it');
  const reach = px(profile, 'right') + px(rule('.px-portrait'), 'width') + px(profile, 'gap') + caption + OUTSET;
  assert.equal(reach, 234);
  // the wordmark is min(234px, 36.4vw) wide and centred (BR6; BR5's was min(321px, 50vw), BR4's min(540px, 84vw)), so it
  // reaches under the mark at every width under 234 + 2 * reach; a 1024x768 door, which fits unscrolled, stays outside the band - the reason
  // the bound is 140 and not 158, when the band ran to 1007
  const mark = rule('.px-wordmark:has(.brand-logo)').match(/width: min\((\d+)px, (\d+(?:\.\d+)?)vw\);/); // BR6: 36.4vw
  assert.ok(mark, "the wordmark's width is px and vw");
  const edge = Number(mark[1]) + 2 * reach - 1;
  assert.equal(edge, 701);
  assert.ok(edge < 1024, `the band ends at ${edge}px, short of 1024`);
  const band = mediaRule(`(min-width: 481px) and (max-width: ${edge}px)`, stage);
  // ...it starts below the profile's portrait, with air
  const [, top, bottom] = band.match(/padding: (\d+)px 24px (\d+)px;/).map(Number);
  assert.ok(top > px(profile, 'top') + px(rule('.px-portrait'), 'height') + OUTSET, `${top}px clears the mark`);
  assert.equal(top, 84);
  // ...and keeps the one-row foot's height at its foot, so a row the band pushed down scrolls clear of About and
  // Screenshots (DOOR-FIT, the next test, is what lets it scroll)
  const foot = 2 * px(rule('.px-foot'), 'padding') + px(rule('.px-about'), 'min-height');
  assert.ok(bottom >= foot, `${bottom}px holds the ${foot}px foot`);
  // on a phone the mark stands 10px in, the caption is hidden and the wordmark is 84vw - under it always: the band's
  // floor there
  assert.match(
    mediaRule('(max-width: 480px)', '.px-profiletext'),
    /display: none;/,
    "a phone's profile is its portrait",
  );
  const phone = mediaRule('(max-width: 480px)', stage).match(/padding-top: max\(7dvh, (\d+)px\);/);
  assert.ok(phone, "the phone's stage keeps PX8's 7dvh, floored");
  const floor = Number(phone[1]);
  assert.ok(
    floor > 10 + px(mediaRule('(max-width: 480px)', '.px-portrait'), 'height') + OUTSET,
    `${floor}px clears the mark on a phone`,
  );
  assert.equal(floor, 72);
  // the band and the bound are the FRONT door's: the pause face (PX4, AUDIT TIMERS1 UI-2's own rule) and the account
  // window's stage keep theirs, and the pause face's caption its own 22ch
  assert.doesNotMatch(ENHANCED_CSS, /\n\s*\.px-stage \{[^}]*padding: 84px/, 'never every stage');
  assert.match(rule('.px-profilesub'), /max-width: 22ch;/, "the caption's own bound, where no wordmark stands");
});

test('DOOR-FIT: the front door never cuts itself off - at every width the phone rule leaves it scrolls, and centres by auto margins where it fits (Mac: "Fix these now")', () => {
  // PX8's stage scrolled only under 560px tall, a threshold set before the door grew to eight rows: a desktop window
  // from 561 to about 690px tall (the eight-row door's own height) ran off BOTH ends with nothing to scroll - the
  // wordmark's top, and under about 620px the whole last row (1366x568). Now the door's stage is a scroller at every
  // width PX8's phone rule does not take...
  const stage = '.px-home:not(.px-over) > .px-stage:not(.px-acctstage)';
  assert.match(mediaRule('(min-width: 481px)', stage), /justify-content: flex-start; overflow-y: auto;/);
  // ...and centres by auto margins, which take the room that is left and none that is not: where the door fits it did
  // not move, and where it does not it starts at the top and every row can be scrolled to
  assert.match(mediaRule('(min-width: 481px)', `${stage} > :first-child`), /margin-top: auto;/);
  assert.match(mediaRule('(min-width: 481px)', `${stage} > :last-child`), /margin-bottom: auto;/);
  // the base stage still centres the old way - the pause face and the account window keep it; the rule above is the
  // front door's alone
  assert.match(rule('.px-stage'), /justify-content: center;/);
  // and a phone keeps PX8's door: from the top, never centred (the band floors its top)
  const phoneBlocks = [...ENHANCED_CSS.matchAll(/@media \(max-width: 480px\) \{\n([\s\S]*?)\n\}/g)]
    .map((m) => m[1])
    .join('\n');
  assert.doesNotMatch(phoneBlocks, /:first-child \{ margin-top: auto; \}/, "a phone's door is not centred");
  // in a browser: tools/doorCornersProbe.mjs - the wordmark's top on the screen and the last row whole and pressed,
  // scrolled to the end, at 192 sizes, and where the door fits the room over it equal to the room under it
});
