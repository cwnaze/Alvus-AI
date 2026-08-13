import type { BillingStatusResponse } from '@alvus-ai/shared';
import { Hono } from 'hono';
import { createDb } from '../lib/db/client';
import { checkUsageLimit, resolveTier } from '../lib/metering';
import { authenticate, requireApproved, type AuthBindings, type AuthVariables } from '../middleware/auth';
import { AppError } from '../middleware/errors';

type Env = { Bindings: AuthBindings; Variables: AuthVariables };

const billing = new Hono<Env>();
billing.use('*', authenticate, requireApproved);

billing.get('/status', async (c) => {
  const authUser = c.get('authUser');
  if (!authUser) throw new AppError(401, 'unauthorized', 'Authentication required');

  const db = createDb(c.env.DATABASE_URL);
  const now = new Date();
  const [sourceAnalysis, feedbackPass] = await Promise.all([
    checkUsageLimit(db, { userId: authUser.id, actionType: 'source_analysis', now }),
    checkUsageLimit(db, { userId: authUser.id, actionType: 'feedback_pass', now }),
  ]);

  const response: BillingStatusResponse = {
    tier: resolveTier(),
    // No `subscriptions` table until Stripe billing lands (US-023/024) -- see
    // lib/metering's resolveTier for the same reasoning.
    subscription_status: null,
    usage: {
      source_analysis: { used: sourceAnalysis.used, limit: sourceAnalysis.limit },
      feedback_pass: { used: feedbackPass.used, limit: feedbackPass.limit },
    },
    // Both calls share the same `now`, so the reset boundary is identical --
    // taking either is fine.
    renews_at: sourceAnalysis.resetsAt,
  };
  return c.json(response, 200);
});

export default billing;
