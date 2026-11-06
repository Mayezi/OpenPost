import {
  ApiRequestItem,
  ApiResponseData,
  AssertionResult,
  AssertionRule,
  CollectionFolder,
  EnvironmentProfile,
  HttpMethod,
  KeyValueItem,
} from '../types/api';

/**
 * Resolves {{variable}} placeholders using active environment variables
 * plus built-in dynamic Postman-compatible variables ({{$timestamp}}, {{$guid}}, {{$randomInt}}, {{$isoTimestamp}}).
 */
export function interpolateString(raw: string, env?: EnvironmentProfile | null): string {
  if (!raw) return '';
  const varMap = new Map<string, string>();
  if (env?.variables) {
    for (const item of env.variables) {
      if (item.enabled && item.key.trim()) {
        varMap.set(item.key.trim(), item.value);
      }
    }
  }

  return raw.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, keyName: string) => {
    const trimmed = keyName.trim();
    if (trimmed === '$timestamp') {
      return String(Math.floor(Date.now() / 1000));
    }
    if (trimmed === '$isoTimestamp') {
      return new Date().toISOString();
    }
    if (trimmed === '$guid' || trimmed === '$uuid') {
      return crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
    }
    if (trimmed === '$randomInt') {
      return String(Math.floor(Math.random() * 9000) + 1000);
    }
    if (varMap.has(trimmed)) {
      return varMap.get(trimmed) ?? '';
    }
    return match;
  });
}

/**
 * Builds the final resolved URL with enabled query parameters and Query-based API key.
 */
export function buildResolvedUrl(req: ApiRequestItem, env?: EnvironmentProfile | null): string {
  const baseResolved = interpolateString(req.url.trim(), env);
  if (!baseResolved) return '';

  const [pathPart, existingQuery] = baseResolved.split('?');
  const searchParams = new URLSearchParams(existingQuery || '');

  for (const param of req.params) {
    if (param.enabled && param.key.trim()) {
      const k = interpolateString(param.key.trim(), env);
      const v = interpolateString(param.value, env);
      searchParams.append(k, v);
    }
  }

  if (
    req.auth.type === 'apikey' &&
    req.auth.apiKeyIn === 'query' &&
    req.auth.apiKeyName?.trim()
  ) {
    searchParams.append(
      interpolateString(req.auth.apiKeyName.trim(), env),
      interpolateString(req.auth.apiKeyValue || '', env)
    );
  }

  const queryString = searchParams.toString();
  return queryString ? `${pathPart}?${queryString}` : pathPart;
}

/**
 * Builds the final resolved Headers dictionary including Auth headers and Content-Type defaults.
 */
export function buildResolvedHeaders(
  req: ApiRequestItem,
  env?: EnvironmentProfile | null
): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const h of req.headers) {
    if (h.enabled && h.key.trim()) {
      const k = interpolateString(h.key.trim(), env);
      const v = interpolateString(h.value, env);
      headers[k] = v;
    }
  }

  // Apply Auth
  if (req.auth.type === 'bearer' && req.auth.bearerToken?.trim()) {
    const token = interpolateString(req.auth.bearerToken.trim(), env);
    headers['Authorization'] = `Bearer ${token}`;
  } else if (req.auth.type === 'basic' && (req.auth.basicUsername || req.auth.basicPassword)) {
    const user = interpolateString(req.auth.basicUsername || '', env);
    const pass = interpolateString(req.auth.basicPassword || '', env);
    const encoded = btoa(unescape(encodeURIComponent(`${user}:${pass}`)));
    headers['Authorization'] = `Basic ${encoded}`;
  } else if (
    req.auth.type === 'apikey' &&
    (req.auth.apiKeyIn === 'header' || !req.auth.apiKeyIn) &&
    req.auth.apiKeyName?.trim()
  ) {
    const k = interpolateString(req.auth.apiKeyName.trim(), env);
    const v = interpolateString(req.auth.apiKeyValue || '', env);
    headers[k] = v;
  }

  // Ensure Content-Type if body is active and not already set
  const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
  if (!hasContentType && !['GET', 'HEAD'].includes(req.method)) {
    if (req.body.type === 'json' || req.body.type === 'graphql') {
      headers['Content-Type'] = 'application/json';
    } else if (req.body.type === 'urlencoded') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (req.body.type === 'form-data') {
      headers['Content-Type'] = 'application/json';
    } else if (req.body.type === 'raw') {
      headers['Content-Type'] = 'text/plain; charset=utf-8';
    }
  }

  return headers;
}

/**
 * Serializes the request body with variable interpolation.
 */
export function buildResolvedBody(
  req: ApiRequestItem,
  env?: EnvironmentProfile | null
): string | undefined {
  if (['GET', 'HEAD'].includes(req.method) || req.body.type === 'none') {
    return undefined;
  }

  if (req.body.type === 'json') {
    return interpolateString(req.body.json || '', env);
  }

  if (req.body.type === 'raw') {
    return interpolateString(req.body.raw || '', env);
  }

  if (req.body.type === 'urlencoded') {
    const params = new URLSearchParams();
    for (const item of req.body.urlencoded || []) {
      if (item.enabled && item.key.trim()) {
        params.append(
          interpolateString(item.key.trim(), env),
          interpolateString(item.value, env)
        );
      }
    }
    return params.toString();
  }

  if (req.body.type === 'form-data') {
    const obj: Record<string, string> = {};
    for (const item of req.body.formData || []) {
      if (item.enabled && item.key.trim()) {
        obj[interpolateString(item.key.trim(), env)] = interpolateString(item.value, env);
      }
    }
    return JSON.stringify(obj, null, 2);
  }

  if (req.body.type === 'graphql') {
    const query = interpolateString(req.body.graphqlQuery || '', env);
    let variablesObj: Record<string, unknown> = {};
    try {
      const varsStr = interpolateString(req.body.graphqlVariables || '{}', env);
      variablesObj = JSON.parse(varsStr || '{}');
    } catch {
      variablesObj = {};
    }
    return JSON.stringify({ query, variables: variablesObj }, null, 2);
  }

  return undefined;
}

/**
 * Safely resolves dot-notation paths like "data.0.name" or "choices.0.message.content" on a parsed JSON object.
 */
export function getByJsonPath(obj: unknown, pathStr: string): unknown {
  if (!obj || typeof obj !== 'object' || !pathStr.trim()) return undefined;
  const normalized = pathStr
    .trim()
    .replace(/^\$\.?/, '')
    .replace(/\[(\d+)\]/g, '.$1');
  const parts = normalized.split('.').filter(Boolean);

  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Evaluates visual/script assertions and extracts environment variables from JSON response.
 */
export function evaluateAssertions(
  rules: AssertionRule[],
  response: {
    status: number;
    headers: Record<string, string>;
    body: string;
    timing: { totalMs: number };
  }
): {
  results: AssertionResult[];
  extractedVars: Array<{ key: string; value: string }>;
} {
  const results: AssertionResult[] = [];
  const extractedVars: Array<{ key: string; value: string }> = [];

  let parsedJson: unknown = undefined;
  try {
    parsedJson = response.body ? JSON.parse(response.body) : undefined;
  } catch {
    parsedJson = undefined;
  }

  for (const rule of rules) {
    if (!rule.enabled) continue;

    if (rule.type === 'status_eq') {
      const expectedCode = Number(rule.expected.trim());
      const passed = response.status === expectedCode;
      results.push({
        id: rule.id,
        label: `HTTP 状态码等于 ${expectedCode}`,
        passed,
        actual: String(response.status),
        expected: String(expectedCode),
      });
    } else if (rule.type === 'time_lt') {
      const maxMs = Number(rule.expected.trim()) || 1000;
      const passed = response.timing.totalMs < maxMs;
      results.push({
        id: rule.id,
        label: `响应耗时小于 ${maxMs} ms`,
        passed,
        actual: `${response.timing.totalMs} ms`,
        expected: `< ${maxMs} ms`,
      });
    } else if (rule.type === 'header_contains') {
      const targetHeader = rule.target.trim().toLowerCase();
      const matchedEntry = Object.entries(response.headers).find(
        ([k]) => k.toLowerCase() === targetHeader
      );
      const actualVal = matchedEntry ? matchedEntry[1] : '(未找到该响应头)';
      const passed = matchedEntry
        ? actualVal.toLowerCase().includes(rule.expected.trim().toLowerCase())
        : false;
      results.push({
        id: rule.id,
        label: `响应头 [${rule.target}] 包含 "${rule.expected}"`,
        passed,
        actual: actualVal,
        expected: rule.expected,
      });
    } else if (rule.type === 'json_path_exists') {
      const val = getByJsonPath(parsedJson, rule.target);
      const passed = val !== undefined && val !== null;
      results.push({
        id: rule.id,
        label: `JSON 字段 [${rule.target}] 存在`,
        passed,
        actual: passed ? JSON.stringify(val).slice(0, 60) : 'undefined',
        expected: '非空字段',
      });
    } else if (rule.type === 'json_path_eq') {
      const val = getByJsonPath(parsedJson, rule.target);
      const actualStr = val === undefined ? 'undefined' : String(val);
      const passed = actualStr === rule.expected.trim();
      results.push({
        id: rule.id,
        label: `JSON 字段 [${rule.target}] == ${rule.expected}`,
        passed,
        actual: actualStr,
        expected: rule.expected.trim(),
      });
    } else if (rule.type === 'extract_env') {
      const val = getByJsonPath(parsedJson, rule.target);
      const varName = rule.expected.trim();
      const passed = val !== undefined && val !== null && Boolean(varName);
      if (passed) {
        extractedVars.push({
          key: varName,
          value: typeof val === 'object' ? JSON.stringify(val) : String(val),
        });
      }
      results.push({
        id: rule.id,
        label: `提取 JSON [${rule.target}] → 写入环境变量 {{${varName}}}`,
        passed,
        actual: passed ? `${varName} = ${String(val).slice(0, 48)}` : '未找到目标 JSON 路径',
        expected: `设置 {{${varName}}}`,
        isEnvExtraction: true,
      });
    }
  }

  return { results, extractedVars };
}

/**
 * Executes an API request either through the built-in Local Node Proxy (/api/proxy) or Browser Direct Fetch.
 */
export async function executeApiRequest(
  req: ApiRequestItem,
  env: EnvironmentProfile | null,
  engine: 'local-proxy' | 'browser-direct' = 'local-proxy'
): Promise<ApiResponseData> {
  const finalUrl = buildResolvedUrl(req, env);
  const finalHeaders = buildResolvedHeaders(req, env);
  const finalBody = buildResolvedBody(req, env);

  if (engine === 'local-proxy') {
    const proxyRes = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: finalUrl,
        method: req.method,
        headers: finalHeaders,
        body: finalBody,
        timeoutMs: 30000,
      }),
    });

    const data = await proxyRes.json();
    const { results, extractedVars } = evaluateAssertions(req.assertions || [], {
      status: data.status || 0,
      headers: data.headers || {},
      body: data.body || '',
      timing: data.timing || { totalMs: 0 },
    });

    return {
      ok: Boolean(data.ok),
      status: data.status ?? 0,
      statusText: data.statusText || 'Error',
      url: data.url || finalUrl,
      headers: data.headers || {},
      cookies: data.cookies || [],
      contentType: data.contentType || '',
      sizeBytes: data.sizeBytes || 0,
      body: data.body || '',
      timing: data.timing || { totalMs: 0, ttfbMs: 0, downloadMs: 0 },
      error: data.error,
      engine: 'local-proxy',
      timestamp: new Date().toISOString(),
      assertionResults: results,
      extractedVars,
    };
  } else {
    // Browser Direct Fetch
    const start = performance.now();
    try {
      const init: RequestInit = {
        method: req.method,
        headers: finalHeaders,
      };
      if (finalBody !== undefined && !['GET', 'HEAD'].includes(req.method)) {
        init.body = finalBody;
      }
      const res = await fetch(finalUrl, init);
      const ttfb = performance.now();
      const text = await res.text();
      const end = performance.now();

      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        respHeaders[k] = v;
      });

      const totalMs = Math.max(1, Math.round(end - start));
      const ttfbMs = Math.max(1, Math.round(ttfb - start));
      const sizeBytes = new Blob([text]).size;

      const { results, extractedVars } = evaluateAssertions(req.assertions || [], {
        status: res.status,
        headers: respHeaders,
        body: text,
        timing: { totalMs },
      });

      return {
        ok: true,
        status: res.status,
        statusText: res.statusText || 'OK',
        url: res.url || finalUrl,
        headers: respHeaders,
        cookies: [],
        contentType: res.headers.get('content-type') || '',
        sizeBytes,
        body: text,
        timing: {
          totalMs,
          ttfbMs,
          downloadMs: Math.max(0, totalMs - ttfbMs),
        },
        engine: 'browser-direct',
        timestamp: new Date().toISOString(),
        assertionResults: results,
        extractedVars,
      };
    } catch (err: unknown) {
      const elapsed = Math.max(1, Math.round(performance.now() - start));
      return {
        ok: false,
        status: 0,
        statusText: 'CORS / Network Error',
        url: finalUrl,
        headers: {},
        cookies: [],
        contentType: 'text/plain',
        sizeBytes: 0,
        body: '',
        timing: { totalMs: elapsed, ttfbMs: elapsed, downloadMs: 0 },
        error: `浏览器直连受阻 (${err instanceof Error ? err.message : String(err)})。建议切换为「本地无跨域代理引擎 (Local Proxy)」。`,
        engine: 'browser-direct',
        timestamp: new Date().toISOString(),
        assertionResults: [],
        extractedVars: [],
      };
    }
  }
}

/**
 * Generates multi-language code snippets for the active request.
 */
export function generateCodeSnippet(
  req: ApiRequestItem,
  env: EnvironmentProfile | null,
  lang: 'curl' | 'fetch' | 'axios' | 'python' | 'go' | 'rust'
): string {
  const url = buildResolvedUrl(req, env) || 'https://httpbin.org/get';
  const absoluteUrl = url.startsWith('/') ? `${window.location.origin}${url}` : url;
  const headers = buildResolvedHeaders(req, env);
  const body = buildResolvedBody(req, env);

  if (lang === 'curl') {
    const lines: string[] = [`curl -X ${req.method} '${absoluteUrl}'`];
    for (const [k, v] of Object.entries(headers)) {
      lines.push(`  -H '${k}: ${v.replace(/'/g, "'\\''")}'`);
    }
    if (body) {
      lines.push(`  -d '${body.replace(/'/g, "'\\''")}'`);
    }
    return lines.join(' \\\n');
  }

  if (lang === 'fetch') {
    const options: Record<string, unknown> = {
      method: req.method,
      headers,
    };
    const headerStr = JSON.stringify(options.headers, null, 4).replace(/\}$/, '  }');
    let code = `const response = await fetch('${absoluteUrl}', {\n  method: '${req.method}',\n  headers: ${headerStr}`;
    if (body) {
      code += `,\n  body: ${JSON.stringify(body)}`;
    }
    code += `\n});\n\nconst data = await response.json();\nconsole.log(response.status, data);`;
    return code;
  }

  if (lang === 'axios') {
    let parsedData: unknown = body;
    try {
      if (body) parsedData = JSON.parse(body);
    } catch {
      parsedData = body;
    }
    return `import axios from 'axios';\n\nconst response = await axios({\n  method: '${req.method.toLowerCase()}',\n  url: '${absoluteUrl}',\n  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')}${
      body ? `,\n  data: ${JSON.stringify(parsedData, null, 2).replace(/\n/g, '\n  ')}` : ''
    }\n});\n\nconsole.log(response.status, response.data);`;
  }

  if (lang === 'python') {
    return `import requests\n\nurl = "${absoluteUrl}"\nheaders = ${JSON.stringify(headers, null, 4)}\n${
      body ? `payload = ${JSON.stringify(body)}\n\nresponse = requests.request("${req.method}", url, headers=headers, data=payload)` : `\nresponse = requests.request("${req.method}", url, headers=headers)`
    }\nprint(response.status_code)\nprint(response.text)`;
  }

  if (lang === 'go') {
    const headerLines = Object.entries(headers)
      .map(([k, v]) => `\treq.Header.Add("${k}", "${v.replace(/"/g, '\\"')}")`)
      .join('\n');
    return `package main\n\nimport (\n\t"fmt"\n\t"io"\n\t"net/http"\n${body ? '\t"strings"\n' : ''})\n\nfunc main() {\n\turl := "${absoluteUrl}"\n${
      body
        ? `\tpayload := strings.NewReader(${JSON.stringify(body)})\n\treq, _ := http.NewRequest("${req.method}", url, payload)`
        : `\treq, _ := http.NewRequest("${req.method}", url, nil)`
    }\n${headerLines ? headerLines + '\n' : ''}\tres, err := http.DefaultClient.Do(req)\n\tif err != nil {\n\t\tpanic(err)\n\t}\n\tdefer res.Body.Close()\n\tbody, _ := io.ReadAll(res.Body)\n\tfmt.Println(res.Status)\n\tfmt.Println(string(body))\n}`;
  }

  // Rust (reqwest)
  const rustHeaders = Object.entries(headers)
    .map(([k, v]) => `        .header("${k}", "${v.replace(/"/g, '\\"')}")`)
    .join('\n');
  return `use reqwest::Client;\n\n#[tokio::main]\nasync fn main() -> Result<(), Box<dyn std::error::Error>> {\n    let client = Client::new();\n    let res = client\n        .${req.method.toLowerCase()}("${absoluteUrl}")\n${
    rustHeaders ? rustHeaders + '\n' : ''
  }${body ? `        .body(${JSON.stringify(body)})\n` : ''}        .send()\n        .await?;\n\n    println!("Status: {}", res.status());\n    println!("Body: {}", res.text().await?);\n    Ok(())\n}`;
}

/**
 * Parses a raw cURL command string into an ApiRequestItem.
 */
export function parseCurlCommand(curlInput: string, targetFolderId: string): ApiRequestItem {
  const cleaned = curlInput
    .replace(/\\\r?\n/g, ' ')
    .trim();

  // Tokenize respecting single and double quotes
  const tokens: string[] = [];
  let current = '';
  let inQuote: "'" | '"' | null = null;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuote) {
      if (ch === inQuote && cleaned[i - 1] !== '\\') {
        inQuote = null;
      } else {
        current += ch;
      }
    } else {
      if (ch === "'" || ch === '"') {
        inQuote = ch;
      } else if (/\s/.test(ch)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += ch;
      }
    }
  }
  if (current) tokens.push(current);

  let method: HttpMethod = 'GET';
  let explicitMethod = false;
  let rawUrl = '';
  const headers: KeyValueItem[] = [];
  let bodyStr = '';

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'curl') continue;

    if (t === '-X' || t === '--request') {
      const next = tokens[++i]?.toUpperCase();
      if (next && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(next)) {
        method = next as HttpMethod;
        explicitMethod = true;
      }
    } else if (t === '-H' || t === '--header') {
      const headerVal = tokens[++i] || '';
      const colonIdx = headerVal.indexOf(':');
      if (colonIdx > 0) {
        const k = headerVal.slice(0, colonIdx).trim();
        const v = headerVal.slice(colonIdx + 1).trim();
        headers.push({
          id: `h_${Date.now()}_${headers.length}`,
          key: k,
          value: v,
          enabled: true,
        });
      }
    } else if (
      t === '-d' ||
      t === '--data' ||
      t === '--data-raw' ||
      t === '--data-binary' ||
      t === '--json'
    ) {
      bodyStr = tokens[++i] || '';
      if (!explicitMethod) {
        method = 'POST';
      }
      if (t === '--json') {
        headers.push({
          id: `h_json_${Date.now()}`,
          key: 'Content-Type',
          value: 'application/json',
          enabled: true,
        });
      }
    } else if (!t.startsWith('-') && !rawUrl) {
      rawUrl = t;
    }
  }

  // Extract query params from rawUrl
  const params: KeyValueItem[] = [];
  let baseUrl = rawUrl || 'https://httpbin.org/get';
  const qIndex = baseUrl.indexOf('?');
  if (qIndex !== -1) {
    const queryPart = baseUrl.slice(qIndex + 1);
    baseUrl = baseUrl.slice(0, qIndex);
    const sp = new URLSearchParams(queryPart);
    sp.forEach((v, k) => {
      params.push({
        id: `p_${Date.now()}_${params.length}`,
        key: k,
        value: v,
        enabled: true,
      });
    });
  }

  // Check if body is JSON
  let bodyType: 'none' | 'json' | 'raw' = 'none';
  let jsonStr = '';
  let rawStr = '';

  if (bodyStr) {
    try {
      const parsed = JSON.parse(bodyStr);
      bodyType = 'json';
      jsonStr = JSON.stringify(parsed, null, 2);
    } catch {
      bodyType = 'raw';
      rawStr = bodyStr;
    }
  }

  let hostnameLabel = 'Imported cURL';
  try {
    const u = new URL(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`);
    hostnameLabel = `${method} ${u.pathname === '/' ? u.hostname : u.pathname}`;
  } catch {
    hostnameLabel = `${method} ${baseUrl.slice(0, 28)}`;
  }

  return {
    id: `req_curl_${Date.now()}`,
    name: hostnameLabel,
    folderId: targetFolderId,
    method,
    url: baseUrl,
    params,
    headers,
    auth: { type: 'none' },
    body: {
      type: bodyType,
      json: jsonStr,
      raw: rawStr,
      formData: [],
      urlencoded: [],
      graphqlQuery: '',
      graphqlVariables: '{}',
    },
    assertions: [
      { id: `as_${Date.now()}`, enabled: true, type: 'status_eq', target: 'status', expected: '200' },
    ],
    description: '由 cURL 命令本地解析导入',
  };
}

/**
 * Exports all folders, requests, and environments in Postman v2.1 + ZeroPost Dual-Compatible JSON format.
 */
export function exportWorkspaceBundle(
  folders: CollectionFolder[],
  requests: ApiRequestItem[],
  environments: EnvironmentProfile[]
): string {
  const postmanItems = folders.map((folder) => {
    const folderReqs = requests.filter((r) => r.folderId === folder.id);
    return {
      name: folder.name,
      description: folder.description || '',
      item: folderReqs.map((r) => ({
        name: r.name,
        request: {
          method: r.method,
          header: r.headers.map((h) => ({
            key: h.key,
            value: h.value,
            disabled: !h.enabled,
          })),
          url: {
            raw: r.url,
            query: r.params.map((p) => ({
              key: p.key,
              value: p.value,
              disabled: !p.enabled,
            })),
          },
          body:
            r.body.type === 'json'
              ? { mode: 'raw', raw: r.body.json, options: { raw: { language: 'json' } } }
              : r.body.type === 'raw'
              ? { mode: 'raw', raw: r.body.raw }
              : undefined,
          description: r.description || '',
        },
      })),
    };
  });

  return JSON.stringify(
    {
      info: {
        name: 'openPost Local API Vault',
        description: '100% Local-First Zero-Backdoor API Workspace (Postman v2.1 Compatible)',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        exportedAt: new Date().toISOString(),
      },
      item: postmanItems,
      openpost_native: {
        version: '1.0.0',
        folders,
        requests,
        environments,
      },
    },
    null,
    2
  );
}
