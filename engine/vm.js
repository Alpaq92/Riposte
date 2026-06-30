// engine/vm.js
// The PostScript virtual machine: operand / execution / dictionary stacks, the
// iterative eval loop (no host recursion), name resolution, and the push-vs-
// execute dispatch rule. Pure JS — no DOM, runs headless in Node/Deno/Bun.

import { PS, T, NULL, PSObject, nameString } from './object.js';
import { DictStack } from './dictstack.js';
import { Scanner } from './scanner.js';
import { ProcFrame, FileFrame, unwindToStop } from './frames.js';
import { PSError } from './errors.js';
import { mutationKey, snapshotBacking, restoreBacking } from './save.js';
import { GState } from './graphics/gstate.js';
import { Driver } from './graphics/driver.js';
import { installOperators } from './operators/index.js';

function defaultOut(s) {
  if (typeof process !== 'undefined' && process.stdout) process.stdout.write(s);
  else if (typeof console !== 'undefined') console.log(s.replace(/\n$/, ''));
}

export class VM {
  constructor({ out, driver } = {}) {
    this.ostack = [];   // operand stack
    this.estack = [];   // execution stack (frames)
    this.hold = [];     // hold stack (operand stash for error recovery)
    this.systemdict = PS.dict();
    this.userdict = PS.dict();
    this.dictstack = new DictStack(this.systemdict, this.userdict);
    this.out = out || defaultOut;
    this.quit = false;

    // graphics: current state, the gsave/grestore stack, and the output backend
    // (defaults to the null Driver, so the VM runs headless with no rendering).
    this.gstate = new GState();
    this.gsStack = [];
    this.driver = driver || new Driver();

    this.saveStack = [];   // active save() snapshots (copy-on-write)
    this.saveLevel = 0;

    this.fonts = new Map(); // registered fonts (name -> descriptor), incl. parsed Type 1

    installOperators(this);
  }

  /** Register a font descriptor so `findfont <name>` returns it. */
  registerFont(name, descriptor) { this.fonts.set(name, descriptor); }

  // --- save / restore (lazy copy-on-write) ---------------------------------
  // Record a composite's storage before its first mutation after each save.
  recordMutation(comp) {
    if (this.saveStack.length === 0) return;
    const snap = this.saveStack[this.saveStack.length - 1];
    const key = mutationKey(comp);
    if (!snap.touched.has(key)) snap.touched.set(key, snapshotBacking(comp));
  }

  save() {
    this.saveLevel++;
    const snap = {
      level: this.saveLevel,
      touched: new Map(),
      gstate: this.gstate.clone(),
      gsStack: this.gsStack.map((g) => g.clone()),
      dictStack: this.dictstack.stack.slice(),
    };
    this.saveStack.push(snap);
    return new PSObject(T.SAVE, snap);
  }

  restore(saveObj) {
    if (saveObj.type !== T.SAVE) throw new PSError('typecheck');
    const target = saveObj.value;
    const idx = this.saveStack.indexOf(target);
    if (idx < 0) throw new PSError('invalidrestore');
    // apply backups from the top down to the target (so the target's win last)
    for (let k = this.saveStack.length - 1; k >= idx; k--) {
      for (const b of this.saveStack[k].touched.values()) restoreBacking(b);
    }
    this.gstate = target.gstate;
    this.gsStack = target.gsStack;
    this.dictstack.stack = target.dictStack;
    this.saveLevel = target.level - 1;
    this.saveStack.length = idx;
  }

  // --- operand-stack helpers (used pervasively by operators) ---------------
  push(o) { this.ostack.push(o); }
  pop() { if (this.ostack.length === 0) throw new PSError('stackunderflow'); return this.ostack.pop(); }
  popNum() { const o = this.pop(); if (o.type !== T.INTEGER && o.type !== T.REAL) throw new PSError('typecheck'); return o; }
  popInt() { const o = this.pop(); if (o.type !== T.INTEGER) throw new PSError('typecheck'); return o.value; }
  popType(t) { const o = this.pop(); if (o.type !== t) throw new PSError('typecheck'); return o; }
  count() { return this.ostack.length; }

  // --- dispatch ------------------------------------------------------------
  // The core PostScript rule: executable names are resolved & executed,
  // executable operators run, everything else (incl. executable arrays read
  // directly from the stream, and all literals) is pushed onto the operand
  // stack. A procedure executes only when a *name* resolves to it (execName),
  // via `exec`, or via a control operator.
  execObject(o) {
    if (o.type === T.NAME && o.executable) { this.execName(o); return; }
    if (o.type === T.OPERATOR && o.executable) { o.value.fn(this); return; }
    this.ostack.push(o);
  }

  execName(o) {
    const v = this.dictstack.load(o);
    if (v === undefined) throw new PSError('undefined', nameString(o.value));
    if (v.type === T.OPERATOR) { v.value.fn(this); return; }
    if (v.type === T.ARRAY && v.executable) { this.estack.push(new ProcFrame(v.value)); return; }
    this.ostack.push(v);
  }

  // --- the eval loop -------------------------------------------------------
  run() {
    while (this.estack.length && !this.quit) {
      try {
        this.estack[this.estack.length - 1].tick(this);
      } catch (e) {
        if (e instanceof PSError) {
          // an error behaves like `stop`: catchable by an enclosing `stopped`.
          if (!unwindToStop(this)) { this.estack.length = 0; throw e; }
        } else throw e;
      }
    }
  }

  /** Stream and execute a source string (PostScript `file`), so `currentfile`
   *  can hand the running program its own input to `eexec` / read operators. */
  runString(src) {
    this.estack.push(new FileFrame(new Scanner(src)));
    this.run();
  }
}

export { NULL };
