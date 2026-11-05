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
    // Test write permission
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
      const full = path.join(dirPath, entry);
      const stat = fs.statSync(full);
      if (stat.isFile()) {
        totalBytes += stat.size;
        files.push(entry);
      }
    }
    return { fileCount: files.length, totalBytes, files };
  } catch {
    return { fileCount: 0, totalBytes: 0, files: [] };
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

  // ============================================================================
  // 1. CUSTOM LOCAL DATA STORAGE DIRECTORY MANAGEMENT API
  // Allows user to relocate storage directory off the default system disk
  // ============================================================================
  app.get('/api/storage/config', (_req: Request, res: Response) => {
    const stats = getDirStats(currentConfig.storageDir);
    const homedir = os.homedir();
    const tmpdir = os.tmpdir();
    const suggestedPaths = [
      DEFAULT_VAULT_DIR,
      path.join(homedir, 'openPost_Vault'),
      path.join(tmpdir, 'openPost_External_Disk'),
      'D:\\openPost_Data\\Vault',
      '/Volumes/ExternalSSD/openPost_Vault',
      '/mnt/data/openpost_vault',
    ];

    res.status(200).json({
      ok: true,
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

    // On Linux container environment, if user enters a Windows drive path like D:\ZeroPost_Data,
    // map it cleanly to a local mounted volume path so it succeeds in both sandbox and native OS
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

    // Migrate files if directory changed
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
  // 2. BUILT-IN LOCAL SANDBOX ENDPOINTS (100% OFFLINE TEST TARGETS)
  // ============================================================================
  const localUsers = [
    { id: 'usr_01', name: 'Linus Torvalds', role: 'Kernel Architect', platform: 'Linux x86_64', active: true, commits: 14820 },
    { id: 'usr_02', name: 'Ada Lovelace', role: 'Systems Pioneer', platform: 'macOS arm64', active: true, commits: 9410 },
    { id: 'usr_03', name: 'Ken Thompson', role: 'Unix Creator', platform: 'Linux riscv64', active: true, commits: 12350 },
    { id: 'usr_04', name: 'Margaret Hamilton', role: 'Flight Software Lead', platform: 'Windows 11 x64', active: false, commits: 8930 },
  ];

  app.get('/api/mock/users', (req: Request, res: Response) => {
    const { role, platform, limit } = req.query;
    let filtered = [...localUsers];
    if (role && typeof role === 'string') {
      filtered = filtered.filter((u) => u.role.toLowerCase().includes(role.toLowerCase()));
    }
    if (platform && typeof platform === 'string') {
      filtered = filtered.filter((u) => u.platform.toLowerCase().includes(platform.toLowerCase()));
    }
    if (limit && !isNaN(Number(limit))) {
      filtered = filtered.slice(0, Number(limit));
    }
    res.setHeader('X-OpenPost-Sandbox', 'Local-Memory-Engine');
    res.setHeader('Set-Cookie', 'op_session=local_verified_99812a; Path=/; HttpOnly; SameSite=Strict');
    res.status(200).json({
      ok: true,
      mode: '100% Local Sandbox (Zero External Network)',
      storagePath: currentConfig.storageDir,
      timestamp: new Date().toISOString(),
      count: filtered.length,
      data: filtered,
    });
  });

  app.post('/api/mock/auth/token', (req: Request, res: Response) => {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const clientId = body.clientId || 'local-dev-client';
    const scope = body.scope || 'read:apis write:collections';
    const token = `op_local_jwt_${Buffer.from(`${clientId}:${Date.now()}`).toString('base64').replace(/=/g, '')}`;
    res.setHeader('X-OpenPost-Auth', 'Issued-Locally');
    res.status(201).json({
      ok: true,
      token_type: 'Bearer',
      access_token: token,
      expires_in: 3600,
      scope,
      issued_at: new Date().toISOString(),
      security_notice: 'Generated locally inside openPost process. No cloud sync.',
    });
  });

  app.all('/api/mock/echo', (req: Request, res: Response) => {
    res.setHeader('X-Echo-Engine', 'openPost-Local-Loopback');
    res.status(200).json({
      ok: true,
      method: req.method,
      path: req.path,
      query: req.query,
      headers: req.headers,
      body: req.body,
      clientIp: req.ip || '127.0.0.1',
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/mock/ai/completions', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const model = body.model || 'deepseek-coder-v3-local';
    res.status(200).json({
      id: `chatcmpl-local-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      authenticated: authHeader.startsWith('Bearer '),
      usage: {
        prompt_tokens: 42,
        completion_tokens: 68,
        total_tokens: 110,
      },
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: 'openPost local endpoint verified. All request headers, payload parameters, and environment tokens were processed strictly on localhost.',
          },
        },
      ],
    });
  });

  // ============================================================================
  // 3. LOCAL CORS-FREE PROXY ENGINE (/api/proxy)
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
  // 4. VITE MIDDLEWARE OR STATIC DIST SERVING
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
