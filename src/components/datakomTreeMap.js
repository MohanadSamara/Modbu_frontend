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
export function buildSidebarProjects(tree, overrides = {}) {
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

  // Each root Datakom node becomes its OWN top-level project (no "Datakom
  // Rainbow" wrapper). A node's sub-nodes render as locations; its direct
  // devices render right under the project. readOnly so the merged sidebar
  // shows no create/delete controls; names are locally overridable (keyed by
  // the node id, same as the rename endpoint expects).
  const projects = (tree.roots || []).map((node) => {
    const id = `dk-node-${node.id}`;
    const cloudName = node.name || `Node ${node.id}`;
    return {
      id,
      name: overrides[id] || cloudName,
      cloudName,
      readOnly: true,
      datakomProject: true,
      locations: (node.children || []).map(mapNode),
      devices: (node.devices || []).map(mapDevice),
    };
  });

  // Devices with no Datakom node → their own project so they're still reachable.
  if (tree.ungrouped && tree.ungrouped.length) {
    const id = 'dk-node-ungrouped';
    projects.push({
      id,
      name: overrides[id] || 'Ungrouped',
      cloudName: 'Ungrouped',
      readOnly: true,
      datakomProject: true,
      locations: [],
      devices: tree.ungrouped.map(mapDevice),
    });
  }

  return { projects, deviceIndex, onlineIds };
}
