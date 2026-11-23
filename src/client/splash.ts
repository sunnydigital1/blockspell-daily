// Inline view shown in the feed: today's number, the top scores and one big Play button.
// Kept light; the game itself loads only in expanded mode.
import { navigateToPost, requestExpandedMode } from '@devvit/web/client';
import { isT3 } from '@devvit/web/shared';
import type { Board, InitResponse } from '../shared/api';

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function renderBoard(board: Board): void {
  const list = byId('board');
  list.replaceChildren(
    ...board.top.slice(0, 3).map((r, i) => {
      const li = document.createElement('li');
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = String(i + 1);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = `u/${r.username}`;
      const score = document.createElement('span');
      score.className = 'score';
      score.textContent = fmt(r.score);
      li.append(rank, name, score);
      return li;
    })
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}`;
}

const playersLine = (n: number, today: boolean) =>
  `${fmt(n)} ${n === 1 ? 'player' : 'players'} ${today ? 'today' : 'took part'}`;

function status(init: InitResponse): string {
  const { postBoard: board, postResult: result, post } = init;
  const players = playersLine(board.total, post.isToday);
  if (result && board.me) return `You scored ${fmt(result.score)}: #${board.me.rank} of ${players}`;
  if (result) return `You scored ${fmt(result.score)}`;
  if (board.total === 0) return post.isToday ? 'No scores yet today. Be the first!' : 'Nobody played this one.';
  return players;
}

// Until /api/init answers, Play opens the game here.
let onPlay: (e: MouseEvent) => void = (e) => requestExpandedMode(e, 'game');
byId('play').addEventListener('click', (e) => onPlay(e));

void (async () => {
  try {
    const res = await fetch('/api/init');
    if (!res.ok) return;
    const init: InitResponse = await res.json();
    renderBoard(init.postBoard);
    byId('status').textContent = status(init);
    if (init.post.isToday) {
      byId('day').textContent = `Blockspell Daily #${init.today.dayNo}`;
      if (init.todayResult) byId('play').textContent = 'See the leaderboard';
      return;
    }
    // An older daily: show its final standings and send players to today's post.
    byId('day').textContent = `Daily #${init.post.dayNo}: final results`;
    byId('sub').textContent = `The ${shortDate(init.post.date)} spell is closed. Today's is #${init.today.dayNo}.`;
    byId('play').textContent = `Play today's spell (#${init.today.dayNo})`;
    const todayId = init.todayPostId;
    onPlay = (e) => {
      if (todayId && isT3(todayId)) navigateToPost(todayId);
      else requestExpandedMode(e, 'game');
    };
  } catch {
    /* offline or preview: the static card still works */
  }
})();
