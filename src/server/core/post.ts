import { context, reddit, redis } from '@devvit/web/server';
import { isT3, type T3 } from '@devvit/web/shared';
import { dayNumber, utcDate } from '../../shared/api';
import { keys } from './board';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dailyTitle(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `Blockspell Daily #${dayNumber(date)} (${MONTHS[(m ?? 1) - 1]} ${d}): same pieces for everyone, one try`;
}

/**
 * Creates the post for a day, or returns the one that already exists.
 * With force, always makes a new post (mods use this to replace a deleted one).
 */
export async function ensureDailyPost(
  date: string = utcDate(),
  force = false
): Promise<{ id: string; created: boolean }> {
  const existing = force ? undefined : await redis.get(keys.post(date));
  if (existing) return { id: existing, created: false };
  const post = await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: dailyTitle(date),
    postData: { date },
    textFallback: {
      text: `Blockspell Daily #${dayNumber(date)}. Open this post on the Reddit app or new Reddit to play.`,
    },
  });
  await redis.set(keys.post(date), post.id);
  await pinLatest(post.id);
  return { id: post.id, created: true };
}

/** Keeps the newest daily pinned at the top of the subreddit and unpins the one before it. */
async function pinLatest(id: T3): Promise<void> {
  const previous = await redis.get(keys.pinned());
  if (previous && previous !== id && isT3(previous)) {
    try {
      await (await reddit.getPostById(previous)).unsticky();
    } catch (error) {
      console.warn('could not unpin previous daily', error);
    }
  }
  try {
    await (await reddit.getPostById(id)).sticky(1);
    await redis.set(keys.pinned(), id);
  } catch (error) {
    // Pinning needs the app to have mod permissions in the subreddit; the daily still works without it.
    console.warn('could not pin daily', error);
  }
}
