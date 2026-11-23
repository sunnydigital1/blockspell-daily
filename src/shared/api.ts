// Shapes shared by the Devvit server and the web view.

export type BoardRow = { username: string; score: number };

export type Board = {
  date: string;
  dayNo: number;
  total: number;
  top: BoardRow[];
  /** The signed-in player's place, when they have a score for this date. */
  me: { username: string; score: number; rank: number } | null;
  signedIn: boolean;
};

export type DailyResult = { score: number; cleared: number };

export type InitResponse = {
  type: 'init';
  username: string | null;
  /** The player's saved game, as stored by the client. Null when logged out or new. */
  save: Record<string, unknown> | null;
  today: { date: string; dayNo: number };
  /** Today's recorded result, so one try per day holds across devices. */
  todayResult: DailyResult | null;
  /** Today's leaderboard. */
  board: Board;
  /** The day this post belongs to. Older posts become a results page for their day. */
  post: { date: string; dayNo: number; isToday: boolean };
  /** Leaderboard and the player's result for the post's own day (same as today's on today's post). */
  postBoard: Board;
  postResult: DailyResult | null;
  /** Today's daily post, so older posts can send players to it. Null if it isn't up yet. */
  todayPostId: string | null;
};

export type SaveRequest = { save: Record<string, unknown> };

export type DailyRequest = { date: string; score: number; cleared: number; streak: number };
export type DailyResponse = { type: 'daily'; board: Board; accepted: boolean };

export type CommentRequest = { text: string; asUser: boolean };
export type CommentResponse = { type: 'comment'; ok: boolean; message: string };

export type ErrorResponse = { status: 'error'; message: string };

/** Daily #1 is 2026-11-23, launch day on Reddit; the game uses the same epoch. Dates are UTC. */
export const DAY_ONE_UTC = Date.UTC(2026, 10, 23);

export function utcDate(d: Date = new Date()): string {
  return (
    d.getUTCFullYear() +
    '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getUTCDate()).padStart(2, '0')
  );
}

export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor((Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1) - DAY_ONE_UTC) / 864e5) + 1;
}

export function isDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
