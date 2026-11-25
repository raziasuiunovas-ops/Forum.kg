import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const order = await prisma.order.findFirst({
  where: { id: { startsWith: 'dcd07432' } },
  include: { payments: true }
});

console.log('ORDER:', order?.orderNumber, order?.status, order?.reservedUntil);
if (order?.payments[0]) {
  const p = order.payments[0];
  console.log('PAYMENT id:', p.id);
  console.log('PAYMENT providerPaymentId:', p.providerPaymentId);
  console.log('PAYMENT status:', p.status);
  console.log('PAYMENT amountMinor:', p.amountMinor);
}

const events = await prisma.paymentWebhookEvent.findMany({
  orderBy: { receivedAt: 'desc' },
  take: 3,
  select: { dedupeKey: true, status: true, paymentId: true, receivedAt: true }
});
console.log('\nWEBHOOK EVENTS:');
events.forEach(e => console.log(e.dedupeKey, '|', e.status, '| paymentId:', e.paymentId));

await prisma.$disconnect();
