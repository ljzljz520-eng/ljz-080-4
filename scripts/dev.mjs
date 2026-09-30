import { spawn } from 'node:child_process';

const procs = [
  { name: 'api', cmd: 'npm', args: ['run', 'dev', '-w', 'server'], color: '\\x1b[36m' },
  { name: 'web', cmd: 'npm', args: ['run', 'dev', '-w', 'client'], color: '\\x1b[35m' }
];
for (const p of procs) {
  const child = spawn(p.cmd, p.args, { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
  const tag = `${p.color}[${p.name}]\\x1b[0m`;
  child.stdout.on('data', (d) => String(d).split('\\n').filter(Boolean).forEach((l) => console.log(tag, l)));
  child.stderr.on('data', (d) => String(d).split('\\n').filter(Boolean).forEach((l) => console.error(tag, l)));
}
