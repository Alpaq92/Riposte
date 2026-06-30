// engine/operators/file.js — the `file` operators needed for in-document fonts.
//
// PostScript fonts embed their Private dict / CharStrings as an eexec-encrypted
// block read straight from the program's own input: `currentfile eexec`. We
// expose the running stream as a FILE (via FileFrame), decrypt the embedded
// Type 1 font, register its glyphs, and skip the program cursor past the
// encrypted block so the cleartext after it keeps executing.
import { T, PSObject } from '../object.js';
import { PSError } from '../errors.js';
import { parseType1 } from '../font/type1.js';

// The file of the nearest enclosing streaming frame (the program's input).
function activeFile(vm) {
  for (let k = vm.estack.length - 1; k >= 0; k--) {
    if (vm.estack[k] && vm.estack[k].isFile) return vm.estack[k].file;
  }
  return null;
}

// Where the eexec section ends: resume after the standard `cleartomark` that
// closes it; failing that, skip the trailing run of zero bytes; else go to EOF.
function endOfEexecBlock(b, start) {
  const needle = 'cleartomark';
  outer:
  for (let i = start; i <= b.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (b[i + j] !== needle.charCodeAt(j)) continue outer;
    return i + needle.length;
  }
  let run = 0, runEnd = -1;
  for (let i = start; i < b.length; i++) {
    if (b[i] === 0x30) { if (++run >= 16) runEnd = i + 1; }       // '0'
    else { if (runEnd > 0) return runEnd; run = 0; }
  }
  return b.length;
}

export default {
  currentfile(vm) {
    vm.push(activeFile(vm) || new PSObject(T.FILE, { scanner: null, open: false }));
  },

  // `file eexec` — decrypt the embedded Type 1 font program and register it, then
  // advance the program cursor past the encrypted block.
  eexec(vm) {
    const f = vm.pop();
    if (f.type !== T.FILE) throw new PSError('typecheck');
    const sc = f.value && f.value.scanner;
    if (!sc) throw new PSError('ioerror');
    // The font program is the cleartext header up to the end of the eexec block;
    // parse just that slice (not the trailing ordinary PostScript after it).
    const end = endOfEexecBlock(sc.b, sc.pos);
    let desc = null;
    try { desc = parseType1(sc.b.subarray(0, end)); } catch { desc = null; }
    if (desc && desc.charstrings && desc.charstrings.size) {
      vm.registerFont(desc.fontName || 'EmbeddedFont', desc);
    }
    sc.pos = end;
  },

  closefile(vm) {
    const f = vm.pop();
    if (f.type !== T.FILE) throw new PSError('typecheck');
    if (f.value) f.value.open = false;
  },

  // Access modifiers a font's cleartext header may apply. We don't enforce
  // access, so these return their operand unchanged (a no-op on the stack).
  readonly() {},
  executeonly() {},
  noaccess() {},
};
