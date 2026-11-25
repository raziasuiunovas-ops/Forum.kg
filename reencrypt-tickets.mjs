/**
 * Re-encrypts all ticket tokens using the production encryption key.
 * Run this ONCE after setting ENCRYPTION_KEY_BASE64 in .env
 * Usage: ENCRYPTION_KEY_BASE64=<key> node reencrypt-tickets.mjs
 */
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const prisma = new PrismaClient();
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

function getKey(keyBase64) {
  if (keyBase64) return Buffer.from(keyBase64, 'base64');
  // dev key
  return Buffer.from('dev-key-not-secure-change-in-production-env-variable-required', 'utf-8').slice(0, KEY_LENGTH);
}

function encrypt(plaintext, key) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), ct.toString('base64'), tag.toString('base64')].join(':');
}

function decrypt(encrypted, key) {
  const parts = encrypted.split(':');
  if (parts.length !== 3) return encrypted; // plain token
  const [ivB64, ctB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf-8');
}

const oldKey = getKey(process.env.OLD_ENCRYPTION_KEY_BASE64);
const newKey = getKey(process.env.ENCRYPTION_KEY_BASE64);

const tickets = await prisma.ticket.findMany({ select: { id: true, qrTokenEncrypted: true } });
console.log(`Re-encrypting ${tickets.length} tickets...`);

let count = 0;
for (const ticket of tickets) {
  try {
    const plainToken = decrypt(ticket.qrTokenEncrypted, oldKey);
    const reencrypted = encrypt(plainToken, newKey);
    await prisma.ticket.update({ where: { id: ticket.id }, data: { qrTokenEncrypted: reencrypted } });
    count++;
  } catch (e) {
    console.error('Failed for ticket', ticket.id, e.message);
  }
}

console.log(`Done! Re-encrypted ${count} tickets.`);
await prisma.$disconnect();
