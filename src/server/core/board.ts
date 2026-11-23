import { redis } from '@devvit/web/server';
import type { Board, DailyResult } from '../../shared/api';
import { dayNumber } from '../../shared/api';

// Redis schema
//   lb:{date}            sorted set, member = username, score = daily score
//   res:{date}:{user}    JSON DailyResult (first submission only: one try per day)
//   save:{userId}        JSON save blob from the client
//   post:{date}          id of that day's daily post
//   commented:{date}:{user}  set once a score comment was posted
const KEEP_DAYS = 45 * 24 * 3600;

export const keys = {
  board: (date: string) => `lb:${date}`,
  result: (date: string, user: string) => `res:${date}:${user}`,
  save: (userId: string) => `save:${userId}`,
  post: (date: string) => `post:${date}`,
  commented: (date: string, user: string) => `commented:${date}:${user}`,
  pinned: () => 'pinned',
};

export async function getBoard(date: string, username: string | null, size = 10): Promise<Board> {
  const key = keys.board(date);
  const [total, rows] = await Promise.all([
    redis.zCard(key),
    redis.zRange(key, 0, size - 1, { by: 'rank', reverse: true }),
  ]);
  let me: Board['me'] = null;
  if (username) {
    const score = await redis.zScore(key, username);
    if (score !== undefined) {
      const asc = await redis.zRank(key, username);
      // zRank is ascending and 0-based; ties keep Redis's member order.
      me = { username, score, rank: asc === undefined ? total : total - asc };
    }
  }
  return {
    date,
    dayNo: dayNumber(date),
    total,
    top: rows.map((r) => ({ username: r.member, score: r.score })),
    me,
    signedIn: !!username,
  };
}

function parseResult(raw: string | undefined): DailyResult | null {
  if (!raw) return null;
  try {
    const r: unknown = JSON.parse(raw);
    if (r && typeof r === 'object' && 'score' in r && 'cleared' in r) {
      const { score, cleared } = r;
      if (typeof score === 'number' && typeof cleared === 'number') return { score, cleared };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function getResult(date: string, username: string): Promise<DailyResult | null> {
  return parseResult(await redis.get(keys.result(date, username)));
}

/** Records the first result of the day. Returns false when the player already has one. */
export async function recordResult(date: string, username: string, result: DailyResult): Promise<boolean> {
  const rkey = keys.result(date, username);
  if (await redis.get(rkey)) return false;
  await redis.set(rkey, JSON.stringify(result));
  await redis.expire(rkey, KEEP_DAYS);
  const bkey = keys.board(date);
  await redis.zAdd(bkey, { member: username, score: result.score });
  await redis.expire(bkey, KEEP_DAYS);
  return true;
}
