import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import FuelGauge from '../components/FuelGauge.jsx';
import ControlButtons from '../components/ControlButtons.jsx';
import ProjectsSidebar from '../components/ProjectsSidebar.jsx';
import Can from '../components/Can.jsx';
import modbusApi from '../api/modbus.js';
import { projectsApi, locationsApi, devicesApi } from '../api/projects.js';
import { brandsApi } from '../api/brands.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { defaultSettings } from '../api/settings.js';
import { useAuth } from '../context/useAuth.js';

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Set of backend device ids currently connected server-side, from GET /session.
// Handles the new per-device shape ({ devices:[{deviceId,connected}] }) and the
// legacy single-device shape ({ connected, deviceId }).
function connectedIdsFromSession(session) {
  const set = new Set();
  if (Array.isArray(session?.devices)) {
    for (const d of session.devices) {
      if (d.connected && d.deviceId != null) set.add(String(d.deviceId));
    }
  } else if (session?.connected && session?.deviceId != null) {
    set.add(String(session.deviceId));
  }
  return set;
}

// Shallow equality for two Sets (avoids needless re-renders on each poll).
function setsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// The tree re-hydrates from the backend with fresh (ephemeral) frontend ids on
// every mount, so a selection saved by frontend id can't be found again. We
// instead remember the selection's STABLE backend ids and, after a fresh
// hydrate, map them back to the new frontend ids + the tree path to expand.
function restoreSelectionByBackendIds(hydrated, bids) {
  const S = (v) => (v == null || v === '' ? null : String(v));
  const dBid = S(bids.device), lBid = S(bids.location), pBid = S(bids.project);
  const out = { projectId: null, locationId: null, deviceId: null, expProjects: {}, expLocations: {} };

  for (const project of hydrated) {
    const walk = (locs, ancestors) => {
      for (const loc of locs || []) {
        const chain = [...ancestors, loc];
        if (dBid) {
          const dev = (loc.devices || []).find((d) => S(d.backendId) === dBid);
          if (dev) {
            out.projectId = project.id; out.locationId = loc.id; out.deviceId = dev.id;
            out.expProjects[project.id] = true;
            for (const a of chain) out.expLocations[a.id] = true;
            return true;
          }
        } else if (lBid && S(loc.backendId) === lBid) {
          out.projectId = project.id; out.locationId = loc.id;
          out.expProjects[project.id] = true;
          for (const a of chain) out.expLocations[a.id] = true;
          return true;
        }
        if (loc.children && walk(loc.children, chain)) return true;
      }
      return false;
    };
    if (walk(project.locations, [])) return out;
    if (!dBid && !lBid && pBid && S(project.backendId) === pBid) {
      out.projectId = project.id; out.expProjects[project.id] = true;
      return out;
    }
  }
  return out;
}


function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj?.[k] !== undefined) return obj[k];
  }
  return undefined;
}

// Process devices from backend location response
function processDevices(devices) {
  if (!Array.isArray(devices)) return [];
  return devices.map((d) => ({
    id: createId(),
    backendId: pick(d, 'id', 'ID') ?? null,
    name: pick(d, 'name', 'NAME') ?? '',
    ip: pick(d, 'ip', 'IP') ?? pick(d, 'device_ip', 'DEVICE_IP') ?? '',
    port: Number(pick(d, 'port', 'PORT') ?? pick(d, 'device_port', 'DEVICE_PORT') ?? 502),
    status: pick(d, 'status', 'STATUS') ?? 'offline',
    description: pick(d, 'description', 'DESCRIPTION') ?? '',
    locationId: pick(d, 'location_id', 'LOCATION_ID') ?? null,
    latitude: numOrNull(pick(d, 'latitude', 'LATITUDE')),
    longitude: numOrNull(pick(d, 'longitude', 'LONGITUDE')),
    altitude: numOrNull(pick(d, 'altitude', 'ALTITUDE')),
    brandId: numOrNull(pick(d, 'brand_id', 'BRAND_ID')),
    brandName: pick(d, 'brand_name', 'BRAND_NAME') ?? null,
  }));
}

// Coordinates come back as numbers, strings, or null — normalize to number|null.
function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Parse+validate a manual lat/lon pair from form inputs. Blank stays null;
// out-of-range values also return null so callers can flag them.
function parseCoords(latIn, lonIn) {
  const parse = (v, max) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
  };
  return { latitude: parse(latIn, 90), longitude: parse(lonIn, 180) };
}

// Helper function to fetch devices for a location from backend
async function fetchDevicesForLocation(locationBackendId) {
  if (!locationBackendId) return [];
  try {
    const devices = await devicesApi.list({ location_id: locationBackendId });
    return processDevices(devices ?? []);
  } catch (err) {
    console.warn('Failed to fetch devices for location', locationBackendId, err.message);
    return [];
  }
}

// Process locations and fetch devices for each location recursively
async function processLocationsWithDevices(locations) {
  const result = [];
  for (const loc of locations) {
    const locationId = pick(loc, 'id', 'ID');
    const locationName = pick(loc, 'name', 'NAME') ?? '';
    const parentId = pick(loc, 'parent_id', 'PARENT_ID');
    
    // Fetch devices for this location from backend
    const devices = await fetchDevicesForLocation(locationId);
    
    // Process child locations recursively
    const childLocations = Array.isArray(loc.children)
      ? await processLocationsWithDevices(loc.children)
      : [];
    
    result.push({
      id: createId(),
      backendId: locationId,
      parentId: parentId,
      name: locationName,
      description: pick(loc, 'description', 'DESCRIPTION') ?? '',
      address: pick(loc, 'address', 'ADDRESS') ?? '',
      depth: pick(loc, 'depth', 'DEPTH') ?? 1,
      path: pick(loc, 'path', 'PATH') ?? `/${locationName}`,
      devices,
      children: childLocations
    });
  }
  return result;
}

async function loadProjectsTreeFromBackend() {
  try {
    const rawProjects = await projectsApi.list();
    const projects = await Promise.all(
      (rawProjects ?? []).map(async (p) => {
        const backendProjectId = pick(p, 'id', 'ID');
        // This API returns hierarchical tree with children embedded
        const rawLocations = backendProjectId
          ? await locationsApi.listByProject(backendProjectId)
          : [];
        
        // Process hierarchical locations AND fetch devices for each location from backend
        const locations = await processLocationsWithDevices(rawLocations);

        return {
          id: createId(),
          backendId: backendProjectId ?? null,
          name: pick(p, 'name', 'NAME') ?? '',
          description: pick(p, 'description', 'DESCRIPTION') ?? '',
          locations
        };
      })
    );
    return projects;
  } catch (err) {
    // Re-throw error to let the UI handle it (shows offline warning)
    throw err;
  }
}

export default function Projects() {
  const { settings, loading: settingsLoading } = useSettings();
  const { hasPermission, canUseElement } = useAuth();

  // A viewer may hold device.read without project.read. The project tree needs
  // project.read, so in that case we skip the tree entirely and load a flat
  // device list straight from GET /devices — device access no longer depends
  // on being able to see projects/locations.
  const canReadProjects = hasPermission('project.read');
  const canReadDevices  = hasPermission('device.read');
  const flatMode = !canReadProjects && canReadDevices;
  const [flatDevices, setFlatDevices] = useState([]);

// Helper function to check if device should be shown based on settings
  // Uses default setting if settings are still loading
  const shouldShowDevice = (device) => {
    // If settings are still loading, default to showing all devices
    if (settingsLoading || !settings) {
      return true;
    }
    
    // Get the setting value or use default (true)
    const showOffline = settings.SHOW_OFFLINE_DEVICES ?? defaultSettings.SHOW_OFFLINE_DEVICES ?? true;
    
    // Check if device is currently connected
    const isCurrentlyConnected = connectedDeviceIds.has(device.id);
    
    // Check device status from database
    const deviceOnline = device.status === 'online';

    // If showing offline devices is enabled (true), show all devices.
    if (showOffline === true) return true;
    // Otherwise (showOffline = false), only show connected or explicitly online devices.
    return isCurrentlyConnected || deviceOnline;
  };
  const [projects, setProjects] = useState(() => {
    try {
      const saved = localStorage.getItem('projects-data');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [projectName, setProjectName] = useState('');

  const [activeProjectId, setActiveProjectId] = useState(
    () => localStorage.getItem('projects-active-project') || null
  );
  const [activeLocationId, setActiveLocationId] = useState(
    () => localStorage.getItem('projects-active-location') || null
  );
  const [activeDeviceId, setActiveDeviceId] = useState(
    () => localStorage.getItem('projects-active-device') || null
  );

  const [expandedProjects, setExpandedProjects] = useState({});
  const [expandedLocations, setExpandedLocations] = useState({});

const [locationInputs, setLocationInputs] = useState({});
  const [subLocationInputs, setSubLocationInputs] = useState({});
  const [deviceDrafts, setDeviceDrafts] = useState({});
  const [deviceErrors, setDeviceErrors] = useState({});
  const [addingDeviceFor, setAddingDeviceFor] = useState(null);
  // Brand list for the device add/edit brand dropdowns.
  const [brands, setBrands] = useState([]);
  useEffect(() => {
    let alive = true;
    brandsApi.list()
      .then((rows) => { if (alive) setBrands((rows ?? []).map((b) => ({ id: b.id ?? b.ID, name: b.name ?? b.NAME ?? '' }))); })
      .catch(() => { if (alive) setBrands([]); });
    return () => { alive = false; };
  }, []);

  // Frontend ids of every device currently connected server-side (shared across
  // users). Driven by the session poll below + optimistic connect/disconnect, so
  // a device someone else connected still shows connected and usable here.
  const [connectedDeviceIds, setConnectedDeviceIds] = useState(() => new Set());
  const [connectingDeviceId, setConnectingDeviceId] = useState(null);
  const [deviceConnectionErrors, setDeviceConnectionErrors] = useState({});

  const [backendError, setBackendError] = useState('');
  const [backendOnline, setBackendOnline] = useState(false);

  // On mount: load projects tree AND restore any existing Modbus session.
  // This means switching tabs never triggers a new TCP connect — the backend
  // keeps the session alive and we just read its state.
  useEffect(() => {
    if (!canReadProjects) return undefined; // tree needs project.read
    let cancelled = false;
    (async () => {
      // 1. Load projects tree from backend
      try {
        const hydrated = await loadProjectsTreeFromBackend();
        if (cancelled) return;
        setProjects(hydrated);
        setBackendOnline(true);
        setBackendError('');

        // 1b. Re-select whatever was open before (matched by stable backend id)
        // and expand the tree path to it, so navigating away and back keeps you
        // on the same device instead of dropping you to the empty view.
        const savedBids = {
          device:   localStorage.getItem('projects-sel-device-bid'),
          location: localStorage.getItem('projects-sel-location-bid'),
          project:  localStorage.getItem('projects-sel-project-bid'),
        };
        if (savedBids.device || savedBids.location || savedBids.project) {
          const r = restoreSelectionByBackendIds(hydrated, savedBids);
          if (r.projectId) {
            setActiveProjectId(r.projectId);
            setActiveLocationId(r.locationId);
            setActiveDeviceId(r.deviceId);
            setExpandedProjects((prev) => ({ ...prev, ...r.expProjects }));
            setExpandedLocations((prev) => ({ ...prev, ...r.expLocations }));
          }
        }

        // 2. Restore connected device from server-side session
        try {
          const session = await modbusApi.getSession();
          if (cancelled) return;

          // Mark every visible device that is connected server-side (shared).
          const connectedIds = connectedIdsFromSession(session);
          if (connectedIds.size) {
            const next = new Set();
            const walk = (locs) => {
              for (const location of locs || []) {
                for (const d of location.devices || []) {
                  if (connectedIds.has(String(d.backendId))) next.add(d.id);
                }
                if (location.children) walk(location.children);
              }
            };
            for (const project of hydrated) walk(project.locations);
            setConnectedDeviceIds(next);
          }
        } catch {
          // Session fetch failed — no connected device to restore, that's fine
        }
      } catch (err) {
        if (cancelled) return;
        setBackendOnline(false);
        setBackendError(
          `Working offline (localStorage only): ${err.message || 'backend unreachable'}`
        );
      }
    })();
    return () => { cancelled = true; };
  }, [canReadProjects]);

  // Flat mode: load devices directly (no project/location context required).
  useEffect(() => {
    if (!flatMode) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const list = await devicesApi.list();
        if (cancelled) return;
        const devices = processDevices(list ?? []);
        setFlatDevices(devices);
        setBackendOnline(true);
        setBackendError('');

        // Re-select the previously open device (matched by stable backend id).
        const savedDeviceBid = localStorage.getItem('projects-sel-device-bid');
        if (savedDeviceBid) {
          const found = devices.find((d) => String(d.backendId) === String(savedDeviceBid));
          if (found) setActiveDeviceId(found.id);
        }

        // Restore any live Modbus session against the flat list.
        try {
          const session = await modbusApi.getSession();
          if (cancelled) return;
          const connectedIds = connectedIdsFromSession(session);
          if (connectedIds.size) {
            const next = new Set();
            for (const d of devices) {
              if (connectedIds.has(String(d.backendId))) next.add(d.id);
            }
            setConnectedDeviceIds(next);
          }
        } catch {
          // No session to restore — fine.
        }
      } catch (err) {
        if (cancelled) return;
        setBackendOnline(false);
        setBackendError(`Failed to load devices: ${err.message || 'backend unreachable'}`);
      }
    })();
    return () => { cancelled = true; };
  }, [flatMode]);

  // Flattened { frontendId, backendId } list, kept fresh for the poll below.
  const devicesRef = useRef([]);
  useEffect(() => {
    const flat = [];
    const walk = (locs) => {
      for (const l of locs || []) {
        for (const d of l.devices || []) flat.push({ id: d.id, backendId: d.backendId, ip: d.ip, port: d.port });
        if (l.children) walk(l.children);
      }
    };
    for (const p of projects) walk(p.locations);
    for (const d of flatDevices) flat.push({ id: d.id, backendId: d.backendId, ip: d.ip, port: d.port });
    devicesRef.current = flat;
  }, [projects, flatDevices]);

  // Poll session every 8 s and mirror the server's connected-device set. This is
  // what makes a device connected by ANOTHER user show as connected (and usable)
  // here too — the connection is shared per device on the backend.
  useEffect(() => {
    const poll = async () => {
      try {
        const session = await modbusApi.getSession();
        const connectedBackendIds = connectedIdsFromSession(session);
        const next = new Set();
        for (const d of devicesRef.current) {
          if (d.backendId != null && connectedBackendIds.has(String(d.backendId))) next.add(d.id);
        }
        setConnectedDeviceIds((prev) => (setsEqual(prev, next) ? prev : next));
      } catch {
        // Backend unreachable — leave state as-is
      }
    };

    poll(); // populate immediately, then keep it fresh
    const id = setInterval(poll, 8_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem('projects-data', JSON.stringify(projects));
  }, [projects]);
  useEffect(() => {
    if (activeProjectId) localStorage.setItem('projects-active-project', activeProjectId);
    else localStorage.removeItem('projects-active-project');
  }, [activeProjectId]);
  useEffect(() => {
    if (activeLocationId) localStorage.setItem('projects-active-location', activeLocationId);
    else localStorage.removeItem('projects-active-location');
  }, [activeLocationId]);
  useEffect(() => {
    if (activeDeviceId) localStorage.setItem('projects-active-device', activeDeviceId);
    else localStorage.removeItem('projects-active-device');
  }, [activeDeviceId]);

  // Persist the selection by STABLE backend ids too, so it survives the tree
  // re-hydrating with new frontend ids when you leave and come back.
  useEffect(() => {
    const S = (v) => (v == null ? null : String(v));
    let devBid = null, locBid = null, projBid = null;
    for (const p of projects) {
      if (S(p.id) === S(activeProjectId)) projBid = p.backendId ?? null;
      const walk = (locs) => {
        for (const l of locs || []) {
          if (S(l.id) === S(activeLocationId)) { locBid = l.backendId ?? null; projBid = projBid ?? (p.backendId ?? null); }
          const d = (l.devices || []).find((x) => S(x.id) === S(activeDeviceId));
          if (d) { devBid = d.backendId ?? null; locBid = locBid ?? (l.backendId ?? null); projBid = projBid ?? (p.backendId ?? null); }
          if (l.children) walk(l.children);
        }
      };
      walk(p.locations);
    }
    const put = (k, v) => { if (v != null) localStorage.setItem(k, String(v)); else localStorage.removeItem(k); };
    put('projects-sel-device-bid', devBid);
    put('projects-sel-location-bid', locBid);
    put('projects-sel-project-bid', projBid);
  }, [activeProjectId, activeLocationId, activeDeviceId, projects]);

  const selection = useMemo(() => {
    for (const project of projects) {
      for (const location of project.locations) {
        for (const device of location.devices) {
          if (device.id === activeDeviceId) return { project, location, device };
        }
        if (location.id === activeLocationId) return { project, location, device: null };
      }
      if (project.id === activeProjectId) return { project, location: null, device: null };
    }
    return { project: null, location: null, device: null };
  }, [projects, activeProjectId, activeLocationId, activeDeviceId]);

  // Selected device in flat mode (no project/location wrapper).
  const flatSelectedDevice = useMemo(
    () => flatDevices.find((d) => d.id === activeDeviceId) ?? null,
    [flatDevices, activeDeviceId]
  );

  const toggleProject = (id) =>
    setExpandedProjects((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleLocation = (id) =>
    setExpandedLocations((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleCreateProject = async (e) => {
    e.preventDefault();
    const name = projectName.trim();
    if (!name) return;

    let backendId = null;
    try {
      await projectsApi.create({ name });
      const latest = await projectsApi.list();
      const found = (latest ?? []).find(
        (p) => String(p?.name ?? p?.NAME ?? '').toLowerCase() === name.toLowerCase()
      );
      backendId = found?.id ?? found?.ID ?? null;
    } catch (err) {
      setBackendError(`Project saved locally only: ${err.message}`);
    }

    const newProject = { id: createId(), backendId, name, description: '', locations: [] };
    setProjects((prev) => [newProject, ...prev]);
    setExpandedProjects((prev) => ({ ...prev, [newProject.id]: true }));
    setActiveProjectId(newProject.id);
    setActiveLocationId(null);
    setActiveDeviceId(null);
    setProjectName('');
  };

  const handleCreateLocation = async (projectId) => {
    const name = (locationInputs[projectId] ?? '').trim();
    if (!name) return;

    const project = projects.find((p) => p.id === projectId);
    let backendId = null;
    if (project?.backendId) {
      try {
        await locationsApi.create(project.backendId, { name });
        const latest = await locationsApi.listByProject(project.backendId);
        const found = (latest ?? []).find(
          (l) => String(l?.name ?? l?.NAME ?? '').toLowerCase() === name.toLowerCase()
        );
        backendId = found?.id ?? found?.ID ?? null;
      } catch (err) {
        setBackendError(`Location saved locally only: ${err.message}`);
      }
    }

const location = { id: createId(), backendId, name, description: '', address: '', devices: [], children: [] };
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, locations: [...p.locations, location] } : p
      )
    );
    setExpandedLocations((prev) => ({ ...prev, [location.id]: true }));
    setLocationInputs((prev) => ({ ...prev, [projectId]: '' }));
  };

// Handle creating a sub-location under a parent location
  const handleCreateSubLocation = async (projectId, parentLocationId) => {
    const name = (subLocationInputs[parentLocationId] ?? '').trim();
    if (!name) return;
    
    // Find the parent location in the projects tree, and the owning project's
    // backend id (from the projectId we were given — locations don't carry it).
    const parentLocation = findLocationById(projects, parentLocationId);
    const projectBackendId = projects.find((p) => p.id === projectId)?.backendId ?? null;
    let backendId = null;

    if (parentLocation?.backendId && projectBackendId) {
      try {
        // Create NEW sub-location by calling locationsApi.create with parent_id
        await locationsApi.create(projectBackendId, {
          name,
          parent_id: parentLocation.backendId,
        });
        // Fetch updated locations to get the new location's ID. The response is
        // a nested tree, so the new sub-location lives inside its parent's
        // children — search recursively, not just the top level.
        const latest = await locationsApi.listByProject(projectBackendId);
        const findInTree = (nodes) => {
          for (const l of nodes || []) {
            const nm  = String(l?.name ?? l?.NAME ?? '').toLowerCase();
            const pid = l?.parent_id ?? l?.PARENT_ID;
            if (nm === name.toLowerCase() && pid == parentLocation.backendId) return l;
            const kids = l.children ?? l.CHILDREN;
            if (kids) { const r = findInTree(kids); if (r) return r; }
          }
          return null;
        };
        const found = findInTree(latest);
        backendId = found?.id ?? found?.ID ?? null;
      } catch (err) {
        setBackendError(`Sub-location saved locally only: ${err.message}`);
      }
    } else if (!parentLocation?.backendId) {
      setBackendError('Save the parent location first — sub-location kept locally only.');
    }

    // Add sub-location to local state
    const newSubLocation = { 
      id: createId(), 
      backendId, 
      name, 
      description: '', 
      address: '', 
      devices: [], 
      children: [],
      parentId: parentLocationId,
      depth: (parentLocation?.depth || 1) + 1,
      path: `${parentLocation?.path || ''}/${name}`
    };
    
    // Update projects state to add sub-location under parent
    setProjects((prev) => 
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          locations: addSubLocationToParent(p.locations, parentLocationId, newSubLocation)
        };
      })
    );
    
    setExpandedLocations((prev) => ({ ...prev, [newSubLocation.id]: true }));
    setSubLocationInputs((prev) => ({ ...prev, [parentLocationId]: '' }));
  };

  // Helper function to add sub-location to parent location's children array
  function addSubLocationToParent(locations, parentId, newSubLocation) {
    return locations.map((loc) => {
      if (loc.id === parentId) {
        return {
          ...loc,
          children: [...(loc.children || []), newSubLocation]
        };
      }
      if (loc.children && loc.children.length > 0) {
        return {
          ...loc,
          children: addSubLocationToParent(loc.children, parentId, newSubLocation)
        };
      }
      return loc;
    });
  }

  // Helper function to find a location by ID in the projects tree
  function findLocationById(projectsList, locationId) {
    for (const project of projectsList) {
      for (const location of project.locations) {
        if (location.id === locationId) {
          return { ...location, projectId: project.id, projectBackendId: project.backendId };
        }
        // Check children recursively
        if (location.children && location.children.length > 0) {
          const found = findLocationInChildren(location.children, locationId);
          if (found) return { ...found, projectId: project.id, projectBackendId: project.backendId };
        }
      }
    }
    return null;
  }

  function findLocationInChildren(children, locationId) {
    for (const child of children) {
      if (child.id === locationId) return child;
      if (child.children && child.children.length > 0) {
        const found = findLocationInChildren(child.children, locationId);
        if (found) return found;
      }
    }
    return null;
  }

  const startAddDevice = (locationId) => {
    setAddingDeviceFor(locationId);
    setDeviceDrafts((prev) => ({
      ...prev,
      [locationId]: prev[locationId] ?? { name: '', ip: '', port: 502, description: '', brandId: '' }
    }));
  };

  const cancelAddDevice = (locationId) => {
    setAddingDeviceFor((prev) => (prev === locationId ? null : prev));
    setDeviceErrors((prev) => ({ ...prev, [locationId]: {} }));
  };

  const updateDeviceDraft = (locationId, field, value) => {
    setDeviceDrafts((prev) => ({
      ...prev,
      [locationId]: {
        name: '',
        ip: '',
        port: 502,
        description: '',
        brandId: '',
        ...(prev[locationId] ?? {}),
        [field]: value
      }
    }));
    if (deviceErrors[locationId]?.[field]) {
      setDeviceErrors((prev) => ({
        ...prev,
        [locationId]: { ...(prev[locationId] ?? {}), [field]: '' }
      }));
    }
  };

  const handleCreateDevice = async (projectId, locationId) => {
    const input = deviceDrafts[locationId] ?? { name: '', ip: '', port: 502, description: '', latitude: '', longitude: '', brandId: '' };
    const name = String(input.name ?? '').trim();
    const ip = String(input.ip ?? '').trim();
    const portValue = Number(input.port);
    const description = String(input.description ?? '').trim();
    const { latitude, longitude } = parseCoords(input.latitude, input.longitude);
    const brandId = input.brandId === '' || input.brandId == null ? null : Number(input.brandId);

    const errors = {};
    if (!name) errors.name = 'Name is required';
    if (!ip.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) errors.ip = 'Valid IP required';
    if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
      errors.port = 'Valid port (1-65535) required';
    }
    if (String(input.latitude ?? '').trim() !== '' && latitude === null) errors.latitude = 'Latitude must be -90..90';
    if (String(input.longitude ?? '').trim() !== '' && longitude === null) errors.longitude = 'Longitude must be -180..180';
    if (Object.keys(errors).length > 0) {
      setDeviceErrors((prev) => ({ ...prev, [locationId]: errors }));
      return;
    }

    // Persist device to backend DB so it gets a real numeric device_id
    // (needed by /api/modbus/connect?device_id=...). Fall back to local-only
    // device if the backend is unreachable.
    // If the owning location has a backendId, send it so the device row is
    // correctly linked to its location in the DB.
    // Recursive lookup — the owner may be a nested sub-location, which a
    // top-level .locations.find() would miss (leaving location_id null).
    const ownerLocation = findLocationById(projects, locationId);
    let backendId = null;
    try {
      await devicesApi.create({
        location_id: ownerLocation?.backendId ?? null,
        name,
        ip,
        port: portValue,
        description,
        status: 'offline',
        latitude,
        longitude,
        brand_id: brandId ?? ''
      });

      if (ownerLocation?.backendId) {
        const latest = await devicesApi.list({ location_id: ownerLocation.backendId });
        const found = (latest ?? []).find((d) => {
          const dn = String(d?.name ?? d?.NAME ?? '').toLowerCase();
          const dip = String(d?.ip ?? d?.IP ?? '');
          const dp = Number(d?.port ?? d?.PORT ?? 0);
          return dn === name.toLowerCase() && dip === ip && dp === portValue;
        });
        backendId = found?.id ?? found?.ID ?? null;
      }
    } catch (err) {
      setDeviceErrors((prev) => ({
        ...prev,
        [locationId]: { ...(prev[locationId] ?? {}), name: `Saved locally only: ${err.message}` }
      }));
    }

    const device = {
      id: createId(),
      backendId,
      name,
      ip,
      port: portValue,
      description,
      latitude,
      longitude,
      brandId,
      brandName: brands.find((b) => b.id === brandId)?.name ?? null
    };

    // Add the device to its location — recursively, so nested sub-locations
    // (not just top-level ones) receive it in local state.
    const addDeviceToLocation = (locs) =>
      (locs || []).map((location) => {
        if (location.id === locationId) {
          return { ...location, devices: [...(location.devices || []), device] };
        }
        if (location.children && location.children.length) {
          return { ...location, children: addDeviceToLocation(location.children) };
        }
        return location;
      });

    setProjects((prev) =>
      prev.map((project) =>
        project.id !== projectId
          ? project
          : { ...project, locations: addDeviceToLocation(project.locations) }
      )
    );

    setDeviceDrafts((prev) => ({
      ...prev,
      [locationId]: { name: '', ip: '', port: 502, description: '', brandId: '' }
    }));
    if (backendId) {
      setDeviceErrors((prev) => ({ ...prev, [locationId]: {} }));
      setAddingDeviceFor(null);
    }
  };

  // ── Inline edits from the tree ─────────────────────────────────────────
  // Each returns { ok } or { ok:false, error } so the editing node can show a
  // message and stay open on failure.

  // Rename a project. `draft` = { name }.
  const handleUpdateProject = async (projectId, draft) => {
    const name = String(draft.name ?? '').trim();
    if (!name) return { ok: false, error: 'Name is required' };
    const project = projects.find((p) => p.id === projectId);
    if (project?.backendId) {
      try { await projectsApi.update(project.backendId, { name }); }
      catch (err) { return { ok: false, error: `Update failed: ${err.message}` }; }
    }
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, name } : p)));
    return { ok: true };
  };

  // Rename a location (searches nested children too). `draft` = { name }.
  const handleUpdateLocation = async (projectId, locationId, draft) => {
    const name = String(draft.name ?? '').trim();
    if (!name) return { ok: false, error: 'Name is required' };

    // Find the location (top level or nested) to get its backendId.
    const findLoc = (locs) => {
      for (const l of locs) {
        if (l.id === locationId) return l;
        const nested = l.children ? findLoc(l.children) : null;
        if (nested) return nested;
      }
      return null;
    };
    const project = projects.find((p) => p.id === projectId);
    const loc = project ? findLoc(project.locations) : null;
    if (loc?.backendId) {
      try { await locationsApi.update(loc.backendId, { name }); }
      catch (err) { return { ok: false, error: `Update failed: ${err.message}` }; }
    }

    const renameIn = (locs) =>
      locs.map((l) =>
        l.id === locationId
          ? { ...l, name }
          : { ...l, children: l.children ? renameIn(l.children) : l.children }
      );
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, locations: renameIn(p.locations) } : p))
    );
    return { ok: true };
  };

  // Edit a device. `draft` = { name, ip, port, description, latitude, longitude }.
  const handleUpdateDevice = async (projectId, locationId, device, draft) => {
    const name = String(draft.name ?? '').trim();
    const ip = String(draft.ip ?? '').trim();
    const portValue = Number(draft.port);
    const description = String(draft.description ?? '').trim();
    const { latitude, longitude } = parseCoords(draft.latitude, draft.longitude);
    // brandId may be '' (unset) — send '' so the backend clears it.
    const brandId = draft.brandId === '' || draft.brandId == null ? null : Number(draft.brandId);

    if (!name) return { ok: false, error: 'Name is required' };
    if (!ip.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) return { ok: false, error: 'Valid IP required' };
    if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
      return { ok: false, error: 'Valid port (1-65535) required' };
    }
    if (String(draft.latitude ?? '').trim() !== '' && latitude === null) return { ok: false, error: 'Latitude must be -90..90' };
    if (String(draft.longitude ?? '').trim() !== '' && longitude === null) return { ok: false, error: 'Longitude must be -180..180' };

    if (device.backendId) {
      // Send latitude/longitude as '' when cleared so the backend nulls them.
      try {
        await devicesApi.update(device.backendId, {
          name, ip, port: portValue, description,
          latitude: latitude ?? '',
          longitude: longitude ?? '',
          brand_id: brandId ?? '',
        });
      }
      catch (err) { return { ok: false, error: `Update failed: ${err.message}` }; }
    }

    // Devices can live in a nested location, so rewrite recursively.
    const editIn = (locs) =>
      locs.map((l) => ({
        ...l,
        devices: (l.devices ?? []).map((d) =>
          d.id === device.id
            ? { ...d, name, ip, port: portValue, description, latitude, longitude,
                brandId, brandName: brands.find((b) => b.id === brandId)?.name ?? null }
            : d
        ),
        children: l.children ? editIn(l.children) : l.children,
      }));
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, locations: editIn(p.locations) } : p))
    );
    return { ok: true };
  };

  const handleDeleteProject = async (projectId) => {
    if (!confirm('Delete this project?')) return;
    const project = projects.find((p) => p.id === projectId);
    if (project?.backendId) {
      try {
        await projectsApi.remove(project.backendId);
      } catch (err) {
        setBackendError(`Backend delete failed, removed locally only: ${err.message}`);
      }
    }
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
      setActiveLocationId(null);
      setActiveDeviceId(null);
    }
  };

  const handleDeleteLocation = async (projectId, locationId) => {
    if (!confirm('Delete this location?')) return;
    // Recursive lookup + removal so sub-locations (nested) work too.
    const location = findLocationById(projects, locationId);
    if (location?.backendId) {
      try {
        await locationsApi.remove(location.backendId);
      } catch (err) {
        setBackendError(`Backend delete failed, removed locally only: ${err.message}`);
      }
    }
    const removeLocation = (locs) =>
      (locs || [])
        .filter((l) => l.id !== locationId)
        .map((l) => (l.children && l.children.length ? { ...l, children: removeLocation(l.children) } : l));
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, locations: removeLocation(p.locations) } : p
      )
    );
    if (activeLocationId === locationId) {
      setActiveLocationId(null);
      setActiveDeviceId(null);
    }
  };

  const handleDeleteDevice = async (projectId, locationId, deviceId) => {
    if (!confirm('Delete this device?')) return;

    // Find device to get its backendId (if any) for backend cleanup.
    // Search recursively — devices can live in nested sub-locations, not just
    // top-level ones. `undefined` = not found, `null` = found but no backendId.
    const findBackendId = (locs) => {
      for (const l of locs || []) {
        for (const d of l.devices || []) {
          if (d.id === deviceId) return d.backendId ?? null;
        }
        const nested = findBackendId(l.children);
        if (nested !== undefined) return nested;
      }
      return undefined;
    };
    let backendId;
    for (const p of projects) {
      backendId = findBackendId(p.locations);
      if (backendId !== undefined) break;
    }
    backendId = backendId ?? null;

    if (backendId) {
      try {
        await modbusApi.deleteDevice(backendId);
      } catch (err) {
        // Don't remove locally if the backend delete failed — otherwise the
        // device vanishes from the UI but comes back on the next reload.
        setBackendError(`Failed to delete device: ${err.message}`);
        return;
      }
    }

    // Remove the device from local state, descending into sub-locations too.
    const removeFromLocs = (locs) =>
      (locs || []).map((l) => ({
        ...l,
        devices: (l.devices || []).filter((d) => d.id !== deviceId),
        ...(l.children ? { children: removeFromLocs(l.children) } : {}),
      }));
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, locations: removeFromLocs(p.locations) } : p
      )
    );
    if (activeDeviceId === deviceId) setActiveDeviceId(null);
  };

  const handleConnectDevice = async (device) => {
    setDeviceConnectionErrors((prev) => ({ ...prev, [device.id]: '' }));
    setConnectingDeviceId(device.id);
    try {
      // request() throws on any non-2xx — if we reach the next line, connect succeeded.
      const result = device.backendId
        ? await modbusApi.connect(device.backendId)
        : await modbusApi.connect(null, device.ip, device.port);

      // Some backends return { success: false } with HTTP 200 as a soft-error.
      const softError = result != null && result.success === false;
      if (softError) {
        const msg = result.error || result.detail || result.message || 'Connection refused by server';
        setDeviceConnectionErrors((prev) => ({ ...prev, [device.id]: msg }));
        return;
      }

      setConnectedDeviceIds((prev) => new Set(prev).add(device.id));
      // Persist status to DB.
      if (device.backendId) {
        try {
          await devicesApi.update(device.backendId, {
            name: device.name,
            ip: device.ip,
            port: device.port ?? 502,
            status: 'online',
            ...(device.locationId != null ? { location_id: device.locationId } : {}),
          });
        } catch (e) { console.error('[connect] status update failed:', e.message); }
        // Stamp LAST_SEEN = SYSDATE via dedicated endpoint.
        try {
          await devicesApi.patchLastSeen(device.backendId);
        } catch (e) { console.error('[connect] last_seen update failed:', e.message); }
      }
    } catch (error) {
      setDeviceConnectionErrors((prev) => ({
        ...prev,
        [device.id]: error?.message || 'Connection failed'
      }));
    } finally {
      setConnectingDeviceId(null);
    }
  };

  const handleDisconnectDevice = async (deviceId) => {
    setConnectingDeviceId(deviceId);
    try {
      const dev = devicesRef.current.find((d) => d.id === deviceId) || {};
      const target = dev.backendId
        ? { deviceId: dev.backendId }
        : (dev.ip ? { ip: dev.ip, port: dev.port } : {});

      // request() throws on non-2xx — reaching next line means success.
      const result = await modbusApi.disconnect(target);

      const softError = result != null && result.success === false;
      if (softError) {
        setDeviceConnectionErrors((prev) => ({
          ...prev,
          [deviceId]: result.error || result.message || 'Disconnect failed'
        }));
        return;
      }

      setConnectedDeviceIds((prev) => { const next = new Set(prev); next.delete(deviceId); return next; });
      // Persist offline status to DB.
      if (dev.backendId) {
        try {
          await devicesApi.update(dev.backendId, {
            name: dev.name,
            ip: dev.ip,
            port: dev.port ?? 502,
            status: 'offline',
            ...(dev.locationId != null ? { location_id: dev.locationId } : {}),
          });
        } catch { /* best-effort */ }
      }
    } catch (error) {
      setDeviceConnectionErrors((prev) => ({
        ...prev,
        [deviceId]: error?.message || 'Disconnect failed'
      }));
    } finally {
      setConnectingDeviceId(null);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Banners */}
      {backendError && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {backendError}
          </div>
          <button onClick={() => setBackendError('')} className="text-xs text-amber-400 hover:text-amber-200 underline flex-shrink-0">dismiss</button>
        </div>
      )}
      {backendOnline && !backendError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Connected to backend — changes are saved to the database.
        </div>
      )}

      {flatMode && (
        <FlatDeviceView
          devices={flatDevices.filter(shouldShowDevice)}
          activeDeviceId={activeDeviceId}
          setActiveDeviceId={setActiveDeviceId}
          selectedDevice={flatSelectedDevice}
          connectedDeviceIds={connectedDeviceIds}
          connectingDeviceId={connectingDeviceId}
          deviceConnectionErrors={deviceConnectionErrors}
          onConnect={handleConnectDevice}
          onDisconnect={handleDisconnectDevice}
          canConnect={hasPermission('device.connect') && canUseElement('device.connect')}
        />
      )}

      {!flatMode && (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sidebar */}
        <ProjectsSidebar
          projects={projects}
          shouldShowDevice={shouldShowDevice}
          projectName={projectName}
          setProjectName={setProjectName}
          onCreateProject={handleCreateProject}
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
          locationInputs={locationInputs}
          setLocationInputs={setLocationInputs}
          onCreateLocation={handleCreateLocation}
          onDeleteProject={handleDeleteProject}
          onDeleteLocation={handleDeleteLocation}
          onDeleteDevice={handleDeleteDevice}
          onUpdateProject={handleUpdateProject}
          onUpdateLocation={handleUpdateLocation}
          onUpdateDevice={handleUpdateDevice}
          connectedDeviceIds={connectedDeviceIds}
          addingDeviceFor={addingDeviceFor}
          startAddDevice={startAddDevice}
          cancelAddDevice={cancelAddDevice}
          deviceDrafts={deviceDrafts}
          deviceErrors={deviceErrors}
          updateDeviceDraft={updateDeviceDraft}
          onCreateDevice={handleCreateDevice}
          brands={brands}
          onCreateSubLocation={handleCreateSubLocation}
          subLocationInputs={subLocationInputs}
          setSubLocationInputs={setSubLocationInputs}
        />

        {/* Main panel */}
        <section className="lg:col-span-3 rounded-2xl bg-[#1a1d27] border border-white/5 p-6 min-h-[400px]">

          {/* Empty state */}
          {!selection.project && (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-200 mb-2">Projects</h1>
              <p className="text-gray-500 text-sm max-w-sm leading-relaxed">
                Create a project in the sidebar, add locations, then add devices under each location.
                Click a device to see its fuel reading and start/stop controls.
              </p>
            </div>
          )}

          {/* Project selected */}
          {selection.project && !selection.location && (
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold mb-1">Project</p>
              <h1 className="text-2xl font-bold text-gray-100 mb-1">{selection.project.name}</h1>
              <p className="text-sm text-gray-500">
                {selection.project.locations.length} location{selection.project.locations.length !== 1 ? 's' : ''} — select one from the sidebar to manage devices.
              </p>
            </div>
          )}

          {/* Location selected */}
          {selection.project && selection.location && !selection.device && (
            <div>
              <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                <span>{selection.project.name}</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>{selection.location.name}</span>
              </div>
              <h2 className="text-xl font-bold text-gray-100 mb-5">{selection.location.name}</h2>

              {selection.location.devices.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                  </div>
                  <p className="text-gray-400 font-medium">No devices yet</p>
                  <p className="text-gray-600 text-sm mt-1">Use the sidebar to add a device.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {selection.location.devices.filter(shouldShowDevice).map((device) => {
                    const isConnected = connectedDeviceIds.has(device.id);
                    const isBusy = connectingDeviceId === device.id;
                    const connErr = deviceConnectionErrors[device.id];
                    return (
                      <div
                        key={device.id}
                        className={`rounded-2xl border p-4 flex flex-col gap-3 transition-all duration-200
                          ${isConnected
                            ? 'bg-emerald-500/5 border-emerald-500/25 shadow-lg shadow-emerald-900/10'
                            : 'bg-[#0f1117] border-white/8 hover:border-white/15'
                          }`}
                      >
                        {/* Device header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-700'}`} />
                            <h3 className="text-sm font-semibold text-gray-200 truncate">{device.name}</h3>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0
                            ${isConnected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-gray-500'}`}>
                            {isConnected ? 'CONNECTED' : 'OFFLINE'}
                          </span>
                        </div>

                        {/* IP / Port */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-600 w-8">IP</span>
                            <span className="font-mono text-gray-300">{device.ip}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-600 w-8">Port</span>
                            <span className="font-mono text-gray-300">{device.port}</span>
                          </div>
                        </div>

                        {device.description && (
                          <p className="text-xs text-gray-600 line-clamp-2">{device.description}</p>
                        )}

                        {connErr && (
                          <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5">
                            {connErr}
                          </p>
                        )}

                        {/* Actions */}
                        <div className="mt-auto flex gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveDeviceId(device.id)}
                            className="flex-1 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                          >
                            Details
                          </button>
                          <Can feature="button.device.connect" element="device.connect">
                            {isConnected ? (
                              <button
                                type="button"
                                onClick={() => handleDisconnectDevice(device.id)}
                                disabled={isBusy}
                                className="px-3 py-2 text-xs font-semibold rounded-xl bg-red-600/80 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                              >
                                {isBusy ? '…' : 'Disconnect'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleConnectDevice(device)}
                                disabled={isBusy}
                                className="px-3 py-2 text-xs font-semibold rounded-xl bg-emerald-600/80 text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                              >
                                {isBusy ? '…' : 'Connect'}
                              </button>
                            )}
                          </Can>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Device selected */}
          {selection.project && selection.location && selection.device && (
            <div className="space-y-5">
              {/* Breadcrumb */}
              <div>
                <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-2">
                  <span>{selection.project.name}</span>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span>{selection.location.name}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-100">{selection.device.name}</h2>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                      <span className="font-mono">{selection.device.ip}</span>
                      <span className="text-gray-700">:</span>
                      <span className="font-mono">{selection.device.port}</span>
                    </div>
                    {selection.device.description && (
                      <p className="text-sm text-gray-600 mt-1">{selection.device.description}</p>
                    )}
                  </div>

                  <Can feature="button.device.connect" element="device.connect">
                    {connectedDeviceIds.has(selection.device.id) ? (
                      <button
                        onClick={() => handleDisconnectDevice(selection.device.id)}
                        disabled={connectingDeviceId === selection.device.id}
                        className="flex-shrink-0 px-4 py-2 rounded-xl bg-red-600/80 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
                      >
                        {connectingDeviceId === selection.device.id ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnectDevice(selection.device)}
                        disabled={connectingDeviceId === selection.device.id}
                        className="flex-shrink-0 px-4 py-2 rounded-xl bg-emerald-600/80 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                      >
                        {connectingDeviceId === selection.device.id ? 'Connecting…' : 'Connect'}
                      </button>
                    )}
                  </Can>
                </div>

                {deviceConnectionErrors[selection.device.id] && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {deviceConnectionErrors[selection.device.id]}
                  </div>
                )}
              </div>

              {/* Location */}
              <DeviceLocationCard device={selection.device} />

              {/* Fuel + Controls */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <FuelGauge isConnected={connectedDeviceIds.has(selection.device.id)}
                  target={{ deviceId: selection.device.backendId, ip: selection.device.ip, port: selection.device.port }} />
                <ControlButtons isConnected={connectedDeviceIds.has(selection.device.id)}
                  target={{ deviceId: selection.device.backendId, ip: selection.device.ip, port: selection.device.port }} />
              </div>
            </div>
          )}
        </section>
      </div>
      )}
    </div>
  );
}

// Device location card — shows the device's GPS coordinates and links to the
// map (focused on this device) to view or set them.
function DeviceLocationCard({ device }) {
  const lat = device?.latitude;
  const lng = device?.longitude;
  const has = typeof lat === 'number' && typeof lng === 'number';
  const to = device?.backendId != null ? `/map?device=${device.backendId}` : '/map';
  return (
    <div className="rounded-2xl bg-[#0f1117] border border-white/8 p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
          </svg>
        </span>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-600 mb-0.5">Location</p>
          <p className="text-sm text-gray-200 font-mono">
            {has ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'No GPS coordinates set'}
          </p>
        </div>
      </div>
      <Link
        to={to}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-cyan-500/20 text-gray-200 hover:text-cyan-200 text-sm font-medium transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        {has ? 'View on map' : 'Set on map'}
      </Link>
    </div>
  );
}

// ── Flat device view (device.read without project.read) ───────────────────
// A plain list of devices the user can open and connect to, with no project or
// location chrome. Fed by GET /devices.
function FlatDeviceView({
  devices,
  activeDeviceId,
  setActiveDeviceId,
  selectedDevice,
  connectedDeviceIds,
  connectingDeviceId,
  deviceConnectionErrors,
  onConnect,
  onDisconnect,
  canConnect,
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold mb-1">Devices</p>
        <h1 className="text-2xl font-bold text-gray-100">Your devices</h1>
        <p className="text-sm text-gray-500 mt-1">
          {devices.length} device{devices.length !== 1 ? 's' : ''} you can access.
        </p>
      </div>

      {devices.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center rounded-2xl bg-[#1a1d27] border border-white/5">
          <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
            <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <p className="text-gray-400 font-medium">No devices available</p>
          <p className="text-gray-600 text-sm mt-1">No devices are currently assigned to you.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {devices.map((device) => {
            const isConnected = connectedDeviceIds.has(device.id);
            const isBusy = connectingDeviceId === device.id;
            const connErr = deviceConnectionErrors[device.id];
            const isActive = activeDeviceId === device.id;
            return (
              <div
                key={device.id}
                className={`rounded-2xl border p-4 flex flex-col gap-3 transition-all duration-200
                  ${isConnected
                    ? 'bg-emerald-500/5 border-emerald-500/25 shadow-lg shadow-emerald-900/10'
                    : isActive
                      ? 'bg-[#0f1117] border-indigo-500/30'
                      : 'bg-[#0f1117] border-white/8 hover:border-white/15'
                  }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-700'}`} />
                    <h3 className="text-sm font-semibold text-gray-200 truncate">{device.name}</h3>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0
                    ${isConnected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-gray-500'}`}>
                    {isConnected ? 'CONNECTED' : 'OFFLINE'}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-600 w-8">IP</span>
                    <span className="font-mono text-gray-300">{device.ip}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-600 w-8">Port</span>
                    <span className="font-mono text-gray-300">{device.port}</span>
                  </div>
                </div>

                {device.description && (
                  <p className="text-xs text-gray-600 line-clamp-2">{device.description}</p>
                )}

                {connErr && (
                  <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5">
                    {connErr}
                  </p>
                )}

                <div className="mt-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveDeviceId(device.id)}
                    className="flex-1 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                  >
                    Details
                  </button>
                  {canConnect && (
                    isConnected ? (
                      <button
                        type="button"
                        onClick={() => onDisconnect(device.id)}
                        disabled={isBusy}
                        className="px-3 py-2 text-xs font-semibold rounded-xl bg-red-600/80 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                      >
                        {isBusy ? '…' : 'Disconnect'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onConnect(device)}
                        disabled={isBusy}
                        className="px-3 py-2 text-xs font-semibold rounded-xl bg-emerald-600/80 text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                      >
                        {isBusy ? '…' : 'Connect'}
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected device detail: fuel + controls */}
      {selectedDevice && (
        <section className="rounded-2xl bg-[#1a1d27] border border-white/5 p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-100">{selectedDevice.name}</h2>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                <span className="font-mono">{selectedDevice.ip}</span>
                <span className="text-gray-700">:</span>
                <span className="font-mono">{selectedDevice.port}</span>
              </div>
            </div>
          </div>
          <DeviceLocationCard device={selectedDevice} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <FuelGauge isConnected={connectedDeviceIds.has(selectedDevice.id)}
              target={{ deviceId: selectedDevice.backendId, ip: selectedDevice.ip, port: selectedDevice.port }} />
            <ControlButtons isConnected={connectedDeviceIds.has(selectedDevice.id)}
              target={{ deviceId: selectedDevice.backendId, ip: selectedDevice.ip, port: selectedDevice.port }} />
          </div>
        </section>
      )}
    </div>
  );
}
