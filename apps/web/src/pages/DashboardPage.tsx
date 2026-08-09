import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

// Project listing/creation is a later story -- this is the empty-state shell
// US-011's acceptance criteria asks for ("reach the app... empty state if no
// projects yet"), not the projects feature itself.
export default function DashboardPage() {
  const auth = useAuth();

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-brand">Alvus AI</h1>
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <span>{auth.user?.email}</span>
          {auth.user?.role === 'admin' && (
            <>
              <Link to="/admin/waitlist" className="text-brand underline">
                Waitlist admin
              </Link>
              <Link to="/admin/users" className="text-brand underline">
                User directory
              </Link>
            </>
          )}
          <button onClick={() => auth.signOut()} className="rounded border border-slate-300 px-3 py-1">
            Log out
          </button>
        </div>
      </header>
      <section className="flex flex-col items-center justify-center gap-2 px-6 py-24 text-center">
        <h2 className="text-lg font-medium">You don't have any projects yet</h2>
        <p className="text-slate-600">Start a new project to begin researching and writing.</p>
      </section>
    </main>
  );
}
