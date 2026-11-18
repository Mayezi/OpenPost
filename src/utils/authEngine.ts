import {
  ApiRequestItem,
  AuthConfig,
  CollectionFolder,
  EnvironmentProfile,
} from '../types/api';

function resolveVars(raw: string | undefined, env?: EnvironmentProfile | null): string {
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
    if (trimmed === '$timestamp') return String(Math.floor(Date.now() / 1000));
    if (trimmed === '$isoTimestamp') return new Date().toISOString();
    if (trimmed === '$guid' || trimmed === '$uuid') {
      return crypto.randomUUID ? crypto.randomUUID() : randomHex(16);
    }
    if (trimmed === '$randomInt') return String(Math.floor(Math.random() * 9000) + 1000);
    if (varMap.has(trimmed)) return varMap.get(trimmed) ?? '';
    return match;
  });
}

function randomHex(byteLen: number): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function utf8Bytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function utf16LeBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return out;
}

// ============================================================================
// Pure TypeScript MD5 & MD4 (Required for Digest Auth & NTLM)
// ============================================================================
function md5Bytes(input: Uint8Array): Uint8Array {
  const origLen = input.length;
  const bitLen = origLen * 8;
  const padLen = ((56 - ((origLen + 1) % 64)) + 64) % 64;
  const padded = new Uint8Array(origLen + 1 + padLen + 8);
  padded.set(input);
  padded[origLen] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLen >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000) >>> 0, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  }

  for (let offset = 0; offset < padded.length; offset += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(offset + j * 4, true);
    }
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F = 0;
      let g = 0;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      const dTemp = D;
      D = C;
      C = B;
      const sum = (A + F + K[i] + M[g]) >>> 0;
      const rot = (sum << s[i]) | (sum >>> (32 - s[i]));
      B = (B + rot) >>> 0;
      A = dTemp;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return out;
}

function md5Hex(str: string): string {
  return bytesToHex(md5Bytes(utf8Bytes(str)));
}

function md4Bytes(input: Uint8Array): Uint8Array {
  const origLen = input.length;
  const bitLen = origLen * 8;
  const padLen = ((56 - ((origLen + 1) % 64)) + 64) % 64;
  const padded = new Uint8Array(origLen + 1 + padLen + 8);
  padded.set(input);
  padded[origLen] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLen >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000) >>> 0, true);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const X = new Uint32Array(16);
    for (let j = 0; j < 16; j++) X[j] = view.getUint32(offset + j * 4, true);

    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;

    const r1 = (p: number, q: number, r: number, s: number, k: number, sh: number) =>
      rotl((p + ((q & r) | (~q & s)) + X[k]) >>> 0, sh);
    const r2 = (p: number, q: number, r: number, s: number, k: number, sh: number) =>
      rotl((p + ((q & r) | (q & s) | (r & s)) + X[k] + 0x5a827999) >>> 0, sh);
    const r3 = (p: number, q: number, r: number, s: number, k: number, sh: number) =>
      rotl((p + (q ^ r ^ s) + X[k] + 0x6ed9eba1) >>> 0, sh);

    a = r1(a, b, c, d, 0, 3); d = r1(d, a, b, c, 1, 7); c = r1(c, d, a, b, 2, 11); b = r1(b, c, d, a, 3, 19);
    a = r1(a, b, c, d, 4, 3); d = r1(d, a, b, c, 5, 7); c = r1(c, d, a, b, 6, 11); b = r1(b, c, d, a, 7, 19);
    a = r1(a, b, c, d, 8, 3); d = r1(d, a, b, c, 9, 7); c = r1(c, d, a, b, 10, 11); b = r1(b, c, d, a, 11, 19);
    a = r1(a, b, c, d, 12, 3); d = r1(d, a, b, c, 13, 7); c = r1(c, d, a, b, 14, 11); b = r1(b, c, d, a, 15, 19);

    a = r2(a, b, c, d, 0, 3); d = r2(d, a, b, c, 4, 5); c = r2(c, d, a, b, 8, 9); b = r2(b, c, d, a, 12, 13);
    a = r2(a, b, c, d, 1, 3); d = r2(d, a, b, c, 5, 5); c = r2(c, d, a, b, 9, 9); b = r2(b, c, d, a, 13, 13);
    a = r2(a, b, c, d, 2, 3); d = r2(d, a, b, c, 6, 5); c = r2(c, d, a, b, 10, 9); b = r2(b, c, d, a, 14, 13);
    a = r2(a, b, c, d, 3, 3); d = r2(d, a, b, c, 7, 5); c = r2(c, d, a, b, 11, 9); b = r2(b, c, d, a, 15, 13);

    a = r3(a, b, c, d, 0, 3); d = r3(d, a, b, c, 8, 9); c = r3(c, d, a, b, 4, 11); b = r3(b, c, d, a, 12, 15);
    a = r3(a, b, c, d, 2, 3); d = r3(d, a, b, c, 10, 9); c = r3(c, d, a, b, 6, 11); b = r3(b, c, d, a, 14, 15);
    a = r3(a, b, c, d, 1, 3); d = r3(d, a, b, c, 9, 9); c = r3(c, d, a, b, 5, 11); b = r3(b, c, d, a, 13, 15);
    a = r3(a, b, c, d, 3, 3); d = r3(d, a, b, c, 11, 9); c = r3(c, d, a, b, 7, 11); b = r3(b, c, d, a, 15, 15);

    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a, true);
  outView.setUint32(4, b, true);
  outView.setUint32(8, c, true);
  outView.setUint32(12, d, true);
  return out;
}

function hmacMd5Bytes(key: Uint8Array, msg: Uint8Array): Uint8Array {
  const blockSize = 64;
  const k = key.length > blockSize ? md5Bytes(key) : key;
  const oPad = new Uint8Array(blockSize).fill(0x5c);
  const iPad = new Uint8Array(blockSize).fill(0x36);
  for (let i = 0; i < k.length; i++) {
    oPad[i] ^= k[i];
    iPad[i] ^= k[i];
  }
  const inner = new Uint8Array(blockSize + msg.length);
  inner.set(iPad);
  inner.set(msg, blockSize);
  const innerHash = md5Bytes(inner);
  const outer = new Uint8Array(blockSize + innerHash.length);
  outer.set(oPad);
  outer.set(innerHash, blockSize);
  return md5Bytes(outer);
}

// ============================================================================
// WebCrypto Helpers
// ============================================================================
async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(digest);
}

async function sha256Hex(str: string): Promise<string> {
  return bytesToHex(await sha256Bytes(utf8Bytes(str)));
}

async function hmacBytes(
  algo: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512',
  key: Uint8Array,
  msg: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: algo },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msg as BufferSource);
  return new Uint8Array(sig);
}

// ============================================================================
// Resolve Parent Inheritance
// ============================================================================
export function resolveEffectiveAuth(
  req: ApiRequestItem,
  folders?: CollectionFolder[]
): AuthConfig {
  if (req.auth.type !== 'inherit') {
    return req.auth;
  }
  const parentFolder = folders?.find((f) => f.id === req.folderId);
  if (parentFolder?.auth && parentFolder.auth.type !== 'inherit') {
    return parentFolder.auth;
  }
  return { type: 'none' };
}

// ============================================================================
// OAuth 1.0 Percent Encoding & Signing
// ============================================================================
function oauthPercentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

// ============================================================================
// Digest Auth Helper
// ============================================================================
export function parseDigestChallenge(headerValue: string): Record<string, string> {
  const result: Record<string, string> = {};
  const stripped = headerValue.replace(/^Digest\s+/i, '');
  const regex = /([a-zA-Z0-9_-]+)=(?:"([^"]*)"|([^,\s]+))/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(stripped)) !== null) {
    result[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3];
  }
  return result;
}

export async function buildDigestAuthorizationHeader(params: {
  username: string;
  password: string;
  method: string;
  uri: string;
  realm: string;
  nonce: string;
  algorithm?: string;
  qop?: string;
  nc?: string;
  cnonce?: string;
  opaque?: string;
  body?: string;
}): Promise<string> {
  const algRaw = (params.algorithm || 'MD5').toUpperCase();
  const isSha256 = algRaw.startsWith('SHA-256');
  const isSess = algRaw.endsWith('-SESS');
  const hashFn = async (val: string) => (isSha256 ? sha256Hex(val) : md5Hex(val));

  const cnonce = params.cnonce || randomHex(8);
  const nc = params.nc || '00000001';
  const qopList = (params.qop || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const selectedQop = qopList.includes('auth')
    ? 'auth'
    : qopList.includes('auth-int')
    ? 'auth-int'
    : params.qop?.trim() || '';

  let ha1 = await hashFn(`${params.username}:${params.realm}:${params.password}`);
  if (isSess) {
    ha1 = await hashFn(`${ha1}:${params.nonce}:${cnonce}`);
  }

  let ha2: string;
  if (selectedQop === 'auth-int') {
    const bodyHash = await hashFn(params.body || '');
    ha2 = await hashFn(`${params.method.toUpperCase()}:${params.uri}:${bodyHash}`);
  } else {
    ha2 = await hashFn(`${params.method.toUpperCase()}:${params.uri}`);
  }

  let responseHash: string;
  if (selectedQop) {
    responseHash = await hashFn(
      `${ha1}:${params.nonce}:${nc}:${cnonce}:${selectedQop}:${ha2}`
    );
  } else {
    responseHash = await hashFn(`${ha1}:${params.nonce}:${ha2}`);
  }

  const parts = [
    `username="${params.username}"`,
    `realm="${params.realm}"`,
    `nonce="${params.nonce}"`,
    `uri="${params.uri}"`,
    `algorithm=${algRaw}`,
    `response="${responseHash}"`,
  ];
  if (selectedQop) {
    parts.push(`qop=${selectedQop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (params.opaque) {
    parts.push(`opaque="${params.opaque}"`);
  }
  return `Digest ${parts.join(', ')}`;
}

// ============================================================================
// NTLM Type 1 & Type 3 (NTLMv2) Helpers
// ============================================================================
export function buildNtlmType1Header(domain = '', workstation = ''): string {
  const domBytes = utf8Bytes(domain.toUpperCase());
  const wsBytes = utf8Bytes(workstation.toUpperCase());
  const flags = 0x00008207 | 0x00000200; // NTLMSSP_NEGOTIATE_UNICODE | OEM | REQUEST_TARGET | NTLM | ALWAYS_SIGN | EXTENDED_SESSIONSECURITY
  const buf = new Uint8Array(32 + domBytes.length + wsBytes.length);
  const view = new DataView(buf.buffer);
  buf.set(utf8Bytes('NTLMSSP\0'), 0);
  view.setUint32(8, 1, true); // Type 1
  view.setUint32(12, flags, true);
  // Domain fields
  view.setUint16(16, domBytes.length, true);
  view.setUint16(18, domBytes.length, true);
  view.setUint32(20, 32, true);
  // Workstation fields
  view.setUint16(24, wsBytes.length, true);
  view.setUint16(26, wsBytes.length, true);
  view.setUint32(28, 32 + domBytes.length, true);
  buf.set(domBytes, 32);
  buf.set(wsBytes, 32 + domBytes.length);
  return `NTLM ${bytesToBase64(buf)}`;
}

export function buildNtlmType3Header(params: {
  type2Base64: string;
  username: string;
  password: string;
  domain?: string;
  workstation?: string;
}): string {
  const challengeMsg = base64ToBytes(params.type2Base64.trim());
  const view2 = new DataView(challengeMsg.buffer);
  const serverChallenge = challengeMsg.slice(24, 32);
  const flags = challengeMsg.length >= 24 ? view2.getUint32(20, true) : 0x00008201;

  let targetInfo = new Uint8Array(0);
  if (challengeMsg.length >= 48) {
    const tiLen = view2.getUint16(40, true);
    const tiOffset = view2.getUint32(44, true);
    if (tiLen > 0 && tiOffset + tiLen <= challengeMsg.length) {
      targetInfo = challengeMsg.slice(tiOffset, tiOffset + tiLen);
    }
  }

  const domain = params.domain || '';
  const workstation = params.workstation || '';

  // NTLMv2 Key = HMAC_MD5(MD4(UTF16LE(password)), UTF16LE(UPPER(user) + domain))
  const ntHash = md4Bytes(utf16LeBytes(params.password));
  const userDom = utf16LeBytes(params.username.toUpperCase() + domain);
  const ntlmV2Hash = hmacMd5Bytes(ntHash, userDom);

  const clientChallenge = new Uint8Array(8);
  crypto.getRandomValues(clientChallenge);
  const nowFileTime = (BigInt(Date.now()) + 11644473600000n) * 10000n;

  const blob = new Uint8Array(28 + targetInfo.length + 4);
  const blobView = new DataView(blob.buffer);
  blobView.setUint32(0, 0x00000101, true); // RespType + HiRespType
  blobView.setUint32(4, 0, true);
  blobView.setBigUint64(8, nowFileTime, true);
  blob.set(clientChallenge, 16);
  blobView.setUint32(24, 0, true);
  blob.set(targetInfo, 28);
  blobView.setUint32(28 + targetInfo.length, 0, true);

  const challengeAndBlob = new Uint8Array(8 + blob.length);
  challengeAndBlob.set(serverChallenge, 0);
  challengeAndBlob.set(blob, 8);
  const ntProofStr = hmacMd5Bytes(ntlmV2Hash, challengeAndBlob);

  const ntResp = new Uint8Array(ntProofStr.length + blob.length);
  ntResp.set(ntProofStr, 0);
  ntResp.set(blob, ntProofStr.length);

  // LMv2 response
  const lmChallengeInput = new Uint8Array(16);
  lmChallengeInput.set(serverChallenge, 0);
  lmChallengeInput.set(clientChallenge, 8);
  const lmHash = hmacMd5Bytes(ntlmV2Hash, lmChallengeInput);
  const lmResp = new Uint8Array(24);
  lmResp.set(lmHash, 0);
  lmResp.set(clientChallenge, 16);

  const domBytes = utf16LeBytes(domain);
  const userBytes = utf16LeBytes(params.username);
  const wsBytes = utf16LeBytes(workstation);

  const headerSize = 64;
  let cursor = headerSize;
  const domOff = cursor; cursor += domBytes.length;
  const userOff = cursor; cursor += userBytes.length;
  const wsOff = cursor; cursor += wsBytes.length;
  const lmOff = cursor; cursor += lmResp.length;
  const ntOff = cursor; cursor += ntResp.length;

  const out = new Uint8Array(cursor);
  const outView = new DataView(out.buffer);
  out.set(utf8Bytes('NTLMSSP\0'), 0);
  outView.setUint32(8, 3, true); // Type 3

  const writeSec = (off: number, len: number, dataOff: number) => {
    outView.setUint16(off, len, true);
    outView.setUint16(off + 2, len, true);
    outView.setUint32(off + 4, dataOff, true);
  };

  writeSec(12, lmResp.length, lmOff);
  writeSec(20, ntResp.length, ntOff);
  writeSec(28, domBytes.length, domOff);
  writeSec(36, userBytes.length, userOff);
  writeSec(44, wsBytes.length, wsOff);
  writeSec(52, 0, cursor);
  outView.setUint32(60, flags & 0x000fffff, true);

  out.set(domBytes, domOff);
  out.set(userBytes, userOff);
  out.set(wsBytes, wsOff);
  out.set(lmResp, lmOff);
  out.set(ntResp, ntOff);

  return `NTLM ${bytesToBase64(out)}`;
}

// ============================================================================
// Main Auth Artifact Builder (Async, Real Cryptographic Signing)
// ============================================================================
export interface AuthArtifacts {
  extraHeaders: Record<string, string>;
  extraQueryParams: Array<[string, string]>;
  challengeMode?: 'digest' | 'ntlm';
  effectiveAuth: AuthConfig;
}

export async function computeAuthArtifacts(
  req: ApiRequestItem,
  resolvedUrl: string,
  method: string,
  existingHeaders: Record<string, string>,
  body: string | undefined,
  env?: EnvironmentProfile | null,
  folders?: CollectionFolder[]
): Promise<AuthArtifacts> {
  const effectiveAuth = resolveEffectiveAuth(req, folders);
  const extraHeaders: Record<string, string> = {};
  const extraQueryParams: Array<[string, string]> = [];
  let challengeMode: 'digest' | 'ntlm' | undefined;

  if (effectiveAuth.type === 'none') {
    return { extraHeaders, extraQueryParams, effectiveAuth };
  }

  // 1. Bearer Token
  if (effectiveAuth.type === 'bearer') {
    const token = resolveVars(effectiveAuth.bearerToken, env).trim();
    if (token) {
      extraHeaders['Authorization'] = `Bearer ${token}`;
    }
    return { extraHeaders, extraQueryParams, effectiveAuth };
  }

  // 2. Basic Auth
  if (effectiveAuth.type === 'basic') {
    const user = resolveVars(effectiveAuth.basicUsername, env);
    const pass = resolveVars(effectiveAuth.basicPassword, env);
    if (user || pass) {
      const encoded = btoa(unescape(encodeURIComponent(`${user}:${pass}`)));
      extraHeaders['Authorization'] = `Basic ${encoded}`;
    }
    return { extraHeaders, extraQueryParams, effectiveAuth };
  }

  // 3. API Key
  if (effectiveAuth.type === 'apikey') {
    const name = resolveVars(effectiveAuth.apiKeyName, env).trim();
    const val = resolveVars(effectiveAuth.apiKeyValue, env);
    if (name) {
      if (effectiveAuth.apiKeyIn === 'query') {
        extraQueryParams.push([name, val]);
      } else {
        extraHeaders[name] = val;
      }
    }
    return { extraHeaders, extraQueryParams, effectiveAuth };
  }

  // 4. JWT Bearer (Real HMAC-SHA256/384/512 Signing)
  if (effectiveAuth.type === 'jwt') {
    const alg = effectiveAuth.jwtAlgorithm || 'HS256';
    let customHeaders: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(resolveVars(effectiveAuth.jwtHeadersJson, env) || '{}');
      if (parsed && typeof parsed === 'object') customHeaders = parsed;
    } catch {
      customHeaders = {};
    }
    const headerObj = { alg, typ: 'JWT', ...customHeaders };
    const payloadStr =
      resolveVars(effectiveAuth.jwtPayload, env).trim() ||
      JSON.stringify({ iat: Math.floor(Date.now() / 1000) });

    const encodedHeader = toBase64Url(utf8Bytes(JSON.stringify(headerObj)));
    const encodedPayload = toBase64Url(utf8Bytes(payloadStr));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    let signature = '';
    if (alg !== 'none') {
      const secretRaw = resolveVars(effectiveAuth.jwtSecret, env);
      const keyBytes = effectiveAuth.jwtSecretBase64
        ? base64ToBytes(secretRaw.trim())
        : utf8Bytes(secretRaw);
      const shaAlg =
        alg === 'HS384' ? 'SHA-384' : alg === 'HS512' ? 'SHA-512' : 'SHA-256';
      const sigBytes = await hmacBytes(shaAlg, keyBytes, utf8Bytes(signingInput));
      signature = toBase64Url(sigBytes);
    }

    const jwtToken = `${signingInput}.${signature}`;
    if (effectiveAuth.jwtAddTo === 'query') {
      const paramName = resolveVars(effectiveAuth.jwtQueryParamName, env).trim() || 'token';
      extraQueryParams.push([paramName, jwtToken]);
    } else {
      const prefix = (resolveVars(effectiveAuth.jwtHeaderPrefix, env) ?? 'Bearer').trim();
      extraHeaders['Authorization'] = prefix ? `${prefix} ${jwtToken}` : jwtToken;
    }
    return { extraHeaders, extraQueryParams, effectiveAuth };
  }

  // 5. Digest Auth
  if (effectiveAuth.type === 'digest') {
    const username = resolveVars(effectiveAuth.digestUsername, env);
    const password = resolveVars(effectiveAuth.digestPassword, env);
    const realm = resolveVars(effectiveAuth.digestRealm, env).trim();
    const nonce = resolveVars(effectiveAuth.digestNonce, env).trim();

    if (realm && nonce) {
      let uriPath = '/';
      try {
        const u = new URL(resolvedUrl);
        uriPath = `${u.pathname}${u.search}`;
      } catch {
        uriPath = resolvedUrl || '/';
      }
      extraHeaders['Authorization'] = await buildDigestAuthorizationHeader({
        username,
        password,
        method,
        uri: uriPath,
        realm,
        nonce,
        algorithm: effectiveAuth.digestAlgorithm || 'MD5',
        qop: resolveVars(effectiveAuth.digestQop, env),
        nc: resolveVars(effectiveAuth.digestNc, env),
        cnonce: resolveVars(effectiveAuth.digestCnonce, env),
        opaque: resolveVars(effectiveAuth.digestOpaque, env),
        body,
      });
    } else if (!effectiveAuth.digestDisableRetry) {
      challengeMode = 'digest';
    }
    return { extraHeaders, extraQueryParams, challengeMode, effectiveAuth };
  }

  // 6. OAuth 1.0 (Real RFC 5849 Signing)
  if (effectiveAuth.type === 'oauth1') {
    const consumerKey = resolveVars(effectiveAuth.oauth1ConsumerKey, env);
    const consumerSecret = resolveVars(effectiveAuth.oauth1ConsumerSecret, env);
    const token = resolveVars(effectiveAuth.oauth1Token, env);
    const tokenSecret = resolveVars(effectiveAuth.oauth1TokenSecret, env);
    const sigMethod = effectiveAuth.oauth1SignatureMethod || 'HMAC-SHA1';
    const timestamp =
      resolveVars(effectiveAuth.oauth1Timestamp, env).trim() ||
      String(Math.floor(Date.now() / 1000));
    const nonce =
      resolveVars(effectiveAuth.oauth1Nonce, env).trim() || randomHex(8);
    const version = resolveVars(effectiveAuth.oauth1Version, env).trim() || '1.0';
    const callback = resolveVars(effectiveAuth.oauth1Callback, env).trim();
    const verifier = resolveVars(effectiveAuth.oauth1Verifier, env).trim();
    const realm = resolveVars(effectiveAuth.oauth1Realm, env).trim();

    const oauthParams: Array<[string, string]> = [
      ['oauth_consumer_key', consumerKey],
      ['oauth_nonce', nonce],
      ['oauth_signature_method', sigMethod],
      ['oauth_timestamp', timestamp],
      ['oauth_version', version],
    ];
    if (token) oauthParams.push(['oauth_token', token]);
    if (callback) oauthParams.push(['oauth_callback', callback]);
    if (verifier) oauthParams.push(['oauth_verifier', verifier]);

    let baseUrl = resolvedUrl;
    const allParams: Array<[string, string]> = [...oauthParams];
    try {
      const u = new URL(resolvedUrl);
      baseUrl = `${u.protocol}//${u.host}${u.pathname}`;
      u.searchParams.forEach((v, k) => allParams.push([k, v]));
    } catch {
      // keep raw
    }

    const normalizedParams = allParams
      .map(([k, v]) => [oauthPercentEncode(k), oauthPercentEncode(v)] as const)
      .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    const signingKey = `${oauthPercentEncode(consumerSecret)}&${oauthPercentEncode(tokenSecret)}`;
    let signature = signingKey;
    if (sigMethod !== 'PLAINTEXT') {
      const baseString = `${method.toUpperCase()}&${oauthPercentEncode(baseUrl)}&${oauthPercentEncode(normalizedParams)}`;
      const algo = sigMethod === 'HMAC-SHA256' ? 'SHA-256' : 'SHA-1';
      const sigBytes = await hmacBytes(algo, utf8Bytes(signingKey), utf8Bytes(baseString));
      signature = bytesToBase64(sigBytes);
    }

    const finalOAuthParams: Array<[string, string]> = [
      ...oauthParams,
      ['oauth_signature', signature],
    ];

    if (effectiveAuth.oauth1AddTo === 'query') {
      for (const pair of finalOAuthParams) {
        extraQueryParams.push(pair);
      }
    } else {
      const headerPairs = finalOAuthParams.map(
        ([k, v]) => `${oauthPercentEncode(k)}="${oauthPercentEncode(v)}"`
      );
      if (realm) headerPairs.unshift(`realm="${realm}"`);
      extraHeaders['Authorization'] = `OAuth ${headerPairs.join(', ')}`;
    }
    return { extraHeaders, extraQueryParams, effectiveAuth };
  }

  // 7. OAuth 2.0
  if (effectiveAuth.type === 'oauth2') {
    const token = resolveVars(effectiveAuth.oauth2Token, env).trim();
    if (token) {
      if (effectiveAuth.oauth2AddTo === 'query') {
        extraQueryParams.push(['access_token', token]);
      } else {
        const prefix = (resolveVars(effectiveAuth.oauth2HeaderPrefix, env) ?? 'Bearer').trim();
        extraHeaders['Authorization'] = prefix ? `${prefix} ${token}` : token;
      }
    }
    return { extraHeaders, extraQueryParams, effectiveAuth };
  }

  // 8. Hawk Authentication
  if (effectiveAuth.type === 'hawk') {
    const id = resolveVars(effectiveAuth.hawkId, env).trim();
    const key = resolveVars(effectiveAuth.hawkKey, env);
    const alg = effectiveAuth.hawkAlgorithm || 'sha256';
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = resolveVars(effectiveAuth.hawkNonce, env).trim() || randomHex(4);
    const ext = resolveVars(effectiveAuth.hawkExt, env);
    const app = resolveVars(effectiveAuth.hawkApp, env).trim();
    const dlg = resolveVars(effectiveAuth.hawkDlg, env).trim();

    let host = 'localhost';
    let port = '80';
    let resource = '/';
    try {
      const u = new URL(resolvedUrl);
      host = u.hostname;
      port = u.port || (u.protocol === 'https:' ? '443' : '80');
      resource = `${u.pathname}${u.search}`;
    } catch {
      // fallback
    }

    const normalized = [
      'hawk.1.header',
      ts,
      nonce,
      method.toUpperCase(),
      resource,
      host.toLowerCase(),
      port,
      '', // payload hash optional
      ext,
      app ? app : undefined,
      app && dlg ? dlg : undefined,
    ]
      .filter((x) => x !== undefined)
      .join('\n') + '\n';

    const shaAlg = alg === 'sha1' ? 'SHA-1' : 'SHA-256';
    const mac = bytesToBase64(await hmacBytes(shaAlg, utf8Bytes(key), utf8Bytes(normalized)));

    const parts = [`id="${id}"`, `ts="${ts}"`, `nonce="${nonce}"`];
    if (ext) parts.push(`ext="${ext}"`);
    parts.push(`mac="${mac}"`);
    if (app) parts.push(`app="${app}"`);
    if (dlg) parts.push(`dlg="${dlg}"`);
    extraHeaders['Authorization'] = `Hawk ${parts.join(', ')}`;
    return { extraHeaders, extraQueryParams, effectiveAuth };
  }

  // 9. AWS Signature Version 4 (Real SigV4)
  if (effectiveAuth.type === 'awsv4') {
    const accessKey = resolveVars(effectiveAuth.awsAccessKey, env).trim();
    const secretKey = resolveVars(effectiveAuth.awsSecretKey, env).trim();
    const region = resolveVars(effectiveAuth.awsRegion, env).trim() || 'us-east-1';
    const service = resolveVars(effectiveAuth.awsService, env).trim() || 'execute-api';
    const sessionToken = resolveVars(effectiveAuth.awsSessionToken, env).trim();

    if (!accessKey || !secretKey) {
      return { extraHeaders, extraQueryParams, effectiveAuth };
    }

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    let host = 'localhost';
    let canonicalUri = '/';
    let canonicalQueryPairs: Array<[string, string]> = [];
    try {
      const u = new URL(resolvedUrl);
      host = u.host;
      canonicalUri = u.pathname
        .split('/')
        .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
        .join('/') || '/';
      u.searchParams.forEach((v, k) => canonicalQueryPairs.push([k, v]));
    } catch {
      // fallback
    }

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const payloadHash = await sha256Hex(body || '');

    const signHeadersMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(existingHeaders)) {
      signHeadersMap[k.toLowerCase()] = v.trim();
    }
    signHeadersMap['host'] = host;

    if (effectiveAuth.awsAddTo === 'query') {
      const signedHeadersList = Object.keys(signHeadersMap).sort();
      const signedHeadersStr = signedHeadersList.join(';');
      canonicalQueryPairs.push(
        ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
        ['X-Amz-Credential', `${accessKey}/${credentialScope}`],
        ['X-Amz-Date', amzDate],
        ['X-Amz-Expires', '300'],
        ['X-Amz-SignedHeaders', signedHeadersStr]
      );
      if (sessionToken) {
        canonicalQueryPairs.push(['X-Amz-Security-Token', sessionToken]);
      }

      const canonicalQuery = canonicalQueryPairs
        .map(([k, v]) => `${oauthPercentEncode(k)}=${oauthPercentEncode(v)}`)
        .sort()
        .join('&');
      const canonicalHeaders = signedHeadersList
        .map((k) => `${k}:${signHeadersMap[k]}\n`)
        .join('');
      const canonicalRequest = [
        method.toUpperCase(),
        canonicalUri,
        canonicalQuery,
        canonicalHeaders,
        signedHeadersStr,
        'UNSIGNED-PAYLOAD',
      ].join('\n');

      const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        await sha256Hex(canonicalRequest),
      ].join('\n');

      const kDate = await hmacBytes('SHA-256', utf8Bytes(`AWS4${secretKey}`), utf8Bytes(dateStamp));
      const kRegion = await hmacBytes('SHA-256', kDate, utf8Bytes(region));
      const kService = await hmacBytes('SHA-256', kRegion, utf8Bytes(service));
      const kSigning = await hmacBytes('SHA-256', kService, utf8Bytes('aws4_request'));
      const sig = bytesToHex(await hmacBytes('SHA-256', kSigning, utf8Bytes(stringToSign)));

      extraQueryParams.push(
        ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
        ['X-Amz-Credential', `${accessKey}/${credentialScope}`],
        ['X-Amz-Date', amzDate],
        ['X-Amz-Expires', '300'],
        ['X-Amz-SignedHeaders', signedHeadersStr],
        ['X-Amz-Signature', sig]
      );
      if (sessionToken) {
        extraQueryParams.push(['X-Amz-Security-Token', sessionToken]);
      }
    } else {
      signHeadersMap['x-amz-date'] = amzDate;
      signHeadersMap['x-amz-content-sha256'] = payloadHash;
      extraHeaders['X-Amz-Date'] = amzDate;
      extraHeaders['X-Amz-Content-Sha256'] = payloadHash;
      if (sessionToken) {
        signHeadersMap['x-amz-security-token'] = sessionToken;
        extraHeaders['X-Amz-Security-Token'] = sessionToken;
      }

      const signedHeadersList = Object.keys(signHeadersMap).sort();
      const signedHeadersStr = signedHeadersList.join(';');
      const canonicalQuery = canonicalQueryPairs
        .map(([k, v]) => `${oauthPercentEncode(k)}=${oauthPercentEncode(v)}`)
        .sort()
        .join('&');
      const canonicalHeaders = signedHeadersList
        .map((k) => `${k}:${signHeadersMap[k]}\n`)
        .join('');
      const canonicalRequest = [
        method.toUpperCase(),
        canonicalUri,
        canonicalQuery,
        canonicalHeaders,
        signedHeadersStr,
        payloadHash,
      ].join('\n');

      const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        await sha256Hex(canonicalRequest),
      ].join('\n');

      const kDate = await hmacBytes('SHA-256', utf8Bytes(`AWS4${secretKey}`), utf8Bytes(dateStamp));
      const kRegion = await hmacBytes('SHA-256', kDate, utf8Bytes(region));
      const kService = await hmacBytes('SHA-256', kRegion, utf8Bytes(service));
      const kSigning = await hmacBytes('SHA-256', kService, utf8Bytes('aws4_request'));
      const sig = bytesToHex(await hmacBytes('SHA-256', kSigning, utf8Bytes(stringToSign)));

      extraHeaders['Authorization'] =
        `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${sig}`;
    }

    return { extraHeaders, extraQueryParams, effectiveAuth };
  }

  // 10. NTLM Authentication
  if (effectiveAuth.type === 'ntlm') {
    const domain = resolveVars(effectiveAuth.ntlmDomain, env).trim();
    const workstation = resolveVars(effectiveAuth.ntlmWorkstation, env).trim();
    extraHeaders['Authorization'] = buildNtlmType1Header(domain, workstation);
    if (!effectiveAuth.ntlmDisableRetry) {
      challengeMode = 'ntlm';
    }
    return { extraHeaders, extraQueryParams, challengeMode, effectiveAuth };
  }

  // 11. Akamai EdgeGrid (EG1-HMAC-SHA256)
  if (effectiveAuth.type === 'edgegrid') {
    const accessToken = resolveVars(effectiveAuth.edgegridAccessToken, env).trim();
    const clientToken = resolveVars(effectiveAuth.edgegridClientToken, env).trim();
    const clientSecret = resolveVars(effectiveAuth.edgegridClientSecret, env).trim();

    if (!accessToken || !clientToken || !clientSecret) {
      return { extraHeaders, extraQueryParams, effectiveAuth };
    }

    const nonce =
      resolveVars(effectiveAuth.edgegridNonce, env).trim() ||
      (crypto.randomUUID ? crypto.randomUUID() : randomHex(16));
    let timestamp = resolveVars(effectiveAuth.edgegridTimestamp, env).trim();
    if (!timestamp) {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      timestamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+0000`;
    }

    let scheme = 'https';
    let host = '';
    let pathQuery = '/';
    try {
      const targetUrl = resolveVars(effectiveAuth.edgegridBaseUrl, env).trim() || resolvedUrl;
      const u = new URL(targetUrl);
      scheme = u.protocol.replace(':', '');
      host = u.host;
      const reqU = new URL(resolvedUrl);
      pathQuery = `${reqU.pathname}${reqU.search}`;
    } catch {
      // fallback
    }

    const headersToSign = resolveVars(effectiveAuth.edgegridHeadersToSign, env)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const canonicalHeaders = headersToSign
      .map((h) => {
        const entry = Object.entries(existingHeaders).find(([k]) => k.toLowerCase() === h);
        return entry ? `${h}:${entry[1].trim().replace(/\s+/g, ' ')}` : '';
      })
      .filter(Boolean)
      .join('\t');

    let contentHash = '';
    if (method.toUpperCase() === 'POST' && body) {
      const bodyBytes = utf8Bytes(body).slice(0, 131072);
      contentHash = bytesToBase64(await sha256Bytes(bodyBytes));
    }

    const authData = `EG1-HMAC-SHA256 client_token=${clientToken};access_token=${accessToken};timestamp=${timestamp};nonce=${nonce};`;
    const dataToSign = [
      method.toUpperCase(),
      scheme,
      host,
      pathQuery,
      canonicalHeaders ? `${canonicalHeaders}\t` : '',
      contentHash,
      authData,
    ].join('\t');

    const signingKeyBytes = await hmacBytes('SHA-256', utf8Bytes(clientSecret), utf8Bytes(timestamp));
    const signingKeyB64 = bytesToBase64(signingKeyBytes);
    const signature = bytesToBase64(
      await hmacBytes('SHA-256', utf8Bytes(signingKeyB64), utf8Bytes(dataToSign))
    );
    extraHeaders['Authorization'] = `${authData}signature=${signature}`;
    return { extraHeaders, extraQueryParams, effectiveAuth };
  }

  return { extraHeaders, extraQueryParams, effectiveAuth };
}

// ============================================================================
// Real OAuth 2.0 Token Endpoint Exchange via Local Proxy
// ============================================================================
export async function exchangeOAuth2Token(params: {
  tokenUrl: string;
  grantType: 'client_credentials' | 'password' | 'authorization_code';
  clientId: string;
  clientSecret: string;
  scope?: string;
  username?: string;
  password?: string;
  code?: string;
  redirectUri?: string;
  env?: EnvironmentProfile | null;
}): Promise<{ accessToken?: string; tokenType?: string; error?: string; raw?: string }> {
  const url = resolveVars(params.tokenUrl, params.env).trim();
  if (!url) return { error: '请填写 Access Token URL' };

  const form = new URLSearchParams();
  form.set('grant_type', params.grantType);
  const cid = resolveVars(params.clientId, params.env).trim();
  const csec = resolveVars(params.clientSecret, params.env).trim();
  if (cid) form.set('client_id', cid);
  if (csec) form.set('client_secret', csec);
  const scope = resolveVars(params.scope, params.env).trim();
  if (scope) form.set('scope', scope);

  if (params.grantType === 'password') {
    form.set('username', resolveVars(params.username, params.env));
    form.set('password', resolveVars(params.password, params.env));
  } else if (params.grantType === 'authorization_code') {
    form.set('code', resolveVars(params.code, params.env).trim());
    const redir = resolveVars(params.redirectUri, params.env).trim();
    if (redir) form.set('redirect_uri', redir);
  }

  try {
    const res = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: form.toString(),
        timeoutMs: 15000,
      }),
    });
    const data = await res.json();
    if (!data.ok && !data.body) {
      return { error: data.error || `HTTP ${data.status}` };
    }
    try {
      const parsed = JSON.parse(data.body);
      if (parsed.access_token) {
        return {
          accessToken: parsed.access_token,
          tokenType: parsed.token_type || 'Bearer',
          raw: data.body,
        };
      }
      return {
        error: parsed.error_description || parsed.error || `HTTP ${data.status}: 未返回 access_token`,
        raw: data.body,
      };
    } catch {
      return { error: `响应非 JSON 格式 (HTTP ${data.status})`, raw: data.body };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
