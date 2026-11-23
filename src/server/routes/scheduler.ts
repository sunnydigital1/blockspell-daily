import { Hono } from 'hono';
import { ensureDailyPost } from '../core/post';

export const scheduler = new Hono();

// Runs a minute after midnight UTC (see devvit.json) and opens the new day's thread.
scheduler.post('/daily-post', async (c) => {
  try {
    const post = await ensureDailyPost();
    console.log(`daily post ${post.created ? 'created' : 'already existed'}: ${post.id}`);
    return c.json({ status: 'ok' }, 200);
  } catch (error) {
    console.error('daily post failed', error);
    return c.json({ status: 'error' }, 500);
  }
});
