// ============================================================================
// EditToolbar — admin-only floating control for the page visual editor.
//
// Renders (only for admins):
//   1. A floating pill (bottom-right) to toggle Edit Mode on/off + Reset all.
//   2. The EditInspector panel when an element is selected while editing.
//
// All state lives in PageEditContext; this component only reads/dispatches.
// ============================================================================

import { usePageEdit } from '../../context/PageEditContext.jsx';
import EditInspector from './EditInspector.jsx';

export default function EditToolbar() {
  const { isAdmin, editMode, setEditMode, setSelectedId, resetAll, overrides } = usePageEdit();
  if (!isAdmin) return null;

  const count = Object.keys(overrides).length;

  return (
    <>
      {editMode && <EditInspector />}

      <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2">
        {editMode && (
          <span className="hidden sm:inline-block px-3 py-2.5 rounded-xl bg-[#13151c] border border-white/10 text-gray-400 text-xs shadow-lg">
            Click any element to restyle it
          </span>
        )}
        {editMode && count > 0 && (
          <button
            onClick={resetAll}
            className="px-3 py-2.5 rounded-xl bg-[#13151c] border border-white/10 text-gray-300 text-sm font-medium hover:bg-white/10 transition-colors shadow-lg"
          >
            Reset all ({count})
          </button>
        )}
        <button
          onClick={() => {
            setEditMode(!editMode);
            setSelectedId(null);
          }}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg transition-colors ${
            editMode
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'bg-[#13151c] border border-white/10 text-gray-300 hover:bg-white/10'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          {editMode ? 'Done editing' : 'Edit page'}
        </button>
      </div>
    </>
  );
}
