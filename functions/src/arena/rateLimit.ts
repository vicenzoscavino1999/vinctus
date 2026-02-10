/**
 * Arena AI - Daily Rate Limit
 */

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const AI_DAILY_LIMIT = parseInt(process.env.AI_DAILY_LIMIT || '10', 10);
const ARENA_USAGE_COLLECTION = 'arenaUsage';

export async function checkRateLimit(uid: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: string;
}> {
  const db = admin.firestore();
  const today = new Date().toISOString().split('T')[0];
  const usageRef = db.doc(`${ARENA_USAGE_COLLECTION}/${uid}/days/${today}`);

  const result = await db.runTransaction(async (tx) => {
    const usageDoc = await tx.get(usageRef);
    const currentCount = usageDoc.exists
      ? ((usageDoc.data()?.count as number | undefined) ?? 0)
      : 0;

    if (currentCount >= AI_DAILY_LIMIT) {
      return {
        allowed: false,
        remaining: 0,
      };
    }

    tx.set(
      usageRef,
      {
        count: currentCount + 1,
        lastUsed: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      allowed: true,
      remaining: AI_DAILY_LIMIT - currentCount - 1,
    };
  });

  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  return {
    allowed: result.allowed,
    remaining: result.remaining,
    resetAt: tomorrow.toISOString(),
  };
}

export async function getUsage(uid: string): Promise<{
  used: number;
  limit: number;
  remaining: number;
}> {
  const db = admin.firestore();
  const today = new Date().toISOString().split('T')[0];
  const usageDoc = await db.doc(`${ARENA_USAGE_COLLECTION}/${uid}/days/${today}`).get();
  const used = usageDoc.exists ? ((usageDoc.data()?.count as number | undefined) ?? 0) : 0;

  return {
    used,
    limit: AI_DAILY_LIMIT,
    remaining: Math.max(0, AI_DAILY_LIMIT - used),
  };
}
