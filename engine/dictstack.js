// engine/dictstack.js
// The dictionary stack. systemdict (built-ins) sits at the bottom, userdict
// above it; `begin`/`end` push/pop further dicts. Name resolution searches
// top-down, so user definitions can shadow built-ins and `bind` works.
import { PSError } from './errors.js';

export class DictStack {
  constructor(systemdict, userdict) {
    this.stack = [systemdict, userdict];
    this.systemdict = systemdict;
    this.userdict = userdict;
  }
  push(dictObj) { this.stack.push(dictObj); }
  pop() {
    if (this.stack.length <= 2) throw new PSError('dictstackunderflow');
    return this.stack.pop();
  }
  top() { return this.stack[this.stack.length - 1]; }
  def(key, val) { this.top().value.put(key, val); }
  load(key) {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const v = this.stack[i].value.get(key);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  where(key) {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].value.knows(key)) return this.stack[i];
    }
    return null;
  }
}
