// Reddit entry for Blockspell: loads the player's save from Redis, then boots the original game
// scripts with a small platform layer (saves, daily scores, comments, share sheet).
import { canRunAsUser, showLoginPrompt, showShareSheet, showToast } from '@devvit/web/client';
import type { Board, CommentResponse, DailyRequest, DailyResponse, InitResponse } from '../shared/api';

type Platform = {
  name: 'reddit';
  noAds: true;
  startOnDaily: boolean;
  save: (save: unknown) => void;
  submitDaily: (r: DailyRequest) => Promise<Board | null>;
  board: (date: string) => Promise<Board | null>;
  comment: (text: string) => Promise<boolean>;
  share: (text: string) => void;
};

declare global {
  interface Window {
    BS_PLATFORM?: Platform;
    BS_NO_ADS?: boolean;
  }
}

const SAVE_KEY = 'blockspell.save.v1';

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function readLocal(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return isRecord(v) ? v : null;
  } catch {
    return null;
  }
}

function writeLocal(save: Record<string, unknown>): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage can be blocked inside the post iframe; the server copy still works */
  }
}

const savedAt = (s: Record<string, unknown> | null): number =>
  s && typeof s.savedAt === 'number' ? s.savedAt : 0;

/** Newest save wins, and today's server-recorded result always sticks (one try per day). */
function reconcile(init: InitResponse | null): void {
  const local = readLocal();
  const remote = init?.save ?? null;
  let save = savedAt(remote) > savedAt(local) ? remote : local;
  if (init?.todayResult) {
    save = save ?? {};
    const daily = isRecord(save.daily) ? save.daily : { streak: 0, last: null, results: {} };
    const results = isRecord(daily.results) ? daily.results : {};
    results[init.today.date] = init.todayResult;
    daily.results = results;
    save.daily = daily;
    if (isRecord(save.dailyRun) && save.dailyRun.date === init.today.date) save.dailyRun = null;
  }
  if (save) writeLocal(save);
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    const data: T = await res.json();
    return data;
  } catch {
    return null;
  }
}

const post = (body: unknown, keepalive = false): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  keepalive,
});

// Saves are debounced: the game persists after nearly every move.
let pendingSave: unknown = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function flushSave(keepalive = false): void {
  if (pendingSave === null) return;
  const body = { save: pendingSave };
  pendingSave = null;
  clearTimeout(saveTimer);
  void fetch('/api/save', post(body, keepalive)).catch(() => null);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushSave(true);
});
window.addEventListener('pagehide', () => flushSave(true));

// Run-as-user consent needs the trusted event that started the action. The canvas game
// dispatches button presses from its own pointer handlers, so keep the latest one.
let lastPointer: Event | null = null;
for (const type of ['pointerdown', 'pointerup', 'click']) {
  window.addEventListener(type, (e) => (lastPointer = e), true);
}

async function boot(): Promise<void> {
  const init = await getJson<InitResponse>('/api/init');
  reconcile(init);
  let signedIn = !!init?.username;

  window.BS_NO_ADS = true;
  window.BS_PLATFORM = {
    name: 'reddit',
    noAds: true,
    startOnDaily: true,
    save(save) {
      if (!signedIn) return;
      pendingSave = save;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => flushSave(), 1500);
    },
    async submitDaily(r) {
      flushSave();
      const res = await getJson<DailyResponse>('/api/daily', post(r));
      return res ? res.board : null;
    },
    board(date) {
      return getJson<Board>(`/api/board?date=${encodeURIComponent(date)}`).then((b) => {
        if (b) signedIn = b.signedIn;
        return b;
      });
    },
    async comment(text) {
      if (!signedIn) {
        showLoginPrompt();
        return false;
      }
      let asUser = false;
      try {
        if (lastPointer) asUser = await canRunAsUser(lastPointer);
      } catch {
        asUser = false;
      }
      const res = await getJson<CommentResponse>('/api/comment', post({ text, asUser }));
      showToast(res?.message ?? 'Could not post the comment');
      return !!res?.ok;
    },
    share(text) {
      void showShareSheet({ title: 'Blockspell Daily', text }).catch(() => {
        showToast('Sharing is not available here');
      });
    },
  };

  // The original scripts register globals (BS, GFX, SFX) and must run in this order.
  await import('./bs/core.js');
  await import('./bs/gfx.js');
  await import('./bs/audio.js');
  await import('./bs/game.js');
}

void boot();
