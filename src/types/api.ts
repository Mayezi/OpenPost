export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface KeyValueItem {
  id: string;
  key: string;
  value: string;
  description?: string;
  enabled: boolean;
}

export interface AuthConfig {
  type: 'none' | 'bearer' | 'basic' | 'apikey';
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyIn?: 'header' | 'query';
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
