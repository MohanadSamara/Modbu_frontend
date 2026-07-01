import { useState } from 'react';
import { useAuth } from '../context/useAuth.js';

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
  connectedDeviceId,
  addingDeviceFor, startAddDevice, cancelAddDevice,
  deviceDrafts, deviceErrors, updateDeviceDraft, onCreateDevice,
  onCreateSubLocation, subLocationInputs, setSubLocationInputs,
  shouldShowDevice,
}) {
  const { hasPermission } = useAuth();
  const canWriteProject = hasPermission('project.write');

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
        <span className="text-sm font-semibold text-gray-200">Projects</span>
        <span className="ml-auto text-xs text-gray-600 font-mono">{projects.length}</span>
      </div>

      {/* New project input — only for users who can create projects */}
      {canWriteProject && (
        <div className="px-3 py-3 border-b border-white/5 flex-shrink-0">
          <form onSubmit={onCreateProject} className="flex gap-2">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="New project name…"
              className="flex-1 px-3 py-2 rounded-xl bg-[#0f1117] border border-white/10 text-sm text-gray-200 placeholder-gray-600
                focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 transition-colors"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            >
              <PlusIcon />
            </button>
          </form>
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
                connectedDeviceId={connectedDeviceId}
                addingDeviceFor={addingDeviceFor} startAddDevice={startAddDevice} cancelAddDevice={cancelAddDevice}
                deviceDrafts={deviceDrafts} deviceErrors={deviceErrors} updateDeviceDraft={updateDeviceDraft} onCreateDevice={onCreateDevice}
                onCreateSubLocation={onCreateSubLocation} subLocationInputs={subLocationInputs} setSubLocationInputs={setSubLocationInputs}
                shouldShowDevice={shouldShowDevice}
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
  connectedDeviceId,
  addingDeviceFor, startAddDevice, cancelAddDevice,
  deviceDrafts, deviceErrors, updateDeviceDraft, onCreateDevice,
  onCreateSubLocation, subLocationInputs, setSubLocationInputs,
  shouldShowDevice,
}) {
  const { hasPermission } = useAuth();
  const canWriteProject = hasPermission('project.write');

  const open = !!expandedProjects[project.id];
  const active = activeProjectId === project.id;

  return (
    <li>
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
          <span className="truncate text-sm font-semibold">{project.name}</span>
          <span className="ml-1 text-[10px] text-gray-600 flex-shrink-0">{project.locations.length}</span>
        </button>
        {canWriteProject && (
          <button
            onClick={() => onDeleteProject(project.id)}
            className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {open && (
        <div className="ml-4 border-l border-white/5 pl-3 mt-1 space-y-1">
          {/* Add location */}
          {canWriteProject && (
            <div className="flex gap-1.5 py-1">
              <input
                type="text"
                value={locationInputs[project.id] ?? ''}
                onChange={(e) => setLocationInputs((p) => ({ ...p, [project.id]: e.target.value }))}
                placeholder="Add location…"
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#0f1117] border border-white/10 text-xs text-gray-300 placeholder-gray-600
                  focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/40 transition-colors"
              />
              <button
                onClick={() => onCreateLocation(project.id)}
                className="px-2 py-1.5 rounded-lg bg-emerald-600/80 text-white hover:bg-emerald-500 transition-colors"
              >
                <PlusIcon />
              </button>
            </div>
          )}

          {project.locations.length === 0 ? (
            <p className="text-xs text-gray-600 px-1 pb-2">No locations yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {project.locations.map((loc) => (
                <LocationNode
                  key={loc.id}
                  project={project} location={loc}
                  expandedLocations={expandedLocations} toggleLocation={toggleLocation}
                  activeLocationId={activeLocationId} activeDeviceId={activeDeviceId}
                  setActiveProjectId={setActiveProjectId} setActiveLocationId={setActiveLocationId} setActiveDeviceId={setActiveDeviceId}
                  onDeleteLocation={onDeleteLocation} onDeleteDevice={onDeleteDevice}
                  connectedDeviceId={connectedDeviceId}
                  addingDeviceFor={addingDeviceFor} startAddDevice={startAddDevice} cancelAddDevice={cancelAddDevice}
                  deviceDrafts={deviceDrafts} deviceErrors={deviceErrors} updateDeviceDraft={updateDeviceDraft} onCreateDevice={onCreateDevice}
                  onCreateSubLocation={onCreateSubLocation} subLocationInputs={subLocationInputs} setSubLocationInputs={setSubLocationInputs}
                  shouldShowDevice={shouldShowDevice}
                />
              ))}
            </ul>
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
  connectedDeviceId,
  addingDeviceFor, startAddDevice, cancelAddDevice,
  deviceDrafts, deviceErrors, updateDeviceDraft, onCreateDevice,
  onCreateSubLocation, subLocationInputs, setSubLocationInputs,
  shouldShowDevice,
}) {
  const { hasPermission } = useAuth();
  const canWriteProject = hasPermission('project.write');
  const canWriteDevice  = hasPermission('device.write');

  const open = !!expandedLocations[location.id];
  const active = activeLocationId === location.id;
  const childLocations = location.children ?? [];
  const visibleDevices = (location.devices ?? []).filter(shouldShowDevice);
  const draft = deviceDrafts[location.id] ?? { name: '', ip: '', port: 502, description: '' };
  const errs = deviceErrors[location.id] ?? {};

  return (
    <li>
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
          <span className="truncate text-xs font-medium">{location.name}</span>
        </button>
        {canWriteProject && (
          <button
            onClick={() => onDeleteLocation(project.id, location.id)}
            className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {open && (
        <div className="ml-4 border-l border-white/5 pl-3 mt-0.5 space-y-1 pb-1">
          {/* Add sub-location */}
          {canWriteProject && (
            <div className="flex gap-1 pt-1">
              <input
                type="text"
                value={subLocationInputs[location.id] ?? ''}
                onChange={(e) => setSubLocationInputs((p) => ({ ...p, [location.id]: e.target.value }))}
                placeholder="Sub-location…"
                className="flex-1 px-2 py-1.5 rounded-lg bg-[#0f1117] border border-white/10 text-[11px] text-gray-300 placeholder-gray-600
                  focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors"
              />
              <button
                onClick={() => onCreateSubLocation(project.id, location.id)}
                className="px-2 py-1.5 rounded-lg bg-white/10 text-gray-300 hover:bg-white/20 transition-colors"
              >
                <PlusIcon />
              </button>
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
                  connectedDeviceId={connectedDeviceId}
                  addingDeviceFor={addingDeviceFor} startAddDevice={startAddDevice} cancelAddDevice={cancelAddDevice}
                  deviceDrafts={deviceDrafts} deviceErrors={deviceErrors} updateDeviceDraft={updateDeviceDraft} onCreateDevice={onCreateDevice}
                  onCreateSubLocation={onCreateSubLocation} subLocationInputs={subLocationInputs} setSubLocationInputs={setSubLocationInputs}
                  shouldShowDevice={shouldShowDevice}
                />
              ))}
            </ul>
          )}

          {/* Devices */}
          {visibleDevices.length > 0 && (
            <ul className="space-y-0.5 pt-0.5">
              {visibleDevices.map((device) => {
                const isActive = activeDeviceId === device.id;
                const isConn = connectedDeviceId === device.id;
                return (
                  <li key={device.id}>
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
                        <span className="truncate text-[11px] font-medium">{device.name}</span>
                      </button>
                      {canWriteDevice && (
                        <button
                          onClick={() => onDeleteDevice(project.id, location.id, device.id)}
                          className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Add device form / button */}
          {canWriteDevice && (addingDeviceFor === location.id ? (
            <div className="rounded-xl bg-[#0f1117] border border-white/10 p-3 space-y-2 mt-1">
              {[
                { field: 'name', placeholder: 'Device name', type: 'text' },
                { field: 'ip', placeholder: 'IP (e.g. 192.168.1.100)', type: 'text' },
                { field: 'port', placeholder: 'Port', type: 'number' },
              ].map(({ field, placeholder, type }) => (
                <div key={field}>
                  <input
                    type={type}
                    value={draft[field]}
                    onChange={(e) => updateDeviceDraft(location.id, field, e.target.value)}
                    placeholder={placeholder}
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs text-gray-200 placeholder-gray-600 bg-[#1a1d27] border transition-colors
                      focus:outline-none focus:ring-1 focus:ring-blue-500/30
                      ${errs[field] ? 'border-red-500/40 bg-red-500/5' : 'border-white/10'}`}
                  />
                  {errs[field] && <p className="text-[10px] text-red-400 mt-0.5">{errs[field]}</p>}
                </div>
              ))}
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
