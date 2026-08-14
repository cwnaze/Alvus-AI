import Stripe from 'stripe';

// Workers has no Node `http`/`https` module even under `nodejs_compat` --
// the SDK's default HTTP client assumes one is available, so it must be
// pointed at `fetch` explicitly (Stripe's documented Workers integration).
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}
