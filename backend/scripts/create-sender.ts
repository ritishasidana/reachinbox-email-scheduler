/**
 * Adds an Ethereal sender to an existing user (user must have logged in once via Google).
 *
 *   npm run sender:create -- user@gmail.com "Marketing Sender" [hourlyLimit] [minDelayMs]
 *
 * Uses existing credentials if ETHEREAL_USER / ETHEREAL_PASS are set in the shell, otherwise creates
 * a brand-new Ethereal account.
 */
import { prisma } from '../src/db/prisma';
import { redis } from '../src/db/redis';
import { createEtherealSender } from '../src/services/sender.service';

async function main() {
  const [email, name, hourly, delay] = process.argv.slice(2);
  if (!email) throw new Error('Usage: npm run sender:create -- <user-email> [name] [hourlyLimit] [minDelayMs]');
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new Error(`No user with email ${email}. Log in with Google first.`);

  const sender = await createEtherealSender(user.id, {
    name,
    smtpUser: process.env.ETHEREAL_USER || undefined,
    smtpPass: process.env.ETHEREAL_PASS || undefined,
    hourlyLimit: hourly ? Number(hourly) : undefined,
    minDelayMs: delay ? Number(delay) : undefined,
  });
  console.log('Created sender:', sender);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    process.exit();
  });
