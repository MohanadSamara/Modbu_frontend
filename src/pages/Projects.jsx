import { useEffect, useMemo, useState } from 'react';
import FuelGauge from '../components/FuelGauge.jsx';
import ControlButtons from '../components/ControlButtons.jsx';
import ProjectsSidebar from '../components/ProjectsSidebar.jsx';
import modbusApi from '../api/modbus.js';
import { projectsApi, locationsApi, devicesApi } from '../api/projects.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { defaultSettings } from '../api/settings.js';

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    description: pick(d, 'description', 'DESCRIPTION') ?? ''
  }));
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
    const isCurrentlyConnected = connectedDeviceId === device.id;
    
    // Check device status from database
    const deviceOnline = device.status === 'online';
    
    // Debug log for troubleshooting
    console.log('[shouldShowDevice]', device.name, {
      showOffline,
      isCurrentlyConnected,
      deviceOnline,
      deviceStatus: device.status
    });
    
    // FIXED: Proper filtering logic
    // If showing offline devices is enabled (true), show all devices
    if (showOffline === true) {
      console.log('[shouldShowDevice]', device.name, '-> SHOW (showOffline=true)');
      return true;
    }
    // Otherwise (showOffline = false), only show connected or explicitly online devices
    const shouldShow = isCurrentlyConnected || deviceOnline;
    console.log('[shouldShowDevice]', device.name, '->', shouldShow ? 'SHOW' : 'HIDE', '(showOffline=false)');
    return shouldShow;
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

  const [connectedDeviceId, setConnectedDeviceId] = useState(null);
  const [connectingDeviceId, setConnectingDeviceId] = useState(null);
  const [deviceConnectionErrors, setDeviceConnectionErrors] = useState({});

  const [backendError, setBackendError] = useState('');
  const [backendOnline, setBackendOnline] = useState(false);

  // On mount: load projects tree AND restore any existing Modbus session.
  // This means switching tabs never triggers a new TCP connect — the backend
  // keeps the session alive and we just read its state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Load projects tree from backend
      try {
        const hydrated = await loadProjectsTreeFromBackend();
        if (cancelled) return;
        setProjects(hydrated);
        setBackendOnline(true);
        setBackendError('');

        // 2. Restore connected device from server-side session
        try {
          const session = await modbusApi.getSession();
          if (cancelled) return;

          if (session?.connected && session?.deviceId) {
            // Find the frontend device object whose backendId matches the session
            for (const project of hydrated) {
              for (const location of project.locations) {
                const found = location.devices.find(
                  (d) => String(d.backendId) === String(session.deviceId)
                );
                if (found) {
                  setConnectedDeviceId(found.id);
                  break;
                }
              }
            }
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
  }, []);

  // Poll session every 15 s so the UI reflects auto-reconnect events
  // (e.g. backend reconnected after a network blip while user was on another tab)
  useEffect(() => {
    const poll = async () => {
      try {
        const session = await modbusApi.getSession();
        if (!session?.connected) {
          // Backend is no longer connected — clear UI if we thought we were
          setConnectedDeviceId((prev) => {
            if (prev === null) return null;
            return null;
          });
          return;
        }
        if (!session.deviceId) return;
        // Re-match in case projects reloaded
        setProjects((currentProjects) => {
          for (const project of currentProjects) {
            for (const location of project.locations) {
              const found = location.devices.find(
                (d) => String(d.backendId) === String(session.deviceId)
              );
              if (found) {
                setConnectedDeviceId((prev) => (prev === found.id ? prev : found.id));
                break;
              }
            }
          }
          return currentProjects; // no state change, just side-effect
        });
      } catch {
        // Backend unreachable — leave state as-is
      }
    };

    const id = setInterval(poll, 15_000);
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
    
    // Find the parent location in the projects tree
    const parentLocation = findLocationById(projects, parentLocationId);
    let backendId = null;
    
    if (parentLocation?.backendId && parentLocation?.projectBackendId) {
      try {
        // Create NEW sub-location by calling locationsApi.create with parent_id
        await locationsApi.create(parentLocation.projectBackendId, { 
          name, 
          parent_id: parentLocation.backendId 
        });
        // Fetch updated locations to get the new location's ID
        const latest = await locationsApi.listByProject(parentLocation.projectBackendId);
        const found = (latest ?? []).find(
          (l) => String(l?.name ?? l?.NAME ?? '').toLowerCase() === name.toLowerCase() &&
                 (l?.parent_id ?? l?.PARENT_ID) == parentLocation.backendId
        );
        backendId = found?.id ?? found?.ID ?? null;
      } catch (err) {
        setBackendError(`Sub-location saved locally only: ${err.message}`);
      }
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
      [locationId]: prev[locationId] ?? { name: '', ip: '', port: 502, description: '' }
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
    const input = deviceDrafts[locationId] ?? { name: '', ip: '', port: 502, description: '' };
    const name = String(input.name ?? '').trim();
    const ip = String(input.ip ?? '').trim();
    const portValue = Number(input.port);
    const description = String(input.description ?? '').trim();

    const errors = {};
    if (!name) errors.name = 'Name is required';
    if (!ip.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) errors.ip = 'Valid IP required';
    if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
      errors.port = 'Valid port (1-65535) required';
    }
    if (Object.keys(errors).length > 0) {
      setDeviceErrors((prev) => ({ ...prev, [locationId]: errors }));
      return;
    }

    // Persist device to backend DB so it gets a real numeric device_id
    // (needed by /api/modbus/connect?device_id=...). Fall back to local-only
    // device if the backend is unreachable.
    // If the owning location has a backendId, send it so the device row is
    // correctly linked to its location in the DB.
    const ownerLocation = projects
      .find((p) => p.id === projectId)
      ?.locations.find((l) => l.id === locationId);
    let backendId = null;
    try {
      await devicesApi.create({
        location_id: ownerLocation?.backendId ?? null,
        name,
        ip,
        port: portValue,
        description,
        status: 'offline'
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
      description
    };

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          locations: project.locations.map((location) =>
            location.id === locationId
              ? { ...location, devices: [...location.devices, device] }
              : location
          )
        };
      })
    );

    setDeviceDrafts((prev) => ({
      ...prev,
      [locationId]: { name: '', ip: '', port: 502, description: '' }
    }));
    if (backendId) {
      setDeviceErrors((prev) => ({ ...prev, [locationId]: {} }));
      setAddingDeviceFor(null);
    }
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
    const location = projects
      .find((p) => p.id === projectId)
      ?.locations.find((l) => l.id === locationId);
    if (location?.backendId) {
      try {
        await locationsApi.remove(location.backendId);
      } catch (err) {
        setBackendError(`Backend delete failed, removed locally only: ${err.message}`);
      }
    }
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, locations: p.locations.filter((l) => l.id !== locationId) }
          : p
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
    let backendId = null;
    for (const p of projects) {
      for (const l of p.locations) {
        for (const d of l.devices) {
          if (d.id === deviceId) {
            backendId = d.backendId ?? null;
          }
        }
      }
    }
    if (backendId) {
      try {
        await modbusApi.deleteDevice(backendId);
      } catch (err) {
        console.warn('Backend device delete failed:', err.message);
      }
    }

    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          locations: p.locations.map((l) =>
            l.id === locationId
              ? { ...l, devices: l.devices.filter((d) => d.id !== deviceId) }
              : l
          )
        };
      })
    );
    if (activeDeviceId === deviceId) setActiveDeviceId(null);
  };

  const handleConnectDevice = async (device) => {
    setDeviceConnectionErrors((prev) => ({ ...prev, [device.id]: '' }));
    setConnectingDeviceId(device.id);
    try {
      // Prefer backend device_id (numeric, stored in DB). Fall back to IP/port.
      const result = device.backendId
        ? await modbusApi.connect(device.backendId)
        : await modbusApi.connect(null, device.ip, device.port);
      if (result?.success) {
        setConnectedDeviceId(device.id);
        return;
      }
      const message =
        result?.error || result?.detail || result?.message || 'Connection refused by server';
      setDeviceConnectionErrors((prev) => ({ ...prev, [device.id]: message }));
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
      const result = await modbusApi.disconnect();
      if (result?.success) {
        setConnectedDeviceId((prev) => (prev === deviceId ? null : prev));
      } else {
        setDeviceConnectionErrors((prev) => ({
          ...prev,
          [deviceId]: result?.error || result?.message || 'Disconnect failed'
        }));
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
          connectedDeviceId={connectedDeviceId}
          addingDeviceFor={addingDeviceFor}
          startAddDevice={startAddDevice}
          cancelAddDevice={cancelAddDevice}
          deviceDrafts={deviceDrafts}
          deviceErrors={deviceErrors}
          updateDeviceDraft={updateDeviceDraft}
          onCreateDevice={handleCreateDevice}
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
                    const isConnected = connectedDeviceId === device.id;
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

                  {connectedDeviceId === selection.device.id ? (
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

              {/* Fuel + Controls */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <FuelGauge isConnected={connectedDeviceId === selection.device.id} />
                <ControlButtons isConnected={connectedDeviceId === selection.device.id} />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
