const copy = (value) => JSON.parse(JSON.stringify(value));
export class FaderEditor {
  constructor(editor) { this.editor = editor; }
  move(orientationName, page, target, row, column) {
    return this.editor.change((deck) => { const orientation = this.editor.orientation(orientationName, deck), pageValue = orientation.pages[page]; if (!pageValue || !['speaker', 'mic'].includes(target)) return false; const effective = this.editor.effectiveFader(orientation, page, target); pageValue.faders = pageValue.faders || { speaker: null, mic: null, speakerHidden: false, micHidden: false }; pageValue.faders[target] = Object.assign({}, effective || orientation.faders[target], { row, column, off: undefined }); pageValue.faders[`${target}Hidden`] = false; });
  }
  canMove(orientationName, page, target, row, column) {
    const candidate = copy(this.editor.deck), orientation = this.editor.orientation(orientationName, candidate), pageValue = orientation.pages[page]; if (!pageValue || !['speaker', 'mic'].includes(target)) return false; const effective = this.editor.effectiveFader(orientation, page, target); pageValue.faders = pageValue.faders || { speaker: null, mic: null, speakerHidden: false, micHidden: false }; pageValue.faders[target] = Object.assign({}, effective || orientation.faders[target], { row, column, off: undefined }); pageValue.faders[`${target}Hidden`] = false; return this.editor.validateDeck(candidate);
  }
  update(orientationName, page, target, values) {
    return this.editor.change((deck) => { const orientation = this.editor.orientation(orientationName, deck), pageValue = orientation.pages[page]; if (!pageValue || !['speaker', 'mic'].includes(target)) return false; pageValue.faders = pageValue.faders || { speaker: null, mic: null, speakerHidden: false, micHidden: false }; if (Object.prototype.hasOwnProperty.call(values, 'hidden')) pageValue.faders[`${target}Hidden`] = !!values.hidden; if (values.width || values.height) { const current = this.editor.effectiveFader(orientation, page, target) || orientation.faders[target]; pageValue.faders[target] = Object.assign({}, current, values, { hidden: undefined, off: undefined }); } });
  }
  canUpdate(orientationName, page, target, values) {
    const candidate = copy(this.editor.deck), orientation = this.editor.orientation(orientationName, candidate), pageValue = orientation.pages[page]; if (!pageValue || !['speaker', 'mic'].includes(target)) return false; pageValue.faders = pageValue.faders || { speaker: null, mic: null, speakerHidden: false, micHidden: false }; const current = this.editor.effectiveFader(orientation, page, target) || pageValue.faders[target] || orientation.faders[target]; pageValue.faders[target] = Object.assign({}, current, values); pageValue.faders[`${target}Hidden`] = false; return this.editor.validateDeck(candidate);
  }
}
