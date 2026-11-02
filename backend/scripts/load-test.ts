/**
 * Schedules N emails for (approximately) the same moment through the real scheduling service, to
 * observe spacing + hourly limiting + rescheduling in Bull Board and the dashboard.
 *
 *   npm run load-test -- <user-email> [count=1000] [startInSeconds=10]
 *
 * Recipients are @example.com addresses — Ethereal captures everything, nothing is delivered.
 */
import crypto from 'crypto';
import { prisma } from '../src/db/prisma';
import { redis } from '../src/db/redis';
import { closeQueues } from '../src/queues';
import { scheduleCampaign } from '../src/services/email.service';

async function main() {
  const [email, countArg, startArg] = process.argv.slice(2);
  if (!email) throw new Error('Usage: npm run load-test -- <user-email> [count] [startInSeconds]');
  const count = Number(countArg ?? 1000);
  const startIn = Number(startArg ?? 10);

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { senders: true } });
  if (!user) throw new Error(`No user ${email}`);
  const sender = user.senders[0];
  if (!sender) throw new Error('User has no senders');

  const recipients = Array.from({ length: count }, (_, i) => `load-test-${i + 1}@example.com`);
  const started = Date.now();
  const result = await scheduleCampaign(user.id, `load-test-${crypto.randomUUID()}`, {
    senderId: sender.id,
    recipients,
    subject: `Load test (${count} recipients)`,
    bodyHtml: '<p>Load test message from ReachInbox scheduler.</p>',
    startAt: new Date(Date.now() + startIn * 1000),
    attachmentIds: [],
  });
  console.log(`Scheduled ${result.scheduled} emails in ${Date.now() - started} ms (campaign ${result.campaignId})`);
  console.log(`Sender ${sender.email}: hourlyLimit=${sender.hourlyLimit}, minDelayMs=${sender.minDelayMs}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeQueues();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit();
  });
