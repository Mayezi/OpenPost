import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const targetPlatform = process.env.TARGET_OS || process.platform;
const targetArch = process.env.TARGET_ARCH || process.arch;

const platformLabel =
  targetPlatform === 'win32' || targetPlatform === 'windows'
    ? 'windows'
    : targetPlatform === 'darwin' || targetPlatform === 'macos'
    ? 'macos'
    : 'linux';

const outRoot = path.join(rootDir, 'release-dist');
const bundleName = `openPost-v2.0.0-${platformLabel}-${targetArch}`;
const bundleDir = path.join(outRoot, bundleName);

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  if (!exists) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function runPackaging() {
  console.log(`[openPost Packager] Packaging for ${platformLabel} (${targetArch})...`);

  const distDir = path.join(rootDir, 'dist');
  if (!fs.existsSync(distDir)) {
    throw new Error('Frontend dist/ directory not found. Run "npm run build" first.');
  }

  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.mkdirSync(bundleDir, { recursive: true });

  // 1. Copy compiled frontend assets
  copyRecursiveSync(distDir, path.join(bundleDir, 'dist'));

  // 2. Bundle server.ts into a standalone production entry using esbuild
  await build({
    entryPoints: [path.join(rootDir, 'server.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outfile: path.join(bundleDir, 'server.mjs'),
    external: ['vite', 'esbuild', 'express'],
    banner: {
      js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
    },
  });

  // 3. Write minimal production package.json for standalone runtime
  const runtimePkg = {
    name: 'openpost-desktop-runtime',
    version: '2.0.0',
    private: true,
    type: 'module',
    engines: {
      node: '>=22.0.0',
    },
    scripts: {
      start: 'NODE_ENV=production node server.mjs',
    },
    dependencies: {
      express: '^4.21.2',
    },
  };
  fs.writeFileSync(
    path.join(bundleDir, 'package.json'),
    JSON.stringify(runtimePkg, null, 2),
    'utf-8'
  );

  // 4. Generate OS-specific native desktop launchers
  if (platformLabel === 'windows') {
    const batContent = [
      '@echo off',
      'title openPost Local API Studio',
      'cd /d "%~dp0"',
      'set NODE_ENV=production',
      'set OPENPOST_OFFLINE_ONLY=1',
      'if not exist "node_modules" (',
      '  echo [openPost] Installing minimal local runtime...',
      '  call npm install --omit=dev --no-audit --no-fund',
      ')',
      'start "" "http://127.0.0.1:3000"',
      'node server.mjs',
    ].join('\r\n');
    fs.writeFileSync(path.join(bundleDir, 'openPost-Windows.bat'), batContent, 'utf-8');
  } else if (platformLabel === 'macos') {
    const commandScript = [
      '#!/usr/bin/env bash',
      'cd "$(dirname "$0")"',
      'export NODE_ENV=production',
      'export OPENPOST_OFFLINE_ONLY=1',
      'if [ ! -d "node_modules" ]; then',
      '  npm install --omit=dev --no-audit --no-fund',
      'fi',
      '(sleep 1 && open "http://127.0.0.1:3000") &',
      'node server.mjs',
    ].join('\n');
    const cmdPath = path.join(bundleDir, 'openPost-macOS.command');
    fs.writeFileSync(cmdPath, commandScript, 'utf-8');
    fs.chmodSync(cmdPath, 0o755);
  } else {
    const shScript = [
      '#!/usr/bin/env bash',
      'cd "$(dirname "$0")"',
      'export NODE_ENV=production',
      'export OPENPOST_OFFLINE_ONLY=1',
      'if [ ! -d "node_modules" ]; then',
      '  npm install --omit=dev --no-audit --no-fund',
      'fi',
      '(sleep 1 && xdg-open "http://127.0.0.1:3000" >/dev/null 2>&1 || true) &',
      'node server.mjs',
    ].join('\n');
    const shPath = path.join(bundleDir, 'openPost-Linux.sh');
    fs.writeFileSync(shPath, shScript, 'utf-8');
    fs.chmodSync(shPath, 0o755);
  }

  console.log(`[openPost Packager] Successfully created desktop bundle at: ${bundleDir}`);
}

runPackaging().catch((err) => {
  console.error('[openPost Packager] Build failed:', err);
  process.exit(1);
});
