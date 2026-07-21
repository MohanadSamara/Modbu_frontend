// ============================================================================
// DatakomProjectTree.jsx — read-only "project tree" sourced from the Datakom
// Rainbow cloud, for the Projects page's source toggle.
//
// Datakom groups its devices under a node hierarchy (see getTree() in the
// backend adapter). This component fetches that hierarchy, maps it into the same
// shape <ProjectsSidebar> renders for local DB projects, and shows it in READ-ONLY
// mode (no create/rename/delete — it's cloud data). Selecting a device shows its
// live reading via the shared <DatakomDeviceLive> gauge. Self-contained: it keeps
// its own expand/selection state so it never touches the DB-backed project flow.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { datakomApi } from '../api/datakom.js';
import ProjectsSidebar from './ProjectsSidebar.jsx';
import DatakomDeviceLive from './DatakomDeviceLive.jsx';
import DatakomDeviceEdit from './DatakomDeviceEdit.jsx';
import { buildSidebarProjects } from './datakomTreeMap.js';

// The backend serves a continuously-pushed in-memory cache, so polling is cheap.
const POLL_MS = 5000;

const noop = () => {};

export default function DatakomProjectTree() {
  const [status, setStatus] = useState(null);
  const [tree, setTree] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Tree navigation state — kept local so this view is fully independent of the
  // DB project tree. The single synthetic project starts expanded.
  const [expandedProjects, setExpandedProjects] = useState({ 'dk-root': true });
  const [expandedLocations, setExpandedLocations] = useState({});
  const [activeProjectId, setActiveProjectId] = useState('dk-root');
  const [activeLocationId, setActiveLocationId] = useState(null);
  const [activeDeviceId, setActiveDeviceId] = useState(null);

  // Local custom names for cloud nodes ({ nodeId: name }). Fetched once and
  // refreshed after a rename; applied over the cloud names in buildSidebarProjects.
  const [nodeNames, setNodeNames] = useState({});
  const refreshNodeNames = async () => {
    try { setNodeNames(await datakomApi.nodeNames() || {}); } catch { /* keep last */ }
  };
  useEffect(() => { refreshNodeNames(); }, []);

  // Rename a cloud node: persist the override, then reflect it immediately.
  // Shaped like the sidebar's onUpdateLocation ({ ok, error }); ignores the
  // synthetic project id — the node id is all the backend needs.
  const renameNode = async (_projectId, nodeId, { name }) => {
    try {
      await datakomApi.setNodeName(nodeId, name);
      setNodeNames((prev) => {
        const next = { ...prev };
        if (name.trim()) next[nodeId] = name.trim(); else delete next[nodeId];
        return next;
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || 'Rename failed' };
    }
  };

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const st = await datakomApi.status();
        if (cancelled) return;
        setStatus(st);
        if (st?.ready) {
          try {
            const t = await datakomApi.tree();
            if (!cancelled) { setTree(t); setError(''); }
          } catch (e) {
            if (!cancelled) setError(e.message || 'Failed to load Datakom tree');
          }
        } else if (!cancelled) {
          setTree(null);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to reach Datakom adapter');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const { projects, deviceIndex, onlineIds } = useMemo(
    () => (tree ? buildSidebarProjects(tree, nodeNames) : { projects: [], deviceIndex: new Map(), onlineIds: new Set() }),
    [tree, nodeNames]
  );

  const toggleProject = (id) => setExpandedProjects((p) => ({ ...p, [id]: !p[id] }));
  const toggleLocation = (id) => setExpandedLocations((p) => ({ ...p, [id]: !p[id] }));

  const selectedDevice = activeDeviceId ? deviceIndex.get(activeDeviceId) : null;

  // Resolve which node (location) is selected, for the node summary view.
  const selectedLocationName = useMemo(() => {
    if (!activeLocationId) return null;
    let found = null;
    const walk = (locs) => {
      for (const l of locs || []) {
        if (l.id === activeLocationId) { found = l; return; }
        walk(l.children);
        if (found) return;
      }
    };
    for (const p of projects) walk(p.locations);
    return found?.name ?? null;
  }, [activeLocationId, projects]);

  const notConnected = status && !status.ready;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      {/* Sidebar — reuses the DB tree component in read-only mode. */}
      <ProjectsSidebar
        readOnly
        // Even though the tree is read-only cloud data, users with datakom.write
        // may rename nodes locally — enabled by this flag, wired to renameNode.
        allowLocationRename
        title="Datakom Rainbow"
        projects={projects}
        shouldShowDevice={() => true}
        projectName=""
        setProjectName={noop}
        onCreateProject={noop}
        expandedProjects={expandedProjects}
        toggleProject={toggleProject}
        expandedLocations={expandedLocations}
        toggleLocation={toggleLocation}
        activeProjectId={activeProjectId}
        activeLocationId={activeLocationId}
        activeDeviceId={activeDeviceId}
        setActiveProjectId={setActiveProjectId}
        setActiveLocationId={setActiveLocationId}
        setActiveDeviceId={setActiveDeviceId}
        locationInputs={{}}
        setLocationInputs={noop}
        onCreateLocation={noop}
        onDeleteProject={noop}
        onDeleteLocation={noop}
        onDeleteDevice={noop}
        onUpdateProject={noop}
        onUpdateLocation={renameNode}
        onUpdateDevice={noop}
        connectedDeviceIds={onlineIds}
        addingDeviceFor={null}
        startAddDevice={noop}
        cancelAddDevice={noop}
        deviceDrafts={{}}
        deviceErrors={{}}
        updateDeviceDraft={noop}
        onCreateDevice={noop}
        brands={[]}
        onCreateSubLocation={noop}
        subLocationInputs={{}}
        setSubLocationInputs={noop}
        alarmsMap={{}}
        onAcceptAlarm={noop}
      />

      {/* Main panel */}
      <section className="lg:col-span-3 card p-6 min-h-[400px]">
        {/* Connection / load state */}
        {status && !status.enabled ? (
          <StateNote
            title="Datakom Rainbow is disabled"
            body={<>Set <code className="text-gray-400">DK_ENABLED=1</code> (plus <code className="text-gray-400">DK_USER</code>/<code className="text-gray-400">DK_PASS</code>) on the backend to activate the live data source.</>}
          />
        ) : error ? (
          <StateNote title="Couldn't load the Datakom tree" body={error} tone="error" />
        ) : loading && !tree ? (
          <StateNote title="Connecting to Datakom…" body="Fetching the live device tree." />
        ) : notConnected ? (
          <StateNote
            title={status?.gaveUp ? 'Datakom adapter stopped' : 'Connecting to Datakom…'}
            body={status?.gaveUp
              ? 'The adapter stopped after repeated connection resets. Confirm this host’s public IP is whitelisted by Datakom, then restart the backend.'
              : 'Waiting for the cloud portal to finish connecting.'}
            tone={status?.gaveUp ? 'error' : 'default'}
          />
        ) : selectedDevice ? (
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
              <span>Datakom Rainbow</span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>{selectedDevice.sid || `Device ${selectedDevice.did}`}</span>
            </div>
            <h2 className="text-xl font-bold text-gray-100 mb-1">
              {selectedDevice.sid || `Device ${selectedDevice.did}`}
            </h2>
            <p className="text-xs text-gray-500 mb-5 tabular-nums">
              did {selectedDevice.did}
              {selectedDevice.esn ? ` · esn ${selectedDevice.esn}` : ''}
              {selectedDevice.online ? ' · live' : ' · no reading yet'}
            </p>
            {/* Edit affordance: rename the linked platform device, or link+edit
                when the cloud device isn't in the platform yet (self-gates by
                device.write / datakom.write). */}
            <DatakomDeviceEdit
              did={selectedDevice.did}
              cloudName={selectedDevice.sid || `Device ${selectedDevice.did}`}
            />
            <div className="max-w-md">
              <DatakomDeviceLive did={selectedDevice.did} />
            </div>
          </div>
        ) : activeLocationId ? (
          <StateNote
            title={selectedLocationName || 'Node'}
            body="Select a device in this node to see its live reading."
          />
        ) : (
          <StateNote
            title="Datakom Rainbow"
            body={<>
              Live device tree from Datakom&rsquo;s cloud portal.
              {status ? <> {status.deviceCount ?? 0} device{status.deviceCount === 1 ? '' : 's'} across {status.nodes ?? 0} node{status.nodes === 1 ? '' : 's'}.</> : null}
              {' '}Pick a device in the sidebar to view its fuel and live values.
            </>}
          />
        )}
      </section>
    </div>
  );
}

// Small centered message block used for the various empty / connection states.
function StateNote({ title, body, tone = 'default' }) {
  const ring = tone === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400';
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 text-center">
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${ring}`}>
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-gray-200 mb-2">{title}</h1>
      <p className="text-gray-500 text-sm max-w-sm leading-relaxed">{body}</p>
    </div>
  );
}
