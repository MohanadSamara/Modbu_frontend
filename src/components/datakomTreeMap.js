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

  const locations = (tree.roots || []).map(mapNode);
  if (tree.ungrouped && tree.ungrouped.length) {
    locations.push({
      id: 'dk-node-ungrouped',
      name: overrides['dk-node-ungrouped'] || 'Ungrouped',
      cloudName: 'Ungrouped',
      children: [],
      devices: tree.ungrouped.map(mapDevice),
    });
  }

  // readOnly so it can be merged into the editable Projects sidebar without
  // exposing create/rename/delete controls on cloud-sourced nodes.
  const projects = [{ id: 'dk-root', name: 'Datakom Rainbow', readOnly: true, locations }];
  return { projects, deviceIndex, onlineIds };
}
