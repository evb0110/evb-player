import {spawn, spawnSync, type ChildProcess} from 'node:child_process';

const port = 3131;
// pnpm is a .cmd shim on Windows, which only starts through a shell.
const shell = process.platform === 'win32';
const devUrl = `http://127.0.0.1:${port}`;
const children: ChildProcess[] = [];

function stopChildren() {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

function waitForServer(url: string) {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 30_000;
    const check = async () => {
      try {
        await fetch(url);
        resolve();
        return;
      } catch {
        if (Date.now() >= deadline) {
          reject(new Error(`Nuxt did not start at ${url}.`));
          return;
        }
        setTimeout(check, 250);
      }
    };
    void check();
  });
}

async function main() {
  const build = spawnSync('pnpm', ['run', 'build:electron'], {stdio: 'inherit', shell});
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }

  const nuxt = spawn('pnpm', ['exec', 'nuxi', 'dev', '--host', '127.0.0.1', '--port', String(port)], {
    stdio: 'inherit',
    shell,
    env: {...process.env, EVB_PLAYER_DEV_SERVER_URL: devUrl},
  });
  children.push(nuxt);

  try {
    await waitForServer(devUrl);
  } catch (error) {
    stopChildren();
    throw error;
  }

  const electron = spawn('pnpm', ['exec', 'electron', '.'], {
    stdio: 'inherit',
    shell,
    env: {...process.env, EVB_PLAYER_DEV_SERVER_URL: devUrl},
  });
  children.push(electron);

  const exit = (code: number | null) => {
    stopChildren();
    process.exit(code ?? 0);
  };

  electron.on('exit', exit);
  process.on('SIGINT', () => exit(0));
  process.on('SIGTERM', () => exit(0));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
