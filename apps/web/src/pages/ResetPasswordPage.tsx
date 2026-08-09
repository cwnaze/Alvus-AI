import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { ApiError, confirmPasswordReset } from '../lib/api';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setPending(true);
    try {
      await confirmPasswordReset(token, password);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Invalid reset link">
        <p role="alert" className="text-sm text-red-600 text-center">
          This reset link is invalid or has expired. Request a new one below.
        </p>
        <Link to="/forgot-password" className="text-brand underline text-center">
          Request a new reset link
        </Link>
      </AuthLayout>
    );
  }

  if (submitted) {
    return (
      <AuthLayout title="Password reset">
        <p role="status" className="text-slate-700">
          Your password has been reset. You can now log in with your new password.
        </p>
        <Link to="/login" className="text-brand underline text-center">
          Log in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-700">New password</span>
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
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-700">Confirm new password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
          {pending ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
      <Link to="/login" className="text-brand underline text-center">
        Back to login
      </Link>
    </AuthLayout>
  );
}
