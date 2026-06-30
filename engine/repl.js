// engine/repl.js — minimal interactive REPL.  Run: node engine/repl.js
import readline from 'node:readline';
import { VM } from './vm.js';

const vm = new VM();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'PS> ' });

process.stdout.write('Riposte REPL — type PostScript, Ctrl+D to exit.\n');
rl.prompt();
rl.on('line', (line) => {
  try { vm.runString(line); }
  catch (e) { process.stderr.write('%% ' + (e.psname || e.message) + '\n'); }
  rl.prompt();
});
rl.on('close', () => process.exit(0));
