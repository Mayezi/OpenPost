import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Send,
  Plus,
  FolderPlus,
  Folder,
  FolderOpen,
  Trash2,
  Copy,
  Check,
  Search,
  History,
  Layers,
  SlidersHorizontal,
  Code2,
  CheckSquare,
  Square,
  Wand2,
  X,
  Settings,
  Sun,
  Moon,
  ChevronRight,
  Play,
  FolderSync,
  Globe,
  Palette,
  ListFilter,
  KeyRound,
  FileSpreadsheet,
  Braces,
  CheckCircle2,
  Minus,
  Maximize2,
  Minimize2,
  ChevronDown,
} from 'lucide-react';
import {
  ApiRequestItem,
  ApiResponseData,
  AssertionRule,
  AssertionType,
  CollectionFolder,
  EnvironmentProfile,
  HistoryEntry,
  HttpMethod,
} from './types/api';
import {
  AI_THEMES,
  INITIAL_ENVIRONMENTS,
  INITIAL_FOLDERS,
  INITIAL_REQUESTS,
  METHOD_COLORS,
} from './data/themesAndDefaults';
import {
  buildResolvedUrl,
  executeApiRequest,
  generateCodeSnippet,
} from './utils/requestEngine';
import { KeyValueTable } from './components/KeyValueTable';
import { ResponseViewer } from './components/ResponseViewer';
import { CustomSelect } from './components/CustomSelect';
import {
  CollectionRunnerModal,
  EnvironmentModal,
  ImportExportModal,
  SettingsCenterModal,
  SettingsTabId,
} from './components/Modals';

const STORAGE_KEYS = {
  THEME: 'zeropost_theme_id_v3',
  FONT_SCALE: 'zeropost_font_scale_v3',
  FOLDERS: 'zeropost_folders_v2',
  REQUESTS: 'zeropost_requests_v2',
  ENVIRONMENTS: 'zeropost_environments_v2',
  ACTIVE_ENV: 'zeropost_active_env_v2',
  HISTORY: 'zeropost_history_v2',
  CUSTOM_DIR: 'zeropost_custom_dir_v2',
};

type FontSizeScale = 'compact' | 'default' | 'comfortable' | 'large';

const FONT_SCALE_PRESETS: Record<
  FontSizeScale,
  { rootPx: string; uiPx: string; codePx: string; label: string }
> = {
  compact: { rootPx: '15px', uiPx: '13px', codePx: '12.5px', label: '13px' },
  default: { rootPx: '16.5px', uiPx: '14.5px', codePx: '13.5px', label: '15px' },
  comfortable: { rootPx: '17.5px', uiPx: '15.5px', codePx: '14.5px', label: '16px' },
  large: { rootPx: '19px', uiPx: '17px', codePx: '15.5px', label: '17.5px' },
};

const HTTP_METHODS: HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];

const COMMON_HEADERS = [
  'Accept',
  'Authorization',
  'Cache-Control',
  'Content-Type',
  'Origin',
  'Referer',
  'User-Agent',
  'X-API-Key',
  'X-Client-Platform',
  'X-Forwarded-For',
  'X-Request-ID',
];

export default function App() {
  // ==========================================================================
  // 1. PERSISTENT LOCAL STATE (100% OFFLINE LOCALSTORAGE & DISK VAULT)
  // ==========================================================================
  const [activeThemeId, setActiveThemeId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.THEME) || 'claude-code';
  });

  const [fontSizeScale, setFontSizeScale] = useState<FontSizeScale>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.FONT_SCALE) as FontSizeScale | null;
    return saved && FONT_SCALE_PRESETS[saved] ? saved : 'default';
  });

  const [customStoragePath, setCustomStoragePath] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.CUSTOM_DIR) || 'D:\\openPost_Data\\Vault';
  });

  const [folders, setFolders] = useState<CollectionFolder[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FOLDERS);
      return saved ? JSON.parse(saved) : INITIAL_FOLDERS;
    } catch {
      return INITIAL_FOLDERS;
    }
  });

  const [requests, setRequests] = useState<ApiRequestItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.REQUESTS);
      return saved ? JSON.parse(saved) : INITIAL_REQUESTS;
    } catch {
      return INITIAL_REQUESTS;
    }
  });

  const [environments, setEnvironments] = useState<EnvironmentProfile[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ENVIRONMENTS);
      return saved ? JSON.parse(saved) : INITIAL_ENVIRONMENTS;
    } catch {
      return INITIAL_ENVIRONMENTS;
    }
  });

  const [activeEnvId, setActiveEnvId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_ENV) || INITIAL_ENVIRONMENTS[0].id;
  });

  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.HISTORY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Open Tabs & Active Request ID
  const [openTabIds, setOpenTabIds] = useState<string[]>(() => {
    const initialIds = INITIAL_REQUESTS.slice(0, 3).map((r) => r.id);
    return initialIds.length > 0 ? initialIds : [];
  });
  const [activeRequestId, setActiveRequestId] = useState<string>(() => {
    return INITIAL_REQUESTS[0]?.id || '';
  });

  // UI Navigation & Panels
  const [sidebarMode, setSidebarMode] = useState<'collections' | 'history'>('collections');
  const [searchQuery, setSearchQuery] = useState('');
  const [reqSubTab, setReqSubTab] = useState<
    'params' | 'auth' | 'headers' | 'body' | 'tests' | 'code'
  >('params');
  const [engineMode, setEngineMode] = useState<'local-proxy' | 'browser-direct'>('local-proxy');
  const [codeLang, setCodeLang] = useState<'curl' | 'fetch' | 'axios' | 'python' | 'go' | 'rust'>(
    'curl'
  );
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedCurlQuick, setCopiedCurlQuick] = useState(false);

  // Unified Environment Popover, Icon-only Theme Popover & Window State
  const [envPopoverOpen, setEnvPopoverOpen] = useState(false);
  const [quickNewEnvName, setQuickNewEnvName] = useState('');
  const envPopoverRef = useRef<HTMLDivElement>(null);
  const [themePopoverOpen, setThemePopoverOpen] = useState(false);
  const themePopoverRef = useRef<HTMLDivElement>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Responses Map per Request ID
  const [responsesById, setResponsesById] = useState<Record<string, ApiResponseData>>({});
  const [loadingReqId, setLoadingReqId] = useState<string | null>(null);

  // Modals State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabId>('themes');
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isRunnerModalOpen, setIsRunnerModalOpen] = useState(false);

  const openSettingsAt = (tab: SettingsTabId) => {
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  };

  // Close env & theme popovers on outside click
  useEffect(() => {
    if (!themePopoverOpen && !envPopoverOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (themePopoverRef.current && !themePopoverRef.current.contains(e.target as Node)) {
        setThemePopoverOpen(false);
      }
      if (envPopoverRef.current && !envPopoverRef.current.contains(e.target as Node)) {
        setEnvPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [themePopoverOpen, envPopoverOpen]);

  const handleQuickCreateEnvInline = () => {
    const name = quickNewEnvName.trim() || `新环境 ${environments.length + 1}`;
    const created: EnvironmentProfile = {
      id: `env_${Date.now()}`,
      name,
      variables: [
        {
          id: `v_${Date.now()}`,
          key: 'baseUrl',
          value: 'http://localhost:3000/api/mock',
          description: '接口基础地址',
          enabled: true,
        },
      ],
    };
    setEnvironments((prev) => [...prev, created]);
    setActiveEnvId(created.id);
    setQuickNewEnvName('');
  };

  // ==========================================================================
  // 2. THEME & FONT SCALE APPLICATION + LOCAL STORAGE / DISK VAULT SYNC
  // ==========================================================================
  const currentTheme = useMemo(
    () => AI_THEMES.find((t) => t.id === activeThemeId) || AI_THEMES[0],
    [activeThemeId]
  );

  useEffect(() => {
    const root = document.documentElement;
    if (currentTheme.mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    const c = currentTheme.colors;
    root.style.setProperty('--zp-bg-canvas', c.bgCanvas);
    root.style.setProperty('--zp-bg-surface', c.bgSurface);
    root.style.setProperty('--zp-bg-elevated', c.bgElevated);
    root.style.setProperty('--zp-bg-input', c.bgInput);
    root.style.setProperty('--zp-border', c.border);
    root.style.setProperty('--zp-border-subtle', c.borderSubtle);
    root.style.setProperty('--zp-text-primary', c.textPrimary);
    root.style.setProperty('--zp-text-secondary', c.textSecondary);
    root.style.setProperty('--zp-text-muted', c.textMuted);
    root.style.setProperty('--zp-accent', c.accent);
    root.style.setProperty('--zp-accent-hover', c.accentHover);
    root.style.setProperty('--zp-accent-fg', c.accentFg);
    root.style.setProperty('--zp-accent-soft', c.accentSoft);
    root.style.setProperty('--zp-code-bg', c.codeBg);

    localStorage.setItem(STORAGE_KEYS.THEME, currentTheme.id);
  }, [currentTheme]);

  useEffect(() => {
    const root = document.documentElement;
    const preset = FONT_SCALE_PRESETS[fontSizeScale] || FONT_SCALE_PRESETS.default;
    root.style.setProperty('--zp-root-font-size', preset.rootPx);
    root.style.setProperty('--zp-ui-font-size', preset.uiPx);
    root.style.setProperty('--zp-code-font-size', preset.codePx);
    localStorage.setItem(STORAGE_KEYS.FONT_SCALE, fontSizeScale);
  }, [fontSizeScale]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_DIR, customStoragePath);
  }, [customStoragePath]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
  }, [folders]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ENVIRONMENTS, JSON.stringify(environments));
  }, [environments]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ENV, activeEnvId);
  }, [activeEnvId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history.slice(0, 100)));
  }, [history]);

  // Background auto-sync to configured local disk directory
  useEffect(() => {
    const timer = setTimeout(() => {
      fetch('/api/storage/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folders, requests, environments, history }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [folders, requests, environments, history]);

  // ==========================================================================
  // 3. DERIVED OBJECTS & HELPERS
  // ==========================================================================
  const activeEnv = useMemo(
    () => environments.find((e) => e.id === activeEnvId) || environments[0] || null,
    [environments, activeEnvId]
  );

  const activeRequest = useMemo(
    () => requests.find((r) => r.id === activeRequestId) || requests[0] || null,
    [requests, activeRequestId]
  );

  const updateActiveRequest = useCallback(
    (patch: Partial<ApiRequestItem>) => {
      if (!activeRequest) return;
      setRequests((prev) =>
        prev.map((r) => (r.id === activeRequest.id ? { ...r, ...patch } : r))
      );
    },
    [activeRequest]
  );

  const handleOpenRequestTab = (reqId: string) => {
    if (!openTabIds.includes(reqId)) {
      setOpenTabIds((prev) => [...prev, reqId]);
    }
    setActiveRequestId(reqId);
  };

  const handleCloseTab = (reqId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextTabs = openTabIds.filter((id) => id !== reqId);
    if (nextTabs.length > 0) {
      setOpenTabIds(nextTabs);
      if (activeRequestId === reqId) {
        setActiveRequestId(nextTabs[nextTabs.length - 1]);
      }
    }
  };

  const handleCreateNewRequest = (targetFolderId?: string) => {
    const fId =
      targetFolderId || activeRequest?.folderId || folders[0]?.id || 'folder_local_sandbox';
    const newReq: ApiRequestItem = {
      id: `req_${Date.now()}`,
      name: `新建接口 ${requests.length + 1}`,
      folderId: fId,
      method: 'GET',
      url: '{{baseUrl}}/users',
      params: [],
      headers: [
        { id: `h_${Date.now()}`, key: 'Accept', value: 'application/json', enabled: true },
      ],
      auth: { type: 'none' },
      body: {
        type: 'none',
        json: '{\n  \n}',
        raw: '',
        formData: [],
        urlencoded: [],
        graphqlQuery: 'query {\n  users {\n    id\n    name\n  }\n}',
        graphqlVariables: '{}',
      },
      assertions: [
        {
          id: `as_${Date.now()}`,
          enabled: true,
          type: 'status_eq',
          target: 'status',
          expected: '200',
        },
      ],
    };
    setRequests((prev) => [...prev, newReq]);
    setOpenTabIds((prev) => [...prev, newReq.id]);
    setActiveRequestId(newReq.id);
  };

  const handleDuplicateRequest = (req: ApiRequestItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const copy: ApiRequestItem = {
      ...JSON.parse(JSON.stringify(req)),
      id: `req_copy_${Date.now()}`,
      name: `${req.name} (副本)`,
    };
    setRequests((prev) => [...prev, copy]);
    setOpenTabIds((prev) => [...prev, copy.id]);
    setActiveRequestId(copy.id);
  };

  const handleDeleteRequest = (reqId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (requests.length <= 1) return;
    const nextReqs = requests.filter((r) => r.id !== reqId);
    setRequests(nextReqs);
    const nextTabs = openTabIds.filter((id) => id !== reqId);
    setOpenTabIds(nextTabs.length > 0 ? nextTabs : [nextReqs[0].id]);
    if (activeRequestId === reqId) {
      setActiveRequestId(nextTabs[0] || nextReqs[0].id);
    }
  };

  const handleCreateFolder = () => {
    const newFolder: CollectionFolder = {
      id: `folder_${Date.now()}`,
      name: `0${folders.length + 1}. 新建接口分组`,
      expanded: true,
    };
    setFolders((prev) => [...prev, newFolder]);
  };

  const handleQuickSaveEnvVar = useCallback(
    (varKey: string, varVal: string) => {
      if (!activeEnv) return;
      setEnvironments((prev) =>
        prev.map((env) => {
          if (env.id !== activeEnv.id) return env;
          const exists = env.variables.some((v) => v.key === varKey);
          const nextVars = exists
            ? env.variables.map((v) =>
                v.key === varKey ? { ...v, value: varVal, enabled: true } : v
              )
            : [
                ...env.variables,
                {
                  id: `v_auto_${Date.now()}`,
                  key: varKey,
                  value: varVal,
                  description: '由接口响应自动提取写入',
                  enabled: true,
                },
              ];
          return { ...env, variables: nextVars };
        })
      );
    },
    [activeEnv]
  );

  // Quick toggle between Light and Dark theme families
  const handleToggleLightDark = () => {
    if (currentTheme.mode === 'dark') {
      const matchingLight =
        AI_THEMES.find(
          (t) => t.mode === 'light' && t.id.startsWith(currentTheme.id.split('-')[0])
        ) || AI_THEMES.find((t) => t.mode === 'light');
      if (matchingLight) setActiveThemeId(matchingLight.id);
    } else {
      const matchingDark =
        AI_THEMES.find(
          (t) => t.mode === 'dark' && t.id.startsWith(currentTheme.id.split('-')[0])
        ) || AI_THEMES.find((t) => t.mode === 'dark');
      if (matchingDark) setActiveThemeId(matchingDark.id);
    }
  };

  const handleToggleMaximize = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsMaximized(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsMaximized(false);
    }
  };

  // ==========================================================================
  // 4. SEND HTTP REQUEST HANDLER + KEYBOARD SHORTCUT (CTRL/CMD + ENTER)
  // ==========================================================================
  const handleSendRequest = useCallback(
    async (overrideReq?: ApiRequestItem) => {
      const targetReq = overrideReq || activeRequest;
      if (!targetReq || loadingReqId) return;
      setLoadingReqId(targetReq.id);

      const res = await executeApiRequest(targetReq, activeEnv, engineMode);
      setResponsesById((prev) => ({ ...prev, [targetReq.id]: res }));

      if (res.extractedVars.length > 0) {
        res.extractedVars.forEach(({ key, value }) => {
          handleQuickSaveEnvVar(key, value);
        });
      }

      const entry: HistoryEntry = {
        id: `hist_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        request: JSON.parse(JSON.stringify(targetReq)),
        status: res.status,
        durationMs: res.timing.totalMs,
        sizeBytes: res.sizeBytes,
      };
      setHistory((prev) => [entry, ...prev.slice(0, 99)]);
      setLoadingReqId(null);
    },
    [activeRequest, activeEnv, engineMode, loadingReqId, handleQuickSaveEnvVar]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSendRequest();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSendRequest]);

  // JSON Body Formatting & Validation
  const jsonSyntaxStatus = useMemo(() => {
    if (!activeRequest || activeRequest.body.type !== 'json' || !activeRequest.body.json.trim()) {
      return { valid: true, message: '' };
    }
    try {
      const sanitized = activeRequest.body.json.replace(/\{\{[^}]+\}\}/g, '0');
      JSON.parse(sanitized);
      return { valid: true, message: 'JSON 语法有效' };
    } catch (e: unknown) {
      return {
        valid: false,
        message: e instanceof Error ? e.message : 'JSON 格式错误',
      };
    }
  }, [activeRequest]);

  const handleFormatJsonBody = (minify = false) => {
    if (!activeRequest || activeRequest.body.type !== 'json') return;
    try {
      const parsed = JSON.parse(activeRequest.body.json);
      updateActiveRequest({
        body: {
          ...activeRequest.body,
          json: minify ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2),
        },
      });
    } catch {
      // Keep as is if it contains unquoted {{vars}} or syntax errors
    }
  };

  const resolvedPreviewUrl = useMemo(() => {
    if (!activeRequest) return '';
    return buildResolvedUrl(activeRequest, activeEnv);
  }, [activeRequest, activeEnv]);

  const activeResponse = activeRequest ? responsesById[activeRequest.id] || null : null;

  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests;
    const q = searchQuery.toLowerCase();
    return requests.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.url.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q)
    );
  }, [requests, searchQuery]);

  const reqSubTabItems = useMemo(() => {
    if (!activeRequest) return [];
    return [
      {
        id: 'params' as const,
        label: 'Params',
        icon: <ListFilter className="w-3.5 h-3.5" />,
        count: activeRequest.params.filter((p) => p.enabled && p.key).length,
      },
      {
        id: 'auth' as const,
        label: 'Auth',
        icon: <KeyRound className="w-3.5 h-3.5" />,
        badge: activeRequest.auth.type === 'none' ? '' : activeRequest.auth.type.toUpperCase(),
      },
      {
        id: 'headers' as const,
        label: 'Headers',
        icon: <FileSpreadsheet className="w-3.5 h-3.5" />,
        count: activeRequest.headers.filter((h) => h.enabled && h.key).length,
      },
      {
        id: 'body' as const,
        label: 'Body',
        icon: <Braces className="w-3.5 h-3.5" />,
        badge: activeRequest.body.type === 'none' ? '' : activeRequest.body.type,
      },
      {
        id: 'tests' as const,
        label: '断言与提取',
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
        count: activeRequest.assertions.filter((a) => a.enabled).length,
      },
      {
        id: 'code' as const,
        label: '代码生成',
        icon: <Code2 className="w-3.5 h-3.5" />,
      },
    ];
  }, [activeRequest]);

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden select-none zp-surface-transition"
      style={{
        backgroundColor: 'var(--zp-bg-canvas)',
        color: 'var(--zp-text-primary)',
      }}
    >
      {/* ====================================================================
          ULTRA-CLEAN DBX NATIVE DESKTOP TITLE BAR
          - Left: Brand + "+ 新建请求" + "导入" + "批量运行" (No storage path clutter!)
          - Right: Environment Selector + Icon-Only Theme Switcher + Icon-Only Settings + Native Minimize/Maximize/Close Window Controls
         ==================================================================== */}
      <header
        className="h-10 flex items-center justify-between pl-3 pr-0 border-b shrink-0 zp-surface-transition"
        style={{
          backgroundColor: 'var(--zp-bg-surface)',
          borderColor: 'var(--zp-border)',
        }}
      >
        {/* LEFT ZONE: Brand + Left-Aligned Action Buttons */}
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="flex items-center gap-2 pr-2.5 mr-1 border-r hover:opacity-85 transition-opacity"
            style={{ borderColor: 'var(--zp-border-subtle)' }}
            title="点击展开/收起侧边栏"
          >
            <img
              src="/icons/openpost_icon_pack/png/transparent/openpost-64-transparent.png"
              alt="openPost"
              className="w-6 h-6 object-contain shrink-0"
            />
            <span className="text-sm font-bold tracking-tight font-display whitespace-nowrap shrink-0">
              openPost
            </span>
          </button>

          {/* Primary New Request Button on Left */}
          <button
            type="button"
            onClick={() => handleCreateNewRequest()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all hover:opacity-95 active:scale-[0.98] whitespace-nowrap shrink-0"
            style={{
              backgroundColor: 'var(--zp-accent)',
              color: 'var(--zp-accent-fg)',
            }}
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>新建请求</span>
          </button>

          {/* Clean Icon + Label Action Buttons */}
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium zp-surface-transition hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
            style={{ color: 'var(--zp-text-secondary)' }}
          >
            <FolderSync className="w-3.5 h-3.5" style={{ color: 'var(--zp-accent)' }} />
            <span>导入</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRunnerModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium zp-surface-transition hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
            style={{ color: 'var(--zp-text-secondary)' }}
          >
            <Play className="w-3.5 h-3.5" style={{ color: 'var(--zp-accent)' }} />
            <span>批量运行</span>
          </button>
        </div>

        {/* RIGHT ZONE: Compact Env + Icon-Only Theme & Settings + Native Window Buttons */}
        <div className="flex items-center h-full shrink-0">
          <div className="flex items-center gap-1 pr-2">
            {/* UNIFIED ENVIRONMENT SWITCHER + INLINE ADD + VARIABLE CONFIG POPOVER */}
            <div ref={envPopoverRef} className="relative">
              <button
                type="button"
                onClick={() => setEnvPopoverOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium zp-surface-transition hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
                style={{ color: 'var(--zp-text-primary)' }}
                title="切换运行环境、直接新建环境或配置环境变量"
              >
                <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--zp-accent)' }} />
                <span className="max-w-[140px] truncate">{activeEnv?.name || '选择环境'}</span>
                <span
                  className="px-1.5 py-0.2 rounded text-[10px] font-mono-tabular"
                  style={{
                    backgroundColor: 'var(--zp-accent-soft)',
                    color: 'var(--zp-accent)',
                  }}
                >
                  {activeEnv?.variables.filter((v) => v.enabled).length ?? 0}
                </span>
                <motion.span
                  animate={{ rotate: envPopoverOpen ? 180 : 0 }}
                  transition={{ duration: 0.16 }}
                  className="opacity-60"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </motion.span>
              </button>

              <AnimatePresence>
                {envPopoverOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 3, scale: 0.97 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute right-0 top-full mt-1.5 w-72 rounded-xl border p-2 z-50 zp-popover-shadow"
                    style={{
                      backgroundColor: 'var(--zp-bg-surface)',
                      borderColor: 'var(--zp-border)',
                      color: 'var(--zp-text-primary)',
                    }}
                  >
                    {/* Header: Title + Edit Variables Action */}
                    <div
                      className="flex items-center justify-between px-2 py-1.5 mb-1 border-b text-xs"
                      style={{ borderColor: 'var(--zp-border-subtle)' }}
                    >
                      <span className="font-semibold" style={{ color: 'var(--zp-text-secondary)' }}>
                        运行环境切换与新建
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEnvPopoverOpen(false);
                          setIsEnvModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-opacity hover:opacity-85"
                        style={{
                          backgroundColor: 'var(--zp-accent-soft)',
                          color: 'var(--zp-accent)',
                        }}
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        <span>编辑变量表</span>
                      </button>
                    </div>

                    {/* Environment List */}
                    <div className="max-h-56 overflow-y-auto space-y-0.5 py-0.5">
                      {environments.map((env) => {
                        const isSelected = env.id === activeEnvId;
                        const enabledCount = env.variables.filter((v) => v.enabled).length;
                        return (
                          <div
                            key={env.id}
                            onClick={() => {
                              setActiveEnvId(env.id);
                              setEnvPopoverOpen(false);
                            }}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5 group"
                            style={{
                              backgroundColor: isSelected ? 'var(--zp-accent-soft)' : 'transparent',
                              color: isSelected ? 'var(--zp-accent)' : 'var(--zp-text-primary)',
                            }}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor: isSelected
                                    ? 'var(--zp-accent)'
                                    : 'var(--zp-border)',
                                }}
                              />
                              <div className="min-w-0">
                                <div className="font-medium truncate">{env.name}</div>
                                <div
                                  className="text-[10px] font-mono-tabular truncate"
                                  style={{ color: 'var(--zp-text-muted)' }}
                                >
                                  {enabledCount} 个生效变量
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveEnvId(env.id);
                                  setEnvPopoverOpen(false);
                                  setIsEnvModalOpen(true);
                                }}
                                className="px-1.5 py-0.5 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity border"
                                style={{
                                  borderColor: 'var(--zp-border)',
                                  backgroundColor: 'var(--zp-bg-canvas)',
                                  color: 'var(--zp-text-secondary)',
                                }}
                                title="配置此环境的变量"
                              >
                                变量
                              </button>
                              {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Integrated Inline Add Environment Footer */}
                    <div
                      className="mt-1.5 pt-2 border-t flex items-center gap-1.5"
                      style={{ borderColor: 'var(--zp-border-subtle)' }}
                    >
                      <input
                        type="text"
                        value={quickNewEnvName}
                        onChange={(e) => setQuickNewEnvName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleQuickCreateEnvInline();
                          }
                        }}
                        placeholder="输入新环境名 (如 Staging)..."
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none"
                        style={{
                          backgroundColor: 'var(--zp-bg-input)',
                          borderColor: 'var(--zp-border)',
                          color: 'var(--zp-text-primary)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleQuickCreateEnvInline}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-opacity hover:opacity-90"
                        style={{
                          backgroundColor: 'var(--zp-accent)',
                          color: 'var(--zp-accent-fg)',
                        }}
                        title="立即创建并切换到新环境"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>新建</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ICON-ONLY THEME SWITCHER WITH POPOVER */}
            <div ref={themePopoverRef} className="relative">
              <button
                type="button"
                onClick={() => setThemePopoverOpen((prev) => !prev)}
                className="w-7 h-7 rounded-lg inline-flex items-center justify-center zp-surface-transition hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: 'var(--zp-text-secondary)' }}
                title={`切换主题 (当前: ${currentTheme.name})`}
              >
                <Palette className="w-3.5 h-3.5" style={{ color: 'var(--zp-accent)' }} />
              </button>

              <AnimatePresence>
                {themePopoverOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 3, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1.5 w-60 rounded-xl border p-1.5 z-50 zp-popover-shadow"
                    style={{
                      backgroundColor: 'var(--zp-bg-surface)',
                      borderColor: 'var(--zp-border)',
                      color: 'var(--zp-text-primary)',
                    }}
                  >
                    <div
                      className="flex items-center justify-between px-2.5 py-1.5 mb-1 border-b text-xs"
                      style={{ borderColor: 'var(--zp-border-subtle)' }}
                    >
                      <span className="font-semibold">AI 主题快切</span>
                      <button
                        type="button"
                        onClick={handleToggleLightDark}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px]"
                        style={{
                          borderColor: 'var(--zp-border)',
                          color: 'var(--zp-text-secondary)',
                        }}
                      >
                        {currentTheme.mode === 'dark' ? (
                          <>
                            <Sun className="w-3 h-3 text-amber-400" />
                            <span>转浅色</span>
                          </>
                        ) : (
                          <>
                            <Moon className="w-3 h-3 text-indigo-500" />
                            <span>转深色</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-0.5">
                      {AI_THEMES.map((t) => {
                        const selected = t.id === activeThemeId;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setActiveThemeId(t.id);
                              setThemePopoverOpen(false);
                            }}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                            style={{
                              backgroundColor: selected ? 'var(--zp-accent-soft)' : 'transparent',
                              color: selected ? 'var(--zp-accent)' : 'var(--zp-text-primary)',
                            }}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: t.colors.accent }}
                              />
                              <span className="truncate font-medium">{t.name}</span>
                            </div>
                            <span
                              className="text-[10px] font-mono-tabular shrink-0"
                              style={{ color: 'var(--zp-text-muted)' }}
                            >
                              {t.mode === 'light' ? 'Light' : 'Dark'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ICON-ONLY SETTINGS BUTTON */}
            <button
              type="button"
              onClick={() => openSettingsAt('themes')}
              className="w-7 h-7 rounded-lg inline-flex items-center justify-center zp-surface-transition hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: 'var(--zp-text-secondary)' }}
              title="偏好设置 (字号缩放 / 自定义数据目录 / 代理引擎 / 多端构建)"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* NATIVE DESKTOP WINDOW CONTROLS (MINIMIZE / MAXIMIZE / CLOSE) */}
          <div
            className="flex items-center h-full border-l"
            style={{ borderColor: 'var(--zp-border-subtle)' }}
          >
            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="h-full w-11 inline-flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: 'var(--zp-text-secondary)' }}
              title="最小化侧边面板"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleToggleMaximize}
              className="h-full w-11 inline-flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: 'var(--zp-text-secondary)' }}
              title={isMaximized ? '向下还原窗口' : '最大化全屏工作台'}
            >
              {isMaximized ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                if (openTabIds.length > 1 && activeRequest) {
                  handleCloseTab(activeRequest.id);
                }
              }}
              className="h-full w-11 inline-flex items-center justify-center transition-colors hover:bg-[#E81123] hover:text-white"
              style={{ color: 'var(--zp-text-secondary)' }}
              title="关闭当前活动标签页"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ====================================================================
          MAIN IDE BODY: COLLAPSIBLE SIDEBAR (276px) + REQUEST/RESPONSE WORKSPACE
         ==================================================================== */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT SIDEBAR */}
        <AnimatePresence initial={false}>
          {!sidebarCollapsed && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 276, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="border-r flex flex-col shrink-0 overflow-hidden zp-surface-transition"
              style={{
                backgroundColor: 'var(--zp-bg-surface)',
                borderColor: 'var(--zp-border)',
              }}
            >
              {/* Sidebar Mode Switcher with Unified Rounded-lg Sliding Pill */}
              <div
                className="grid grid-cols-2 gap-1 p-2 border-b text-xs"
                style={{ borderColor: 'var(--zp-border-subtle)' }}
              >
                {(
                  [
                    {
                      id: 'collections' as const,
                      label: `接口集合 (${requests.length})`,
                      icon: <Layers className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'history' as const,
                      label: `历史记录 (${history.length})`,
                      icon: <History className="w-3.5 h-3.5" />,
                    },
                  ] as const
                ).map((tab) => {
                  const active = sidebarMode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSidebarMode(tab.id)}
                      className="relative inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0"
                      style={{
                        color: active ? 'var(--zp-text-primary)' : 'var(--zp-text-secondary)',
                      }}
                    >
                      {active && (
                        <motion.div
                          layoutId="sidebar-mode-pill"
                          transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                          className="absolute inset-0 rounded-lg border"
                          style={{
                            backgroundColor: 'var(--zp-bg-elevated)',
                            borderColor: 'var(--zp-border)',
                          }}
                        />
                      )}
                      <span
                        className="relative z-10"
                        style={{ color: active ? 'var(--zp-accent)' : 'currentColor' }}
                      >
                        {tab.icon}
                      </span>
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Search & Quick Left Creation Actions */}
              <div
                className="p-2.5 border-b space-y-2"
                style={{ borderColor: 'var(--zp-border-subtle)' }}
              >
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs zp-surface-transition"
                  style={{
                    backgroundColor: 'var(--zp-bg-input)',
                    borderColor: 'var(--zp-border)',
                  }}
                >
                  <Search
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: 'var(--zp-text-muted)' }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索接口名称、URL 或方法..."
                    className="w-full bg-transparent text-xs focus:outline-none"
                    style={{ color: 'var(--zp-text-primary)' }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{ color: 'var(--zp-text-muted)' }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {sidebarMode === 'collections' && (
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => handleCreateNewRequest()}
                      className="inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg border font-medium zp-surface-transition hover:opacity-90 whitespace-nowrap shrink-0"
                      style={{
                        borderColor: 'var(--zp-border)',
                        backgroundColor: 'var(--zp-accent-soft)',
                        color: 'var(--zp-accent)',
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>新建请求</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateFolder}
                      className="inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg border font-medium zp-surface-transition hover:opacity-85 whitespace-nowrap shrink-0"
                      style={{
                        borderColor: 'var(--zp-border)',
                        backgroundColor: 'var(--zp-bg-canvas)',
                        color: 'var(--zp-text-secondary)',
                      }}
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>新建目录</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Tree or History List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {sidebarMode === 'collections' ? (
                  folders.map((folder) => {
                    const folderReqs = filteredRequests.filter((r) => r.folderId === folder.id);
                    const isExpanded = folder.expanded !== false;
                    return (
                      <div key={folder.id} className="space-y-0.5">
                        <div
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs font-semibold group transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                          style={{ color: 'var(--zp-text-secondary)' }}
                          onClick={() =>
                            setFolders((prev) =>
                              prev.map((f) =>
                                f.id === folder.id ? { ...f, expanded: !isExpanded } : f
                              )
                            )
                          }
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <motion.span
                              animate={{ rotate: isExpanded ? 90 : 0 }}
                              transition={{ duration: 0.16 }}
                              className="shrink-0 opacity-60"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </motion.span>
                            {isExpanded ? (
                              <FolderOpen
                                className="w-3.5 h-3.5 shrink-0"
                                style={{ color: 'var(--zp-accent)' }}
                              />
                            ) : (
                              <Folder
                                className="w-3.5 h-3.5 shrink-0"
                                style={{ color: 'var(--zp-text-muted)' }}
                              />
                            )}
                            <span className="truncate">{folder.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateNewRequest(folder.id);
                            }}
                            className="opacity-60 hover:opacity-100 p-0.5 rounded-md"
                            title="在此目录下新建接口"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                              className="overflow-hidden pl-3.5 space-y-0.5"
                            >
                              {folderReqs.length === 0 ? (
                                <p
                                  className="px-2.5 py-1 text-xs"
                                  style={{ color: 'var(--zp-text-muted)' }}
                                >
                                  暂无匹配接口
                                </p>
                              ) : (
                                folderReqs.map((req) => {
                                  const isSelected = req.id === activeRequest?.id;
                                  const mStyle = METHOD_COLORS[req.method];
                                  return (
                                    <div
                                      key={req.id}
                                      onClick={() => handleOpenRequestTab(req.id)}
                                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer group zp-surface-transition border"
                                      style={{
                                        backgroundColor: isSelected
                                          ? 'var(--zp-bg-elevated)'
                                          : 'transparent',
                                        borderColor: isSelected
                                          ? 'var(--zp-border)'
                                          : 'transparent',
                                        color: isSelected
                                          ? 'var(--zp-text-primary)'
                                          : 'var(--zp-text-secondary)',
                                      }}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span
                                          className={`font-mono-tabular font-bold text-[11px] w-11 shrink-0 ${mStyle.text}`}
                                        >
                                          {req.method}
                                        </span>
                                        <span className="truncate font-medium">{req.name}</span>
                                      </div>
                                      <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenRequestTab(req.id);
                                            handleSendRequest(req);
                                          }}
                                          className="p-0.5 hover:opacity-80"
                                          style={{ color: 'var(--zp-accent)' }}
                                          title="立即发送此请求"
                                        >
                                          <Play className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => handleDuplicateRequest(req, e)}
                                          className="p-0.5 hover:opacity-80"
                                          title="克隆接口"
                                        >
                                          <Copy className="w-3 h-3" />
                                        </button>
                                        {requests.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={(e) => handleDeleteRequest(req.id, e)}
                                            className="p-0.5 hover:text-rose-500"
                                            title="删除接口"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                ) : history.length === 0 ? (
                  <div className="p-4 text-center text-xs" style={{ color: 'var(--zp-text-muted)' }}>
                    暂无本地请求记录。发送任意请求后将在此显示耗时与状态历史。
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex justify-end px-2 pb-1">
                      <button
                        type="button"
                        onClick={() => setHistory([])}
                        className="text-xs hover:underline"
                        style={{ color: 'var(--zp-text-muted)' }}
                      >
                        清空本地历史
                      </button>
                    </div>
                    {history.map((h) => {
                      const mStyle = METHOD_COLORS[h.request.method];
                      return (
                        <div
                          key={h.id}
                          onClick={() => {
                            const existing = requests.find((r) => r.id === h.request.id);
                            if (existing) {
                              handleOpenRequestTab(existing.id);
                            } else {
                              setRequests((prev) => [...prev, h.request]);
                              handleOpenRequestTab(h.request.id);
                            }
                          }}
                          className="p-2.5 rounded-lg border text-xs cursor-pointer zp-surface-transition hover:opacity-90"
                          style={{
                            backgroundColor: 'var(--zp-bg-canvas)',
                            borderColor: 'var(--zp-border-subtle)',
                          }}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span
                              className={`font-mono-tabular font-bold text-xs ${mStyle.text}`}
                            >
                              {h.request.method}
                            </span>
                            <span
                              className="font-mono-tabular text-xs"
                              style={{ color: 'var(--zp-text-muted)' }}
                            >
                              {h.status > 0 ? `HTTP ${h.status}` : 'ERR'} · {h.durationMs} ms ·{' '}
                              {h.timestamp}
                            </span>
                          </div>
                          <p
                            className="font-mono-tabular text-xs truncate"
                            style={{ color: 'var(--zp-text-secondary)' }}
                          >
                            {h.request.url}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* RIGHT MAIN WORKSPACE */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* ==================================================================
              UNIFIED ROUNDED-LG OPEN TABS BAR (MATCHES SUB-TABS DESIGN LANGUAGE)
             ================================================================== */}
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 border-b overflow-x-auto shrink-0 zp-surface-transition"
            style={{
              backgroundColor: 'var(--zp-bg-surface)',
              borderColor: 'var(--zp-border)',
            }}
          >
            {openTabIds.map((tabId) => {
              const req = requests.find((r) => r.id === tabId);
              if (!req) return null;
              const isActive = req.id === activeRequest?.id;
              const mStyle = METHOD_COLORS[req.method];
              return (
                <div
                  key={req.id}
                  onClick={() => setActiveRequestId(req.id)}
                  className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors max-w-[240px] shrink-0"
                  style={{
                    color: isActive ? 'var(--zp-text-primary)' : 'var(--zp-text-secondary)',
                  }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="open-request-tab-card"
                      transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                      className="absolute inset-0 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--zp-bg-elevated)',
                        borderColor: 'var(--zp-border)',
                      }}
                    />
                  )}
                  <span
                    className={`relative z-10 font-mono-tabular font-bold text-[11px] shrink-0 ${mStyle.text}`}
                  >
                    {req.method}
                  </span>
                  <span className="relative z-10 truncate font-medium">{req.name}</span>
                  {openTabIds.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => handleCloseTab(req.id, e)}
                      className="relative z-10 p-0.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 shrink-0"
                      style={{ color: 'var(--zp-text-muted)' }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => handleCreateNewRequest()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium hover:opacity-85 shrink-0"
              style={{
                borderColor: 'var(--zp-border-subtle)',
                backgroundColor: 'var(--zp-bg-canvas)',
                color: 'var(--zp-text-secondary)',
              }}
              title="新建请求标签页"
            >
              <Plus className="w-3.5 h-3.5" style={{ color: 'var(--zp-accent)' }} />
              <span>新建</span>
            </button>
          </div>

          {activeRequest && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* ================================================================
                  STREAMLINED REQUEST CONTROL BLOCK (BREADCRUMB + OMNIBAR)
                 ================================================================ */}
              <div
                className="px-4 py-2.5 border-b space-y-2 shrink-0 zp-surface-transition"
                style={{
                  borderColor: 'var(--zp-border)',
                  backgroundColor: 'var(--zp-bg-canvas)',
                }}
              >
                {/* Compact Top Row: Folder Dropdown + Request Title + Resolved URL + Copy cURL */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                    <CustomSelect
                      value={activeRequest.folderId}
                      onChange={(folderId) => updateActiveRequest({ folderId })}
                      icon={<Folder className="w-3.5 h-3.5" />}
                      minWidth={210}
                      options={folders.map((f) => ({
                        value: f.id,
                        label: f.name,
                      }))}
                    />
                    <span style={{ color: 'var(--zp-text-muted)' }}>/</span>
                    <input
                      type="text"
                      value={activeRequest.name}
                      onChange={(e) => updateActiveRequest({ name: e.target.value })}
                      className="font-semibold font-display text-sm bg-transparent border border-transparent hover:border-[var(--zp-border)] focus:border-[var(--zp-accent)] rounded-lg focus:outline-none px-2.5 py-1 flex-1 max-w-md zp-surface-transition"
                      style={{ color: 'var(--zp-text-primary)' }}
                      placeholder="输入接口名称..."
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="hidden lg:inline font-mono-tabular text-xs truncate max-w-md"
                      style={{ color: 'var(--zp-text-muted)' }}
                      title={`实际解析目标 URL: ${resolvedPreviewUrl}`}
                    >
                      解析预览:{' '}
                      <span style={{ color: 'var(--zp-text-secondary)' }}>
                        {resolvedPreviewUrl}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const curlStr = generateCodeSnippet(activeRequest, activeEnv, 'curl');
                        navigator.clipboard.writeText(curlStr);
                        setCopiedCurlQuick(true);
                        setTimeout(() => setCopiedCurlQuick(false), 1800);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium hover:opacity-85 whitespace-nowrap shrink-0"
                      style={{
                        borderColor: 'var(--zp-border)',
                        backgroundColor: 'var(--zp-bg-surface)',
                        color: 'var(--zp-text-secondary)',
                      }}
                      title="一键复制当前请求的 cURL 命令"
                    >
                      {copiedCurlQuick ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedCurlQuick ? '已复制 cURL' : '复制 cURL'}</span>
                    </button>
                  </div>
                </div>

                {/* Bottom Row: Flush Rounded-xl URL Omnibar + Primary Send CTA */}
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex-1 flex items-center rounded-[10px] border zp-surface-transition focus-within:border-[var(--zp-accent)]"
                    style={{
                      backgroundColor: 'var(--zp-bg-input)',
                      borderColor: 'var(--zp-border)',
                    }}
                  >
                    <CustomSelect
                      value={activeRequest.method}
                      onChange={(m) => updateActiveRequest({ method: m as HttpMethod })}
                      variant="method"
                      minWidth={135}
                      options={HTTP_METHODS.map((m) => ({
                        value: m,
                        label: m,
                        colorDot: METHOD_COLORS[m].dot,
                        textClassName: METHOD_COLORS[m].text,
                      }))}
                    />

                    <input
                      type="text"
                      value={activeRequest.url}
                      onChange={(e) => updateActiveRequest({ url: e.target.value })}
                      placeholder="输入接口地址，如 https://api.example.com/v1/users 或 {{baseUrl}}/users"
                      className="flex-1 px-3.5 py-2 font-mono-tabular text-xs bg-transparent focus:outline-none"
                      style={{ color: 'var(--zp-text-primary)' }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSendRequest()}
                    disabled={loadingReqId === activeRequest.id}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-xs font-semibold transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-50 whitespace-nowrap shrink-0"
                    style={{
                      backgroundColor: 'var(--zp-accent)',
                      color: 'var(--zp-accent-fg)',
                    }}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {loadingReqId === activeRequest.id ? '请求中...' : '发送请求 (⌘↵)'}
                    </span>
                  </button>
                </div>
              </div>

              {/* ================================================================
                  SPLIT PANE: TOP = REQUEST CONFIG (6/12), BOTTOM = RESPONSE (6/12)
                 ================================================================ */}
              <div className="flex-1 grid grid-rows-12 min-h-0">
                {/* TOP PANE: Request Builder */}
                <div
                  className="row-span-6 flex flex-col border-b min-h-0 zp-surface-transition"
                  style={{ borderColor: 'var(--zp-border)' }}
                >
                  {/* Request Builder Sub-Tabs with Unified Rounded-lg Sliding Pill + Icons */}
                  <div
                    className="flex items-center justify-between px-4 py-1.5 border-b text-xs shrink-0 zp-surface-transition"
                    style={{
                      backgroundColor: 'var(--zp-bg-surface)',
                      borderColor: 'var(--zp-border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-1 overflow-x-auto py-0.5">
                      {reqSubTabItems.map((tab) => {
                        const active = reqSubTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setReqSubTab(tab.id)}
                            className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0"
                            style={{
                              color: active
                                ? 'var(--zp-text-primary)'
                                : 'var(--zp-text-secondary)',
                            }}
                          >
                            {active && (
                              <motion.div
                                layoutId="req-builder-tab-pill"
                                transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                                className="absolute inset-0 rounded-lg border"
                                style={{
                                  backgroundColor: 'var(--zp-bg-elevated)',
                                  borderColor: 'var(--zp-border)',
                                }}
                              />
                            )}
                            <span
                              className="relative z-10"
                              style={{ color: active ? 'var(--zp-accent)' : 'currentColor' }}
                            >
                              {tab.icon}
                            </span>
                            <span className="relative z-10">{tab.label}</span>
                            {typeof tab.count === 'number' && tab.count > 0 && (
                              <span
                                className="relative z-10 font-mono-tabular text-xs font-semibold"
                                style={{ color: 'var(--zp-accent)' }}
                              >
                                ({tab.count})
                              </span>
                            )}
                            {tab.badge && (
                              <span
                                className="relative z-10 font-mono-tabular text-[11px]"
                                style={{ color: 'var(--zp-accent)' }}
                              >
                                · {tab.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {activeRequest.description && (
                      <span
                        className="hidden xl:inline text-xs truncate max-w-sm"
                        style={{ color: 'var(--zp-text-muted)' }}
                      >
                        {activeRequest.description}
                      </span>
                    )}
                  </div>

                  {/* Sub-Tab Body Content with Smooth Transition */}
                  <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={reqSubTab}
                        initial={{ opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -3 }}
                        transition={{ duration: 0.14 }}
                        className="flex-1 min-h-0 flex flex-col"
                      >
                        {reqSubTab === 'params' && (
                          <KeyValueTable
                            items={activeRequest.params}
                            onChange={(params) => updateActiveRequest({ params })}
                            keyPlaceholder="URL 查询参数名 (如 page, limit)"
                            valuePlaceholder="参数值 (支持 {{变量}})"
                          />
                        )}

                        {reqSubTab === 'headers' && (
                          <KeyValueTable
                            items={activeRequest.headers}
                            onChange={(headers) => updateActiveRequest({ headers })}
                            keyPlaceholder="请求头名称 (如 Content-Type, X-API-Key)"
                            valuePlaceholder="请求头值 (支持 {{变量}})"
                            suggestions={COMMON_HEADERS}
                          />
                        )}

                        {reqSubTab === 'auth' && (
                          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
                            <div className="flex flex-wrap items-center gap-3">
                              <span
                                className="font-medium"
                                style={{ color: 'var(--zp-text-secondary)' }}
                              >
                                鉴权模式 (Authorization):
                              </span>
                              <div
                                className="inline-flex items-center gap-1 p-1 rounded-lg border"
                                style={{
                                  backgroundColor: 'var(--zp-bg-surface)',
                                  borderColor: 'var(--zp-border)',
                                }}
                              >
                                {(
                                  [
                                    { id: 'none', label: 'No Auth (无鉴权)' },
                                    { id: 'bearer', label: 'Bearer Token' },
                                    { id: 'basic', label: 'Basic Auth' },
                                    { id: 'apikey', label: 'API Key' },
                                  ] as const
                                ).map((t) => {
                                  const active = activeRequest.auth.type === t.id;
                                  return (
                                    <button
                                      key={t.id}
                                      type="button"
                                      onClick={() =>
                                        updateActiveRequest({
                                          auth: { ...activeRequest.auth, type: t.id },
                                        })
                                      }
                                      className="px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0"
                                      style={{
                                        backgroundColor: active
                                          ? 'var(--zp-accent)'
                                          : 'transparent',
                                        color: active
                                          ? 'var(--zp-accent-fg)'
                                          : 'var(--zp-text-secondary)',
                                      }}
                                    >
                                      {t.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {activeRequest.auth.type === 'none' && (
                              <p style={{ color: 'var(--zp-text-muted)' }}>
                                当前请求不自动附加额外鉴权头。
                              </p>
                            )}

                            {activeRequest.auth.type === 'bearer' && (
                              <div className="max-w-xl space-y-2">
                                <label
                                  className="block font-medium"
                                  style={{ color: 'var(--zp-text-secondary)' }}
                                >
                                  Bearer Token (自动注入{' '}
                                  <code className="font-mono-tabular">
                                    Authorization: Bearer &lt;token&gt;
                                  </code>
                                  )
                                </label>
                                <input
                                  type="text"
                                  value={activeRequest.auth.bearerToken || ''}
                                  onChange={(e) =>
                                    updateActiveRequest({
                                      auth: {
                                        ...activeRequest.auth,
                                        bearerToken: e.target.value,
                                      },
                                    })
                                  }
                                  placeholder="输入 Token 或使用 {{auth_token}}"
                                  className="w-full px-3.5 py-2 rounded-lg border font-mono-tabular text-xs focus:outline-none"
                                  style={{
                                    backgroundColor: 'var(--zp-bg-input)',
                                    borderColor: 'var(--zp-border)',
                                    color: 'var(--zp-accent)',
                                  }}
                                />
                              </div>
                            )}

                            {activeRequest.auth.type === 'basic' && (
                              <div className="max-w-xl grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <label
                                    className="block font-medium"
                                    style={{ color: 'var(--zp-text-secondary)' }}
                                  >
                                    用户名 (Username)
                                  </label>
                                  <input
                                    type="text"
                                    value={activeRequest.auth.basicUsername || ''}
                                    onChange={(e) =>
                                      updateActiveRequest({
                                        auth: {
                                          ...activeRequest.auth,
                                          basicUsername: e.target.value,
                                        },
                                      })
                                    }
                                    placeholder="Username"
                                    className="w-full px-3 py-2 rounded-lg border font-mono-tabular text-xs focus:outline-none"
                                    style={{
                                      backgroundColor: 'var(--zp-bg-input)',
                                      borderColor: 'var(--zp-border)',
                                      color: 'var(--zp-text-primary)',
                                    }}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label
                                    className="block font-medium"
                                    style={{ color: 'var(--zp-text-secondary)' }}
                                  >
                                    密码 (Password)
                                  </label>
                                  <input
                                    type="password"
                                    value={activeRequest.auth.basicPassword || ''}
                                    onChange={(e) =>
                                      updateActiveRequest({
                                        auth: {
                                          ...activeRequest.auth,
                                          basicPassword: e.target.value,
                                        },
                                      })
                                    }
                                    placeholder="Password"
                                    className="w-full px-3 py-2 rounded-lg border font-mono-tabular text-xs focus:outline-none"
                                    style={{
                                      backgroundColor: 'var(--zp-bg-input)',
                                      borderColor: 'var(--zp-border)',
                                      color: 'var(--zp-text-primary)',
                                    }}
                                  />
                                </div>
                              </div>
                            )}

                            {activeRequest.auth.type === 'apikey' && (
                              <div className="max-w-2xl grid grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                  <label
                                    className="block font-medium"
                                    style={{ color: 'var(--zp-text-secondary)' }}
                                  >
                                    Key 名称
                                  </label>
                                  <input
                                    type="text"
                                    value={activeRequest.auth.apiKeyName || ''}
                                    onChange={(e) =>
                                      updateActiveRequest({
                                        auth: {
                                          ...activeRequest.auth,
                                          apiKeyName: e.target.value,
                                        },
                                      })
                                    }
                                    placeholder="X-API-Key"
                                    className="w-full px-3 py-2 rounded-lg border font-mono-tabular text-xs focus:outline-none"
                                    style={{
                                      backgroundColor: 'var(--zp-bg-input)',
                                      borderColor: 'var(--zp-border)',
                                      color: 'var(--zp-text-primary)',
                                    }}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label
                                    className="block font-medium"
                                    style={{ color: 'var(--zp-text-secondary)' }}
                                  >
                                    Key 值
                                  </label>
                                  <input
                                    type="text"
                                    value={activeRequest.auth.apiKeyValue || ''}
                                    onChange={(e) =>
                                      updateActiveRequest({
                                        auth: {
                                          ...activeRequest.auth,
                                          apiKeyValue: e.target.value,
                                        },
                                      })
                                    }
                                    placeholder="sk-..."
                                    className="w-full px-3 py-2 rounded-lg border font-mono-tabular text-xs focus:outline-none"
                                    style={{
                                      backgroundColor: 'var(--zp-bg-input)',
                                      borderColor: 'var(--zp-border)',
                                      color: 'var(--zp-accent)',
                                    }}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label
                                    className="block font-medium"
                                    style={{ color: 'var(--zp-text-secondary)' }}
                                  >
                                    注入位置
                                  </label>
                                  <CustomSelect
                                    value={activeRequest.auth.apiKeyIn || 'header'}
                                    onChange={(v) =>
                                      updateActiveRequest({
                                        auth: {
                                          ...activeRequest.auth,
                                          apiKeyIn: v as 'header' | 'query',
                                        },
                                      })
                                    }
                                    size="md"
                                    minWidth={170}
                                    options={[
                                      { value: 'header', label: 'Header (请求头)' },
                                      { value: 'query', label: 'Query Params (URL参数)' },
                                    ]}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {reqSubTab === 'body' && (
                          <div className="flex-1 flex flex-col min-h-0">
                            <div
                              className="flex items-center justify-between px-4 py-1.5 border-b text-xs shrink-0"
                              style={{ borderColor: 'var(--zp-border-subtle)' }}
                            >
                              <div
                                className="inline-flex items-center gap-1 p-1 rounded-lg border"
                                style={{
                                  backgroundColor: 'var(--zp-bg-surface)',
                                  borderColor: 'var(--zp-border)',
                                }}
                              >
                                {(
                                  [
                                    { id: 'none', label: 'none' },
                                    { id: 'json', label: 'JSON' },
                                    { id: 'form-data', label: 'form-data' },
                                    { id: 'urlencoded', label: 'x-www-form-urlencoded' },
                                    { id: 'raw', label: 'raw (Text/XML)' },
                                    { id: 'graphql', label: 'GraphQL' },
                                  ] as const
                                ).map((bType) => {
                                  const active = activeRequest.body.type === bType.id;
                                  return (
                                    <button
                                      key={bType.id}
                                      type="button"
                                      onClick={() =>
                                        updateActiveRequest({
                                          body: { ...activeRequest.body, type: bType.id },
                                        })
                                      }
                                      className="px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0"
                                      style={{
                                        backgroundColor: active
                                          ? 'var(--zp-accent)'
                                          : 'transparent',
                                        color: active
                                          ? 'var(--zp-accent-fg)'
                                          : 'var(--zp-text-secondary)',
                                      }}
                                    >
                                      {bType.label}
                                    </button>
                                  );
                                })}
                              </div>

                              {activeRequest.body.type === 'json' && (
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`font-mono-tabular ${
                                      jsonSyntaxStatus.valid ? 'text-emerald-500' : 'text-rose-500'
                                    }`}
                                  >
                                    {jsonSyntaxStatus.message}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleFormatJsonBody(false)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs whitespace-nowrap shrink-0 hover:opacity-85"
                                    style={{
                                      borderColor: 'var(--zp-border)',
                                      color: 'var(--zp-text-secondary)',
                                    }}
                                  >
                                    <Wand2 className="w-3.5 h-3.5" />
                                    <span>美化 JSON</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleFormatJsonBody(true)}
                                    className="px-2.5 py-1 rounded-lg border text-xs whitespace-nowrap shrink-0 hover:opacity-85"
                                    style={{
                                      borderColor: 'var(--zp-border)',
                                      color: 'var(--zp-text-secondary)',
                                    }}
                                  >
                                    压缩
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-h-0 flex flex-col">
                              {activeRequest.body.type === 'none' && (
                                <div
                                  className="flex-1 flex items-center justify-center text-xs"
                                  style={{ color: 'var(--zp-text-muted)' }}
                                >
                                  该请求不包含请求体 (Body is none)。
                                </div>
                              )}

                              {activeRequest.body.type === 'json' && (
                                <textarea
                                  value={activeRequest.body.json}
                                  onChange={(e) =>
                                    updateActiveRequest({
                                      body: { ...activeRequest.body, json: e.target.value },
                                    })
                                  }
                                  placeholder='{\n  "key": "value"\n}'
                                  className="flex-1 w-full p-3.5 font-mono-tabular text-xs resize-none focus:outline-none leading-relaxed zp-surface-transition"
                                  style={{
                                    backgroundColor: 'var(--zp-code-bg)',
                                    color: 'var(--zp-text-primary)',
                                  }}
                                />
                              )}

                              {activeRequest.body.type === 'raw' && (
                                <textarea
                                  value={activeRequest.body.raw}
                                  onChange={(e) =>
                                    updateActiveRequest({
                                      body: { ...activeRequest.body, raw: e.target.value },
                                    })
                                  }
                                  placeholder="输入原始文本、XML 或自定义报文载荷..."
                                  className="flex-1 w-full p-3.5 font-mono-tabular text-xs resize-none focus:outline-none leading-relaxed zp-surface-transition"
                                  style={{
                                    backgroundColor: 'var(--zp-code-bg)',
                                    color: 'var(--zp-text-primary)',
                                  }}
                                />
                              )}

                              {activeRequest.body.type === 'form-data' && (
                                <KeyValueTable
                                  items={activeRequest.body.formData || []}
                                  onChange={(formData) =>
                                    updateActiveRequest({
                                      body: { ...activeRequest.body, formData },
                                    })
                                  }
                                  keyPlaceholder="表单字段名 (Field)"
                                  valuePlaceholder="表单字段值"
                                />
                              )}

                              {activeRequest.body.type === 'urlencoded' && (
                                <KeyValueTable
                                  items={activeRequest.body.urlencoded || []}
                                  onChange={(urlencoded) =>
                                    updateActiveRequest({
                                      body: { ...activeRequest.body, urlencoded },
                                    })
                                  }
                                  keyPlaceholder="URL 编码字段名"
                                  valuePlaceholder="字段值"
                                />
                              )}

                              {activeRequest.body.type === 'graphql' && (
                                <div className="flex-1 grid grid-cols-2 min-h-0">
                                  <div
                                    className="flex flex-col border-r min-h-0"
                                    style={{ borderColor: 'var(--zp-border-subtle)' }}
                                  >
                                    <div
                                      className="px-3.5 py-1.5 border-b text-xs font-medium"
                                      style={{
                                        borderColor: 'var(--zp-border-subtle)',
                                        color: 'var(--zp-text-muted)',
                                      }}
                                    >
                                      GraphQL Query
                                    </div>
                                    <textarea
                                      value={activeRequest.body.graphqlQuery}
                                      onChange={(e) =>
                                        updateActiveRequest({
                                          body: {
                                            ...activeRequest.body,
                                            graphqlQuery: e.target.value,
                                          },
                                        })
                                      }
                                      className="flex-1 p-3.5 font-mono-tabular text-xs resize-none focus:outline-none"
                                      style={{
                                        backgroundColor: 'var(--zp-code-bg)',
                                        color: 'var(--zp-text-primary)',
                                      }}
                                    />
                                  </div>
                                  <div className="flex flex-col min-h-0">
                                    <div
                                      className="px-3.5 py-1.5 border-b text-xs font-medium"
                                      style={{
                                        borderColor: 'var(--zp-border-subtle)',
                                        color: 'var(--zp-text-muted)',
                                      }}
                                    >
                                      GraphQL Variables (JSON)
                                    </div>
                                    <textarea
                                      value={activeRequest.body.graphqlVariables}
                                      onChange={(e) =>
                                        updateActiveRequest({
                                          body: {
                                            ...activeRequest.body,
                                            graphqlVariables: e.target.value,
                                          },
                                        })
                                      }
                                      className="flex-1 p-3.5 font-mono-tabular text-xs resize-none focus:outline-none"
                                      style={{
                                        backgroundColor: 'var(--zp-code-bg)',
                                        color: 'var(--zp-text-primary)',
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {reqSubTab === 'tests' && (
                          <div className="flex-1 flex flex-col min-h-0">
                            <div
                              className="flex items-center justify-between px-4 py-2 border-b text-xs shrink-0"
                              style={{ borderColor: 'var(--zp-border-subtle)' }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  const nextRule: AssertionRule = {
                                    id: `as_${Date.now()}`,
                                    enabled: true,
                                    type: 'status_eq',
                                    target: 'status',
                                    expected: '200',
                                  };
                                  updateActiveRequest({
                                    assertions: [...activeRequest.assertions, nextRule],
                                  });
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap shrink-0"
                                style={{
                                  backgroundColor: 'var(--zp-accent-soft)',
                                  color: 'var(--zp-accent)',
                                }}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>新增断言或变量提取规则</span>
                              </button>
                              <span style={{ color: 'var(--zp-text-muted)' }}>
                                请求返回后自动执行校验，支持将响应 JSON 字段自动写入环境变量
                              </span>
                            </div>

                            <div className="flex-1 overflow-y-auto p-3.5 space-y-2 text-xs">
                              {activeRequest.assertions.map((rule) => (
                                <div
                                  key={rule.id}
                                  className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl border"
                                  style={{
                                    backgroundColor: 'var(--zp-bg-surface)',
                                    borderColor: 'var(--zp-border)',
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateActiveRequest({
                                        assertions: activeRequest.assertions.map((a) =>
                                          a.id === rule.id ? { ...a, enabled: !a.enabled } : a
                                        ),
                                      })
                                    }
                                    style={{
                                      color: rule.enabled
                                        ? 'var(--zp-accent)'
                                        : 'var(--zp-text-muted)',
                                    }}
                                  >
                                    {rule.enabled ? (
                                      <CheckSquare className="w-4 h-4" />
                                    ) : (
                                      <Square className="w-4 h-4" />
                                    )}
                                  </button>

                                  <CustomSelect
                                    value={rule.type}
                                    onChange={(val) =>
                                      updateActiveRequest({
                                        assertions: activeRequest.assertions.map((a) =>
                                          a.id === rule.id
                                            ? { ...a, type: val as AssertionType }
                                            : a
                                        ),
                                      })
                                    }
                                    minWidth={210}
                                    options={[
                                      { value: 'status_eq', label: 'HTTP 状态码等于' },
                                      { value: 'time_lt', label: '响应耗时小于 (ms)' },
                                      { value: 'json_path_eq', label: 'JSONPath 字段值等于' },
                                      { value: 'json_path_exists', label: 'JSONPath 字段存在' },
                                      { value: 'header_contains', label: '响应头包含' },
                                      {
                                        value: 'extract_env',
                                        label: '提取 JSONPath 存入环境变量',
                                      },
                                    ]}
                                  />

                                  {(rule.type === 'json_path_eq' ||
                                    rule.type === 'json_path_exists' ||
                                    rule.type === 'header_contains' ||
                                    rule.type === 'extract_env') && (
                                    <input
                                      type="text"
                                      value={rule.target}
                                      onChange={(e) =>
                                        updateActiveRequest({
                                          assertions: activeRequest.assertions.map((a) =>
                                            a.id === rule.id
                                              ? { ...a, target: e.target.value }
                                              : a
                                          ),
                                        })
                                      }
                                      placeholder={
                                        rule.type === 'header_contains'
                                          ? '响应头名称 (如 content-type)'
                                          : 'JSON 路径 (如 data.0.id 或 access_token)'
                                      }
                                      className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border font-mono-tabular text-xs focus:outline-none"
                                      style={{
                                        backgroundColor: 'var(--zp-bg-input)',
                                        borderColor: 'var(--zp-border)',
                                        color: 'var(--zp-text-primary)',
                                      }}
                                    />
                                  )}

                                  {rule.type !== 'json_path_exists' && (
                                    <input
                                      type="text"
                                      value={rule.expected}
                                      onChange={(e) =>
                                        updateActiveRequest({
                                          assertions: activeRequest.assertions.map((a) =>
                                            a.id === rule.id
                                              ? { ...a, expected: e.target.value }
                                              : a
                                          ),
                                        })
                                      }
                                      placeholder={
                                        rule.type === 'extract_env'
                                          ? '目标变量名 (如 auth_token)'
                                          : '期望值 (如 200)'
                                      }
                                      className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg border font-mono-tabular text-xs focus:outline-none"
                                      style={{
                                        backgroundColor: 'var(--zp-bg-input)',
                                        borderColor: 'var(--zp-border)',
                                        color: 'var(--zp-accent)',
                                      }}
                                    />
                                  )}

                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateActiveRequest({
                                        assertions: activeRequest.assertions.filter(
                                          (a) => a.id !== rule.id
                                        ),
                                      })
                                    }
                                    className="p-1 hover:text-rose-500"
                                    style={{ color: 'var(--zp-text-muted)' }}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {reqSubTab === 'code' && (
                          <div className="flex-1 flex flex-col min-h-0">
                            <div
                              className="flex items-center justify-between px-4 py-1.5 border-b text-xs shrink-0"
                              style={{ borderColor: 'var(--zp-border-subtle)' }}
                            >
                              <div
                                className="inline-flex items-center gap-1 p-1 rounded-lg border"
                                style={{
                                  backgroundColor: 'var(--zp-bg-surface)',
                                  borderColor: 'var(--zp-border)',
                                }}
                              >
                                {(
                                  [
                                    { id: 'curl', label: 'cURL' },
                                    { id: 'fetch', label: 'JavaScript (fetch)' },
                                    { id: 'axios', label: 'Node.js (axios)' },
                                    { id: 'python', label: 'Python (requests)' },
                                    { id: 'go', label: 'Go (net/http)' },
                                    { id: 'rust', label: 'Rust (reqwest)' },
                                  ] as const
                                ).map((l) => (
                                  <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => setCodeLang(l.id)}
                                    className="px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0"
                                    style={{
                                      backgroundColor:
                                        codeLang === l.id ? 'var(--zp-accent)' : 'transparent',
                                      color:
                                        codeLang === l.id
                                          ? 'var(--zp-accent-fg)'
                                          : 'var(--zp-text-secondary)',
                                    }}
                                  >
                                    {l.label}
                                  </button>
                                ))}
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  const code = generateCodeSnippet(
                                    activeRequest,
                                    activeEnv,
                                    codeLang
                                  );
                                  navigator.clipboard.writeText(code);
                                  setCopiedCode(true);
                                  setTimeout(() => setCopiedCode(false), 1800);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs whitespace-nowrap shrink-0"
                                style={{
                                  borderColor: 'var(--zp-border)',
                                  color: 'var(--zp-text-secondary)',
                                }}
                              >
                                {copiedCode ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                                <span>{copiedCode ? '已复制代码' : '复制代码片段'}</span>
                              </button>
                            </div>

                            <pre
                              className="flex-1 overflow-auto p-4 font-mono-tabular text-xs leading-relaxed zp-surface-transition"
                              style={{
                                backgroundColor: 'var(--zp-code-bg)',
                                color: 'var(--zp-text-primary)',
                              }}
                            >
                              {generateCodeSnippet(activeRequest, activeEnv, codeLang)}
                            </pre>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>

                {/* BOTTOM PANE: Response Inspector */}
                <div className="row-span-6 flex flex-col min-h-0">
                  <ResponseViewer
                    response={activeResponse}
                    loading={loadingReqId === activeRequest.id}
                    onQuickSaveEnvVar={handleQuickSaveEnvVar}
                  />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ====================================================================
          UNIFIED SETTINGS CENTER & WORKSPACE MODALS
         ==================================================================== */}
      <SettingsCenterModal
        isOpen={isSettingsOpen}
        initialTab={settingsInitialTab}
        onClose={() => setIsSettingsOpen(false)}
        themes={AI_THEMES}
        activeThemeId={activeThemeId}
        onSelectTheme={setActiveThemeId}
        engineMode={engineMode}
        onChangeEngineMode={setEngineMode}
        fontSizeScale={fontSizeScale}
        onChangeFontSizeScale={setFontSizeScale}
        customStoragePath={customStoragePath}
        onChangeCustomStoragePath={setCustomStoragePath}
        folders={folders}
        requests={requests}
        environments={environments}
        history={history}
      />

      <EnvironmentModal
        isOpen={isEnvModalOpen}
        onClose={() => setIsEnvModalOpen(false)}
        environments={environments}
        activeEnvId={activeEnvId}
        onSelectEnv={setActiveEnvId}
        onUpdateEnvironments={setEnvironments}
      />

      <ImportExportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        folders={folders}
        requests={requests}
        environments={environments}
        onImportCurlRequest={(req) => {
          setRequests((prev) => [...prev, req]);
          setOpenTabIds((prev) => [...prev, req.id]);
          setActiveRequestId(req.id);
        }}
        onImportWorkspaceData={(newFolders, newRequests, newEnvs) => {
          setFolders(newFolders);
          setRequests(newRequests);
          if (newEnvs && newEnvs.length > 0) {
            setEnvironments(newEnvs);
          }
          if (newRequests.length > 0) {
            setOpenTabIds(newRequests.slice(0, 3).map((r) => r.id));
            setActiveRequestId(newRequests[0].id);
          }
        }}
      />

      <CollectionRunnerModal
        isOpen={isRunnerModalOpen}
        onClose={() => setIsRunnerModalOpen(false)}
        folders={folders}
        requests={requests}
        activeEnv={activeEnv}
        engine={engineMode}
      />
    </div>
  );
}
