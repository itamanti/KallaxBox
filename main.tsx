import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Errore imprevisto durante il caricamento.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <h1 className="text-lg font-bold text-amber-400">KallaxBox - Ripristino Rapido</h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              Si è verificato un problema nell&apos;apertura dell&apos;app (spesso causato da dati salvati di una versione precedente).
            </p>
            {this.state.errorMessage && (
              <p className="text-[11px] font-mono text-red-300 bg-red-950/40 border border-red-900/40 rounded-lg p-2 break-words">
                {this.state.errorMessage}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors"
              >
                Ricarica Pagina
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('kallaxbox_shelves');
                    localStorage.removeItem('kallaxbox_config');
                    localStorage.removeItem('kallaxbox_placements');
                    localStorage.removeItem('kallaxbox_active_shelf_id');
                  } catch {
                    // ignore
                  }
                  window.location.reload();
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors"
              >
                Ripristina Scaffale e Ricarica
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
