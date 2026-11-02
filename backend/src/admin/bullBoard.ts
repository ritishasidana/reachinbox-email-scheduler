import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { allQueues } from '../queues';

export const BULL_BOARD_PATH = '/admin/queues';

/** Bull Board UI for waiting / active / delayed / completed / failed jobs across all queues. */
export function createBullBoardRouter() {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BULL_BOARD_PATH);
  createBullBoard({
    queues: allQueues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
    options: { uiConfig: { boardTitle: 'ReachInbox Queues' } },
  });
  return serverAdapter.getRouter();
}
