// The front door's music and the film's clock.
//
// The intro film and the menu play Daggerfall's own title song from MIDI.BSA, through the game's music service, as
// every other song in the game is played. Daggerfall Unity plays song_5strong under its title screen
// (DaggerfallUnitySetupGameWizard.cs, `titleSongFile`, replayed in Update whenever the song player stops), and the
// classic menu (scenes/menu.js) does the same. Daggerfall's own MIDI.BSA has no 5STRONG record (Daggerfall Unity ships
// that song as a .mid file of its own), so with Daggerfall's data the stand-in, 03.HMI, plays. The lookup still asks
// for 5STRONG first, for an archive that carries it.
//
// The song comes from the player's ARENA2 data, which the front door does not ask for: a first visit has none yet.
// Then the film plays silently. The film's clock is the shared AudioContext's, not the song's, so the film runs the
// same with or without a song, and it stops with the context when the page is hidden.
import { audio } from './audio.js';
import { music, MUSIC_FADE_IN_S } from './music.js';

/** Daggerfall Unity's title song, then the stand-in for an archive without it. */
export const TITLE_SONGS = Object.freeze(['5STRONG.HMI', '03.HMI']);
/** The title song's level under the menu, against its own level under the film. */
export const MENU_MUSIC_LEVEL = 0.32;

/** The first title song the archive holds, or null. */
export function titleSongName(archive) {
  return TITLE_SONGS.find((name) => (archive?.getSongIndex(name) ?? -1) >= 0) ?? null;
}

/** Audio device time corresponding to a presentation time (milliseconds).
 * A zero timestamp before the device starts is not a usable clock. Fallback
 * subtracts reported output latency; it never substitutes a wall clock. */
export function audibleContextTime(context, presentationMs) {
  const stamp = context.getOutputTimestamp?.();
  if (stamp && stamp.performanceTime > 0 && Number.isFinite(stamp.contextTime)) {
    return stamp.contextTime + (presentationMs - stamp.performanceTime) / 1000;
  }
  return context.currentTime - Math.max(0, context.outputLatency ?? context.baseLatency ?? 0);
}

/** The front door owns this session; the cinematic DOM does not. */
export class TitleMusic {
  /** `fetchBytes` reads ARENA2 files (scenes/dataSource.js getBytes). `sound` and `songs` are the tests' seams. */
  constructor({ fetchBytes = null, sound = audio, songs = music, now = () => performance.now() } = {}) {
    this.fetchBytes = fetchBytes;
    this.sound = sound;
    this.songs = songs;
    this.now = now;
    this.loading = null;
    this.archiveReady = Promise.resolve();
    this.started = false;
    this.song = null;
    this.startedAt = null;
    this.level = 1;
    this.disposed = false;
    this.lastTime = 0;
  }

  /** The shared AudioContext, which is also the film's clock. */
  get context() { return this.sound.ctx ?? null; }

  /** Resolves true when there is a clock to run the film on. The archive keeps loading behind it, because the film
   *  does not wait for its song. */
  prepare() {
    this.loading ??= this._prepare();
    return this.loading;
  }

  async _prepare() {
    this.sound.ensureContext();
    if (this.fetchBytes) this.archiveReady = this._bootSongs();
    if (this.disposed) return false;
    if (!this.context) {
      console.warn('[intro] music unavailable: Web Audio is unavailable');
      return false;
    }
    return true;
  }

  /** The music service boots only once MIDI.BSA has been read. Its boot is made once a session, and a boot with no
   *  data would keep the music off after the player picks their data. The bytes read here are kept, so the boot does
   *  not read them again. */
  async _bootSongs() {
    try { await this.fetchBytes('MIDI.BSA'); }
    catch { return; }   // no data yet: the film plays silently, and the game's first host boots the music
    await this.songs.ensure(this.fetchBytes);
  }

  /** Must be called directly from a trusted click/key handler: a browser lets a context run only inside one. */
  unlock() {
    if (this.disposed) return Promise.resolve(false);
    this.prepare();
    try {
      return Promise.resolve(this.context?.resume()).then(() => this.context?.state === 'running').catch(() => false);
    } catch { return Promise.resolve(false); }
  }

  start() {
    if (this.disposed || this.context?.state !== 'running') return false;
    if (this.started) return true;
    this.started = true;
    this.startedAt = this.context.currentTime + 0.06;
    void this.archiveReady.then(() => this._playSong());
    return true;
  }

  _playSong() {
    if (this.disposed) return;
    const name = titleSongName(this.songs.archive);
    if (!name) {
      if (this.songs.enabled) console.warn('[intro] no title song in MIDI.BSA (tried ' + TITLE_SONGS.join(', ') + ')');
      return;
    }
    if (!this.songs.playSong(name)) return;
    this.song = name;
    // the music service raises a new song to its full level; the film's or the menu's level replaces that rise
    this.songs.fadeTo(this.level, MUSIC_FADE_IN_S);
  }

  time(presentationMs = this.now()) {
    if (this.startedAt === null) return 0;
    if (!this.context) return this.lastTime;
    if (this.context.state !== 'running') return this.lastTime;
    const t = Math.max(0, audibleContextTime(this.context, presentationMs) - this.startedAt);
    this.lastTime = Math.max(this.lastTime, t);
    return this.lastTime;
  }

  setLevel(level, seconds = 0.9) {
    this.level = Math.max(0, Math.min(1, level));
    if (this.song && !this.disposed) this.songs.fadeTo(this.level, seconds);
  }

  async pause() {
    if (this.context?.state === 'running') {
      this.time();
      await this.context.suspend();
    }
  }

  /** The title song fades out when a game is chosen. The next host's song then starts at its own full level. */
  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.song && this.songs.current === this.song) this.songs.fadeOut();
    this.song = null;
  }
}
