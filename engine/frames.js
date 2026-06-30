// engine/frames.js
// Execution-stack frames — the heart of the no-host-recursion eval model.
//
// The VM's execution stack holds FRAMES, each with a tick(vm) method that does
// ONE unit of work and returns to the main loop. Procedures execute by pushing
// a ProcFrame (never by recursing the JS call stack), so deeply recursive
// PostScript (fractals, recursive defs) can't overflow the host stack. Loop
// operators push a loop frame that re-injects its body each iteration; `exit`
// and `stop` unwind the execution stack to the nearest loop / stopped barrier
// (no exceptions needed).

import { PS, PSObject, T } from './object.js';

// Run the elements of an executable array in order.
export class ProcFrame {
  constructor(arr) { this.arr = arr; this.i = 0; }
  tick(vm) {
    if (this.i >= this.arr.length) { vm.estack.pop(); return; }
    vm.execObject(this.arr.get(this.i++));
  }
}

// Stream tokens straight from a Scanner — a PostScript `file`. This is the
// top-level execution frame: it scans and executes one object per tick (like
// ProcFrame, but pulling from a live cursor instead of a pre-scanned array), and
// it lets `currentfile` hand the running program its own input stream so
// operators like `eexec` can read/skip the bytes that follow them.
export class FileFrame {
  constructor(scanner) { this.scanner = scanner; this.isFile = true; }
  get file() {
    if (!this._file) this._file = new PSObject(T.FILE, { scanner: this.scanner, open: true });
    return this._file;
  }
  tick(vm) {
    const o = this.scanner.next();
    if (o === null) { vm.estack.pop(); return; }
    vm.execObject(o);
  }
}

// `initial inc limit proc for`
export class ForFrame {
  constructor(initial, inc, limit, proc, isInt) {
    this.cur = initial; this.inc = inc; this.limit = limit;
    this.proc = proc; this.isInt = isInt; this.isLoop = true;
  }
  tick(vm) {
    const done = this.inc >= 0 ? this.cur > this.limit : this.cur < this.limit;
    if (done) { vm.estack.pop(); return; }
    vm.ostack.push(this.isInt ? PS.int(this.cur) : PS.real(this.cur));
    this.cur += this.inc;
    vm.estack.push(new ProcFrame(this.proc));
  }
}

// `n proc repeat`
export class RepeatFrame {
  constructor(count, proc) { this.n = count; this.proc = proc; this.isLoop = true; }
  tick(vm) {
    if (this.n <= 0) { vm.estack.pop(); return; }
    this.n--;
    vm.estack.push(new ProcFrame(this.proc));
  }
}

// `proc loop` (forever, until exit)
export class LoopFrame {
  constructor(proc) { this.proc = proc; this.isLoop = true; }
  tick(vm) { vm.estack.push(new ProcFrame(this.proc)); }
}

export class ForallArrayFrame {
  constructor(arr, proc) { this.arr = arr; this.proc = proc; this.i = 0; this.isLoop = true; }
  tick(vm) {
    if (this.i >= this.arr.length) { vm.estack.pop(); return; }
    vm.ostack.push(this.arr.get(this.i++));
    vm.estack.push(new ProcFrame(this.proc));
  }
}

export class ForallStringFrame {
  constructor(str, proc) { this.str = str; this.proc = proc; this.i = 0; this.isLoop = true; }
  tick(vm) {
    if (this.i >= this.str.length) { vm.estack.pop(); return; }
    vm.ostack.push(PS.int(this.str.get(this.i++)));
    vm.estack.push(new ProcFrame(this.proc));
  }
}

export class ForallDictFrame {
  constructor(entries, proc) { this.entries = entries; this.proc = proc; this.i = 0; this.isLoop = true; }
  tick(vm) {
    if (this.i >= this.entries.length) { vm.estack.pop(); return; }
    const [k, v] = this.entries[this.i++];
    vm.ostack.push(k); vm.ostack.push(v);
    vm.estack.push(new ProcFrame(this.proc));
  }
}

// Barrier pushed by `stopped`. If the protected proc completes normally we push
// false; if `stop` (or an error) unwinds to us, we push true instead.
export class StoppedFrame {
  constructor() { this.isStopBarrier = true; }
  tick(vm) { vm.estack.pop(); vm.ostack.push(PS.bool(false)); }
}

/** Unwind the execution stack to (and removing) the nearest loop frame. */
export function unwindToLoop(vm) {
  for (let k = vm.estack.length - 1; k >= 0; k--) {
    if (vm.estack[k].isLoop) { vm.estack.length = k; return true; }
  }
  return false;
}

/** Unwind to the nearest stopped barrier, pushing `true`. */
export function unwindToStop(vm) {
  for (let k = vm.estack.length - 1; k >= 0; k--) {
    if (vm.estack[k].isStopBarrier) { vm.estack.length = k; vm.ostack.push(PS.bool(true)); return true; }
  }
  return false;
}
