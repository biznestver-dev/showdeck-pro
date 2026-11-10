const { spawn } = require('node:child_process');
const path = require('node:path');

const appPath = process.env.VLC_APP_PATH ||
  path.join(process.env.HOME, 'Applications', 'ShowDeck VLC Prototype', 'VLC.app');
const mediaPath = path.join(appPath, 'Contents', 'MacOS');
const electronPath = path.resolve(__dirname, '..', 'node_modules', '.bin', 'electron');
const env = {
  ...process.env,
  VLC_PLUGIN_PATH: path.join(mediaPath, 'plugins'),
  VLC_PROTOTYPE_APP_PATH: appPath
};
const appDirectory = process.argv.includes('--native')
  ? path.join(__dirname, 'native')
  : __dirname;
const child = spawn(electronPath, [appDirectory], {
  cwd: __dirname,
  env,
  stdio: 'inherit'
});

child.on('error', error => {
  console.error('Unable to launch the Electron VLC prototype:', error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
