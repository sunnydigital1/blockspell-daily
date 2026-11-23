import { Hono } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import { isT3 } from '@devvit/web/shared';
import type {
  CommentResponse,
  DailyResponse,
  ErrorResponse,
  InitResponse,
} from '../../shared/api';
import { dayNumber, isDate, utcDate } from '../../shared/api';
import { getBoard, getResult, keys, recordResult } from '../core/board';

export const api = new Hono();

const MAX_SAVE_BYTES = 256 * 1024;
const MAX_SCORE = 50_000_000;

async function currentUsername(): Promise<string | null> {
  if (!context.userId) return null;
  return context.username ?? (await reddit.getCurrentUsername()) ?? null;
}

function parseSave(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) return Object.fromEntries(Object.entries(v));
  } catch {
    /* corrupt save: start fresh */
  }
  return null;
}

function yesterdayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return utcDate(new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, (d ?? 1) - 1)));
}

function postDate(fallback: string): string {
  const d = context.postData?.date;
  return isDate(d) ? d : fallback;
}

api.get('/init', async (c) => {
  try {
    const username = await currentUsername();
    const date = utcDate();
    const pDate = postDate(date);
    const isToday = pDate === date;
    const [rawSave, todayResult, board, todayPost] = await Promise.all([
      context.userId ? redis.get(keys.save(context.userId)) : Promise.resolve(undefined),
      username ? getResult(date, username) : Promise.resolve(null),
      getBoard(date, username),
      redis.get(keys.post(date)),
    ]);
    const [postBoard, postResult] = isToday
      ? [board, todayResult]
      : await Promise.all([getBoard(pDate, username), username ? getResult(pDate, username) : Promise.resolve(null)]);
    return c.json<InitResponse>({
      type: 'init',
      username,
      save: parseSave(rawSave),
      today: { date, dayNo: dayNumber(date) },
      todayResult,
      board,
      post: { date: pDate, dayNo: dayNumber(pDate), isToday },
      postBoard,
      postResult,
      todayPostId: todayPost && isT3(todayPost) ? todayPost : null,
    });
  } catch (error) {
    console.error('init failed', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Could not load your game' }, 500);
  }
});

api.get('/board', async (c) => {
  const q = c.req.query('date');
  const date = isDate(q) ? q : utcDate();
  const board = await getBoard(date, await currentUsername());
  return c.json(board);
});

api.post('/save', async (c) => {
  if (!context.userId) return c.json({ ok: false });
  const body = await c.req.text();
  if (body.length > MAX_SAVE_BYTES) return c.json<ErrorResponse>({ status: 'error', message: 'Save too large' }, 413);
  let save: Record<string, unknown> | null = null;
  try {
    const v: unknown = JSON.parse(body);
    if (v && typeof v === 'object' && 'save' in v) save = parseSave(JSON.stringify(v.save));
  } catch {
    /* ignore */
  }
  if (!save) return c.json<ErrorResponse>({ status: 'error', message: 'Bad save' }, 400);
  await redis.set(keys.save(context.userId), JSON.stringify(save));
  return c.json({ ok: true });
});

api.post('/daily', async (c) => {
  const username = await currentUsername();
  const body: unknown = await c.req.json().catch(() => null);
  const today = utcDate();
  if (!body || typeof body !== 'object' || !('date' in body) || !('score' in body) || !('cleared' in body)) {
    return c.json<ErrorResponse>({ status: 'error', message: 'Bad request' }, 400);
  }
  const { date, score, cleared } = body;
  // A run started just before midnight UTC may finish after it, so yesterday is still accepted.
  const okDate = isDate(date) && (date === today || date === yesterdayOf(today));
  const okScore = typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= MAX_SCORE;
  const okCleared = typeof cleared === 'number' && cleared >= 0 && cleared <= 3;
  if (!okDate || !okScore || !okCleared) {
    return c.json<ErrorResponse>({ status: 'error', message: 'Invalid result' }, 400);
  }
  let accepted = false;
  if (username) accepted = await recordResult(date, username, { score: Math.round(score), cleared });
  return c.json<DailyResponse>({ type: 'daily', accepted, board: await getBoard(date, username) });
});

api.post('/comment', async (c) => {
  const username = await currentUsername();
  const postId = context.postId;
  if (!username || !postId) return c.json<CommentResponse>({ type: 'comment', ok: false, message: 'Log in to comment' });
  const body: unknown = await c.req.json().catch(() => null);
  const rawText = body && typeof body === 'object' && 'text' in body && typeof body.text === 'string' ? body.text : '';
  const asUser = !!(body && typeof body === 'object' && 'asUser' in body && body.asUser === true);
  const text = rawText.slice(0, 400).trim();
  if (!text) return c.json<CommentResponse>({ type: 'comment', ok: false, message: 'Nothing to post' });

  const date = utcDate();
  const flag = keys.commented(date, username);
  if (await redis.get(flag)) return c.json<CommentResponse>({ type: 'comment', ok: true, message: 'Already posted today' });

  try {
    if (asUser) {
      await reddit.submitComment({ id: postId, text, runAs: 'USER' });
    } else {
      throw new Error('user did not grant run-as-user');
    }
  } catch (error) {
    // Fall back to the app account, credited to the player.
    console.warn('comment as user failed, posting as app', error);
    await reddit.submitComment({ id: postId, text: `u/${username} played:\n\n${text}`, runAs: 'APP' });
  }
  await redis.set(flag, '1');
  await redis.expire(flag, 3 * 24 * 3600);
  return c.json<CommentResponse>({ type: 'comment', ok: true, message: 'Posted to the thread' });
});
