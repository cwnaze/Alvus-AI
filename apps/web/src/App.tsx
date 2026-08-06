import { CITATION_FORMATS } from '@alvus-ai/shared';

export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white text-slate-900">
      <h1 className="text-3xl font-semibold text-brand">Alvus AI</h1>
      <p className="text-slate-600">Citation formats: {CITATION_FORMATS.join(', ')}</p>
    </main>
  );
}
