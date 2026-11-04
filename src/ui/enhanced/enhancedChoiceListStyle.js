// @ts-check
// The Plus choice face's look for an answer listed line by line (`lvl-listed`: ui/enhanced/enhancedChoiceFace.js, set by a
// question's `listLines`) and for four or more answers (`lvl-many`). A sheet of its own, laid by the face after the Plus
// sheet so its rules win by order over the base `.lvl-opt` rules (enhancedPlusStyle.js PLUS_FIX_CSS).
export const CHOICE_LISTED_CSS = `
.lvl-opt-line { margin: 0 0 6px; } .lvl-opt-line:last-child { margin-bottom: 0; }
/* Four or five answers on a phone held sideways: one row, no scroll - a tighter tile, the lead and eyebrow folded away */
@media (orientation: landscape) and (max-height: 500px) {
  .lvl-many .lvl-opts { grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); grid-auto-flow: column; gap: 6px; }
  .lvl-shell .px-win.lvl-many { width: 100%; max-height: 100dvh; }
  .lvl-many .px-body { padding: 6px 8px; } .lvl-many .lvl-card { padding: 6px 8px; }
  .lvl-many .lvl-lead, .lvl-many .lvl-eyebrow { display: none; }
  .lvl-many h2.lvl-title { margin: 0 0 6px; font-size: 18px; }
  .lvl-many .lvl-opt { padding: 8px 8px 6px; gap: 6px; min-width: 0; }
  .lvl-many .lvl-opt-title { font-size: 14px; letter-spacing: 0.04em; } .lvl-many .lvl-tag { margin-left: 0; font-size: 9px; letter-spacing: 0.1em; text-align: left; }
  .lvl-many .lvl-opt-body { font-size: 11px; line-height: 1.3; } .lvl-many .lvl-opt-line { margin-bottom: 3px; }
  .lvl-many .lvl-hint { margin-top: 6px; }
}
`;

export const CHOICE_LIST_STYLE_ID = 'enhanced-choice-list-style';
export function injectChoiceListStyle(doc = document) {
  if (doc.getElementById(CHOICE_LIST_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = CHOICE_LIST_STYLE_ID;
  style.textContent = CHOICE_LISTED_CSS;
  doc.head.append(style);
}
