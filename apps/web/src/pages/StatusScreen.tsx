import { useAuth } from '../lib/AuthContext';

const COPY = {
  pending: {
    heading: 'Pending approval',
    body: "Your account is awaiting admin approval. We'll let you in as soon as it's reviewed.",
  },
  rejected: {
    heading: 'Not approved',
    body: 'Your waitlist request was not approved. Contact the site admin if you believe this is a mistake.',
  },
} as const;

export default function StatusScreen({ status }: { status: 'pending' | 'rejected' }) {
  const auth = useAuth();
  const copy = COPY[status];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4 text-center text-slate-900">
      <h1 className="text-2xl font-semibold text-brand">{copy.heading}</h1>
      <p role="status" className="max-w-sm text-slate-700">
        {copy.body}
      </p>
      <button onClick={() => auth.signOut()} className="rounded border border-slate-300 px-4 py-2">
        Log out
      </button>
    </main>
  );
}
