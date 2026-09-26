import {spawnSync} from 'node:child_process';

const webEnvironment = {...process.env, EVB_PLAYER_WEB: '1', NITRO_PRESET: 'vercel'};
const result = spawnSync('nuxi', ['build'], {
  env: webEnvironment,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const iconCheck = spawnSync(process.execPath, ['scripts/check-icons.mjs'], {
  env: webEnvironment,
  stdio: 'inherit',
});
if (iconCheck.error) {
  throw iconCheck.error;
}
if (iconCheck.status !== 0) {
  process.exit(iconCheck.status ?? 1);
}
