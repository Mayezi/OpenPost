import {
  ApiRequestItem,
  CollectionFolder,
  EnvironmentProfile,
  HttpMethod,
  ThemePalette,
} from '../types/api';

export const AI_THEMES: ThemePalette[] = [
  {
    id: 'classic-light',
    name: '简约白昼 (Classic Light)',
    brand: 'Daylight Studio',
    mode: 'light',
    description: '纯净白画布配柔和灰功能区与清晰 1px 细边框，高对比度日间联调配色',
    colors: {
      bgCanvas: '#FFFFFF',
      bgSurface: '#F9F9F9',
      bgElevated: '#EFEFEF',
      bgInput: '#FFFFFF',
      border: '#D4D4D4',
      borderSubtle: '#E6E6E6',
      textPrimary: '#212121',
      textSecondary: '#6B6B6B',
      textMuted: '#999999',
      accent: '#FF6C37',
      accentHover: '#E85D2A',
      accentFg: '#FFFFFF',
      accentSoft: 'rgba(255, 108, 55, 0.12)',
      codeBg: '#FAFAFA',
    },
  },
  {
    id: 'classic-dark',
    name: '深邃暗夜 (Classic Dark)',
    brand: 'Obsidian Studio',
    mode: 'dark',
    description: '沉稳炭黑画布配清晰轮廓线与珊瑚橙焦点，适合长时间夜间接口调试',
    colors: {
      bgCanvas: '#212121',
      bgSurface: '#1C1C1C',
      bgElevated: '#2B2B2B',
      bgInput: '#1A1A1A',
      border: '#424242',
      borderSubtle: '#333333',
      textPrimary: '#EDEDED',
      textSecondary: '#A6A6A6',
      textMuted: '#787878',
      accent: '#FF6C37',
      accentHover: '#FF7E4F',
      accentFg: '#FFFFFF',
      accentSoft: 'rgba(255, 108, 55, 0.16)',
      codeBg: '#181818',
    },
  },
];

export const METHOD_COLORS: Record<HttpMethod, { text: string; bg: string; border: string; dot: string }> = {
  GET: {
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    dot: '#10B981',
  },
  POST: {
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    dot: '#F59E0B',
  },
  PUT: {
    text: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    dot: '#0EA5E9',
  },
  PATCH: {
    text: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    dot: '#8B5CF6',
  },
  DELETE: {
    text: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    dot: '#F43F5E',
  },
  COPY: {
    text: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    dot: '#06B6D4',
  },
  HEAD: {
    text: 'text-teal-600 dark:text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/30',
    dot: '#14B8A6',
  },
  OPTIONS: {
    text: 'text-indigo-600 dark:text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/30',
    dot: '#6366F1',
  },
  LINK: {
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    dot: '#3B82F6',
  },
  UNLINK: {
    text: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    dot: '#F97316',
  },
  PURGE: {
    text: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    dot: '#EF4444',
  },
  LOCK: {
    text: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    dot: '#EAB308',
  },
  UNLOCK: {
    text: 'text-lime-600 dark:text-lime-400',
    bg: 'bg-lime-500/10',
    border: 'border-lime-500/30',
    dot: '#84CC16',
  },
  PROPFIND: {
    text: 'text-fuchsia-600 dark:text-fuchsia-400',
    bg: 'bg-fuchsia-500/10',
    border: 'border-fuchsia-500/30',
    dot: '#D946EF',
  },
  VIEW: {
    text: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    dot: '#64748B',
  },
};

export const INITIAL_FOLDERS: CollectionFolder[] = [
  {
    id: 'folder_http_inspector',
    name: '01. HTTP 标准联调集 (HTTPBin / REST)',
    description: '直连真实 HTTP/HTTPS 端点，验证请求头、Query 参数、JSON 载荷与响应耗时',
    expanded: true,
  },
  {
    id: 'folder_local_services',
    name: '02. 本地微服务与 AI 接口 (Localhost)',
    description: '本地开发服务与 OpenAI / Ollama / vLLM 兼容格式接口调试',
    expanded: true,
  },
];

export const INITIAL_ENVIRONMENTS: EnvironmentProfile[] = [
  {
    id: 'env_default',
    name: 'Default 默认联调环境',
    variables: [
      { id: 'v1', key: 'httpbinUrl', value: 'https://httpbin.org', description: 'HTTPBin 标准测试服务', enabled: true },
      { id: 'v2', key: 'restApiUrl', value: 'https://jsonplaceholder.typicode.com', description: 'REST JSON 联调服务', enabled: true },
      { id: 'v3', key: 'localUrl', value: 'http://127.0.0.1:8080', description: '本地后端服务地址', enabled: true },
      { id: 'v4', key: 'apiKey', value: '', description: 'Bearer Token / API Key', enabled: true },
    ],
  },
  {
    id: 'env_local_dev',
    name: 'Localhost 本地开发环境',
    variables: [
      { id: 'v10', key: 'baseUrl', value: 'http://127.0.0.1:8080', description: '本地服务根路径', enabled: true },
      { id: 'v11', key: 'ollamaUrl', value: 'http://127.0.0.1:11434', description: '本地 Ollama 服务地址', enabled: true },
      { id: 'v12', key: 'apiKey', value: '', description: '本地调试密钥', enabled: true },
    ],
  },
];

export const INITIAL_REQUESTS: ApiRequestItem[] = [
  {
    id: 'req_httpbin_get',
    name: 'GET 请求头与参数检视 (HTTPBin)',
    folderId: 'folder_http_inspector',
    method: 'GET',
    url: '{{httpbinUrl}}/get',
    params: [
      { id: 'p1', key: 'client', value: 'OpenPost', description: '客户端标识', enabled: true },
      { id: 'p2', key: 'request_id', value: '{{$guid}}', description: '动态 UUID', enabled: true },
    ],
    headers: [
      { id: 'h1', key: 'Accept', value: 'application/json', description: 'JSON 响应格式', enabled: true },
    ],
    auth: {
      type: 'none',
    },
    body: {
      type: 'none',
      json: '',
      raw: '',
      formData: [],
      urlencoded: [],
      graphqlQuery: '',
      graphqlVariables: '{}',
    },
    assertions: [
      { id: 'a1', enabled: true, type: 'status_eq', target: 'status', expected: '200' },
      { id: 'a2', enabled: true, type: 'json_path_eq', target: 'args.client', expected: 'OpenPost' },
    ],
    description: '发送真实 GET 请求至 https://httpbin.org/get，检验 Query 参数解析、请求头回显与状态码断言。',
  },
  {
    id: 'req_httpbin_post',
    name: 'POST JSON 报文回显测试 (HTTPBin)',
    folderId: 'folder_http_inspector',
    method: 'POST',
    url: '{{httpbinUrl}}/post',
    params: [],
    headers: [
      { id: 'h10', key: 'Content-Type', value: 'application/json', description: 'JSON 载荷', enabled: true },
    ],
    auth: {
      type: 'none',
    },
    body: {
      type: 'json',
      json: JSON.stringify(
        {
          service: 'OpenPost',
          timestamp: '{{$timestamp}}',
          traceId: '{{$guid}}',
        },
        null,
        2
      ),
      raw: '',
      formData: [],
      urlencoded: [],
      graphqlQuery: '',
      graphqlVariables: '{}',
    },
    assertions: [
      { id: 'a10', enabled: true, type: 'status_eq', target: 'status', expected: '200' },
      { id: 'a11', enabled: true, type: 'json_path_eq', target: 'json.service', expected: 'OpenPost' },
    ],
    description: '向 https://httpbin.org/post 发送真实 JSON 请求体并验证服务端解析结果。',
  },
  {
    id: 'req_rest_posts',
    name: 'REST 资源详情查询 (JSONPlaceholder)',
    folderId: 'folder_http_inspector',
    method: 'GET',
    url: '{{restApiUrl}}/posts/1',
    params: [],
    headers: [
      { id: 'hr1', key: 'Accept', value: 'application/json', description: '', enabled: true },
    ],
    auth: {
      type: 'none',
    },
    body: {
      type: 'none',
      json: '',
      raw: '',
      formData: [],
      urlencoded: [],
      graphqlQuery: '',
      graphqlVariables: '{}',
    },
    assertions: [
      { id: 'ar1', enabled: true, type: 'status_eq', target: 'status', expected: '200' },
      { id: 'ar2', enabled: true, type: 'json_path_eq', target: 'id', expected: '1' },
    ],
    description: '查询 https://jsonplaceholder.typicode.com/posts/1 真实 REST 资源。',
  },
  {
    id: 'req_openai_compat',
    name: 'Chat Completions 接口调试 (OpenAI / Ollama)',
    folderId: 'folder_local_services',
    method: 'POST',
    url: 'http://127.0.0.1:11434/v1/chat/completions',
    params: [],
    headers: [
      { id: 'hai1', key: 'Content-Type', value: 'application/json', enabled: true },
    ],
    auth: {
      type: 'bearer',
      bearerToken: '{{apiKey}}',
    },
    body: {
      type: 'json',
      json: JSON.stringify(
        {
          model: 'qwen2.5-coder:7b',
          stream: false,
          messages: [
            { role: 'user', content: 'ping' },
          ],
        },
        null,
        2
      ),
      raw: '',
      formData: [],
      urlencoded: [],
      graphqlQuery: '',
      graphqlVariables: '{}',
    },
    assertions: [
      { id: 'aai1', enabled: true, type: 'status_eq', target: 'status', expected: '200' },
    ],
    description: '直连本地 Ollama (127.0.0.1:11434) 或兼容 OpenAI 格式的推理服务端点。',
  },
];

