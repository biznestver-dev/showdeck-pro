const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const outputDirectory = path.join(root, 'vlc-runtime');

function getSourceDirectory() {
  if (process.env.VLC_RUNTIME_DIR) return process.env.VLC_RUNTIME_DIR;
  if (process.platform === 'darwin') {
    const appPath = process.env.VLC_APP_PATH ||
      path.join(os.homedir(), 'Applications', 'ShowDeck VLC Prototype', 'VLC.app');
    return path.join(appPath, 'Contents', 'MacOS');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.ProgramFiles || 'C:\\Program Files', 'VideoLAN', 'VLC');
  }
  throw new Error('Создание установщика libVLC доступно только на macOS и Windows.');
}

async function copyMacRuntime(sourceDirectory) {
  const librarySource = path.join(sourceDirectory, 'lib');
  const pluginSource = path.join(sourceDirectory, 'plugins');
  await fs.cp(librarySource, path.join(outputDirectory, 'lib'), {
    recursive: true,
    dereference: true,
    force: true
  });
  await fs.cp(pluginSource, path.join(outputDirectory, 'plugins'), {
    recursive: true,
    dereference: true,
    force: true
  });
}

async function copyWindowsRuntime(sourceDirectory) {
  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.dll')) {
      await fs.copyFile(
        path.join(sourceDirectory, entry.name),
        path.join(outputDirectory, entry.name)
      );
    }
  }
  await fs.cp(path.join(sourceDirectory, 'plugins'), path.join(outputDirectory, 'plugins'), {
    recursive: true,
    dereference: true,
    force: true
  });
}

async function copyLicenseFiles(sourceDirectory) {
  for (const name of ['COPYING', 'COPYING.txt', 'LICENSE', 'LICENSE.txt']) {
    try {
      await fs.copyFile(path.join(sourceDirectory, name), path.join(outputDirectory, name));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await fs.copyFile(
    path.join(root, 'THIRD_PARTY_NOTICES.md'),
    path.join(outputDirectory, 'THIRD_PARTY_NOTICES.md')
  );
}

async function validateMacArchitectures() {
  const archArgument = process.argv.find(argument => argument.startsWith('--arch='));
  const requestedArch = archArgument?.slice('--arch='.length) || 'universal';
  const requiredArchitectures = requestedArch === 'universal'
    ? ['arm64', 'x86_64']
    : requestedArch === 'x64'
      ? ['x86_64']
      : requestedArch === 'arm64'
        ? ['arm64']
        : null;
  if (!requiredArchitectures) {
    throw new Error(`Unsupported VLC_ARCH value: ${requestedArch}. Use arm64, x64, or universal.`);
  }

  // VLC ships CPU-specific optional plugins alongside the universal core libraries.
  const coreLibraries = ['libvlc.dylib', 'libvlccore.dylib']
    .map(name => path.join(outputDirectory, 'lib', name));
  for (const library of coreLibraries) {
    const architectures = execFileSync('lipo', ['-archs', library], { encoding: 'utf8' }).trim().split(/\s+/);
    const missing = requiredArchitectures.filter(architecture => !architectures.includes(architecture));
    if (missing.length > 0) {
      throw new Error(`${path.relative(outputDirectory, library)} is missing ${missing.join(', ')}; runtime must include ${requestedArch}.`);
    }
  }
}

async function main() {
  const sourceDirectory = path.resolve(getSourceDirectory());
  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(outputDirectory, { recursive: true });

  if (process.platform === 'darwin') await copyMacRuntime(sourceDirectory);
  else await copyWindowsRuntime(sourceDirectory);
  if (process.platform === 'darwin') await validateMacArchitectures();
  await copyLicenseFiles(sourceDirectory);

  const libraryDirectory = process.platform === 'darwin'
    ? path.join(outputDirectory, 'lib')
    : outputDirectory;
  const libraryNames = process.platform === 'darwin'
    ? ['libvlc.dylib', 'libvlccore.dylib']
    : ['libvlc.dll', 'libvlccore.dll'];
  for (const name of libraryNames) {
    await fs.access(path.join(libraryDirectory, name));
  }
  await fs.access(path.join(outputDirectory, 'plugins'));
  console.log(`Prepared libVLC runtime from ${sourceDirectory}`);
}

main().catch(error => {
  console.error('Unable to prepare the libVLC runtime:', error);
  process.exitCode = 1;
});
