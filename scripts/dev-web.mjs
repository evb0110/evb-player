import {spawn} from 'node:child_process';

const child = spawn('nuxi', ['dev', '--host', '127.0.0.1'], {
  env: {...process.env, EVB_PLAYER_WEB: '1'},
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('error', (error) => {
  throw error;
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exitCode = code ?? 1;
  }
});
