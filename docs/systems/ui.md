# User interface

This page covers the game's screens: the two skins, how windows are opened and stacked, the HUD, input (keyboard,
mouse, gamepad, touch), the settings screen, the maps, and how text is translated.

## Two skins

The game wears one of two skins. Each surface that has two versions asks one predicate which to mount.

| Skin | What it is | How it draws |
| --- | --- | --- |
| Classic | Daggerfall's own screens on its art (`.IMG`, `.CIF`, `.RCI` from ARENA2), laid out as Daggerfall Unity lays them | WebGL textures on a virtual 320x200 screen, integer-scaled and letterboxed |
| Enhanced (named "Enhanced Plus") | The game's own screens, DOM and CSS, in a stone-and-brass style | HTML elements over the game canvas |

- `src/systems/uiSkin.js` owns the choice. `uiSkin()` answers the `?skin=classic|enhanced` URL override first (this
  page load only, never stored), then uiPrefs `skin`, then `DEFAULT_SKIN` (`'enhanced'`). Call `isEnhanced()` at every
  mount site; never compare the string yourself.
- `setUiSkin(skin)` stores the choice. A change reloads the game, because each skin mounts its own windows.
- The skin is not a settings key. `src/systems/settings/settings.js` holds Daggerfall Unity's own keys only; the
  game's own preferences live in `src/systems/uiPrefs.js` (localStorage key `dagger.ui.v1`).
- `isEnhancedPlus()` answers the same as `isEnhanced()`. It remains as a name for the enhanced dress's own seams.
- The player picks a look on the Overhauls screen (`src/systems/overhauls.js`, drawn by `paneOverhauls` in
  `src/ui/enhanced/enhancedMenu.js`): Classic, Enhanced, the GrimoireUI pack over the classic skin
  (`src/systems/uiPack.js`, `src/ui/packArt.js`, files in `public/art/grimoire-ui/`), or the DFO Grimoire dress over the
  enhanced skin (`src/ui/grimoireDress.js`, `src/ui/grimoireArt.js`, uiPrefs `plusDress`). A UI pack keeps the classic
  logical size of every picture, so layouts and hit rects stay classic.
- Online play uses the same skin choice; the online panels mount on either skin.

### Classic building blocks

- `src/ui/native/nativePanel.js`: `NATIVE_W` x `NATIVE_H` (320x200) virtual screen. `loadImg`, `drawImg`,
  `shadowText` (Daggerfall's yellow with a shadow), `pointToNative` for hit tests.
- `src/ui/text.js`: Daggerfall's `.FNT` fonts as a glyph atlas. Text folds to ASCII first, as Daggerfall Unity does.
- `src/ui/messageBox.js`, `src/ui/yesNoBox.js`, `src/ui/listPicker.js`: the classic boxes.
- `src/ui/hud/hud.js`: the classic HUD (vitals bottom-left from `MAIN03I0`-`MAIN05I0`, compass bottom-right),
  scaled by `floor(canvasHeight / 200)`. `src/ui/hud/hudLarge.js` is the large status bar (`GUI/LargeHUD`).
- `src/ui/uiScreen.js`: `uiCanvas` and `onUiScreen` lay the 2D layer inside the retro-mode pillarbox.

### Enhanced building blocks

- `src/ui/enhanced/enhancedStyle.js`: the shared stylesheet and tokens. `src/ui/enhanced/enhancedFrame.js`: the frame
  kit, which assigns a role (`window`, `panel`, `button`, `tile`, `well` and others) and changes paint, never geometry.
- `src/ui/bitmapCanvas.js`: turns a palettized Daggerfall bitmap into a canvas for the DOM (index 0 transparent,
  nearest scaling).
- `src/ui/enhanced/enhancedChunk.js` `mountEnhancedChunk`: each large enhanced window is a lazy chunk. A deploy deletes
  old chunk files, so a stale tab can fail to load one; the door reports the failure instead of staying silent.
- `src/ui/enhanced/enhancedOverlays.js` `registerOverlay`: a stack of close functions. Tab (the `QuickDial` action)
  closes the top enhanced overlay before it opens the dial (`src/ui/pixelDial.js`).
- `src/ui/uiClickSound.js`: one capture-phase listener plays Daggerfall's button click for every enhanced button.

## Doors: one place builds each window

A "door" module decides which version of a window opens and builds it in one place. The hosts call the door, never
the window's constructor. Examples: `src/ui/inventoryDoor.js`, `src/ui/pauseDoor.js`, `src/ui/charSheetDoor.js`,
`src/ui/spellbookDoor.js`, `src/ui/automap/automapDoor.js`, `src/ui/travel/travelMapDoor.js`,
`src/ui/town/townMapDoor.js`. Each one asks `isEnhanced()` (and, for maps, `heldMapWorn()`), then mounts the enhanced
DOM window or the classic native window. Add a new two-skin window the same way.

## The window stack

`src/ui/windowStack.js` ports Daggerfall Unity's `UserInterfaceManager`. `makeWindowStack({ hud, onTop,
onWindowChange, clearActions })` returns the stack.

- The HUD sits at the bottom and is never popped. `pushWindow(win)` lays a window on top; `popWindow()` returns to the
  one beneath, which gets `onReturn`. `changeWindow`, `clear`, `keepOnly` and `topWindow` complete the API.
- Only the top window receives input.
- The game pauses for any window unless it sets `pauseWhileOpen: false`. Pause is a latch: it lifts only when the
  stack is back to the HUD.
- Window fields the stack reads: `pauseWhileOpen`, `previousWindow` (paint the window beneath, as message boxes do),
  `hidesHud` (the held map hides the HUD), `holdsTop`.
- Each host keeps a single overlay slot as a mirror of the top (`onTop` writes it). `reconcile(live)` turns a slot that
  a close path set to `null` into a pop, so older close paths keep working.
- `postMessage` / `getMessage` carry Daggerfall Unity's window messages (`MAX_MESSAGE_COUNT` 10).

A classic window has `tick`, `draw`, and click, hover and key handlers in native coordinates. An enhanced window owns
its DOM and its own keyboard handling while it is open. Hosts must not grow new window logic inline: add a door or a
module the host calls.

## HUD

- Classic: `src/ui/hud/hud.js` and its widgets in `src/ui/hud/` (`hudVitals.js`, `hudCrosshair.js`,
  `hudActiveSpells.js`, `hudStatus.js`, `hudText.js`, `hudFoeTarget.js`).
- Enhanced: `src/ui/enhanced/enhancedHud.js` draws a compass strip, a target bar, vitals and effects. It is built once
  and each frame writes only what changed. It does not register on the window stack and takes no clicks.
- Both draw from one call, `drawHud`, which every host makes last each frame.
- Enhanced HUD layout: `src/ui/hud/hudLayout.js` (uiPrefs `hudLocked`, `hudLayout`, `hudBarsSplit`, `hudSnap`) lets a
  player move pieces when the lock is off. uiPrefs `hudScale` scales the enhanced HUD.
- Quick slots: on the enhanced skin with a hotbar style chosen, `hotbarInForce()` (`src/systems/uiSkin.js`) replaces
  the quickslot diamond with `src/ui/enhanced/enhancedHotbar.js`.

## Input

### Keyboard and mouse

- `src/systems/inputActions.js` is the binding registry, after Daggerfall Unity's `InputManager`. `ACTIONS` keeps
  Daggerfall Unity's action names and order; the game's own actions (`PORT_ACTIONS`, such as `SocialInteract` on F and
  the quick slots) are appended, never inserted, because the classic controls window indexes the list by number.
- Codes are `KeyboardEvent.code` strings plus `Mouse0`-`Mouse4` and `Joystick*` names. `DEFAULT_BINDINGS` holds the
  defaults (W/A/S/D move, Space jump, C crouch, Left Shift run, Mouse0 activate, Mouse1 swing, Backspace spellbook,
  F5 character sheet, F6 inventory, M automap, V travel map, F9/F11 quick save/load).
- Bindings save to localStorage key `dagger.keybinds` (`saveKeyBinds`, `loadOrCreateBindings`), versioned by
  `KEYBINDS_VERSION`; `migrateKeyBinds` carries old files forward.
- `src/ui/input.js` resolves every gameplay read through the registry, live: `held(keys, action)`,
  `pressed(edges, keys, action)`, `released`, `actionsOf(e)`. Gameplay code must not test a raw key code.
- A player may share one key between actions; every reader then sees each action. `UNLOSEABLE_ACTIONS` cannot be left
  unbound (`repairUnloseableBindings`). A mod's keys answer only while the mod is on (`actionLive`).
- A window's own keys (Escape, Enter, Y/N, arrows on maps, a classic window's letter shortcuts in
  `src/systems/dialogShortcuts.js`) apply only while that window is on top.
- Controls windows: classic `src/ui/controlsWindow.js` (Daggerfall's `CNFG00I0.IMG` grid),
  `src/ui/mouseControlsWindow.js`, `src/ui/joystickControlsWindow.js`; enhanced `src/ui/enhanced/enhancedControls.js`
  on the Settings screen. Edits are staged and applied on Confirm (`src/systems/controlsConfig.js`).

### Gamepad

`src/ui/gamepadInput.js` polls the Gamepad API each frame and speaks the keyboard's language: buttons become synthetic
key events named `JoystickButton0`-`19`, stick axes raise the move actions, and the camera stick feeds the host's look
hook. Rebinding a pad button uses the same registry. `src/systems/gamepad.js` holds the axis law;
`src/ui/menu/menuPad.js` drives the front-door menu; `src/systems/padCursor.js` moves the cursor.

### Touch

`src/ui/touch/` is the game's own layer (Daggerfall Unity has none). It also speaks the desktop language instead of
adding a second input system.

- `touchDevice.js` decides "is the primary pointer a finger" with `(pointer: coarse)` and `(hover: none)`, falling
  back to a touch sniff. `?touch=on|off` overrides it.
- `touch.js`: the left half is a virtual stick that sends the bound move keys (Run past 80% throw). The right half is
  classified by `touchGestures.js` as LOOK (drag), SWIPE (an attack, the same seam as the right-button drag) or TAP
  (activate through the finger, which also locks a foe). `touchLook.js` holds the pure tuning.
- `touchButtons.js`: the bottom-right buttons, which the player can remap.
- Every touch target is at least 44 CSS px under `(max-width: 860px), (pointer: coarse)`. The rule lives in
  `src/ui/enhanced/enhancedStyle.js` after the comment "A THUMB IS NOT A SCREEN WIDTH"; a new element must add its
  coarse sizing there. Both pages use `viewport-fit=cover`, and screens pad with `env(safe-area-inset-*)`.
  `play/index.html` sets `user-scalable=no` on purpose: the touch layer owns pinch and drag.
- Probes: `tools/enhancedTapProbe.mjs`, `tools/chargenPhoneProbe.mjs`, `tools/shortTouchProbe.mjs`.

## Settings screen

One screen serves both skins: the Settings pane of `src/ui/enhanced/enhancedMenu.js`. The front door (`src/main.js`
calls `runEnhancedMenu`) and the enhanced pause screen mount it. The classic pause window (`src/ui/pauseWindow.js`, on
`OPTN00I0.IMG`) keeps Daggerfall's own volume bars and controls.

- `src/ui/settings/settingsMap.js` `CATEGORIES`: nine tabs (Graphics, Gameplay, Combat, World, Interface, Audio,
  Controls, Accessibility, Mods & files), each with sections. An item is `Section/Key` (a Daggerfall Unity setting),
  `feat:<id>` (a row of `src/systems/features.js`), `port:<id>` (a row in `enhancedMenu.js`), `card:<id>`, or a
  screen piece. Every key and row must appear exactly once.
- `src/ui/settings/settingsLaw.js` picks each control's type and range; `src/ui/settings/settingsCopy.js` holds labels
  and help text.
- Storage: Daggerfall Unity's keys in `src/systems/settings/settings.js` (localStorage `dagger.settings.v1`, defaults
  parsed from `vendor/dfu-settings`); the game's own switches in uiPrefs. Each settings key has a tier (`live`,
  `stored`, `unavailable`, `restart`) so the screen never offers a switch that does nothing.
- `onSettingChange` notifies listeners; volume and other live settings subscribe to it.

## Maps

| Map | Classic skin | Enhanced skin |
| --- | --- | --- |
| Travel map (V) | `src/ui/travel/travelMapWindow.js` | Held map, `src/ui/heldMap.js` |
| Town map (M outdoors) | `src/ui/exteriorAutomapWindow.js` | Held map town sheet, `src/ui/town/townSheet.js` |
| Dungeon and interior automap (M) | `src/ui/automap/automapWindow.js` | Held map dungeon sheet, `src/ui/automap/automapSheet.js` |

- `src/ui/map/mapSkin.js` is the one question the three map doors ask. `heldMapWorn()` is true on the enhanced skin
  with uiPrefs `heldMap` on (Features row `enhanced-map`) and a DOM present. `dungeonMap3dOn()` chooses the turned 3D
  dungeon sheet over the flat plan (`dungeon-map-3d`, `?dungeonmap=flat`).
- The held map shows the map on a parchment held in the player's hands (`public/art/held-map.png`). It inks the sheet
  on a 2D canvas at run time (`src/ui/ink/inkMap.js`), and the map pans and zooms under fixed hands. It uses the
  classic travel map's own rules for travel time, cost and discovery. It sets `hidesHud = true`. uiPrefs `mapScale`
  (`src/ui/map/mapScale.js`) scales it on large screens.
- The classic automap ports Daggerfall Unity's `DaggerfallAutomapWindow` on `AMAP00I0.IMG`; its reveal data is
  `src/systems/automap/automapModel.js`.

## Localization

- `src/systems/textManager.js` ports Daggerfall Unity's `TextManager` (string-table collections, CSV parser, patcher,
  grammar). On top of it the game adds locales: a lookup walks `localeChain` (for example `pt-BR`, `pt`, `en`).
- English stays in the code. The game's own strings go through `t(key, en, args)`, for example
  `t('menu.rail.new', 'New Game')`, written in a small ICU MessageFormat subset (`{name}`, `plural`, `select`,
  `selectordinal`, `number`).
- `locales/<tag>/Port_Strings.csv` holds each language (Daggerfall Unity's two-column format);
  `locales/README.md` explains it to translators. `tools/l10nExtract.mjs` writes `locales/en/Port_Strings.csv` from the
  source; `--check` fails when it is stale. Never edit the English catalog by hand.
- `src/systems/localeCatalog.js` `LOCALE_CATALOG` lists the offered languages. Those marked `drafting` are offered only
  when a translation pack covers them. Untranslated drafts are machine translations, and the game labels them so.
- `src/scenes/localeData.js` `initLocale` picks the language at boot (uiPrefs `language`, `?lang=` for one visit);
  `switchLocale` changes it in play. `qps-ploc` is a pseudo-locale that shows unrouted text.
- Classic fonts hold ASCII only. `src/ui/localeFaces.js` registers a system-font face per script for every language but
  English, the same mechanism as Daggerfall Unity's localized fonts.
- `tools/l10nHardcoded.mjs` counts English prose not routed through `t`; `test/systems/l10n4_hardcoded.test.js` holds
  each file's count as a ratchet. A new hard-coded sentence fails the suite.

### Plain words

Player-facing text says what a system is and what the player can do next, on the screen where it is used, in readable
sizes. Use plain words over invented terms. `test/ui/audit_plainui.test.js` checks the surfaces rewritten under this
rule.

## Tests

- Skin and stack: `test/ui/skinmode_toggle.test.js`, `test/ui/roadb_window_stack.test.js`.
- HUD: `test/ui/hud/hud.test.js`, `test/ui/hud/hudvitals.test.js`, `test/ui/enhanced/enhancedHud.test.js`.
- Input: `test/systems/inputactions.test.js`, `test/ui/kb1_keybinds.test.js`, `test/systems/controlswindow.test.js`,
  `test/ui/enhanced/enhancedControls.test.js`, `test/systems/gamepad.test.js`, `test/ui/pad1.test.js`,
  `test/ui/touch/touchinput2.test.js`, `test/ui/touch/touchdevice.test.js`, `test/ui/touch/touchbuttons.test.js`.
- Settings: `test/systems/settings.test.js`, `test/systems/org2_options.test.js`, `test/ui/settings/settingsUI.test.js`.
- Maps: `test/ui/heldmap.test.js`, `test/ui/automap/`, `test/ui/automap_ext.test.js`.
- Localization: `test/systems/l10n1.test.js`, `test/systems/l10n1b.test.js`, `test/ui/l10n2.test.js`.

## Traps

- Probes in `tools/` measure classic geometry with `?skin=classic`; the override must never persist.
- A new uiPrefs key belongs in `src/systems/uiPrefs.js` `PREF_DEFAULTS`, never in the settings store.
- Do not insert into `ACTIONS`; append.
- A Features row with `kinds: ['enhanced']` does nothing on the classic skin.
- Node tests drive hosts headless: doors fall back to the classic canvas window when `document` is absent.
