import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { ApiError, requestPasswordReset } from '../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await requestPasswordReset(email);
      // Always show the same confirmation, whether or not the email exists --
      // the backend's response is identical either way (see docs/api.md), so
      // the UI must not create a distinguishable outcome either.
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <AuthLayout title="Check your email">
        <p role="status" className="text-slate-700">
          If an account exists for that email, we've sent a link to reset your password.
        </p>
        <Link to="/login" className="text-brand underline text-center">
          Back to login
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Forgot your password?">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-700">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand px-4 py-2 text-white disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <Link to="/login" className="text-brand underline text-center">
        Back to login
      </Link>
    </AuthLayout>
  );
}
