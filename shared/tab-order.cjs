function clone(items) {
  return items.map((item) => ({ ...item }));
}

function pinnedFirst(list) {
  return [...list.filter((item) => item.pinned), ...list.filter((item) => !item.pinned)];
}

function placeTab(items, id, beforeId = null) {
  const list = clone(items);
  const from = list.findIndex((item) => item.id === id);
  if (from < 0) return list;
  const [moved] = list.splice(from, 1);
  if (beforeId == null) {
    const last = list[list.length - 1];
    moved.pinned = false;
    moved.groupId = last && !last.pinned ? (last.groupId || null) : null;
    list.push(moved);
    return pinnedFirst(list);
  }
  const index = list.findIndex((item) => item.id === beforeId);
  if (index < 0) {
    list.push(moved);
    return pinnedFirst(list);
  }
  const target = list[index];
  moved.pinned = !!target.pinned;
  moved.groupId = target.pinned ? null : (target.groupId || null);
  list.splice(index, 0, moved);
  return pinnedFirst(list);
}

function placeInGroup(items, id, groupId) {
  const list = clone(items);
  const from = list.findIndex((item) => item.id === id);
  if (from < 0) return list;
  const [moved] = list.splice(from, 1);
  moved.pinned = false;
  moved.groupId = groupId;
  let insertAt = list.length;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (!list[i].pinned && list[i].groupId === groupId) {
      insertAt = i + 1;
      break;
    }
  }
  list.splice(insertAt, 0, moved);
  return pinnedFirst(list);
}

function displayItems(items) {
  const pinned = items.filter((item) => item.pinned);
  const rest = items.filter((item) => !item.pinned);
  const emitted = new Set();
  const body = [];
  for (const item of rest) {
    if (emitted.has(item.id)) continue;
    if (item.groupId) {
      const members = rest.filter((candidate) => candidate.groupId === item.groupId);
      for (const member of members) emitted.add(member.id);
      body.push({ type: 'group', groupId: item.groupId, tabs: members });
    } else {
      emitted.add(item.id);
      body.push({ type: 'tab', tab: item });
    }
  }
  return { pinned, body };
}

module.exports = { placeTab, placeInGroup, displayItems, pinnedFirst };
