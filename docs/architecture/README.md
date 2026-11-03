# Architecture

How the browser client is put together: boot, scene hosts, the frame, module layout and the rules for adding code.

- [boot-and-frame.md](boot-and-frame.md) - `src/main.js`, the scene routes, `bootWorld`'s setup, the mode machine and
  the order of work in one frame.
- [hosts-and-modules.md](hosts-and-modules.md) - the scene hosts, the rule that new behaviour goes into a module the
  host wires, the module shape, how systems, UI and net connect, settings stores and the code standard.
- [source-layout.md](source-layout.md) - `src/` folder by folder, where a new file goes, global state, `window.__*`
  debug hooks and URL parameters.
