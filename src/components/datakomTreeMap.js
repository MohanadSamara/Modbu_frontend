// ============================================================================
// datakomTreeMap.js — map the Datakom Rainbow cloud tree ({ roots, ungrouped })
// into the shape <ProjectsSidebar> renders. Shared by the standalone
// <DatakomProjectTree> and the merged tree on the Projects page.
//
// Everything is wrapped under a single synthetic, read-only "Datakom Rainbow"
// project so that every cloud node — including roots — renders as a location
// (projects don't show devices directly, locations do). Returns the mapped
// projects plus lookups for the details panel (device by leaf id) and live
// status (online leaf ids).
// ============================================================================

// `overrides` ({ [nodeId]: customName }) lets a locally-stored name replace the
// cloud node name (see datakom_node_names on the backend). The `cloudName` is
// kept on each mapped node so the rename UI can show what the portal calls it.
// `containers` ({ [nodeId]: containerName }) groups root node-projects under
// synthetic local container folders (datakom_node_containers on the backend).
export function buildSidebarProjects(tree, overrides = {}, containers = {}) {
  const deviceIndex = new Map(); // leaf id → device summary (has .did)
  const onlineIds = new Set();   // leaf ids with a live reading

  const mapDevice = (dev) => {
    const id = `dk-dev-${dev.did}`;
    deviceIndex.set(id, dev);
    if (dev.online) onlineIds.add(id);
    return { id, name: dev.sid || `Device ${dev.did}`, backendId: null, datakomDid: dev.did };
  };

  const mapNode = (node) => {
    const id = `dk-node-${node.id}`;
    const cloudName = node.name || `Node ${node.id}`;
    return {
      id,
      name: overrides[id] || cloudName,
      cloudName,
      children: (node.children || []).map(mapNode),
      devices: (node.devices || []).map(mapDevice),
    };
  };

  // Build one project object per root Datakom node (sub-nodes → locations,
  // direct devices → under the project). readOnly + datakomProject so the
  // merged sidebar shows no create/delete controls; names are locally
  // overridable (keyed by the node id).
  const buildNodeProject = (node) => {
    const id = `dk-node-${node.id}`;
    const cloudName = node.name || `Node ${node.id}`;
    return {
      id,
      name: overrides[id] || cloudName,
      cloudName,
      readOnly: true,
      datakomProject: true,
      container: containers[id] || null, // which local folder it belongs to
      locations: (node.children || []).map(mapNode),
      devices: (node.devices || []).map(mapDevice),
    };
  };

  const nodeProjects = (tree.roots || []).map(buildNodeProject);
  if (tree.ungrouped && tree.ungrouped.length) {
    const id = 'dk-node-ungrouped';
    nodeProjects.push({
      id,
      name: overrides[id] || 'Ungrouped',
      cloudName: 'Ungrouped',
      readOnly: true,
      datakomProject: true,
      container: containers[id] || null,
      locations: [],
      devices: tree.ungrouped.map(mapDevice),
    });
  }

  // Group node-projects that carry a container assignment under synthetic
  // container folders; the rest stay top-level. A container renders its members
  // as childProjects (reusing the sidebar's nested-project rendering).
  const makeContainer = (cname) => ({
    id: `dk-container-${cname}`,
    name: cname,
    readOnly: true,
    datakomProject: true,
    datakomContainer: true,
    locations: [],
    devices: [],
    childProjects: [],
  });
  const containerByName = new Map();
  // Register EVERY folder name that exists (including empty folders created via
  // the "New folder" button, stored as marker rows) so empty folders still show.
  for (const v of Object.values(containers)) {
    const cname = (v || '').trim();
    if (cname && !containerByName.has(cname)) containerByName.set(cname, makeContainer(cname));
  }
  const topLevel = [];
  for (const np of nodeProjects) {
    const cname = (np.container || '').trim();
    if (cname) {
      if (!containerByName.has(cname)) containerByName.set(cname, makeContainer(cname));
      containerByName.get(cname).childProjects.push(np);
    } else {
      topLevel.push(np);
    }
  }

  const projects = [...containerByName.values(), ...topLevel];
  return { projects, deviceIndex, onlineIds };
}
