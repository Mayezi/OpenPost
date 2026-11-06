import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface StorageConfig {
  storageDir: string;
  autoSyncToDisk: boolean;
  maxHistoryItems: number;
  requestTimeoutMs: number;
  verifySsl: boolean;
  updatedAt: string;
}

const DEFAULT_CONFIG_FILE = path.join(__dirname, '.openpost-storage-config.json');
const DEFAULT_VAULT_DIR = path.join(__dirname, 'openpost_vault');

function loadStorageConfig(): StorageConfig {
  try {
    if (fs.existsSync(DEFAULT_CONFIG_FILE)) {
      const raw = fs.readFileSync(DEFAULT_CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        storageDir: parsed.storageDir || DEFAULT_VAULT_DIR,
        autoSyncToDisk: parsed.autoSyncToDisk ?? true,
        maxHistoryItems: parsed.maxHistoryItems ?? 100,
        requestTimeoutMs: parsed.requestTimeoutMs ?? 30000,
        verifySsl: parsed.verifySsl ?? true,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // Fallback to default
  }
  return {
    storageDir: DEFAULT_VAULT_DIR,
    autoSyncToDisk: true,
    maxHistoryItems: 100,
    requestTimeoutMs: 30000,
    verifySsl: true,
    updatedAt: new Date().toISOString(),
  };
}

function saveStorageConfig(cfg: StorageConfig): void {
  try {
    fs.writeFileSync(DEFAULT_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save storage config:', err);
  }
}

function ensureDirExists(dirPath: string): { ok: boolean; resolvedPath: string; error?: string } {
  try {
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
    const probeFile = path.join(resolved, '.zp_write_probe');
    fs.writeFileSync(probeFile, 'ok', 'utf-8');
    fs.unlinkSync(probeFile);
    return { ok: true, resolvedPath: resolved };
  } catch (e: unknown) {
    return {
      ok: false,
      resolvedPath: dirPath,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function getDirStats(dirPath: string): { fileCount: number; totalBytes: number; files: string[] } {
  try {
    if (!fs.existsSync(dirPath)) {
      return { fileCount: 0, totalBytes: 0, files: [] };
    }
    const entries = fs.readdirSync(dirPath);
    let totalBytes = 0;
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const full = path.join(dirPath, entry);
      const stat = fs.statSync(full);
      if (stat.isFile()) {
        totalBytes += stat.size;
        files.push(entry);
      }
    }
    files.sort();
    return { fileCount: files.length, totalBytes, files };
  } catch {
    return { fileCount: 0, totalBytes: 0, files: [] };
  }
}

function readJsonFileSafe(filePath: string): unknown {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  let currentConfig = loadStorageConfig();
  ensureDirExists(currentConfig.storageDir);

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(express.text({ type: ['text/*', 'application/xml', 'application/graphql'], limit: '50mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true, engine: 'openPost-Local-Runtime', version: '2.0.2' });
  });

  // ============================================================================
  // 1. REAL LOCAL DISK STORAGE & WORKSPACE PERSISTENCE API
  // ============================================================================
  app.get('/api/storage/config', (_req: Request, res: Response) => {
    const stats = getDirStats(currentConfig.storageDir);
    const homedir = os.homedir();
    const suggestedPaths = [
      DEFAULT_VAULT_DIR,
      path.join(homedir, 'openPost_Vault'),
      'D:\\openPost_Data\\Vault',
      'E:\\openPost_Data\\Vault',
      '/Volumes/ExternalSSD/openPost_Vault',
      '/mnt/data/openpost_vault',
    ];

    res.status(200).json({
      ok: true,
      displayPath: currentConfig.storageDir,
      config: currentConfig,
      stats,
      platform: `${os.platform()} (${os.arch()})`,
      suggestedPaths,
    });
  });

  app.post('/api/storage/config', (req: Request, res: Response) => {
    const {
      storageDir,
      autoSyncToDisk,
      maxHistoryItems,
      requestTimeoutMs,
      verifySsl,
      migrateExisting = true,
      cleanOldDir = false,
    } = req.body || {};

    const oldDir = currentConfig.storageDir;
    let targetDir = typeof storageDir === 'string' && storageDir.trim() ? storageDir.trim() : oldDir;

    let virtualMappedFrom: string | undefined;
    if (os.platform() !== 'win32' && /^[A-Za-z]:\\/.test(targetDir)) {
      virtualMappedFrom = targetDir;
      const sanitized = targetDir.replace(/^[A-Za-z]:\\/, '').replace(/\\/g, '_');
      targetDir = path.join(__dirname, 'mounted_drives', sanitized);
    }

    const check = ensureDirExists(targetDir);
    if (!check.ok) {
      res.status(400).json({
        ok: false,
        error: `无法创建或写入目标目录 (${check.error})，请检查磁盘权限或路径格式。`,
      });
      return;
    }

    let migratedFiles = 0;
    if (migrateExisting && check.resolvedPath !== oldDir && fs.existsSync(oldDir)) {
      try {
        const files = fs.readdirSync(oldDir);
        for (const f of files) {
          if (f.endsWith('.json')) {
            const srcFile = path.join(oldDir, f);
            const destFile = path.join(check.resolvedPath, f);
            fs.copyFileSync(srcFile, destFile);
            migratedFiles++;
            if (cleanOldDir) {
              fs.unlinkSync(srcFile);
            }
          }
        }
      } catch (err) {
        console.error('Migration warning:', err);
      }
    }

    currentConfig = {
      storageDir: check.resolvedPath,
      autoSyncToDisk: autoSyncToDisk ?? currentConfig.autoSyncToDisk,
      maxHistoryItems: Number(maxHistoryItems) || currentConfig.maxHistoryItems,
      requestTimeoutMs: Number(requestTimeoutMs) || currentConfig.requestTimeoutMs,
      verifySsl: verifySsl ?? currentConfig.verifySsl,
      updatedAt: new Date().toISOString(),
    };
    saveStorageConfig(currentConfig);

    const stats = getDirStats(currentConfig.storageDir);
    res.status(200).json({
      ok: true,
      config: currentConfig,
      displayPath: virtualMappedFrom || currentConfig.storageDir,
      migratedFiles,
      stats,
    });
  });

  app.get('/api/storage/workspace', (_req: Request, res: Response) => {
    const dir = currentConfig.storageDir;
    const folders = readJsonFileSafe(path.join(dir, 'collections_folders.json'));
    const requests = readJsonFileSafe(path.join(dir, 'collections_requests.json'));
    const environments = readJsonFileSafe(path.join(dir, 'environments.json'));
    const history = readJsonFileSafe(path.join(dir, 'history.json'));
    const stats = getDirStats(dir);

    res.status(200).json({
      ok: true,
      storageDir: dir,
      folders,
      requests,
      environments,
      history,
      stats,
    });
  });

  app.post('/api/storage/sync', (req: Request, res: Response) => {
    const { folders, requests, environments, history } = req.body || {};
    try {
      ensureDirExists(currentConfig.storageDir);
      if (folders) {
        fs.writeFileSync(
          path.join(currentConfig.storageDir, 'collections_folders.json'),
          JSON.stringify(folders, null, 2),
          'utf-8'
        );
      }
      if (requests) {
        fs.writeFileSync(
          path.join(currentConfig.storageDir, 'collections_requests.json'),
          JSON.stringify(requests, null, 2),
          'utf-8'
        );
      }
      if (environments) {
        fs.writeFileSync(
          path.join(currentConfig.storageDir, 'environments.json'),
          JSON.stringify(environments, null, 2),
          'utf-8'
        );
      }
      if (history) {
        fs.writeFileSync(
          path.join(currentConfig.storageDir, 'history.json'),
          JSON.stringify(history.slice(0, currentConfig.maxHistoryItems), null, 2),
          'utf-8'
        );
      }
      const stats = getDirStats(currentConfig.storageDir);
      res.status(200).json({
        ok: true,
        storageDir: currentConfig.storageDir,
        stats,
        syncedAt: new Date().toISOString(),
      });
    } catch (e: unknown) {
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  // ============================================================================
  // 2. REAL HTTP/HTTPS CORS-FREE PROXY ENGINE (/api/proxy)
  // ============================================================================
  app.post('/api/proxy', async (req: Request, res: Response) => {
    const {
      url,
      method = 'GET',
      headers = {},
      body = undefined,
      timeoutMs = currentConfig.requestTimeoutMs || 30000,
    } = req.body || {};

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Target URL is required' });
      return;
    }

    const startTotal = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      Math.min(Math.max(Number(timeoutMs) || 30000, 1000), 120000)
    );

    try {
      let resolvedUrl = url.trim();
      if (resolvedUrl.startsWith('/')) {
        resolvedUrl = `http://127.0.0.1:${PORT}${resolvedUrl}`;
      } else if (!/^https?:\/\//i.test(resolvedUrl)) {
        resolvedUrl = `https://${resolvedUrl}`;
      }

      const forbiddenHeaders = new Set([
        'host',
        'connection',
        'content-length',
        'transfer-encoding',
        'keep-alive',
        'upgrade',
        'expect',
      ]);

      const outgoingHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(headers)) {
        if (k && v !== undefined && v !== null && !forbiddenHeaders.has(k.toLowerCase())) {
          outgoingHeaders[k] = String(v);
        }
      }

      if (!outgoingHeaders['User-Agent'] && !outgoingHeaders['user-agent']) {
        outgoingHeaders['User-Agent'] = 'openPost-LocalRuntime/2.0 (No-Telemetry; Cross-Platform)';
      }

      const upperMethod = String(method).toUpperCase();
      const canHaveBody = !['GET', 'HEAD'].includes(upperMethod);

      const fetchInit: RequestInit = {
        method: upperMethod,
        headers: outgoingHeaders,
        signal: controller.signal,
        redirect: 'follow',
      };

      if (canHaveBody && body !== undefined && body !== null && body !== '') {
        fetchInit.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const connectStart = performance.now();
      const upstreamRes = await fetch(resolvedUrl, fetchInit);
      const ttfbTime = performance.now();

      const arrayBuffer = await upstreamRes.arrayBuffer();
      const endTotal = performance.now();
      clearTimeout(timeoutId);

      const buffer = Buffer.from(arrayBuffer);
      const sizeBytes = buffer.byteLength;
      const contentType = upstreamRes.headers.get('content-type') || '';

      const responseHeaders: Record<string, string> = {};
      upstreamRes.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const setCookies: string[] =
        typeof (upstreamRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
          ? (upstreamRes.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
          : responseHeaders['set-cookie']
          ? [responseHeaders['set-cookie']]
          : [];

      const textBody = buffer.toString('utf-8');

      const totalMs = Math.max(1, Math.round(endTotal - startTotal));
      const ttfbMs = Math.max(1, Math.round(ttfbTime - connectStart));
      const downloadMs = Math.max(0, totalMs - ttfbMs);

      res.status(200).json({
        ok: true,
        status: upstreamRes.status,
        statusText: upstreamRes.statusText || getStandardStatusText(upstreamRes.status),
        url: upstreamRes.url || resolvedUrl,
        redirected: upstreamRes.redirected,
        headers: responseHeaders,
        cookies: setCookies,
        contentType,
        sizeBytes,
        body: textBody,
        timing: {
          totalMs,
          ttfbMs,
          downloadMs,
        },
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const elapsedMs = Math.round(performance.now() - startTotal);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isTimeout = err instanceof Error && err.name === 'AbortError';

      res.status(200).json({
        ok: false,
        status: 0,
        statusText: isTimeout ? 'Request Timed Out' : 'Network / Connection Error',
        error: isTimeout
          ? `Request timed out after ${timeoutMs}ms`
          : `Failed to reach target host: ${errorMessage}`,
        headers: {},
        cookies: [],
        contentType: 'text/plain',
        sizeBytes: 0,
        body: '',
        timing: {
          totalMs: elapsedMs,
          ttfbMs: elapsedMs,
          downloadMs: 0,
        },
      });
    }
  });

  // ============================================================================
  // 3. VITE MIDDLEWARE OR STATIC DIST SERVING
  // ============================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`openPost Local API Engine running on http://0.0.0.0:${PORT}`);
  });
}

function getStandardStatusText(code: number): string {
  const map: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    202: 'Accepted',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return map[code] || 'Response';
}

startServer();
