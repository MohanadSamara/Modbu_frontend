import { useState } from 'react';
import modbusApi from '../api/modbus.js';
import { useAuth } from '../context/useAuth.js';

export default function ControlButtons({ className = '', isConnected = false }) {
  const { hasAnyPermission } = useAuth();
  const canStart = hasAnyPermission(['device.start', 'device.control']);
  const canStop  = hasAnyPermission(['device.stop',  'device.control']);

  const [loading, setLoading] = useState({ start: false, stop: false });
  const [lastAction, setLastAction] = useState(null);
  const [actionError, setActionError] = useState('');

  // If the user can't do either action, don't render the control card at all.
  if (!canStart && !canStop) return null;

  const handleControl = async (action) => {
    setLoading((p) => ({ ...p, [action]: true }));
    setActionError('');
    try {
      if (action === 'start') {
        await modbusApi.start();
      } else {
        await modbusApi.stop();
      }
      setLastAction({ type: action, time: new Date().toLocaleTimeString() });
    } catch (err) {
      setActionError(`${action.charAt(0).toUpperCase() + action.slice(1)} failed: ${err.message}`);
    } finally {
      setLoading((p) => ({ ...p, [action]: false }));
    }
  };

  return (
    <div className={`rounded-2xl bg-[#1a1d27] border border-white/5 p-6 flex flex-col gap-5 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="text-sm font-semibold text-gray-200">Generator Controls</span>
      </div>

      {/* Status indicator */}
      <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium
        ${isConnected ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-gray-500'}`}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0
          ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`}
        />
        {isConnected ? 'Device connected — ready to send commands' : 'Connect a device to enable controls'}
      </div>

      {/* Buttons — each only rendered if the user is allowed that action */}
      <div className={`grid gap-3 ${canStart && canStop ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {/* Start */}
        {canStart && (
          <button
            onClick={() => handleControl('start')}
            disabled={loading.start || !isConnected}
            className="relative overflow-hidden flex items-center justify-center gap-2.5 px-4 py-4 rounded-xl
              bg-gradient-to-br from-emerald-600 to-teal-700
              text-white text-sm font-bold
              shadow-lg shadow-emerald-900/30
              hover:from-emerald-500 hover:to-teal-600
              disabled:opacity-40 disabled:cursor-not-allowed
              active:scale-[0.98] transition-all duration-200"
          >
            {loading.start ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
            {loading.start ? 'Starting…' : 'Start'}
          </button>
        )}

        {/* Stop */}
        {canStop && (
          <button
            onClick={() => handleControl('stop')}
            disabled={loading.stop || !isConnected}
            className="relative overflow-hidden flex items-center justify-center gap-2.5 px-4 py-4 rounded-xl
              bg-gradient-to-br from-red-600 to-rose-700
              text-white text-sm font-bold
              shadow-lg shadow-red-900/30
              hover:from-red-500 hover:to-rose-600
              disabled:opacity-40 disabled:cursor-not-allowed
              active:scale-[0.98] transition-all duration-200"
          >
            {loading.stop ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h12v12H6z" />
              </svg>
            )}
            {loading.stop ? 'Stopping…' : 'Stop'}
          </button>
        )}
      </div>

      {/* Error */}
      {actionError && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {actionError}
        </div>
      )}

      {/* Last action */}
      {lastAction && !actionError && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Last action: <span className="font-medium text-gray-400 capitalize">{lastAction.type}</span> at {lastAction.time}
        </div>
      )}
    </div>
  );
}
