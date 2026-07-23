import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth.js';
import { isCloudBrand } from '../api/brands.js';

// Human-friendly alarm label, e.g. ALARM_CRITICAL_FUEL → "Critical Fuel".
function alarmLabel(type) {
  if (!type) return 'Alarm';
  return type
    .replace(/^ALARM_/, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── icon helpers ─── */
function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
    </svg>
  );
}
function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

// Small inline text input used by the edit forms in the tree.
const treeInput =
  'w-full px-2 py-1 rounded-lg bg-[#0f1117] border border-white/10 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40 focus:border-blue-500/40 transition-colors';

// A dropdown that offers entities from the Datakom Rainbow tree to import at a
// given level (projects / locations / devices). Rendered in normal flow (not an
// absolute popover) so it can't be clipped by the sidebar's scroll container.
// `primary` is an optional top action (e.g. "Create <typed name>"); `options`
// are the Datakom entities to pick from. Each choice calls `onClose`.
function InlineAddMenu({ primary, sectionLabel, options, optionKey, optionLabel, onPick, onClose }) {
  const hasOptions = options?.length > 0;
  if (!primary && !hasOptions) return null;
  return (
    <div role="menu" className="mt-1 rounded-lg bg-[#0f1117] border border-white/10 shadow-lg py-1">
      {primary && (
        <button
          role="menuitem"
          onClick={() => { primary.onClick(); onClose(); }}
          className="w-full text-left px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-white/5 transition-colors truncate"
        >
          {primary.label}
        </button>
      )}
      {hasOptions && (
        <>
          <p className="px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-widest text-orange-400/70">{sectionLabel}</p>
          {options.map((o) => (
            <button
              key={optionKey(o)}
              role="menuitem"
              onClick={() => { onPick(o); onClose(); }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5 transition-colors flex items-center gap-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400/70 flex-shrink-0" />
              <span className="truncate">{optionLabel(o)}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

export default function ProjectsSidebar({
  projects,
  projectName, setProjectName,
  onCreateProject,
  expandedProjects, toggleProject,
  expandedLocations, toggleLocation,
  activeProjectId, activeLocationId, activeDeviceId,
  setActiveProjectId, setActiveLocationId, setActiveDeviceId,
  locationInputs, setLocationInputs,
  onCreateLocation,
  onDeleteProject, onDeleteLocation, onDeleteDevice,
  onUpdateProject, onUpdateLocation, onUpdateDevice,
  connectedDeviceIds,
  addingDeviceFor, startAddDevice, cancelAddDevice,
  deviceDrafts, deviceErrors, updateDeviceDraft, onCreateDevice,
  brands,
  onCreateSubLocation, subLocationInputs, setSubLocationInputs,
  shouldShowDevice,
  alarmsMap = {},
  onAcceptAlarm,
  // Read-only mode: hides every create/rename/delete control. Used for
  // cloud-sourced trees (e.g. Datakom Rainbow) that can't be edited here.
  readOnly = false,
  // Allow renaming location nodes even in read-only mode (used by the Datakom
  // tree: cloud data is otherwise read-only, but a node's DISPLAY name can be
  // overridden locally by users with datakom.write). Wired to onUpdateLocation.
  allowLocationRename = false,
  // Candidate containers for the project edit form ([{ backendId, name }]).
  projectContainerOptions = [],
  // Handler behind the header "New folder" button — creates a container
  // project. Projects are moved inside via their edit form's "Inside" dropdown.
  onCreateFolder = null,
  title = 'Projects',
  // Cascade helpers/handlers for building DB entities from the Datakom Rainbow
  // tree. Null when the page isn't offering the integration.
  datakom = null,
}) {
  const { canFeature } = useAuth();
  const canWriteProject = !readOnly && canFeature('button.project.write');
  // Folder creation rides on project-write access (a folder IS a container
  // project under the hood).
  const canManageFolders = !!onCreateFolder && canWriteProject;

  // The "+" add button opens a menu: create the typed name and/or import an
  // existing Datakom Rainbow project. Closes on outside click.
  const addMenuRef = useRef(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // "New folder" inline input.
  const [folderInput, setFolderInput] = useState('');
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderErr, setFolderErr] = useState('');
  const submitFolder = async () => {
    const res = await onCreateFolder?.(folderInput);
    if (res?.ok) { setFolderInput(''); setFolderOpen(false); setFolderErr(''); }
    else setFolderErr(res?.error || 'Failed');
  };
  useEffect(() => {
    if (!addMenuOpen) return undefined;
    const onDoc = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setAddMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [addMenuOpen]);

  return (
    <aside className="lg:col-span-1 flex flex-col rounded-2xl bg-[#1a1d27] border border-white/5 overflow-hidden h-fit lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/5 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-gray-200">{title}</span>
        {canManageFolders && (
          <button
            type="button"
            onClick={() => { setFolderOpen((v) => !v); setFolderErr(''); }}
            title="Create a folder — projects, locations and devices can be placed inside"
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11v4m2-2h-4" />
            </svg>
            New folder
          </button>
        )}
        <span className={`text-xs text-gray-600 font-mono ${canManageFolders ? 'ml-2' : 'ml-auto'}`}>{projects.length}</span>
      </div>

      {/* New folder inline input */}
      {canManageFolders && folderOpen && (
        <div className="px-3 py-3 border-b border-white/5 flex-shrink-0">
          <div className="flex gap-1.5">
            <input
              type="text"
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitFolder(); } if (e.key === 'Escape') setFolderOpen(false); }}
              placeholder="Folder name…"
              autoFocus
              className="flex-1 px-3 py-2 rounded-xl bg-[#0f1117] border border-white/10 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 transition-colors"
            />
            <button type="button" onClick={submitFolder}
              className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition-colors">
              Create
            </button>
          </div>
          {folderErr && <p className="text-[10px] text-red-400 mt-1">{folderErr}</p>}
          <p className="text-[10px] text-gray-600 mt-1">Then open a project's edit (pencil) and pick "Inside: {folderInput.trim() || 'this folder'}" to move it in. Locations and devices move via their own edit forms.</p>
        </div>
      )}

      {/* New project input — only for users who can create projects */}
      {canWriteProject && (
        <div className="px-3 py-3 border-b border-white/5 flex-shrink-0">
          <div className="relative" ref={addMenuRef}>
            <form
              onSubmit={(e) => { onCreateProject(e); setAddMenuOpen(false); }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="New project name…"
                className="flex-1 px-3 py-2 rounded-xl bg-[#0f1117] border border-white/10 text-sm text-gray-200 placeholder-gray-600
                  focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 transition-colors"
              />
              {/* With Datakom connected, + opens the chooser (create as-is, or link
                  to a Datakom project — your typed name is kept). Without it, +
                  just creates. Enter always creates unlinked. */}
              <button
                type="button"
                onClick={() => {
                  if (datakom?.rootNodes?.length) setAddMenuOpen((o) => !o);
                  else { onCreateProject({ preventDefault() {} }); setAddMenuOpen(false); }
                }}
                title="Add a project"
                aria-haspopup="menu"
                aria-expanded={addMenuOpen}
                className="px-3 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors"
              >
                <PlusIcon />
              </button>
            </form>

            {addMenuOpen && datakom?.rootNodes?.length > 0 && (
              <div
                role="menu"
                className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-xl bg-[#0f1117] border border-white/10 shadow-xl py-1"
              >
                <button
                  role="menuitem"
                  onClick={() => { onCreateProject({ preventDefault() {} }); setAddMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-gray-200 hover:bg-white/5 transition-colors truncate"
                >
                  {projectName.trim() ? `Create “${projectName.trim()}” (no link)` : 'Type a name above, or link to a Datakom project'}
                </button>
                <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-orange-400/70">
                  Link to Datakom project
                </p>
                {datakom.rootNodes.map((n) => (
                    <button
                      key={n.id}
                      role="menuitem"
                      onClick={() => { datakom.onCreateProject(n); setAddMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-orange-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <span className="truncate">{n.name}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center py-10 px-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">No projects yet</p>
            <p className="text-xs text-gray-600 mt-1">Create one above</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {projects.map((project) => (
              <ProjectNode
                key={project.id}
                project={project}
                expandedProjects={expandedProjects} toggleProject={toggleProject}
                expandedLocations={expandedLocations} toggleLocation={toggleLocation}
                activeProjectId={activeProjectId} activeLocationId={activeLocationId} activeDeviceId={activeDeviceId}
                setActiveProjectId={setActiveProjectId} setActiveLocationId={setActiveLocationId} setActiveDeviceId={setActiveDeviceId}
                locationInputs={locationInputs} setLocationInputs={setLocationInputs}
                onCreateLocation={onCreateLocation}
                onDeleteProject={onDeleteProject} onDeleteLocation={onDeleteLocation} onDeleteDevice={onDeleteDevice}
                onUpdateProject={onUpdateProject} onUpdateLocation={onUpdateLocation} onUpdateDevice={onUpdateDevice}
                connectedDeviceIds={connectedDeviceIds}
                addingDeviceFor={addingDeviceFor} startAddDevice={startAddDevice} cancelAddDevice={cancelAddDevice}
                deviceDrafts={deviceDrafts} deviceErrors={deviceErrors} updateDeviceDraft={updateDeviceDraft} onCreateDevice={onCreateDevice}
                brands={brands}
                onCreateSubLocation={onCreateSubLocation} subLocationInputs={subLocationInputs} setSubLocationInputs={setSubLocationInputs}
                shouldShowDevice={shouldShowDevice}
                alarmsMap={alarmsMap}
                onAcceptAlarm={onAcceptAlarm}
                readOnly={readOnly}
                allowLocationRename={allowLocationRename}
                projectContainerOptions={projectContainerOptions}
                datakom={datakom}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

/* ─── ProjectNode ─── */
function ProjectNode({
  project, expandedProjects, toggleProject,
  expandedLocations, toggleLocation,
  activeProjectId, activeLocationId, activeDeviceId,
  setActiveProjectId, setActiveLocationId, setActiveDeviceId,
  locationInputs, setLocationInputs, onCreateLocation,
  onDeleteProject, onDeleteLocation, onDeleteDevice,
  onUpdateProject, onUpdateLocation, onUpdateDevice,
  connectedDeviceIds,
  addingDeviceFor, startAddDevice, cancelAddDevice,
  deviceDrafts, deviceErrors, updateDeviceDraft, onCreateDevice,
  brands,
  onCreateSubLocation, subLocationInputs, setSubLocationInputs,
  shouldShowDevice,
  alarmsMap, onAcceptAlarm,
  readOnly = false,
  allowLocationRename = false,
  projectContainerOptions = [],
  datakomFolderOptions = [],
  datakom = null,
}) {
  const { canFeature, canUseElement, hasPermission } = useAuth();
  // A single project can opt into read-only (e.g. the merged Datakom Rainbow
  // cloud tree) even when the rest of the sidebar is editable.
  const effReadOnly = readOnly || !!project.readOnly;
  // Any Datakom node can be linked to a location (free choice, not scoped to the
  // project's own Datakom node).
  const dkLocationOptions = !effReadOnly ? (datakom?.allNodes ?? []) : [];
  const canWriteProject = !effReadOnly && canFeature('button.project.write');
  const canWriteDevice  = !effReadOnly && canFeature('button.device.write');
  // Devices that hang directly off a project (Datakom nodes promoted to
  // projects carry their own devices; normal DB projects have none here).
  const directDevices = (project.devices ?? []).filter(shouldShowDevice);
  // Child projects (this project acting as a container). Rendered recursively.
  const childProjects = project.childProjects ?? [];
  const itemCount = project.locations.length + (project.devices?.length ?? 0) + childProjects.length;
  // The Datakom Rainbow wrapper (id 'dk-…') is read-only cloud data, but its
  // DISPLAY name can be overridden locally by datakom.write holders — same
  // mechanism as the nodes below it.
  const isDatakomProject = String(project.id).startsWith('dk-');
  const canEditProject =
    (canWriteProject && canUseElement('project.rename')) ||
    (allowLocationRename && isDatakomProject && hasPermission('datakom.write'));
  // Datakom rename pencils are shown always (not hover-only) so they're findable.
  const editVis = (allowLocationRename && isDatakomProject)
    ? 'opacity-60 hover:opacity-100'
    : 'opacity-0 group-hover:opacity-100';

  const open = !!expandedProjects[project.id];
  const active = activeProjectId === project.id;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [parentDraft, setParentDraft] = useState(project.parentId ?? '');
  const [dkContainerDraft, setDkContainerDraft] = useState(project.container ?? '');
  const [editErr, setEditErr] = useState('');
  // Add-location "+" menu (only when this project has Datakom child options).
  const [locMenuOpen, setLocMenuOpen] = useState(false);

  // Only real DB projects can be nested; a Datakom project has no backend id
  // and offers no container dropdown (name-only rename). Exclude self from the
  // container choices (backend also rejects cycles).
  const showContainerSelect = !isDatakomProject && canWriteProject;
  const containerChoices = projectContainerOptions.filter((o) => o.backendId !== project.backendId);
  // A Datakom node-project (not a container folder) can be dropped into a local
  // container folder by typing its name — a free-text field, so a new folder is
  // created on the fly and matching names group together.
  const canWriteDatakom = allowLocationRename && hasPermission('datakom.write');
  const showDkContainerInput = isDatakomProject && !project.datakomContainer && canWriteDatakom;

  const startEdit = () => {
    setDraft(project.name);
    setParentDraft(project.parentId ?? '');
    setDkContainerDraft(project.container ?? '');
    setEditErr('');
    setEditing(true);
  };
  const saveEdit = async () => {
    const payload = { name: draft };
    if (showContainerSelect) payload.parentId = parentDraft === '' ? null : Number(parentDraft);
    if (showDkContainerInput) payload.datakomContainer = dkContainerDraft;
    const res = await onUpdateProject(project.id, payload);
    if (res?.ok) setEditing(false); else setEditErr(res?.error || 'Update failed');
  };

  return (
    <li>
      {editing ? (
        showContainerSelect ? (
          <div className="rounded-xl bg-[#0f1117] border border-white/10 p-2 space-y-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditing(false); }}
              className={treeInput}
              autoFocus
              placeholder="Project name"
            />
            <select
              value={parentDraft}
              onChange={(e) => setParentDraft(e.target.value)}
              className={`${treeInput} cursor-pointer`}
              title="Put this project inside a container"
            >
              <option value="" className="bg-[#0f1117]">— Top level (no container) —</option>
              {containerChoices.map((o) => (
                <option key={o.backendId} value={o.backendId} className="bg-[#0f1117]">Inside: {o.name}</option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <button onClick={saveEdit}
                className="flex-1 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors">
                Save
              </button>
              <button onClick={() => setEditing(false)}
                className="px-2 py-1 rounded-lg bg-white/10 text-gray-300 text-xs hover:bg-white/20 transition-colors">
                Cancel
              </button>
            </div>
            {editErr && <p className="text-[10px] text-red-400">{editErr}</p>}
          </div>
        ) : showDkContainerInput ? (
          <div className="rounded-xl bg-[#0f1117] border border-white/10 p-2 space-y-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditing(false); }}
              className={treeInput}
              autoFocus
              placeholder="Node name"
            />
            {/* Move into a folder. Dropdown of existing folders (created with the
                header "New folder" button); "— Top level —" removes it from any
                folder. The current value is kept even if it isn't in the list. */}
            <select
              value={dkContainerDraft}
              onChange={(e) => setDkContainerDraft(e.target.value)}
              className={`${treeInput} cursor-pointer`}
              title="Move this node into a folder"
            >
              <option value="" className="bg-[#0f1117]">— Top level (no folder) —</option>
              {[...new Set([...(dkContainerDraft ? [dkContainerDraft] : []), ...datakomFolderOptions])].map((f) => (
                <option key={f} value={f} className="bg-[#0f1117]">Move into: {f}</option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <button onClick={saveEdit}
                className="flex-1 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors">
                Save
              </button>
              <button onClick={() => setEditing(false)}
                className="px-2 py-1 rounded-lg bg-white/10 text-gray-300 text-xs hover:bg-white/20 transition-colors">
                Cancel
              </button>
            </div>
            {editErr && <p className="text-[10px] text-red-400">{editErr}</p>}
          </div>
        ) : (
          <InlineEditRow value={draft} onChange={setDraft} onSave={saveEdit}
            onCancel={() => setEditing(false)} error={editErr} />
        )
      ) : (
      <div className={`group flex items-center gap-1.5 px-2 py-2 rounded-xl transition-colors
        ${active ? 'bg-blue-500/10 text-blue-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
      >
        <button
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          onClick={() => { toggleProject(project.id); setActiveProjectId(project.id); setActiveLocationId(null); setActiveDeviceId(null); }}
        >
          <span className={`flex-shrink-0 transition-colors ${active ? 'text-blue-400' : 'text-gray-600 group-hover:text-gray-400'}`}>
            <ChevronIcon open={open} />
          </span>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <span dir="auto" className="truncate text-sm font-semibold">{project.name}</span>
          <span className="ml-1 text-[10px] text-gray-600 flex-shrink-0">{itemCount}</span>
        </button>
        {canEditProject && (
          <button
            onClick={startEdit}
            title={isDatakomProject ? 'Rename' : 'Edit project'}
            className={`${editVis} flex-shrink-0 p-1 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all`}
          >
            <PencilIcon />
          </button>
        )}
        {canWriteProject && (
          <button
            onClick={() => onDeleteProject(project.id)}
            className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <TrashIcon />
          </button>
        )}
      </div>
      )}

      {open && (
        <div className="ml-2 border-l border-white/5 pl-2 mt-1 space-y-1">
          {/* Child projects — this project acts as a container. Rendered as full
              (recursive) ProjectNodes so they carry their own locations/devices
              and can themselves be containers. */}
          {childProjects.length > 0 && (
            <ul className="space-y-1">
              {childProjects.map((child) => (
                <ProjectNode
                  key={child.id}
                  project={child}
                  expandedProjects={expandedProjects} toggleProject={toggleProject}
                  expandedLocations={expandedLocations} toggleLocation={toggleLocation}
                  activeProjectId={activeProjectId} activeLocationId={activeLocationId} activeDeviceId={activeDeviceId}
                  setActiveProjectId={setActiveProjectId} setActiveLocationId={setActiveLocationId} setActiveDeviceId={setActiveDeviceId}
                  locationInputs={locationInputs} setLocationInputs={setLocationInputs}
                  onCreateLocation={onCreateLocation}
                  onDeleteProject={onDeleteProject} onDeleteLocation={onDeleteLocation} onDeleteDevice={onDeleteDevice}
                  onUpdateProject={onUpdateProject} onUpdateLocation={onUpdateLocation} onUpdateDevice={onUpdateDevice}
                  connectedDeviceIds={connectedDeviceIds}
                  addingDeviceFor={addingDeviceFor} startAddDevice={startAddDevice} cancelAddDevice={cancelAddDevice}
                  deviceDrafts={deviceDrafts} deviceErrors={deviceErrors} updateDeviceDraft={updateDeviceDraft} onCreateDevice={onCreateDevice}
                  brands={brands}
                  onCreateSubLocation={onCreateSubLocation} subLocationInputs={subLocationInputs} setSubLocationInputs={setSubLocationInputs}
                  shouldShowDevice={shouldShowDevice}
                  alarmsMap={alarmsMap}
                  onAcceptAlarm={onAcceptAlarm}
                  readOnly={readOnly}
                  allowLocationRename={allowLocationRename}
                  projectContainerOptions={projectContainerOptions}
                  datakom={datakom}
                />
              ))}
            </ul>
          )}

          {/* Add location. When the project came from Datakom, the + opens a menu
              to name it manually or pick a Datakom node; otherwise it creates. */}
          {canWriteProject && (
            <div className="py-1">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={locationInputs[project.id] ?? ''}
                  onChange={(e) => setLocationInputs((p) => ({ ...p, [project.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onCreateLocation(project.id); setLocMenuOpen(false); } }}
                  placeholder="Add location…"
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#0f1117] border border-white/10 text-xs text-gray-300 placeholder-gray-600
                    focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/40 transition-colors"
                />
                <button
                  onClick={() => {
                    // With Datakom connected, + opens the chooser (create as-is or
                    // link to any node). Without it, + just creates.
                    if (dkLocationOptions.length > 0) setLocMenuOpen((o) => !o);
                    else onCreateLocation(project.id);
                  }}
                  title="Add location"
                  aria-haspopup={dkLocationOptions.length > 0 ? 'menu' : undefined}
                  aria-expanded={dkLocationOptions.length > 0 ? locMenuOpen : undefined}
                  className="px-2 py-1.5 rounded-lg bg-emerald-600/80 text-white hover:bg-emerald-500 transition-colors"
                >
                  <PlusIcon />
                </button>
              </div>
              {locMenuOpen && dkLocationOptions.length > 0 && (
                <InlineAddMenu
                  primary={{
                    label: (locationInputs[project.id] ?? '').trim()
                      ? `Create “${(locationInputs[project.id] ?? '').trim()}” (no link)`
                      : 'Type a name above, or link to a Datakom node',
                    onClick: () => onCreateLocation(project.id),
                  }}
                  sectionLabel="Link to Datakom node"
                  options={dkLocationOptions}
                  optionKey={(n) => n.id}
                  optionLabel={(n) => n.name}
                  onPick={(n) => datakom.onCreateLocation(project.id, n)}
                  onClose={() => setLocMenuOpen(false)}
                />
              )}
            </div>
          )}

          {project.locations.length > 0 && (
            <ul className="space-y-0.5">
              {project.locations.map((loc) => (
                <LocationNode
                  key={loc.id}
                  project={project} location={loc}
                  expandedLocations={expandedLocations} toggleLocation={toggleLocation}
                  activeLocationId={activeLocationId} activeDeviceId={activeDeviceId}
                  setActiveProjectId={setActiveProjectId} setActiveLocationId={setActiveLocationId} setActiveDeviceId={setActiveDeviceId}
                  onDeleteLocation={onDeleteLocation} onDeleteDevice={onDeleteDevice}
                  onUpdateLocation={onUpdateLocation} onUpdateDevice={onUpdateDevice}
                  connectedDeviceIds={connectedDeviceIds}
                  addingDeviceFor={addingDeviceFor} startAddDevice={startAddDevice} cancelAddDevice={cancelAddDevice}
                  deviceDrafts={deviceDrafts} deviceErrors={deviceErrors} updateDeviceDraft={updateDeviceDraft} onCreateDevice={onCreateDevice}
                  brands={brands}
                  onCreateSubLocation={onCreateSubLocation} subLocationInputs={subLocationInputs} setSubLocationInputs={setSubLocationInputs}
                  shouldShowDevice={shouldShowDevice}
                  alarmsMap={alarmsMap}
                  onAcceptAlarm={onAcceptAlarm}
                  readOnly={effReadOnly}
                  allowLocationRename={allowLocationRename}
                  datakom={datakom}
                />
              ))}
            </ul>
          )}

          {/* Devices that hang directly off the project (Datakom node promoted
              to a project keeps its own devices here — normal DB projects have
              none, so this renders nothing for them). */}
          {directDevices.length > 0 && (
            <ul className="space-y-0.5 pt-0.5">
              {directDevices.map((device) => (
                <DeviceNode
                  key={device.id}
                  project={project} location={{ id: project.id, name: project.name }} device={device}
                  isActive={activeDeviceId === device.id}
                  isConn={connectedDeviceIds.has(device.id)}
                  setActiveProjectId={setActiveProjectId} setActiveLocationId={setActiveLocationId} setActiveDeviceId={setActiveDeviceId}
                  onDeleteDevice={onDeleteDevice} onUpdateDevice={onUpdateDevice}
                  canWriteDevice={canWriteDevice}
                  brands={brands}
                  alarms={alarmsMap[String(device.backendId)] ?? []}
                  onAcceptAlarm={onAcceptAlarm}
                />
              ))}
            </ul>
          )}

          {project.locations.length === 0 && directDevices.length === 0 && childProjects.length === 0 && (
            <p className="text-xs text-gray-600 px-1 pb-2">
              {project.datakomProject ? 'No devices.' : 'No locations yet.'}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/* ─── LocationNode (recursive) ─── */
function LocationNode({
  project, location,
  expandedLocations, toggleLocation,
  activeLocationId, activeDeviceId,
  setActiveProjectId, setActiveLocationId, setActiveDeviceId,
  onDeleteLocation, onDeleteDevice,
  onUpdateLocation, onUpdateDevice,
  connectedDeviceIds,
  addingDeviceFor, startAddDevice, cancelAddDevice,
  deviceDrafts, deviceErrors, updateDeviceDraft, onCreateDevice,
  brands,
  onCreateSubLocation, subLocationInputs, setSubLocationInputs,
  shouldShowDevice,
  alarmsMap, onAcceptAlarm,
  readOnly = false,
  allowLocationRename = false,
  datakom = null,
}) {
  const { canFeature, canUseElement, hasPermission } = useAuth();
  const effReadOnly = readOnly || !!project.readOnly;
  const canWriteProject = !effReadOnly && canFeature('button.project.write');
  const canWriteDevice  = !effReadOnly && canFeature('button.device.write');
  // Rename is available either through normal project-write access, OR — for a
  // Datakom cloud node (id 'dk-node-…') when allowLocationRename is set — to
  // holders of datakom.write, who can override the node's DISPLAY name locally.
  // Scoping to dk-node ids keeps the pencil off real DB locations, whose rename
  // still requires project-write (avoids showing a button the API would reject).
  const isDatakomNode = String(location.id).startsWith('dk-node-');
  const canEditLocation =
    (canWriteProject && canUseElement('project.rename')) ||
    (allowLocationRename && isDatakomNode && hasPermission('datakom.write'));
  // Datakom rename pencils are shown always (not hover-only) so they're findable.
  const editVis = (allowLocationRename && isDatakomNode)
    ? 'opacity-60 hover:opacity-100'
    : 'opacity-0 group-hover:opacity-100';

  const open = !!expandedLocations[location.id];
  const active = activeLocationId === location.id;
  const childLocations = location.children ?? [];
  const visibleDevices = (location.devices ?? []).filter(shouldShowDevice);
  const draft = deviceDrafts[location.id] ?? { name: '', ip: '', port: 502, description: '', latitude: '', longitude: '' };
  const errs = deviceErrors[location.id] ?? {};
  // Datakom devices are read from the cloud, not Modbus — IP/port aren't
  // required. True when the draft was seeded from a Datakom pick (carries a
  // datakomDid) or its brand is "Datakom".
  // A cloud (Datakom) draft flips to IP method the moment a valid IP is typed —
  // the device is then reachable over Modbus/IP too. Drives the live chip below.
  const draftValidIp = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(String(draft.ip ?? '').trim());
  // The brand is just another field of the form; a cloud brand or a typed DID
  // marks the draft as Datakom-linked. IP wins as the active method when valid.
  const draftBrand = (brands ?? []).find((b) => String(b.id) === String(draft.brandId)) ?? null;
  const draftHasDid = String(draft.datakomDid ?? '').trim() !== '';
  const draftCloud = draftHasDid || isCloudBrand(draftBrand?.name);
  const draftMethod = draftValidIp ? 'ip' : (draftCloud ? 'cloud' : 'ip');
  // Any Datakom node can be linked to a sub-location (free choice, not scoped).
  const dkSubNodes = !effReadOnly ? (datakom?.allNodes ?? []) : [];

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(location.name);
  const [editErr, setEditErr] = useState('');
  // Add-sub-location "+" menu (only when Datakom nodes exist).
  const [subMenuOpen, setSubMenuOpen] = useState(false);
  // The sub-location input is collapsed behind a small button by default.
  const [subFormOpen, setSubFormOpen] = useState(false);
  const startEdit = () => { setNameDraft(location.name); setEditErr(''); setEditing(true); };
  const saveEdit = async () => {
    const res = await onUpdateLocation(project.id, location.id, { name: nameDraft });
    if (res?.ok) setEditing(false); else setEditErr(res?.error || 'Update failed');
  };

  return (
    <li>
      {editing ? (
        <InlineEditRow value={nameDraft} onChange={setNameDraft} onSave={saveEdit}
          onCancel={() => setEditing(false)} error={editErr} />
      ) : (
      <div className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-colors
        ${active ? 'bg-blue-500/10 text-blue-300' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}
      >
        <button
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          onClick={() => { toggleLocation(location.id); setActiveProjectId(project.id); setActiveLocationId(location.id); setActiveDeviceId(null); }}
        >
          <span className={`flex-shrink-0 ${active ? 'text-blue-400' : 'text-gray-600'}`}>
            <ChevronIcon open={open} />
          </span>
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span dir="auto" className="truncate text-xs font-medium">{location.name}</span>
        </button>
        {canEditLocation && (
          <button
            onClick={startEdit}
            title={isDatakomNode ? 'Rename' : 'Edit location'}
            className={`${editVis} flex-shrink-0 p-0.5 rounded text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all`}
          >
            <PencilIcon />
          </button>
        )}
        {canWriteProject && (
          <button
            onClick={() => onDeleteLocation(project.id, location.id)}
            className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <TrashIcon />
          </button>
        )}
      </div>
      )}

      {open && (
        <div className="ml-2 border-l border-white/5 pl-2 mt-0.5 space-y-1 pb-1">
          {/* Add sub-location — collapsed into a small button so a deeply nested
              tree isn't drowned in permanently-open inputs. */}
          {canWriteProject && (
            <div className="pt-0.5">
              {!subFormOpen ? (
                <button
                  onClick={() => setSubFormOpen(true)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] text-gray-600 hover:text-blue-400 hover:bg-blue-500/5 transition-colors"
                >
                  <PlusIcon />
                  Sub-location
                </button>
              ) : (
                <div>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={subLocationInputs[location.id] ?? ''}
                      onChange={(e) => setSubLocationInputs((p) => ({ ...p, [location.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); onCreateSubLocation(project.id, location.id); setSubMenuOpen(false); setSubFormOpen(false); }
                        if (e.key === 'Escape') { setSubMenuOpen(false); setSubFormOpen(false); }
                      }}
                      placeholder="Sub-location…"
                      autoFocus
                      className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-[#0f1117] border border-white/10 text-[11px] text-gray-300 placeholder-gray-600
                        focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors"
                    />
                    <button
                      onClick={() => {
                        if (dkSubNodes.length > 0) { setSubMenuOpen((o) => !o); return; }
                        onCreateSubLocation(project.id, location.id);
                        setSubFormOpen(false);
                      }}
                      title="Add sub-location"
                      aria-haspopup={dkSubNodes.length > 0 ? 'menu' : undefined}
                      aria-expanded={dkSubNodes.length > 0 ? subMenuOpen : undefined}
                      className="px-2 py-1.5 rounded-lg bg-white/10 text-gray-300 hover:bg-white/20 transition-colors"
                    >
                      <PlusIcon />
                    </button>
                  </div>
                  {subMenuOpen && dkSubNodes.length > 0 && (
                    <InlineAddMenu
                      primary={{
                        label: (subLocationInputs[location.id] ?? '').trim()
                          ? `Create “${(subLocationInputs[location.id] ?? '').trim()}” (no link)`
                          : 'Type a name above, or link to a Datakom node',
                        onClick: () => { onCreateSubLocation(project.id, location.id); setSubFormOpen(false); },
                      }}
                      sectionLabel="Link to Datakom node"
                      options={dkSubNodes}
                      optionKey={(n) => n.id}
                      optionLabel={(n) => n.name}
                      onPick={(n) => { datakom.onCreateSubLocation(project.id, location.id, n); setSubFormOpen(false); }}
                      onClose={() => setSubMenuOpen(false)}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Child locations */}
          {childLocations.length > 0 && (
            <ul className="space-y-0.5">
              {childLocations.map((sub) => (
                <LocationNode
                  key={sub.id}
                  project={project} location={sub}
                  expandedLocations={expandedLocations} toggleLocation={toggleLocation}
                  activeLocationId={activeLocationId} activeDeviceId={activeDeviceId}
                  setActiveProjectId={setActiveProjectId} setActiveLocationId={setActiveLocationId} setActiveDeviceId={setActiveDeviceId}
                  onDeleteLocation={onDeleteLocation} onDeleteDevice={onDeleteDevice}
                  onUpdateLocation={onUpdateLocation} onUpdateDevice={onUpdateDevice}
                  connectedDeviceIds={connectedDeviceIds}
                  addingDeviceFor={addingDeviceFor} startAddDevice={startAddDevice} cancelAddDevice={cancelAddDevice}
                  deviceDrafts={deviceDrafts} deviceErrors={deviceErrors} updateDeviceDraft={updateDeviceDraft} onCreateDevice={onCreateDevice}
                  brands={brands}
                  onCreateSubLocation={onCreateSubLocation} subLocationInputs={subLocationInputs} setSubLocationInputs={setSubLocationInputs}
                  shouldShowDevice={shouldShowDevice}
                  alarmsMap={alarmsMap}
                  onAcceptAlarm={onAcceptAlarm}
                  readOnly={effReadOnly}
                  allowLocationRename={allowLocationRename}
                  datakom={datakom}
                />
              ))}
            </ul>
          )}

          {/* Devices */}
          {visibleDevices.length > 0 && (
            <ul className="space-y-0.5 pt-0.5">
              {visibleDevices.map((device) => (
                <DeviceNode
                  key={device.id}
                  project={project} location={location} device={device}
                  isActive={activeDeviceId === device.id}
                  isConn={connectedDeviceIds.has(device.id)}
                  setActiveProjectId={setActiveProjectId} setActiveLocationId={setActiveLocationId} setActiveDeviceId={setActiveDeviceId}
                  onDeleteDevice={onDeleteDevice} onUpdateDevice={onUpdateDevice}
                  canWriteDevice={canWriteDevice}
                  brands={brands}
                  alarms={alarmsMap[String(device.backendId)] ?? []}
                  onAcceptAlarm={onAcceptAlarm}
                />
              ))}
            </ul>
          )}

          {/* Add device form / button */}
          {canWriteDevice && (addingDeviceFor === location.id ? (
            <div className="rounded-xl bg-[#0f1117] border border-white/10 p-3 space-y-2 mt-1">

              {/* ── ONE form, all the device's info at once: name, brand, IP,
                  DID, GPS, description. No brand-first step — the brand is just
                  another field, and a Datakom brand (or a typed DID) makes the
                  device cloud-linked automatically. */}
              {(
                <>
                  {/* Device name — always shown */}
                  <div>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(e) => updateDeviceDraft(location.id, 'name', e.target.value)}
                      placeholder="Device name"
                      autoFocus
                      className={`w-full px-2.5 py-1.5 rounded-lg text-xs text-gray-200 placeholder-gray-600 bg-[#1a1d27] border transition-colors
                        focus:outline-none focus:ring-1 focus:ring-blue-500/30
                        ${errs.name ? 'border-red-500/40 bg-red-500/5' : 'border-white/10'}`}
                    />
                    {errs.name && <p className="text-[10px] text-red-400 mt-0.5">{errs.name}</p>}
                  </div>

                  {/* Brand / product — a plain field, no separate step. */}
                  <select
                    value={draft.brandId ?? ''}
                    onChange={(e) => updateDeviceDraft(location.id, 'brandId', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-[#1a1d27] border border-white/10 text-gray-200
                      focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors cursor-pointer"
                  >
                    <option value="" className="bg-[#1a1d27] text-gray-400">Brand / product (optional)…</option>
                    {(brands ?? []).map((b) => (
                      <option key={b.id} value={b.id} className="bg-[#1a1d27] text-gray-200">
                        {b.name}{isCloudBrand(b.name) ? ' — Datakom Rainbow cloud' : ''}
                      </option>
                    ))}
                  </select>

                  {/* IP / Port — optional; a device can use IP, cloud (DID), or both. */}
                  <>
                    <div>
                      <input
                        type="text"
                        value={draft.ip}
                        onChange={(e) => updateDeviceDraft(location.id, 'ip', e.target.value)}
                        placeholder="IP (e.g. 192.168.1.100)"
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs text-gray-200 placeholder-gray-600 bg-[#1a1d27] border transition-colors
                          focus:outline-none focus:ring-1 focus:ring-blue-500/30 font-mono
                          ${errs.ip ? 'border-red-500/40 bg-red-500/5' : 'border-white/10'}`}
                      />
                      {errs.ip && <p className="text-[10px] text-red-400 mt-0.5">{errs.ip}</p>}
                    </div>
                    {/* Port only matters once there's an IP; hide for a pure cloud draft. */}
                    {(!draftCloud || draftValidIp) && (
                      <div>
                        <input
                          type="number"
                          value={draft.port}
                          onChange={(e) => updateDeviceDraft(location.id, 'port', e.target.value)}
                          placeholder="Port"
                          className={`w-full px-2.5 py-1.5 rounded-lg text-xs text-gray-200 placeholder-gray-600 bg-[#1a1d27] border transition-colors
                            focus:outline-none focus:ring-1 focus:ring-blue-500/30 font-mono
                            ${errs.port ? 'border-red-500/40 bg-red-500/5' : 'border-white/10'}`}
                        />
                        {errs.port && <p className="text-[10px] text-red-400 mt-0.5">{errs.port}</p>}
                      </div>
                    )}
                    {/* Live method chip — shows what the device will use, from
                        what's filled: valid IP → IP; DID / cloud brand → cloud. */}
                    {draftCloud && (
                      <span className={`inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border
                        ${draftMethod === 'ip'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                        {draftMethod === 'ip' ? 'IP + Datakom cloud' : 'Datakom cloud'}
                      </span>
                    )}
                  </>

                  {/* Datakom DID — part of the device's own info, typed like the
                      IP. Filling it IS the link (nothing else to do). The
                      dropdown below is just a helper that fills it for you
                      (available while the cloud connection is on). */}
                  {(
                    <>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={draft.datakomDid ?? ''}
                        onChange={(e) => updateDeviceDraft(location.id, 'datakomDid', e.target.value.trim())}
                        placeholder="Datakom DID (e.g. 8118)"
                        className="w-full px-2.5 py-1.5 rounded-lg text-xs text-gray-200 placeholder-gray-600 bg-[#1a1d27] border border-orange-500/25
                          focus:outline-none focus:ring-1 focus:ring-orange-500/40 transition-colors font-mono"
                      />
                      {datakom?.allDevices?.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => { if (e.target.value !== '') datakom.onLinkDeviceDraft(location.id, e.target.value); }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-[#1a1d27] border border-white/10 text-gray-400
                            focus:outline-none focus:ring-1 focus:ring-orange-500/40 transition-colors cursor-pointer"
                        >
                          <option value="" className="bg-[#1a1d27] text-gray-400">…or pick from the cloud (fills DID/name/GPS)</option>
                          {datakom.allDevices.map((d) => (
                            <option key={d.datakomDid} value={d.datakomDid} className="bg-[#1a1d27] text-gray-200">
                              {d.name} · did {d.datakomDid}
                            </option>
                          ))}
                        </select>
                      )}
                      {draftHasDid && (
                        <p className="text-[10px] text-orange-400/80 leading-snug">
                          Linked to Datakom did {draft.datakomDid} — readings come from the cloud automatically.
                        </p>
                      )}
                    </>
                  )}

                  {/* GPS coords */}
                  <div>
                    <input
                      type="number"
                      value={draft.latitude}
                      onChange={(e) => updateDeviceDraft(location.id, 'latitude', e.target.value)}
                      placeholder="Latitude (optional, e.g. 31.9539)"
                      className={`w-full px-2.5 py-1.5 rounded-lg text-xs text-gray-200 placeholder-gray-600 bg-[#1a1d27] border transition-colors
                        focus:outline-none focus:ring-1 focus:ring-blue-500/30
                        ${errs.latitude ? 'border-red-500/40 bg-red-500/5' : 'border-white/10'}`}
                    />
                    {errs.latitude && <p className="text-[10px] text-red-400 mt-0.5">{errs.latitude}</p>}
                  </div>
                  <div>
                    <input
                      type="number"
                      value={draft.longitude}
                      onChange={(e) => updateDeviceDraft(location.id, 'longitude', e.target.value)}
                      placeholder="Longitude (optional, e.g. 35.9106)"
                      className={`w-full px-2.5 py-1.5 rounded-lg text-xs text-gray-200 placeholder-gray-600 bg-[#1a1d27] border transition-colors
                        focus:outline-none focus:ring-1 focus:ring-blue-500/30
                        ${errs.longitude ? 'border-red-500/40 bg-red-500/5' : 'border-white/10'}`}
                    />
                    {errs.longitude && <p className="text-[10px] text-red-400 mt-0.5">{errs.longitude}</p>}
                  </div>

                  <textarea
                    rows={2}
                    value={draft.description}
                    onChange={(e) => updateDeviceDraft(location.id, 'description', e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs text-gray-200 placeholder-gray-600 bg-[#1a1d27] border border-white/10
                      focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors resize-none"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => onCreateDevice(project.id, location.id)}
                      className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => cancelAddDevice(location.id)}
                      className="px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 text-xs hover:bg-white/20 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => startAddDevice(location.id)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-gray-600 hover:text-blue-400 hover:bg-blue-500/5 transition-colors"
            >
              <PlusIcon />
              Add device
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

/* ─── DeviceNode ─── */
// One device row with an inline "edit details" form (name / IP / port).
function DeviceNode({
  project, location, device,
  isActive, isConn,
  setActiveProjectId, setActiveLocationId, setActiveDeviceId,
  onDeleteDevice, onUpdateDevice, canWriteDevice, brands,
  alarms = [], onAcceptAlarm,
}) {
  const { canUseElement } = useAuth();
  const canEditDevice = canWriteDevice && canUseElement('device.edit');

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', ip: '', port: 502, description: '', latitude: '', longitude: '', brandId: '' });
  const [editErr, setEditErr] = useState('');

  const startEdit = () => {
    setDraft({
      name: device.name ?? '',
      ip: device.ip ?? '',
      port: device.port ?? 502,
      description: device.description ?? '',
      latitude: device.latitude ?? '',
      longitude: device.longitude ?? '',
      brandId: device.brandId ?? '',
      datakomDid: device.datakomDid ?? '',
    });
    setEditErr('');
    setEditing(true);
  };
  const saveEdit = async () => {
    const res = await onUpdateDevice(project.id, location.id, device, draft);
    if (res?.ok) setEditing(false); else setEditErr(res?.error || 'Update failed');
  };

  if (editing) {
    return (
      <li>
        <div className="rounded-xl bg-[#0f1117] border border-white/10 p-2.5 space-y-2 mt-0.5">
          <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Device name" className={treeInput} autoFocus />
          {/* The two connection identifiers. Fill an IP for Modbus/IP, or a Datakom
              DID for the Rainbow cloud — whichever you set decides the method
              (an IP wins if both are present). */}
          <div className="flex gap-2">
            <input value={draft.ip} onChange={(e) => setDraft((d) => ({ ...d, ip: e.target.value }))}
              placeholder="IP (Modbus)" className={`${treeInput} font-mono`} />
            <input type="number" value={draft.port} onChange={(e) => setDraft((d) => ({ ...d, port: e.target.value }))}
              placeholder="Port" className={`${treeInput} font-mono w-20`} />
          </div>
          <input value={draft.datakomDid ?? ''} onChange={(e) => setDraft((d) => ({ ...d, datakomDid: e.target.value }))}
            placeholder="Datakom DID (cloud)" className={`${treeInput} font-mono`} />
          <input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Description (optional)" className={treeInput} />
          <div className="flex gap-2">
            <input type="number" step="any" value={draft.latitude}
              onChange={(e) => setDraft((d) => ({ ...d, latitude: e.target.value }))}
              placeholder="Latitude" className={`${treeInput} font-mono`} />
            <input type="number" step="any" value={draft.longitude}
              onChange={(e) => setDraft((d) => ({ ...d, longitude: e.target.value }))}
              placeholder="Longitude" className={`${treeInput} font-mono`} />
          </div>
          <select
            value={draft.brandId ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, brandId: e.target.value }))}
            className={`${treeInput} cursor-pointer`}
          >
            <option value="" className="bg-[#0f1117]">Brand (optional)</option>
            {(brands ?? []).map((b) => (
              <option key={b.id} value={b.id} className="bg-[#0f1117]">{b.name}</option>
            ))}
          </select>
          {/* Live method — decided by which identifier is filled: an IP → Modbus/IP,
              else a Datakom DID (or Datacom brand) → Datakom Rainbow cloud. */}
          {(() => {
            const validIp = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(String(draft.ip ?? '').trim());
            const hasDid = String(draft.datakomDid ?? '').trim() !== '';
            const brand = (brands ?? []).find((b) => String(b.id) === String(draft.brandId));
            const method = validIp ? 'ip' : (hasDid || isCloudBrand(brand?.name)) ? 'cloud' : 'ip';
            return (
              <span className={`inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border
                ${method === 'ip' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                {method === 'ip' ? 'IP / Modbus method' : 'Datakom Cloud method'}
              </span>
            );
          })()}
          {editErr && <p className="text-[10px] text-red-400">{editErr}</p>}
          <div className="flex gap-2 pt-0.5">
            <button onClick={saveEdit}
              className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors">
              Save
            </button>
            <button onClick={() => setEditing(false)}
              className="px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 text-xs hover:bg-white/20 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li>
      <div className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-colors
        ${isActive ? 'bg-indigo-500/10 text-indigo-300' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}
      >
        <button
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          onClick={() => { setActiveProjectId(project.id); setActiveLocationId(location.id); setActiveDeviceId(device.id); }}
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isConn ? 'bg-emerald-400 animate-pulse' : 'bg-gray-700'}`} />
          <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
          <span dir="auto" className="truncate text-[11px] font-medium">
            {String(device.name ?? '').trim() || `Device ${device.backendId ?? ''}`}
          </span>
        </button>
        {/* Alarm badge: shows critical/warning count when alarms are present */}
        {alarms.length > 0 && (
          <span className={`flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${
            alarms.some(a => a.severity === 'critical')
              ? 'bg-red-500/15 text-red-400 border-red-500/25'
              : 'bg-amber-500/15 text-amber-400 border-amber-500/25'
          }`}>
            <span className={`w-1 h-1 rounded-full ${
              alarms.some(a => a.severity === 'critical') ? 'bg-red-400 animate-pulse' : 'bg-amber-400'
            }`} />
            {alarms.length}
          </span>
        )}
        {canEditDevice && (
          <button
            onClick={startEdit}
            title="Edit device"
            className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 rounded text-gray-600 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
          >
            <PencilIcon />
          </button>
        )}
        {canWriteDevice && (
          <button
            onClick={() => onDeleteDevice(project.id, location.id, device.id)}
            className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {/* Accept All button — one click silences every alarm on this device */}
      {alarms.length > 0 && (
        <div className="ml-5 mt-0.5 mb-1">
          <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${
            alarms.some(a => a.severity === 'critical')
              ? 'bg-red-500/5 border-red-500/15'
              : 'bg-amber-500/5 border-amber-500/10'
          }`}>
            <div className="flex-1 min-w-0 space-y-0.5">
              {alarms.map((a) => (
                <p key={a.id} className={`text-[10px] font-medium truncate ${
                  a.severity === 'critical' ? 'text-red-400' : 'text-amber-400'
                }`}>
                  <span className={`inline-block w-1 h-1 rounded-full mr-1 align-middle ${
                    a.severity === 'critical' ? 'bg-red-400 animate-pulse' : 'bg-amber-400'
                  }`} />
                  {alarmLabel(a.type)}
                </p>
              ))}
            </div>
            <button
              onClick={() => alarms.forEach(a => onAcceptAlarm?.(a.id))}
              className="flex-shrink-0 px-2 py-1 rounded text-[10px] font-semibold bg-white/5 border border-white/10 text-gray-400 hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors whitespace-nowrap"
            >
              Accept All
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/* ─── InlineEditRow ─── */
// A compact rename row (single text input + Save / Cancel) used for projects
// and locations. Enter saves, Escape cancels.
function InlineEditRow({ value, onChange, onSave, onCancel, error }) {
  return (
    <div className="rounded-xl bg-[#0f1117] border border-white/10 p-2 space-y-1.5">
      <div className="flex gap-1.5">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onSave(); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          }}
          className={treeInput}
          autoFocus
        />
        <button onClick={onSave}
          className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors">
          Save
        </button>
        <button onClick={onCancel}
          className="px-2 py-1 rounded-lg bg-white/10 text-gray-300 text-xs hover:bg-white/20 transition-colors">
          Cancel
        </button>
      </div>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}
