// engine/save.js
// Helpers for save/restore — lazy copy-on-write snapshots of composite storage.
// We key snapshots by the BACKING store (array / Uint8Array) or the PSDict, so
// that windows sharing a backing are restored together and in place (sibling
// getinterval views see the rollback).
import { PSString, PSDict } from './object.js';

export function mutationKey(comp) {
  return comp instanceof PSDict ? comp : comp.backing;
}

export function snapshotBacking(comp) {
  if (comp instanceof PSDict) return { kind: 'dict', dict: comp, copy: new Map(comp.map) };
  return { kind: comp instanceof PSString ? 'string' : 'array', backing: comp.backing, copy: comp.backing.slice() };
}

export function restoreBacking(b) {
  if (b.kind === 'dict') { b.dict.map = b.copy; return; }
  if (b.kind === 'string') { b.backing.set(b.copy); return; }
  const back = b.backing, copy = b.copy;          // array: restore contents in place
  back.length = copy.length;
  for (let i = 0; i < copy.length; i++) back[i] = copy[i];
}
