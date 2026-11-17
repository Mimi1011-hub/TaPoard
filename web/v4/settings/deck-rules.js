// Layout checks and the automatic re-placing used by the settings editor.
function integerBox(value) {
  return ['row', 'column', 'width', 'height'].every((key) => Number.isInteger(value[key]));
}

export function validOrientation(state, orientation, ids) {
  if (
    !orientation ||
    orientation.columns < 2 ||
    orientation.columns > 8 ||
    orientation.rows < 2 ||
    orientation.rows > 8 ||
    !orientation.pages.length ||
    orientation.pages.length > 40 ||
    state.countItems(orientation) > 40
  )
    return false;
  return orientation.pages.every((page, pageIndex) => {
    if (!page || !Array.isArray(page.items) || String(page.name || '').length > 20) return false;
    const used = new Set();
    for (const target of ['speaker', 'mic']) {
      const fader = state.effectiveFader(orientation, pageIndex, target);
      if (
        fader &&
        (!integerBox(fader) ||
          !state.faderSizeAllowed(fader) ||
          !state.inside(fader, orientation) ||
          state.cells(fader).some((cell) => used.has(cell)))
      )
        return false;
      if (fader) state.cells(fader).forEach((cell) => used.add(cell));
    }
    return page.items.every((item) => {
      if (
        !integerBox(item) ||
        (item.id && ids.has(item.id)) ||
        !state.sizeAllowed(item) ||
        !state.inside(item, orientation) ||
        state.cells(item).some((cell) => used.has(cell))
      )
        return false;
      if (item.id) ids.add(item.id);
      state.cells(item).forEach((cell) => used.add(cell));
      return true;
    });
  });
}

export function reflowOrientation(state, orientation, apply) {
  const displaced = [], overflowPages = new Set(), faderPages = new Set();
  for (let pageIndex = 0; pageIndex < orientation.pages.length; pageIndex += 1) {
    const page = orientation.pages[pageIndex],
      used = new Set();
    for (const target of ['speaker', 'mic']) {
      const fader = state.effectiveFader(orientation, pageIndex, target);
      if (fader && !state.inside(fader, orientation)) {
        faderPages.add(pageIndex + 1);
        overflowPages.add(pageIndex + 1);
      } else if (fader) state.cells(fader).forEach((cell) => used.add(cell));
    }
    const kept = [];
    page.items.forEach((item) => {
      const fits = state.sizeAllowed(item) && state.inside(item, orientation) && state.cells(item).every((cell) => !used.has(cell));
      if (fits) {
        kept.push(item);
        state.cells(item).forEach((cell) => used.add(cell));
      } else {
        displaced.push({ item, page: pageIndex });
        overflowPages.add(pageIndex + 1);
      }
    });
    page.items = kept;
  }
  const details = () => ({
    count: displaced.length,
    pages: Array.from(overflowPages),
    faderPages: Array.from(faderPages),
  });
  if (faderPages.size) return { error: true, ...details() };
  if (!apply) return details();
  for (const value of displaced) {
    let placed = false;
    for (let page = value.page; page < orientation.pages.length && !placed; page += 1) {
      const space = state.firstSpace(orientation, page, value.item);
      if (space) {
        Object.assign(value.item, space);
        orientation.pages[page].items.push(value.item);
        placed = true;
      }
    }
    while (!placed && orientation.pages.length < 40) {
      orientation.pages.push({ name: '', faders: { speakerHidden: true, micHidden: true }, items: [] });
      const page = orientation.pages.length - 1,
        space = state.firstSpace(orientation, page, value.item);
      if (space) {
        Object.assign(value.item, space);
        orientation.pages[page].items.push(value.item);
        placed = true;
      }
    }
    if (!placed) return { error: true, ...details() };
  }
  return details();
}
