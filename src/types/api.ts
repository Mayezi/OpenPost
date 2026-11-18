export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'COPY'
  | 'HEAD'
  | 'OPTIONS'
  | 'LINK'
  | 'UNLINK'
  | 'PURGE'
  | 'LOCK'
  | 'UNLOCK'
  | 'PROPFIND'
  | 'VIEW';

export interface KeyValueItem {
  id: string;
  key: string;
  value: string;
  description?: string;
  enabled: boolean;
}

export type AuthType =
  | 'inherit'
  | 'none'
  | 'apikey'
  | 'bearer'
  | 'jwt'
  | 'basic'
  | 'digest'
  | 'oauth1'
  | 'oauth2'
  | 'hawk'
  | 'awsv4'
  | 'ntlm'
  | 'edgegrid';

export interface AuthConfig {
  type: AuthType;
  // Bearer
  bearerToken?: string;
  // Basic
  basicUsername?: string;
  basicPassword?: string;
  // API Key
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyIn?: 'header' | 'query';
  // JWT Bearer
  jwtAddTo?: 'header' | 'query';
  jwtAlgorithm?: 'HS256' | 'HS384' | 'HS512' | 'none';
  jwtSecret?: string;
  jwtSecretBase64?: boolean;
  jwtPayload?: string;
  jwtHeaderPrefix?: string;
  jwtQueryParamName?: string;
  jwtHeadersJson?: string;
  // Digest Auth
  digestUsername?: string;
  digestPassword?: string;
  digestRealm?: string;
  digestNonce?: string;
  digestAlgorithm?: 'MD5' | 'MD5-sess' | 'SHA-256' | 'SHA-256-sess' | 'SHA-512-256';
  digestQop?: string;
  digestNc?: string;
  digestCnonce?: string;
  digestOpaque?: string;
  digestDisableRetry?: boolean;
  // OAuth 1.0
  oauth1AddTo?: 'header' | 'query';
  oauth1SignatureMethod?: 'HMAC-SHA1' | 'HMAC-SHA256' | 'PLAINTEXT';
  oauth1ConsumerKey?: string;
  oauth1ConsumerSecret?: string;
  oauth1Token?: string;
  oauth1TokenSecret?: string;
  oauth1Callback?: string;
  oauth1Verifier?: string;
  oauth1Timestamp?: string;
  oauth1Nonce?: string;
  oauth1Version?: string;
  oauth1Realm?: string;
  // OAuth 2.0
  oauth2Token?: string;
  oauth2HeaderPrefix?: string;
  oauth2AddTo?: 'header' | 'query';
  oauth2GrantType?: 'client_credentials' | 'password' | 'authorization_code';
  oauth2AccessTokenUrl?: string;
  oauth2ClientId?: string;
  oauth2ClientSecret?: string;
  oauth2Scope?: string;
  oauth2Username?: string;
  oauth2Password?: string;
  oauth2Code?: string;
  oauth2RedirectUri?: string;
  // Hawk Authentication
  hawkId?: string;
  hawkKey?: string;
  hawkAlgorithm?: 'sha256' | 'sha1';
  hawkUser?: string;
  hawkNonce?: string;
  hawkExt?: string;
  hawkApp?: string;
  hawkDlg?: string;
  // AWS Signature v4
  awsAddTo?: 'header' | 'query';
  awsAccessKey?: string;
  awsSecretKey?: string;
  awsRegion?: string;
  awsService?: string;
  awsSessionToken?: string;
  // NTLM Authentication
  ntlmUsername?: string;
  ntlmPassword?: string;
  ntlmDomain?: string;
  ntlmWorkstation?: string;
  ntlmDisableRetry?: boolean;
  // Akamai EdgeGrid
  edgegridAccessToken?: string;
  edgegridClientToken?: string;
  edgegridClientSecret?: string;
  edgegridNonce?: string;
  edgegridTimestamp?: string;
  edgegridBaseUrl?: string;
  edgegridHeadersToSign?: string;
}

export interface RequestBodyConfig {
  type: 'none' | 'json' | 'form-data' | 'urlencoded' | 'raw' | 'graphql';
  json: string;
  raw: string;
  formData: KeyValueItem[];
  urlencoded: KeyValueItem[];
  graphqlQuery: string;
  graphqlVariables: string;
}

export type AssertionType =
  | 'status_eq'
  | 'time_lt'
  | 'json_path_eq'
  | 'json_path_exists'
  | 'header_contains'
  | 'extract_env';

export interface AssertionRule {
  id: string;
  enabled: boolean;
  type: AssertionType;
  target: string;
  expected: string;
}

export interface ApiRequestItem {
  id: string;
  name: string;
  folderId: string;
  method: HttpMethod;
  url: string;
  params: KeyValueItem[];
  headers: KeyValueItem[];
  auth: AuthConfig;
  body: RequestBodyConfig;
  assertions: AssertionRule[];
  description?: string;
  isDirty?: boolean;
}

export interface CollectionFolder {
  id: string;
  name: string;
  description?: string;
  expanded?: boolean;
  auth?: AuthConfig;
}

export interface EnvironmentProfile {
  id: string;
  name: string;
  variables: KeyValueItem[];
}

export interface AssertionResult {
  id: string;
  label: string;
  passed: boolean;
  actual: string;
  expected: string;
  isEnvExtraction?: boolean;
}

export interface ApiResponseData {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  headers: Record<string, string>;
  cookies: string[];
  contentType: string;
  sizeBytes: number;
  body: string;
  timing: {
    totalMs: number;
    ttfbMs: number;
    downloadMs: number;
  };
  error?: string;
  engine: 'local-proxy' | 'browser-direct';
  timestamp: string;
  assertionResults: AssertionResult[];
  extractedVars: Array<{ key: string; value: string }>;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  request: ApiRequestItem;
  status: number;
  durationMs: number;
  sizeBytes: number;
}

export interface ThemePalette {
  id: string;
  name: string;
  brand: string;
  mode: 'dark' | 'light';
  description: string;
  colors: {
    bgCanvas: string;
    bgSurface: string;
    bgElevated: string;
    bgInput: string;
    border: string;
    borderSubtle: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    accentHover: string;
    accentFg: string;
    accentSoft: string;
    codeBg: string;
  };
}

export type ProxyMode = 'none' | 'system' | 'custom';
export type ProxyProtocol = 'http' | 'https' | 'socks5';

export interface ProxyConfig {
  mode: ProxyMode;
  protocol: ProxyProtocol;
  host: string;
  port: string;
  username?: string;
  password?: string;
  bypass?: string;
}

