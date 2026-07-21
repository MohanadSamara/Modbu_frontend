import { Link, useLocation } from 'react-router-dom';

// Catch-all route: shown for any URL that doesn't match a page.
export default function NotFound() {
  const location = useLocation();

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="animate-fade-in text-center max-w-md">
        <p className="text-7xl font-black gradient-text tracking-tight">404</p>
        <h1 className="mt-4 text-lg font-bold text-white">Page not found</h1>
        <p className="mt-2 text-sm text-gray-400">
          Nothing lives at <span className="font-mono text-gray-300 break-all">{location.pathname}</span>.
          It may have been moved, or the link is simply wrong.
        </p>
        <div className="mt-6 flex justify-center">
          <Link to="/" className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
