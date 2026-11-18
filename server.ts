import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ProxyConfig {
  mode: 'none' | 'system' | 'custom';
  protocol: 'http' | 'https' | 'socks5';
  host: string;
  port: string;
  username?: string;
  password?: string;
  bypass?: string;
}

interface StorageConfig {
  storageDir: string;
  autoSyncToDisk: boolean;
  maxHistoryItems: number;
  requestTimeoutMs: number;
  verifySsl: boolean;
  proxy?: ProxyConfig;
  updatedAt: string;
}

const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  mode: 'none',
  protocol: 'http',
  host: '127.0.0.1',
  port: '7890',
  username: '',
  password: '',
  bypass: 'localhost,127.0.0.1,::1',
};

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
        proxy: parsed.proxy ? { ...DEFAULT_PROXY_CONFIG, ...parsed.proxy } : DEFAULT_PROXY_CONFIG,
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
    proxy: { ...DEFAULT_PROXY_CONFIG },
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
    res.status(200).json({ ok: true, engine: 'OpenPost-Local-Runtime', version: '2.0.3' });
  });

  // ============================================================================
  // 1. REAL LOCAL DISK STORAGE & WORKSPACE PERSISTENCE API
  // ============================================================================
  app.get('/api/storage/config', (_req: Request, res: Response) => {
    const stats = getDirStats(currentConfig.storageDir);
    const homedir = os.homedir();
    const suggestedPaths = [
      DEFAULT_VAULT_DIR,
      path.join(homedir, 'OpenPost_Vault'),
      'D:\\OpenPost_Data\\Vault',
      'E:\\OpenPost_Data\\Vault',
      '/Volumes/ExternalSSD/OpenPost_Vault',
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
      proxy,
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
      proxy: proxy
        ? { ...DEFAULT_PROXY_CONFIG, ...currentConfig.proxy, ...proxy }
        : currentConfig.proxy || DEFAULT_PROXY_CONFIG,
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
  // 2. REAL HTTP/HTTPS CORS-FREE PROXY ENGINE (/api/proxy & /api/proxy/test)
  // ============================================================================
  app.post('/api/proxy/test', async (req: Request, res: Response) => {
    const incomingProxy: ProxyConfig | undefined = req.body?.proxy || currentConfig.proxy;
    if (!incomingProxy || incomingProxy.mode === 'none') {
      res.status(200).json({ ok: true, message: '当前为直连模式，无需测试代理连通性。' });
      return;
    }

    const effective = resolveEffectiveProxy(incomingProxy, 'https://example.com');
    if (!effective) {
      res.status(200).json({
        ok: false,
        error:
          incomingProxy.mode === 'system'
            ? '未在当前系统环境变量中检测到 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY。'
            : '请填写有效的代理服务器地址与端口。',
      });
      return;
    }

    const start = performance.now();
    try {
      await testTcpReachable(effective.host, effective.port, 5000);
      const latencyMs = Math.max(1, Math.round(performance.now() - start));
      res.status(200).json({
        ok: true,
        latencyMs,
        message: `代理服务器 ${effective.protocol.toUpperCase()}://${effective.host}:${effective.port} 连通正常（握手耗时 ${latencyMs} ms）。`,
      });
    } catch (err: unknown) {
      res.status(200).json({
        ok: false,
        error: `无法连接代理服务器 ${effective.host}:${effective.port} (${
          err instanceof Error ? err.message : String(err)
        })`,
      });
    }
  });

  app.post('/api/proxy', async (req: Request, res: Response) => {
    const {
      url,
      method = 'GET',
      headers = {},
      body = undefined,
      timeoutMs = currentConfig.requestTimeoutMs || 30000,
      verifySsl = currentConfig.verifySsl ?? true,
      proxy = currentConfig.proxy,
    } = req.body || {};

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Target URL is required' });
      return;
    }

    const clampedTimeout = Math.min(Math.max(Number(timeoutMs) || 30000, 1000), 120000);
    const startTotal = performance.now();

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
        outgoingHeaders['User-Agent'] = 'OpenPost-LocalRuntime/2.0 (No-Telemetry; Cross-Platform)';
      }

      const upperMethod = String(method).toUpperCase();
      const canHaveBody = !['GET', 'HEAD'].includes(upperMethod);
      const bodyPayload =
        canHaveBody && body !== undefined && body !== null && body !== ''
          ? typeof body === 'string'
            ? body
            : JSON.stringify(body)
          : undefined;

      const effectiveProxy = resolveEffectiveProxy(proxy, resolvedUrl);

      const upstream = await executeNodeHttpRequest({
        targetUrl: resolvedUrl,
        method: upperMethod,
        headers: outgoingHeaders,
        body: bodyPayload,
        timeoutMs: clampedTimeout,
        verifySsl: Boolean(verifySsl),
        proxy: effectiveProxy,
      });

      const endTotal = performance.now();
      const totalMs = Math.max(1, Math.round(endTotal - startTotal));
      const ttfbMs = Math.max(1, Math.round(upstream.ttfbMs));
      const downloadMs = Math.max(0, totalMs - ttfbMs);

      res.status(200).json({
        ok: true,
        status: upstream.status,
        statusText: upstream.statusText || getStandardStatusText(upstream.status),
        url: upstream.finalUrl || resolvedUrl,
        redirected: upstream.redirected,
        headers: upstream.headers,
        cookies: upstream.cookies,
        contentType: upstream.contentType,
        sizeBytes: upstream.sizeBytes,
        body: upstream.body,
        timing: {
          totalMs,
          ttfbMs,
          downloadMs,
        },
      });
    } catch (err: unknown) {
      const elapsedMs = Math.round(performance.now() - startTotal);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isTimeout =
        (err instanceof Error && (err.name === 'AbortError' || /timed out/i.test(err.message)));

      res.status(200).json({
        ok: false,
        status: 0,
        statusText: isTimeout ? 'Request Timed Out' : 'Network / Connection Error',
        error: isTimeout
          ? `Request timed out after ${clampedTimeout}ms`
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
    console.log(`OpenPost Local API Engine running on http://0.0.0.0:${PORT}`);
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

interface ResolvedProxyTarget {
  protocol: 'http' | 'https' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

function shouldBypassHost(hostname: string, bypassStr?: string): boolean {
  if (!bypassStr) return false;
  const hostLower = hostname.toLowerCase();
  const rules = bypassStr
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const rule of rules) {
    if (rule === '*') return true;
    if (rule === hostLower) return true;
    if (rule.startsWith('*.') && hostLower.endsWith(rule.slice(1))) return true;
    if (rule.startsWith('.') && hostLower.endsWith(rule)) return true;
  }
  return false;
}

function parseProxyUrlString(raw: string): ResolvedProxyTarget | null {
  try {
    const normalized = /^https?:\/\/|^socks5h?:\/\//i.test(raw.trim())
      ? raw.trim()
      : `http://${raw.trim()}`;
    const u = new URL(normalized);
    const protoRaw = u.protocol.replace(':', '').toLowerCase();
    const protocol: 'http' | 'https' | 'socks5' =
      protoRaw === 'https' ? 'https' : protoRaw.startsWith('socks') ? 'socks5' : 'http';
    const port = Number(u.port) || (protocol === 'https' ? 443 : protocol === 'socks5' ? 1080 : 8080);
    if (!u.hostname) return null;
    return {
      protocol,
      host: u.hostname,
      port,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
    };
  } catch {
    return null;
  }
}

function resolveEffectiveProxy(
  proxy: ProxyConfig | undefined,
  targetUrl: string
): ResolvedProxyTarget | null {
  if (!proxy || proxy.mode === 'none') return null;
  let targetHost = '';
  let isHttps = false;
  try {
    const parsedTarget = new URL(targetUrl);
    targetHost = parsedTarget.hostname;
    isHttps = parsedTarget.protocol === 'https:';
  } catch {
    targetHost = '';
  }

  if (targetHost && shouldBypassHost(targetHost, proxy.bypass)) {
    return null;
  }

  if (proxy.mode === 'system') {
    if (targetHost && shouldBypassHost(targetHost, process.env.NO_PROXY || process.env.no_proxy)) {
      return null;
    }
    const envProxy = isHttps
      ? process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.ALL_PROXY ||
        process.env.all_proxy ||
        process.env.HTTP_PROXY ||
        process.env.http_proxy
      : process.env.HTTP_PROXY ||
        process.env.http_proxy ||
        process.env.ALL_PROXY ||
        process.env.all_proxy;
    if (!envProxy) return null;
    return parseProxyUrlString(envProxy);
  }

  const host = proxy.host?.trim();
  const port = Number(proxy.port);
  if (!host || !port || Number.isNaN(port)) return null;
  return {
    protocol: proxy.protocol || 'http',
    host,
    port,
    username: proxy.username?.trim() || undefined,
    password: proxy.password || undefined,
  };
}

function testTcpReachable(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Connection timed out'));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function openHttpConnectTunnel(
  proxy: ResolvedProxyTarget,
  targetHost: string,
  targetPort: number,
  timeoutMs: number,
  verifySsl: boolean
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const rawSocket: net.Socket =
      proxy.protocol === 'https'
        ? tls.connect({
            host: proxy.host,
            port: proxy.port,
            rejectUnauthorized: verifySsl,
          })
        : net.connect({ host: proxy.host, port: proxy.port });

    const timer = setTimeout(() => {
      rawSocket.destroy();
      reject(new Error(`Proxy CONNECT timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onReady = () => {
      const authLine = proxy.username
        ? `Proxy-Authorization: Basic ${Buffer.from(
            `${proxy.username}:${proxy.password || ''}`
          ).toString('base64')}\r\n`
        : '';
      const reqStr = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${authLine}Proxy-Connection: keep-alive\r\n\r\n`;
      rawSocket.write(reqStr);
    };

    if (proxy.protocol === 'https') {
      rawSocket.once('secureConnect', onReady);
    } else {
      rawSocket.once('connect', onReady);
    }

    let buf = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      const headerEnd = buf.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      rawSocket.removeListener('data', onData);
      clearTimeout(timer);
      const head = buf.slice(0, headerEnd).toString('utf-8');
      const statusLine = head.split('\r\n')[0] || '';
      if (/^HTTP\/\d\.\d\s+200/i.test(statusLine)) {
        const leftover = buf.slice(headerEnd + 4);
        if (leftover.length > 0) {
          rawSocket.unshift(leftover);
        }
        resolve(rawSocket);
      } else {
        rawSocket.destroy();
        reject(new Error(`Proxy CONNECT failed: ${statusLine}`));
      }
    };

    rawSocket.on('data', onData);
    rawSocket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function openSocks5Tunnel(
  proxy: ResolvedProxyTarget,
  targetHost: string,
  targetPort: number,
  timeoutMs: number
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxy.host, port: proxy.port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`SOCKS5 proxy timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const fail = (msg: string) => {
      clearTimeout(timer);
      socket.destroy();
      reject(new Error(msg));
    };

    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    socket.once('connect', () => {
      const hasAuth = Boolean(proxy.username);
      const greeting = hasAuth ? Buffer.from([0x05, 0x02, 0x00, 0x02]) : Buffer.from([0x05, 0x01, 0x00]);
      socket.write(greeting);

      let stage: 'greeting' | 'auth' | 'connect' = 'greeting';
      let recv = Buffer.alloc(0);

      const sendConnect = () => {
        stage = 'connect';
        const hostBuf = Buffer.from(targetHost, 'utf-8');
        const reqBuf = Buffer.alloc(7 + hostBuf.length);
        reqBuf[0] = 0x05;
        reqBuf[1] = 0x01; // CONNECT
        reqBuf[2] = 0x00;
        reqBuf[3] = 0x03; // Domain name
        reqBuf[4] = hostBuf.length;
        hostBuf.copy(reqBuf, 5);
        reqBuf.writeUInt16BE(targetPort, 5 + hostBuf.length);
        socket.write(reqBuf);
      };

      const onData = (chunk: Buffer) => {
        recv = Buffer.concat([recv, chunk]);
        if (stage === 'greeting') {
          if (recv.length < 2) return;
          const ver = recv[0];
          const method = recv[1];
          recv = recv.slice(2);
          if (ver !== 0x05 || method === 0xff) {
            return fail('SOCKS5 handshake rejected');
          }
          if (method === 0x02) {
            stage = 'auth';
            const u = Buffer.from(proxy.username || '', 'utf-8');
            const p = Buffer.from(proxy.password || '', 'utf-8');
            const authBuf = Buffer.alloc(3 + u.length + p.length);
            authBuf[0] = 0x01;
            authBuf[1] = u.length;
            u.copy(authBuf, 2);
            authBuf[2 + u.length] = p.length;
            p.copy(authBuf, 3 + u.length);
            socket.write(authBuf);
          } else {
            sendConnect();
          }
        } else if (stage === 'auth') {
          if (recv.length < 2) return;
          const status = recv[1];
          recv = recv.slice(2);
          if (status !== 0x00) {
            return fail('SOCKS5 authentication failed');
          }
          sendConnect();
        } else if (stage === 'connect') {
          if (recv.length < 4) return;
          const rep = recv[1];
          const atyp = recv[3];
          let expectedLen = 4;
          if (atyp === 0x01) expectedLen = 10;
          else if (atyp === 0x04) expectedLen = 22;
          else if (atyp === 0x03) {
            if (recv.length < 5) return;
            expectedLen = 7 + recv[4];
          }
          if (recv.length < expectedLen) return;
          if (rep !== 0x00) {
            return fail(`SOCKS5 CONNECT failed with code ${rep}`);
          }
          socket.removeListener('data', onData);
          clearTimeout(timer);
          const leftover = recv.slice(expectedLen);
          if (leftover.length > 0) socket.unshift(leftover);
          resolve(socket);
        }
      };

      socket.on('data', onData);
    });
  });
}

async function executeNodeHttpRequest(
  opts: {
    targetUrl: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeoutMs: number;
    verifySsl: boolean;
    proxy: ResolvedProxyTarget | null;
  },
  redirectCount = 0
): Promise<{
  status: number;
  statusText: string;
  finalUrl: string;
  redirected: boolean;
  headers: Record<string, string>;
  cookies: string[];
  contentType: string;
  sizeBytes: number;
  body: string;
  ttfbMs: number;
}> {
  const parsed = new URL(opts.targetUrl);
  const isHttps = parsed.protocol === 'https:';
  const targetPort = Number(parsed.port) || (isHttps ? 443 : 80);
  const reqStart = performance.now();

  let tunnelSocket: net.Socket | undefined;
  let useAbsoluteProxyPath = false;

  if (opts.proxy) {
    if (opts.proxy.protocol === 'socks5') {
      const rawSock = await openSocks5Tunnel(
        opts.proxy,
        parsed.hostname,
        targetPort,
        opts.timeoutMs
      );
      tunnelSocket = isHttps
        ? tls.connect({
            socket: rawSock,
            servername: parsed.hostname,
            rejectUnauthorized: opts.verifySsl,
          })
        : rawSock;
    } else if (isHttps) {
      const rawSock = await openHttpConnectTunnel(
        opts.proxy,
        parsed.hostname,
        targetPort,
        opts.timeoutMs,
        opts.verifySsl
      );
      tunnelSocket = tls.connect({
        socket: rawSock,
        servername: parsed.hostname,
        rejectUnauthorized: opts.verifySsl,
      });
    } else {
      useAbsoluteProxyPath = true;
    }
  }

  const response = await new Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    cookies: string[];
    contentType: string;
    buffer: Buffer;
    ttfbMs: number;
  }>((resolve, reject) => {
    const reqHeaders: Record<string, string> = { ...opts.headers };
    if (opts.body !== undefined) {
      reqHeaders['Content-Length'] = String(Buffer.byteLength(opts.body, 'utf-8'));
    }

    if (useAbsoluteProxyPath && opts.proxy) {
      reqHeaders['Host'] = parsed.host;
      if (opts.proxy.username) {
        reqHeaders['Proxy-Authorization'] = `Basic ${Buffer.from(
          `${opts.proxy.username}:${opts.proxy.password || ''}`
        ).toString('base64')}`;
      }
    }

    const handleRes = (incoming: http.IncomingMessage) => {
      const ttfbMs = performance.now() - reqStart;
      const chunks: Buffer[] = [];
      incoming.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      incoming.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const flatHeaders: Record<string, string> = {};
        const cookies: string[] = [];
        for (const [k, v] of Object.entries(incoming.headers)) {
          if (v === undefined) continue;
          if (k.toLowerCase() === 'set-cookie') {
            if (Array.isArray(v)) cookies.push(...v);
            else cookies.push(String(v));
          }
          flatHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
        }
        resolve({
          status: incoming.statusCode || 0,
          statusText: incoming.statusMessage || '',
          headers: flatHeaders,
          cookies,
          contentType: flatHeaders['content-type'] || '',
          buffer,
          ttfbMs,
        });
      });
      incoming.on('error', reject);
    };

    let clientReq: http.ClientRequest;
    if (useAbsoluteProxyPath && opts.proxy) {
      const transport = opts.proxy.protocol === 'https' ? https : http;
      clientReq = transport.request(
        {
          host: opts.proxy.host,
          port: opts.proxy.port,
          path: opts.targetUrl,
          method: opts.method,
          headers: reqHeaders,
          rejectUnauthorized: opts.verifySsl,
        } as https.RequestOptions,
        handleRes
      );
    } else if (tunnelSocket) {
      const transport = isHttps ? https : http;
      clientReq = transport.request(
        {
          hostname: parsed.hostname,
          port: targetPort,
          path: `${parsed.pathname}${parsed.search}`,
          method: opts.method,
          headers: reqHeaders,
          createConnection: () => tunnelSocket!,
          agent: false,
        },
        handleRes
      );
    } else {
      const transport = isHttps ? https : http;
      clientReq = transport.request(
        {
          hostname: parsed.hostname,
          port: targetPort,
          path: `${parsed.pathname}${parsed.search}`,
          method: opts.method,
          headers: reqHeaders,
          rejectUnauthorized: opts.verifySsl,
        } as https.RequestOptions,
        handleRes
      );
    }

    clientReq.setTimeout(opts.timeoutMs, () => {
      clientReq.destroy(new Error(`Request timed out after ${opts.timeoutMs}ms`));
    });
    clientReq.once('error', reject);
    if (opts.body !== undefined) {
      clientReq.write(opts.body);
    }
    clientReq.end();
  });

  if (
    redirectCount < 5 &&
    [301, 302, 303, 307, 308].includes(response.status) &&
    response.headers['location']
  ) {
    const nextUrl = new URL(response.headers['location'], opts.targetUrl).toString();
    const nextMethod = response.status === 303 ? 'GET' : opts.method;
    const nextBody = response.status === 303 ? undefined : opts.body;
    const redirectedRes = await executeNodeHttpRequest(
      { ...opts, targetUrl: nextUrl, method: nextMethod, body: nextBody },
      redirectCount + 1
    );
    return { ...redirectedRes, redirected: true };
  }

  return {
    status: response.status,
    statusText: response.statusText,
    finalUrl: opts.targetUrl,
    redirected: redirectCount > 0,
    headers: response.headers,
    cookies: response.cookies,
    contentType: response.contentType,
    sizeBytes: response.buffer.byteLength,
    body: response.buffer.toString('utf-8'),
    ttfbMs: response.ttfbMs,
  };
}

startServer();
