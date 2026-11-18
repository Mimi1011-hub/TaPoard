const OTHER = 'other';

function bucket(icons, titleOf, order) {
  const buckets = new Map();
  icons.forEach((icon) => {
    const title = titleOf(icon) || OTHER;
    if (!buckets.has(title)) buckets.set(title, []);
    buckets.get(title).push(icon);
  });
  const known = order.filter((title) => title !== OTHER);
  const extras = [...buckets.keys()].filter((title) => title !== OTHER && !known.includes(title));
  return [...known, ...extras, OTHER]
    .filter((title) => buckets.has(title))
    .map((title) => ({ title, icons: buckets.get(title) }));
}

export function packSections(icons, presetGroups, keyOf) {
  const values = Array.isArray(icons) ? icons : [];
  const counts = new Map();
  values.forEach((icon) => {
    if (icon.group) counts.set(icon.group, (counts.get(icon.group) || 0) + 1);
  });
  const repeated = new Set([...counts].filter(([, count]) => count >= 2).map(([name]) => name));
  if (values.length && values.filter((icon) => repeated.has(icon.group)).length / values.length >= 0.6) {
    return bucket(values, (icon) => repeated.has(icon.group) ? icon.group : OTHER, [...repeated, OTHER]);
  }
  const mapped = values.map((icon) => keyOf(icon));
  if (values.length > 120 && mapped.filter(Boolean).length / values.length < 0.3) {
    const letter = (icon) => {
      const first = String(icon.name || '').trim().charAt(0).toUpperCase();
      return /[A-Z]/.test(first) ? first : /[0-9]/.test(first) ? '0-9' : OTHER;
    };
    return bucket(values, letter, ['0-9', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', OTHER]);
  }
  const groupByKey = new Map();
  presetGroups.forEach(([name, entries]) => entries.forEach(([key]) => groupByKey.set(key, name)));
  return bucket(values, (icon) => groupByKey.get(keyOf(icon)) || OTHER, [...new Set(groupByKey.values()), OTHER]);
}
