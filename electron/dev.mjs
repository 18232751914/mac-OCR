import { spawn } from 'node:child_process';
import process from 'node:process';

const rendererUrl = 'http://localhost:3000';
const electronExecutable = process.env.ELECTRON_EXECUTABLE || 'electron';
const viteProcess = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    BROWSER: 'none',
  },
});

let electronProcess = null;
let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill();
  }

  if (!viteProcess.killed) {
    viteProcess.kill();
  }

  process.exit(exitCode);
}

async function waitForRenderer() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30000) {
    try {
      const response = await fetch(rendererUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling until Vite is ready
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('Timed out waiting for the Vite renderer to start.');
}

async function start() {
  try {
    await waitForRenderer();

    electronProcess = spawn(electronExecutable, ['.'], {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        ELECTRON_RENDERER_URL: rendererUrl,
      },
    });

    electronProcess.on('exit', (code) => {
      shutdown(code ?? 0);
    });

    electronProcess.on('error', () => {
      console.error(
        `Unable to launch Electron with executable "${electronExecutable}". ` +
          'If Electron is installed globally, make sure it is available on PATH, or set ELECTRON_EXECUTABLE explicitly.',
      );
      shutdown(1);
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    shutdown(1);
  }
}

viteProcess.on('exit', (code) => {
  if (!shuttingDown) {
    shutdown(code ?? 0);
  }
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

void start();
