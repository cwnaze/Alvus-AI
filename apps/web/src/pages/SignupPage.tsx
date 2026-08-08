import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { ApiError, signup } from '../lib/api';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await signup(email, password);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <AuthLayout title="You're on the list">
        <p role="status" className="text-slate-700">
          Thanks for signing up. Your account is pending admin approval -- we'll let you log in once it's reviewed.
        </p>
        <Link to="/login" className="text-brand underline text-center">
          Back to login
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Join the waitlist">
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
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-700">Password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {pending ? 'Signing up…' : 'Sign up'}
        </button>
      </form>
      <Link to="/login" className="text-brand underline text-center">
        Already approved? Log in
      </Link>
    </AuthLayout>
  );
}
