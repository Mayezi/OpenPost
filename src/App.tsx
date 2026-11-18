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
  Wand2,
  X,
  Settings,
  Sun,
  Moon,
  ChevronRight,
  Play,
  FolderSync,
  Globe,
  ListFilter,
  KeyRound,
  FileSpreadsheet,
  Braces,
  CheckCircle2,
  Minus,
  Maximize2,
  Minimize2,
  ChevronDown,
  Save,
  Pencil,
  Clock,
  Network,
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
  ProxyConfig,
} from './types/api';
import {
  AI_THEMES,
  INITIAL_ENVIRONMENTS,
  INITIAL_FOLDERS,
  INITIAL_REQUESTS,
  METHOD_COLORS,
} from './data/themesAndDefaults';
import {
  executeApiRequest,
  generateCodeSnippet,
} from './utils/requestEngine';
import { KeyValueTable } from './components/KeyValueTable';
import { ResponseViewer } from './components/ResponseViewer';
import { CustomSelect } from './components/CustomSelect';
import { AuthPanel } from './components/AuthPanel';
import { SegmentedControl, UiCheckbox } from './components/UiControls';
import {
  EnvironmentModal,
  ImportExportModal,
  SettingsCenterModal,
  SettingsTabId,
} from './components/Modals';

const STORAGE_KEYS = {
  THEME: 'openpost_theme_id_v4',
  FONT_SCALE: 'openpost_font_scale_v4',
  FOLDERS: 'openpost_folders_v4',
  REQUESTS: 'openpost_requests_v4',
  ENVIRONMENTS: 'openpost_environments_v4',
  ACTIVE_ENV: 'openpost_active_env_v4',
  HISTORY: 'openpost_history_v4',
  CUSTOM_DIR: 'openpost_custom_dir_v4',
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
  'COPY',
  'HEAD',
  'OPTIONS',
  'LINK',
  'UNLINK',
  'PURGE',
  'LOCK',
  'UNLOCK',
  'PROPFIND',
  'VIEW',
];

function shortMethodLabel(method: HttpMethod): string {
  switch (method) {
    case 'DELETE':
      return 'DEL';
    case 'OPTIONS':
      return 'OPT';
    case 'PROPFIND':
      return 'PROP';
    case 'UNLOCK':
      return 'UNLK';
    case 'UNLINK':
      return 'UNLN';
    default:
      return method;
  }
}

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
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    if (saved === 'classic-dark' || saved === 'classic-light') return saved;
    if (saved && (saved.includes('dark') || ['claude-code', 'deepseek', 'openai-codex', 'cursor-midnight'].includes(saved))) {
      return 'classic-dark';
    }
    return 'classic-light';
  });

  const [fontSizeScale, setFontSizeScale] = useState<FontSizeScale>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.FONT_SCALE) as FontSizeScale | null;
    return saved && FONT_SCALE_PRESETS[saved] ? saved : 'default';
  });

  const [customStoragePath, setCustomStoragePath] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.CUSTOM_DIR) || 'D:\\OpenPost_Data\\Vault';
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
  const [savedRequestNotice, setSavedRequestNotice] = useState<string | null>(null);

  // Unified Environment Popover, Icon-only Theme Popover & Window State
  const [envPopoverOpen, setEnvPopoverOpen] = useState(false);
  const [quickNewEnvName, setQuickNewEnvName] = useState('');
  const envPopoverRef = useRef<HTMLDivElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Responses Map per Request ID
  const [responsesById, setResponsesById] = useState<Record<string, ApiResponseData>>({});
  const [loadingReqId, setLoadingReqId] = useState<string | null>(null);

  // Modals & Response Layout State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabId>('general');
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [responseExpanded, setResponseExpanded] = useState(false);
  const [proxySummary, setProxySummary] = useState<ProxyConfig | null>(() => {
    try {
      const saved = localStorage.getItem('openpost_proxy_config');
      return saved ? (JSON.parse(saved) as ProxyConfig) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!isSettingsOpen) {
      try {
        const saved = localStorage.getItem('openpost_proxy_config');
        setProxySummary(saved ? (JSON.parse(saved) as ProxyConfig) : null);
      } catch {
        setProxySummary(null);
      }
    }
  }, [isSettingsOpen]);

  const openSettingsAt = (tab: SettingsTabId) => {
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  };

  // Close env popover on outside click
  useEffect(() => {
    if (!envPopoverOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (envPopoverRef.current && !envPopoverRef.current.contains(e.target as Node)) {
        setEnvPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [envPopoverOpen]);

  const handleQuickCreateEnvInline = () => {
    const name = quickNewEnvName.trim() || `新环境 ${environments.length + 1}`;
    const created: EnvironmentProfile = {
      id: `env_${Date.now()}`,
      name,
      variables: [
        {
          id: `v_${Date.now()}`,
          key: 'baseUrl',
          value: 'http://127.0.0.1:8080',
          description: '接口基础地址',
          enabled: true,
        },
      ],
    };
    setEnvironments((prev) => [...prev, created]);
    setActiveEnvId(created.id);
    setQuickNewEnvName('');
  };

  // Hydrate workspace from real local disk files (`GET /api/storage/workspace`) on startup
  useEffect(() => {
    fetch('/api/storage/workspace')
      .then((r) => r.json())
      .then((data) => {
        if (!data || !data.ok) return;
        if (data.storageDir) {
          setCustomStoragePath(data.storageDir);
        }
        if (Array.isArray(data.folders) && data.folders.length > 0) {
          const hasLegacyMock = data.folders.some(
            (f: CollectionFolder) => f.id === 'folder_local_sandbox'
          );
          if (!hasLegacyMock) {
            setFolders(data.folders);
          }
        }
        if (Array.isArray(data.requests) && data.requests.length > 0) {
          const hasLegacyMock = data.requests.some((reqItem: ApiRequestItem) =>
            reqItem.url?.includes('/api/mock')
          );
          if (!hasLegacyMock) {
            setRequests(data.requests);
            setOpenTabIds(data.requests.slice(0, 3).map((r: ApiRequestItem) => r.id));
            setActiveRequestId(data.requests[0].id);
          }
        }
        if (Array.isArray(data.environments) && data.environments.length > 0) {
          const hasLegacyMock = data.environments.some((envItem: EnvironmentProfile) =>
            envItem.variables?.some((v) => v.value?.includes('/api/mock'))
          );
          if (!hasLegacyMock) {
            setEnvironments(data.environments);
          }
        }
        if (Array.isArray(data.history)) {
          setHistory(data.history);
        }
      })
      .catch(() => {});
  }, []);

  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  const sendDesktopWindowCmd = (cmd: 'drag' | 'minimize' | 'maximize' | 'close') => {
    const win = window as unknown as { ipc?: { postMessage: (msg: string) => void } };
    if (cmd === 'maximize') {
      setIsWindowMaximized((prev) => !prev);
    }
    if (win.ipc?.postMessage) {
      win.ipc.postMessage(cmd);
    } else {
      fetch(`/api/window/${cmd}`, { method: 'POST' }).catch(() => {});
      if (cmd === 'maximize') {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      }
    }
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

  const activeRequest = useMemo(() => {
    if (!activeRequestId || !openTabIds.includes(activeRequestId)) return null;
    return requests.find((r) => r.id === activeRequestId) || null;
  }, [requests, activeRequestId, openTabIds]);

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
    if (openTabIds.length <= 1) return;
    const closedIdx = openTabIds.indexOf(reqId);
    const nextTabs = openTabIds.filter((id) => id !== reqId);
    setOpenTabIds(nextTabs);
    if (activeRequestId === reqId) {
      const fallbackIdx = Math.min(Math.max(0, closedIdx - 1), nextTabs.length - 1);
      setActiveRequestId(nextTabs[fallbackIdx]);
    }
  };

  const handleCloseOtherTabs = () => {
    if (!activeRequest) return;
    setOpenTabIds([activeRequest.id]);
    setActiveRequestId(activeRequest.id);
  };

  const handleCreateNewRequest = (targetFolderId?: string) => {
    const fId =
      targetFolderId || activeRequest?.folderId || folders[0]?.id || 'folder_http_inspector';
    const newReq: ApiRequestItem = {
      id: `req_${Date.now()}`,
      name: `新建接口 ${requests.length + 1}`,
      folderId: fId,
      method: 'GET',
      url: '{{httpbinUrl}}/get',
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
    const nextReqs = requests.filter((r) => r.id !== reqId);
    setRequests(nextReqs);
    const nextTabs = openTabIds.filter((id) => id !== reqId);
    setOpenTabIds(nextTabs);
    if (activeRequestId === reqId) {
      setActiveRequestId(nextTabs[nextTabs.length - 1] || '');
    }
  };

  const handleCreateFolder = () => {
    const newId = `folder_${Date.now()}`;
    const defaultName = `0${folders.length + 1}. 新建接口分组`;
    const newFolder: CollectionFolder = {
      id: newId,
      name: defaultName,
      expanded: true,
    };
    setFolders((prev) => [...prev, newFolder]);
    setEditingFolderId(newId);
    setEditingFolderName(defaultName);
  };

  // Folder & Request Inline Editing + Delete + Drag-and-Drop Reordering
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState<string>('');
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);

  const [editingSidebarReqId, setEditingSidebarReqId] = useState<string | null>(null);
  const [editingSidebarReqName, setEditingSidebarReqName] = useState<string>('');

  const [dragState, setDragState] = useState<{
    type: 'folder' | 'request';
    id: string;
    sourceFolderId?: string;
  } | null>(null);

  const [dropIndicator, setDropIndicator] = useState<{
    targetType: 'folder' | 'request';
    targetId: string;
    position: 'before' | 'after' | 'inside';
  } | null>(null);

  const handleStartRenameFolder = (folder: CollectionFolder, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setConfirmDeleteFolderId(null);
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
  };

  const handleCommitRenameFolder = (folderId: string) => {
    const trimmed = editingFolderName.trim();
    if (trimmed) {
      setFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f))
      );
    }
    setEditingFolderId(null);
    setEditingFolderName('');
  };

  const handleDeleteFolder = (folderId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const removedReqIds = new Set(
      requests.filter((r) => r.folderId === folderId).map((r) => r.id)
    );
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setRequests((prev) => prev.filter((r) => r.folderId !== folderId));
    setOpenTabIds((prev) => {
      const nextTabs = prev.filter((id) => !removedReqIds.has(id));
      if (removedReqIds.has(activeRequestId)) {
        setActiveRequestId(nextTabs[nextTabs.length - 1] || '');
      }
      return nextTabs;
    });
    setConfirmDeleteFolderId(null);
  };

  const handleStartRenameSidebarReq = (req: ApiRequestItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingSidebarReqId(req.id);
    setEditingSidebarReqName(req.name);
  };

  const handleCommitRenameSidebarReq = (reqId: string) => {
    const trimmed = editingSidebarReqName.trim();
    if (trimmed) {
      setRequests((prev) =>
        prev.map((r) => (r.id === reqId ? { ...r, name: trimmed } : r))
      );
    }
    setEditingSidebarReqId(null);
    setEditingSidebarReqName('');
  };

  const handleClearDrag = () => {
    setDragState(null);
    setDropIndicator(null);
  };

  const handleFolderDropAction = (
    targetFolderId: string,
    position: 'before' | 'after' | 'inside'
  ) => {
    if (!dragState) return;
    if (dragState.type === 'folder') {
      if (dragState.id === targetFolderId) {
        handleClearDrag();
        return;
      }
      setFolders((prev) => {
        const fromIdx = prev.findIndex((f) => f.id === dragState.id);
        const toIdx = prev.findIndex((f) => f.id === targetFolderId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        const updatedTargetIdx = next.findIndex((f) => f.id === targetFolderId);
        const insertAt = position === 'after' ? updatedTargetIdx + 1 : updatedTargetIdx;
        next.splice(insertAt, 0, moved);
        return next;
      });
    } else if (dragState.type === 'request') {
      // Moving request into targetFolderId
      setRequests((prev) => {
        const fromIdx = prev.findIndex((r) => r.id === dragState.id);
        if (fromIdx === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        const updatedMoved: ApiRequestItem = { ...moved, folderId: targetFolderId };
        // Place at end of requests belonging to targetFolderId
        let lastInFolderIdx = -1;
        next.forEach((r, idx) => {
          if (r.folderId === targetFolderId) lastInFolderIdx = idx;
        });
        if (lastInFolderIdx === -1) {
          next.push(updatedMoved);
        } else {
          next.splice(lastInFolderIdx + 1, 0, updatedMoved);
        }
        return next;
      });
      // Expand target folder automatically
      setFolders((prev) =>
        prev.map((f) => (f.id === targetFolderId ? { ...f, expanded: true } : f))
      );
    }
    handleClearDrag();
  };

  const handleRequestDropAction = (
    targetReq: ApiRequestItem,
    position: 'before' | 'after'
  ) => {
    if (!dragState || dragState.type !== 'request') {
      handleClearDrag();
      return;
    }
    if (dragState.id === targetReq.id) {
      handleClearDrag();
      return;
    }
    setRequests((prev) => {
      const fromIdx = prev.findIndex((r) => r.id === dragState.id);
      if (fromIdx === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      const updatedMoved: ApiRequestItem = { ...moved, folderId: targetReq.folderId };
      const targetIdx = next.findIndex((r) => r.id === targetReq.id);
      if (targetIdx === -1) {
        next.push(updatedMoved);
        return next;
      }
      const insertAt = position === 'after' ? targetIdx + 1 : targetIdx;
      next.splice(insertAt, 0, updatedMoved);
      return next;
    });
    handleClearDrag();
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

  // Quick toggle between Classic Light and Classic Dark themes
  const handleToggleLightDark = () => {
    setActiveThemeId(currentTheme.mode === 'dark' ? 'classic-light' : 'classic-dark');
  };

  // ==========================================================================
  // 4. SEND HTTP REQUEST HANDLER + KEYBOARD SHORTCUT (CTRL/CMD + ENTER)
  // ==========================================================================
  const handleSendRequest = useCallback(
    async (overrideReq?: ApiRequestItem) => {
      const targetReq = overrideReq || activeRequest;
      if (!targetReq || loadingReqId) return;
      setLoadingReqId(targetReq.id);

      const res = await executeApiRequest(targetReq, activeEnv, engineMode, folders);
      setResponsesById((prev) => ({ ...prev, [targetReq.id]: res }));

      if (res.extractedVars.length > 0) {
        res.extractedVars.forEach(({ key, value }) => {
          handleQuickSaveEnvVar(key, value);
        });
      }

      const maxHist = Number(localStorage.getItem('openpost_max_history')) || 100;
      const entry: HistoryEntry = {
        id: `hist_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
        request: JSON.parse(JSON.stringify(targetReq)),
        status: res.status,
        durationMs: res.timing.totalMs,
        sizeBytes: res.sizeBytes,
      };
      setHistory((prev) => [entry, ...prev.slice(0, Math.max(1, maxHist - 1))]);
      setLoadingReqId(null);
    },
    [activeRequest, activeEnv, engineMode, loadingReqId, handleQuickSaveEnvVar]
  );

  const handleSaveRequest = useCallback(async () => {
    try {
      localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
      localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(requests));
      localStorage.setItem(STORAGE_KEYS.ENVIRONMENTS, JSON.stringify(environments));
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history.slice(0, 100)));
      await fetch('/api/storage/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folders, requests, environments, history }),
      });
    } catch {
      // LocalStorage is already updated
    }
    const timeStr = new Date().toLocaleTimeString();
    setSavedRequestNotice(`已保存 (${timeStr})`);
    setTimeout(() => {
      setSavedRequestNotice(null);
    }, 2200);
  }, [folders, requests, environments, history]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSendRequest();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveRequest();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSendRequest, handleSaveRequest]);

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
        hasDot: activeRequest.auth.type !== 'none',
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
        hasDot: activeRequest.body.type !== 'none',
      },
      {
        id: 'tests' as const,
        label: '断言与提取',
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
        hasDot: activeRequest.assertions.some((a) => a.enabled),
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
        onMouseDown={(e) => {
          if (e.button === 0 && e.target === e.currentTarget) {
            sendDesktopWindowCmd('drag');
          }
        }}
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget) {
            sendDesktopWindowCmd('maximize');
          }
        }}
        className="h-9 flex items-center justify-between pl-3 pr-0 border-b shrink-0 zp-surface-transition"
        style={{
          backgroundColor: 'var(--zp-bg-surface)',
          borderColor: 'var(--zp-border-subtle)',
        }}
      >
        {/* LEFT ZONE: Brand + Left-Aligned Action Buttons */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="flex items-center gap-2 px-1.5 py-1 rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title="点击展开/收起侧边栏"
          >
            <img
              src="/icons/openpost_icon_pack/png/transparent/openpost-64-transparent.png"
              alt="OpenPost"
              className="w-5 h-5 object-contain shrink-0"
            />
            <span className="text-sm font-bold tracking-tight font-display whitespace-nowrap shrink-0">
              OpenPost
            </span>
          </button>

          {/* Clean Import / Backup Action Button */}
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-7 px-2 rounded-[6px] text-xs font-medium zp-surface-transition hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
            style={{ color: 'var(--zp-text-secondary)' }}
          >
            <FolderSync className="w-3.5 h-3.5" style={{ color: 'var(--zp-accent)' }} />
            <span>导入 / 备份</span>
          </button>
        </div>

        {/* DRAGGABLE FRAMELESS TITLEBAR REGION (DBX-style) */}
        <div
          className="flex-1 h-full min-w-[32px]"
          onMouseDown={(e) => {
            if (e.button === 0) {
              sendDesktopWindowCmd('drag');
            }
          }}
          onDoubleClick={() => sendDesktopWindowCmd('maximize')}
        />

        {/* RIGHT ZONE: Icon-Only Theme, Proxy & Settings + Frameless Native Window Controls */}
        <div className="flex items-center h-full shrink-0">
          <div className="flex items-center gap-1 pr-2">

            {/* ONE-CLICK LIGHT / DARK THEME TOGGLE */}
            <button
              type="button"
              onClick={handleToggleLightDark}
              className="w-7 h-7 rounded-[6px] inline-flex items-center justify-center zp-surface-transition hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: 'var(--zp-text-secondary)' }}
              title={`切换浅色 / 深色主题（当前：${currentTheme.name}）`}
            >
              {currentTheme.mode === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
            </button>

            {/* QUICK PROXY SETTINGS BUTTON */}
            <button
              type="button"
              onClick={() => openSettingsAt('network')}
              className="relative w-7 h-7 rounded-[6px] inline-flex items-center justify-center zp-surface-transition hover:bg-black/5 dark:hover:bg-white/5"
              style={{
                color:
                  proxySummary && proxySummary.mode !== 'none'
                    ? 'var(--zp-accent)'
                    : 'var(--zp-text-secondary)',
              }}
              title={
                proxySummary?.mode === 'custom'
                  ? `网络代理已启用: ${proxySummary.protocol.toUpperCase()}://${proxySummary.host}:${proxySummary.port} (点击修改)`
                  : proxySummary?.mode === 'system'
                  ? '网络代理已启用: 跟随系统代理 (点击修改)'
                  : '配置网络代理 (HTTP / HTTPS / SOCKS5)'
              }
            >
              <Network className="w-3.5 h-3.5" />
              {proxySummary && proxySummary.mode !== 'none' && (
                <span
                  className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: '#10B981' }}
                />
              )}
            </button>

            {/* ICON-ONLY SETTINGS BUTTON */}
            <button
              type="button"
              onClick={() => openSettingsAt('general')}
              className="w-7 h-7 rounded-[6px] inline-flex items-center justify-center zp-surface-transition hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: 'var(--zp-text-secondary)' }}
              title="偏好设置"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* FRAMELESS WINDOW CONTROLS (MINIMIZE / MAXIMIZE-RESTORE / CLOSE) */}
          <div className="flex items-center h-full">
            <button
              type="button"
              onClick={() => sendDesktopWindowCmd('minimize')}
              className="h-full w-11 inline-flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: 'var(--zp-text-secondary)' }}
              title="最小化窗口"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => sendDesktopWindowCmd('maximize')}
              className="h-full w-11 inline-flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: 'var(--zp-text-secondary)' }}
              title={isWindowMaximized ? '向下还原窗口' : '最大化窗口'}
            >
              {isWindowMaximized ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => sendDesktopWindowCmd('close')}
              className="h-full w-11 inline-flex items-center justify-center transition-colors hover:bg-[#E81123] hover:text-white"
              style={{ color: 'var(--zp-text-secondary)' }}
              title="关闭 OpenPost"
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
                borderColor: 'var(--zp-border-subtle)',
              }}
            >
              {/* Sidebar Mode Switcher: Flat Underline Tabs Aligned with Right Tab Bar (h-10) */}
              <div
                className="grid grid-cols-2 h-10 px-2 border-b text-xs shrink-0"
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
                      className="relative inline-flex items-center justify-center gap-1.5 h-full font-medium transition-colors whitespace-nowrap shrink-0 hover:opacity-90"
                      style={{
                        color: active ? 'var(--zp-text-primary)' : 'var(--zp-text-secondary)',
                      }}
                    >
                      <span
                        className="shrink-0"
                        style={{ color: active ? 'var(--zp-accent)' : 'currentColor' }}
                      >
                        {tab.icon}
                      </span>
                      <span>{tab.label}</span>
                      {active && (
                        <motion.span
                          layoutId="sidebar-mode-underline"
                          transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                          className="absolute bottom-0 left-2 right-2 h-[2px]"
                          style={{ backgroundColor: 'var(--zp-accent)' }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Search & Compact Folder Creation Row (Borderless Separation) */}
              <div className="px-2.5 pt-2.5 pb-1.5 flex items-center gap-1.5">
                <div
                  className="flex-1 flex items-center gap-2 h-8 px-2.5 rounded-[6px] border text-xs zp-surface-transition min-w-0 focus-within:border-[var(--zp-accent)]"
                  style={{
                    backgroundColor: 'var(--zp-bg-input)',
                    borderColor: 'var(--zp-border-subtle)',
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
                  <button
                    type="button"
                    onClick={handleCreateFolder}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-[6px] zp-surface-transition hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
                    style={{ color: 'var(--zp-text-secondary)' }}
                    title="新建目录"
                  >
                    <FolderPlus className="w-4 h-4" style={{ color: 'var(--zp-accent)' }} />
                  </button>
                )}
              </div>

              {/* Tree or History List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {sidebarMode === 'collections' ? (
                  folders.length === 0 ? (
                    <div
                      className="p-4 text-center text-xs rounded-[8px] border border-dashed"
                      style={{
                        borderColor: 'var(--zp-border)',
                        color: 'var(--zp-text-muted)',
                      }}
                    >
                      <p className="mb-2">当前暂无接口集合目录</p>
                      <button
                        type="button"
                        onClick={handleCreateFolder}
                        className="h-7 px-2.5 rounded-[6px] border text-xs font-medium hover:opacity-90"
                        style={{
                          borderColor: 'var(--zp-border)',
                          backgroundColor: 'var(--zp-accent-soft)',
                          color: 'var(--zp-accent)',
                        }}
                      >
                        + 新建首个集合目录
                      </button>
                    </div>
                  ) : (
                    folders.map((folder) => {
                      const folderReqs = filteredRequests.filter((r) => r.folderId === folder.id);
                      const isExpanded = folder.expanded !== false;
                      const isEditingFolder = editingFolderId === folder.id;
                      const isConfirmingDelete = confirmDeleteFolderId === folder.id;
                      const isFolderDropTarget =
                        dropIndicator?.targetType === 'folder' &&
                        dropIndicator.targetId === folder.id;

                      return (
                        <div
                          key={folder.id}
                          className="space-y-0.5 relative"
                          onDragOver={(e) => {
                            if (!dragState) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            const relY = e.clientY - rect.top;
                            if (dragState.type === 'request') {
                              setDropIndicator({
                                targetType: 'folder',
                                targetId: folder.id,
                                position: 'inside',
                              });
                            } else {
                              setDropIndicator({
                                targetType: 'folder',
                                targetId: folder.id,
                                position: relY < 16 ? 'before' : 'after',
                              });
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleFolderDropAction(
                              folder.id,
                              dropIndicator?.position || 'after'
                            );
                          }}
                        >
                          {isFolderDropTarget && dropIndicator?.position === 'before' && (
                            <div
                              className="h-0.5 rounded-full mx-1 pointer-events-none"
                              style={{ backgroundColor: 'var(--zp-accent)' }}
                            />
                          )}

                          <div
                            draggable={!isEditingFolder}
                            onDragStart={(e) => {
                              e.stopPropagation();
                              setDragState({ type: 'folder', id: folder.id });
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={handleClearDrag}
                            className="relative flex items-center h-8 px-2 rounded-[6px] cursor-pointer text-xs font-semibold group transition-colors hover:bg-[var(--zp-bg-elevated)]"
                            style={{
                              color: 'var(--zp-text-secondary)',
                              boxShadow:
                                isFolderDropTarget && dropIndicator?.position === 'inside'
                                  ? 'inset 0 0 0 1px var(--zp-accent)'
                                  : undefined,
                              backgroundColor:
                                isFolderDropTarget && dropIndicator?.position === 'inside'
                                  ? 'var(--zp-accent-soft)'
                                  : undefined,
                            }}
                            onClick={() => {
                              if (isEditingFolder) return;
                              setFolders((prev) =>
                                prev.map((f) =>
                                  f.id === folder.id ? { ...f, expanded: !isExpanded } : f
                                )
                              );
                            }}
                            onDoubleClick={(e) => handleStartRenameFolder(folder, e)}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-6">
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

                              {isEditingFolder ? (
                                <input
                                  type="text"
                                  value={editingFolderName}
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setEditingFolderName(e.target.value)}
                                  onBlur={() => handleCommitRenameFolder(folder.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleCommitRenameFolder(folder.id);
                                    } else if (e.key === 'Escape') {
                                      setEditingFolderId(null);
                                      setEditingFolderName('');
                                    }
                                  }}
                                  className="w-full h-6 px-1.5 rounded-[4px] border text-xs font-medium outline-none"
                                  style={{
                                    backgroundColor: 'var(--zp-bg-canvas)',
                                    borderColor: 'var(--zp-accent)',
                                    color: 'var(--zp-text-primary)',
                                  }}
                                />
                              ) : (
                                <span
                                  className="truncate select-none"
                                  title="双击重命名集合，按住可拖动排序"
                                >
                                  {folder.name}
                                </span>
                              )}
                            </div>

                            {!isEditingFolder && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCreateNewRequest(folder.id);
                                  }}
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-[4px] opacity-55 group-hover:opacity-0 group-hover:pointer-events-none transition-opacity"
                                  title="在此集合下新建接口"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>

                                <div
                                  className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pl-1.5 rounded-[4px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity"
                                  style={{ backgroundColor: 'var(--zp-bg-elevated)' }}
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCreateNewRequest(folder.id);
                                    }}
                                    className="w-6 h-6 inline-flex items-center justify-center rounded-[4px] opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
                                    title="在此集合下新建接口"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => handleStartRenameFolder(folder, e)}
                                    className="w-6 h-6 inline-flex items-center justify-center rounded-[4px] opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
                                    title="重命名此集合"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmDeleteFolderId(
                                        isConfirmingDelete ? null : folder.id
                                      );
                                    }}
                                    className="w-6 h-6 inline-flex items-center justify-center rounded-[4px] opacity-75 hover:opacity-100 hover:text-rose-500 hover:bg-black/5 dark:hover:bg-white/5"
                                    title="删除此集合"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          {isConfirmingDelete && (
                            <div
                              className="mx-2 my-1 p-2 rounded-[8px] border text-[11px] flex items-center justify-between gap-2"
                              style={{
                                backgroundColor: 'var(--zp-bg-elevated)',
                                borderColor: 'var(--zp-border)',
                                color: 'var(--zp-text-primary)',
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="truncate">
                                确认删除「{folder.name}」及下属 {folderReqs.length} 个接口？
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteFolder(folder.id, e)}
                                  className="h-6 px-2 rounded-[6px] bg-rose-500 text-white font-semibold hover:bg-rose-600"
                                >
                                  删除
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteFolderId(null)}
                                  className="h-6 px-2 rounded-[6px] border hover:opacity-80"
                                  style={{ borderColor: 'var(--zp-border)' }}
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          )}

                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                className="relative overflow-hidden pl-[35px] space-y-0.5 pt-0.5"
                              >
                                {folderReqs.length === 0 ? (
                                  <div className="relative flex items-center h-7">
                                    <span
                                      aria-hidden="true"
                                      className="pointer-events-none absolute left-0 top-0 h-3.5 w-2.5 border-l border-b border-dashed"
                                      style={{
                                        borderColor: 'var(--zp-border)',
                                        opacity: 0.5,
                                      }}
                                    />
                                    <p
                                      className="ml-2.5 px-2 text-xs italic"
                                      style={{ color: 'var(--zp-text-muted)' }}
                                    >
                                      暂无接口（可拖入）
                                    </p>
                                  </div>
                                ) : (
                                  folderReqs.map((req, reqIdx) => {
                                    const isSelected = req.id === activeRequest?.id;
                                    const isLastReq = reqIdx === folderReqs.length - 1;
                                    const mStyle = METHOD_COLORS[req.method] || METHOD_COLORS.GET;
                                    const isEditingReq = editingSidebarReqId === req.id;
                                    const isReqDropTarget =
                                      dropIndicator?.targetType === 'request' &&
                                      dropIndicator.targetId === req.id;

                                    return (
                                      <div
                                        key={req.id}
                                        className="relative"
                                        onDragOver={(e) => {
                                          if (!dragState || dragState.type !== 'request') return;
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          const relY = e.clientY - rect.top;
                                          setDropIndicator({
                                            targetType: 'request',
                                            targetId: req.id,
                                            position: relY < rect.height / 2 ? 'before' : 'after',
                                          });
                                        }}
                                        onDrop={(e) => {
                                          if (!dragState || dragState.type !== 'request') return;
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleRequestDropAction(
                                            req,
                                            dropIndicator?.position === 'after'
                                              ? 'after'
                                              : 'before'
                                          );
                                        }}
                                      >
                                        {/* Dashed Vertical Trunk Aligned to Folder Icon Center */}
                                        <span
                                          aria-hidden="true"
                                          className={`pointer-events-none absolute left-0 border-l border-dashed ${
                                            isLastReq ? 'top-0 h-4' : '-top-0.5 -bottom-0.5'
                                          }`}
                                          style={{
                                            borderColor: 'var(--zp-border)',
                                            opacity: 0.5,
                                          }}
                                        />
                                        {/* Dashed Horizontal Branch Tick */}
                                        <span
                                          aria-hidden="true"
                                          className="pointer-events-none absolute left-0 top-4 w-2 border-t border-dashed transition-colors"
                                          style={{
                                            borderColor: isSelected
                                              ? 'var(--zp-accent)'
                                              : 'var(--zp-border)',
                                            opacity: isSelected ? 0.75 : 0.5,
                                          }}
                                        />

                                        {isReqDropTarget &&
                                          dropIndicator?.position === 'before' && (
                                            <div
                                              className="h-0.5 rounded-full ml-2.5 mr-1 pointer-events-none"
                                              style={{ backgroundColor: 'var(--zp-accent)' }}
                                            />
                                          )}

                                        <div
                                          draggable={!isEditingReq}
                                          onDragStart={(e) => {
                                            e.stopPropagation();
                                            setDragState({
                                              type: 'request',
                                              id: req.id,
                                              sourceFolderId: req.folderId,
                                            });
                                            e.dataTransfer.effectAllowed = 'move';
                                          }}
                                          onDragEnd={handleClearDrag}
                                          onClick={() => {
                                            if (!isEditingReq) {
                                              handleOpenRequestTab(req.id);
                                            }
                                          }}
                                          onDoubleClick={(e) =>
                                            handleStartRenameSidebarReq(req, e)
                                          }
                                          className="relative ml-2 flex items-center h-8 px-1.5 rounded-[6px] text-xs cursor-pointer group transition-colors hover:bg-[var(--zp-bg-elevated)]"
                                          style={{
                                            backgroundColor: isSelected
                                              ? 'var(--zp-bg-elevated)'
                                              : undefined,
                                            color: isSelected
                                              ? 'var(--zp-text-primary)'
                                              : 'var(--zp-text-secondary)',
                                          }}
                                        >
                                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                            <span
                                              className={`font-mono-tabular font-bold text-[11px] shrink-0 ${mStyle.text}`}
                                              title={req.method}
                                            >
                                              {shortMethodLabel(req.method)}
                                            </span>
                                            {isEditingReq ? (
                                              <input
                                                type="text"
                                                value={editingSidebarReqName}
                                                autoFocus
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) =>
                                                  setEditingSidebarReqName(e.target.value)
                                                }
                                                onBlur={() =>
                                                  handleCommitRenameSidebarReq(req.id)
                                                }
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleCommitRenameSidebarReq(req.id);
                                                  } else if (e.key === 'Escape') {
                                                    setEditingSidebarReqId(null);
                                                    setEditingSidebarReqName('');
                                                  }
                                                }}
                                                className="w-full h-6 px-1.5 rounded-[4px] border text-xs font-medium outline-none"
                                                style={{
                                                  backgroundColor: 'var(--zp-bg-canvas)',
                                                  borderColor: 'var(--zp-accent)',
                                                  color: 'var(--zp-text-primary)',
                                                }}
                                              />
                                            ) : (
                                              <span
                                                className="truncate font-medium select-none"
                                                title="双击重命名接口，按住可拖动排序或移至其他目录"
                                              >
                                                {req.name}
                                              </span>
                                            )}
                                          </div>
                                          {!isEditingReq && (
                                            <div
                                              className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pl-2 rounded-[4px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity"
                                              style={{ backgroundColor: 'var(--zp-bg-elevated)' }}
                                            >
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleOpenRequestTab(req.id);
                                                  handleSendRequest(req);
                                                }}
                                                className="w-6 h-6 inline-flex items-center justify-center rounded-[4px] hover:bg-black/5 dark:hover:bg-white/5"
                                                style={{ color: 'var(--zp-accent)' }}
                                                title="立即发送此请求"
                                              >
                                                <Play className="w-3 h-3" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(e) =>
                                                  handleStartRenameSidebarReq(req, e)
                                                }
                                                className="w-6 h-6 inline-flex items-center justify-center rounded-[4px] hover:bg-black/5 dark:hover:bg-white/5"
                                                title="重命名接口"
                                              >
                                                <Pencil className="w-3 h-3" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(e) => handleDuplicateRequest(req, e)}
                                                className="w-6 h-6 inline-flex items-center justify-center rounded-[4px] hover:bg-black/5 dark:hover:bg-white/5"
                                                title="克隆接口"
                                              >
                                                <Copy className="w-3 h-3" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(e) => handleDeleteRequest(req.id, e)}
                                                className="w-6 h-6 inline-flex items-center justify-center rounded-[4px] hover:bg-black/5 dark:hover:bg-white/5 hover:text-rose-500"
                                                title="删除接口"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                            </div>
                                          )}
                                        </div>

                                        {isReqDropTarget &&
                                          dropIndicator?.position === 'after' && (
                                            <div
                                              className="h-0.5 rounded-full mx-1 pointer-events-none"
                                              style={{ backgroundColor: 'var(--zp-accent)' }}
                                            />
                                          )}
                                      </div>
                                    );
                                  })
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {isFolderDropTarget && dropIndicator?.position === 'after' && (
                            <div
                              className="h-0.5 rounded-full mx-1 pointer-events-none"
                              style={{ backgroundColor: 'var(--zp-accent)' }}
                            />
                          )}
                        </div>
                      );
                    })
                  )
                ) : history.length === 0 ? (
                  <div
                    className="p-5 text-center text-xs rounded-[8px] border border-dashed my-2"
                    style={{
                      color: 'var(--zp-text-muted)',
                      borderColor: 'var(--zp-border)',
                    }}
                  >
                    <History className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    <p className="font-medium mb-1" style={{ color: 'var(--zp-text-secondary)' }}>
                      暂无本地请求记录
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      发送任意接口请求后，将在此实时记录状态码、耗时与报文快照。
                    </p>
                  </div>
                ) : (
                  (() => {
                    const q = searchQuery.trim().toLowerCase();
                    const filteredHistory = q
                      ? history.filter(
                          (h) =>
                            h.request.name.toLowerCase().includes(q) ||
                            h.request.url.toLowerCase().includes(q) ||
                            h.request.method.toLowerCase().includes(q) ||
                            String(h.status).includes(q)
                        )
                      : history;

                    return (
                      <div className="space-y-1.5">
                        <div
                          className="flex items-center justify-between px-2 py-1 border-b text-[11px]"
                          style={{
                            borderColor: 'var(--zp-border-subtle)',
                            color: 'var(--zp-text-muted)',
                          }}
                        >
                          <span>
                            共 {filteredHistory.length} 条记录
                            {q ? ` (已过滤)` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => setHistory([])}
                            className="inline-flex items-center gap-1 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>清空全部</span>
                          </button>
                        </div>

                        {filteredHistory.length === 0 ? (
                          <div
                            className="p-4 text-center text-xs"
                            style={{ color: 'var(--zp-text-muted)' }}
                          >
                            未找到匹配「{searchQuery}」的历史记录
                          </div>
                        ) : (
                          filteredHistory.map((h) => {
                            const mStyle = METHOD_COLORS[h.request.method] || METHOD_COLORS.GET;
                            const isSuccess = h.status >= 200 && h.status < 300;
                            const isRedirect = h.status >= 300 && h.status < 400;
                            const statusColor =
                              h.status === 0 || h.status >= 500
                                ? 'text-rose-500 bg-rose-500/10 border-rose-500/30'
                                : h.status >= 400
                                ? 'text-amber-500 bg-amber-500/10 border-amber-500/30'
                                : isRedirect
                                ? 'text-sky-500 bg-sky-500/10 border-sky-500/30'
                                : isSuccess
                                ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30'
                                : 'text-slate-400 bg-slate-500/10 border-slate-500/30';

                            const sizeLabel =
                              h.sizeBytes && h.sizeBytes > 0
                                ? h.sizeBytes >= 1024
                                  ? `${(h.sizeBytes / 1024).toFixed(1)} KB`
                                  : `${h.sizeBytes} B`
                                : '';

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
                                className="p-2.5 rounded-[8px] border text-xs cursor-pointer group zp-surface-transition hover:border-[var(--zp-accent)]"
                                style={{
                                  backgroundColor: 'var(--zp-bg-canvas)',
                                  borderColor: 'var(--zp-border-subtle)',
                                }}
                              >
                                {/* Row 1: Method + Request Name + Status Badge / Hover Actions */}
                                <div className="relative flex items-center justify-between gap-1.5 h-6 mb-1 min-w-0">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <span
                                      className={`font-mono-tabular font-bold text-[10px] px-1.5 py-0.5 rounded-[4px] shrink-0 ${mStyle.bg} ${mStyle.text}`}
                                    >
                                      {h.request.method}
                                    </span>
                                    <span
                                      className="font-medium truncate"
                                      style={{ color: 'var(--zp-text-primary)' }}
                                      title={h.request.name}
                                    >
                                      {h.request.name || '未命名请求'}
                                    </span>
                                  </div>

                                  <span
                                    className={`font-mono-tabular font-semibold text-[10px] px-1.5 py-0.5 rounded-[4px] border shrink-0 group-hover:opacity-0 transition-opacity ${statusColor}`}
                                  >
                                    {h.status > 0 ? h.status : 'ERR'}
                                  </span>

                                  <div
                                    className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pl-1.5 rounded-[4px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity"
                                    style={{ backgroundColor: 'var(--zp-bg-canvas)' }}
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const existing = requests.find(
                                          (r) => r.id === h.request.id
                                        );
                                        if (existing) {
                                          handleOpenRequestTab(existing.id);
                                          handleSendRequest(existing);
                                        } else {
                                          setRequests((prev) => [...prev, h.request]);
                                          handleOpenRequestTab(h.request.id);
                                          handleSendRequest(h.request);
                                        }
                                      }}
                                      className="w-6 h-6 inline-flex items-center justify-center rounded-[4px] hover:bg-black/5 dark:hover:bg-white/5"
                                      style={{ color: 'var(--zp-accent)' }}
                                      title="重新发送此请求"
                                    >
                                      <Play className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setHistory((prev) =>
                                          prev.filter((item) => item.id !== h.id)
                                        );
                                      }}
                                      className="w-6 h-6 inline-flex items-center justify-center rounded-[4px] hover:bg-black/5 dark:hover:bg-white/5 hover:text-rose-500"
                                      style={{ color: 'var(--zp-text-muted)' }}
                                      title="删除此条记录"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                {/* Row 2: Monospace URL */}
                                <p
                                  className="font-mono-tabular text-[11px] truncate mb-1.5"
                                  style={{ color: 'var(--zp-text-secondary)' }}
                                  title={h.request.url}
                                >
                                  {h.request.url}
                                </p>

                                {/* Row 3: Latency, Size & Timestamp */}
                                <div
                                  className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular pt-1 border-t"
                                  style={{
                                    borderColor: 'var(--zp-border-subtle)',
                                    color: 'var(--zp-text-muted)',
                                  }}
                                >
                                  <span className="inline-flex items-center gap-1 truncate">
                                    <Clock className="w-2.5 h-2.5 shrink-0" />
                                    <span>{h.durationMs} ms</span>
                                    {sizeLabel && (
                                      <>
                                        <span>·</span>
                                        <span>{sizeLabel}</span>
                                      </>
                                    )}
                                  </span>
                                  <span className="shrink-0">{h.timestamp}</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })()
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* RIGHT MAIN WORKSPACE */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* ==================================================================
              STANDALONE TOP TAB ROW (h-10 ALIGNED WITH SIDEBAR; ACTIVE TAB SEAMLESSLY MERGES INTO CANVAS)
             ================================================================== */}
          <div
            className="relative flex items-center justify-between h-10 shrink-0 select-none zp-surface-transition"
            style={{
              backgroundColor: 'var(--zp-bg-surface)',
            }}
          >
            {/* Bottom 1px hairline at z-0; active tab (z-10, bg-canvas) covers it cleanly */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px z-0"
              style={{ backgroundColor: 'var(--zp-border-subtle)' }}
            />

            <div className="relative z-10 flex items-stretch h-full overflow-x-auto min-w-0 flex-1">
              {openTabIds.map((tabId) => {
                const req = requests.find((r) => r.id === tabId);
                if (!req) return null;
                const isActive = req.id === activeRequest?.id;
                const mStyle = METHOD_COLORS[req.method] || METHOD_COLORS.GET;
                const shortMethod = shortMethodLabel(req.method);
                const canClose = openTabIds.length > 1;
                return (
                  <div
                    key={req.id}
                    onClick={() => setActiveRequestId(req.id)}
                    onMouseDown={(e) => {
                      if (e.button === 1 && canClose) {
                        e.preventDefault();
                        handleCloseTab(req.id);
                      }
                    }}
                    className={`relative flex items-center gap-2 px-3.5 h-full text-xs cursor-pointer transition-colors max-w-[210px] min-w-[116px] shrink-0 group border-r ${
                      isActive
                        ? 'z-10'
                        : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.03]'
                    }`}
                    style={{
                      backgroundColor: isActive ? 'var(--zp-bg-canvas)' : 'transparent',
                      borderRightColor: 'var(--zp-border-subtle)',
                      color: isActive ? 'var(--zp-text-primary)' : 'var(--zp-text-secondary)',
                    }}
                    title={`${req.method} · ${req.name}`}
                  >
                    {isActive && (
                      <span
                        className="absolute top-0 left-0 right-0 h-[2px]"
                        style={{ backgroundColor: 'var(--zp-accent)' }}
                      />
                    )}
                    <span
                      className={`text-[10px] font-bold tracking-tight shrink-0 ${mStyle.text}`}
                    >
                      {shortMethod}
                    </span>
                    <span
                      className={`truncate flex-1 ${isActive ? 'font-medium' : 'font-normal'}`}
                    >
                      {req.name}
                    </span>
                    {canClose && (
                      <button
                        type="button"
                        onClick={(e) => handleCloseTab(req.id, e)}
                        className={`p-0.5 rounded-[4px] hover:bg-black/10 dark:hover:bg-white/10 shrink-0 transition-opacity ${
                          isActive
                            ? 'opacity-65 hover:opacity-100'
                            : 'opacity-0 group-hover:opacity-80 hover:!opacity-100'
                        }`}
                        style={{ color: 'var(--zp-text-muted)' }}
                        title="关闭此标签页"
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
                className="w-9 h-full inline-flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
                style={{ color: 'var(--zp-text-secondary)' }}
                title="新建请求标签页"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Right Zone of Tab Row: Close Others + Environment Switcher */}
            <div className="relative z-10 flex items-center h-full shrink-0 pr-2 gap-1">
              {openTabIds.length > 1 && (
                <button
                  type="button"
                  onClick={handleCloseOtherTabs}
                  className="inline-flex items-center h-7 px-2 rounded-[6px] text-[11px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
                  style={{ color: 'var(--zp-text-muted)' }}
                  title="关闭除当前标签外的其他标签页"
                >
                  关闭其他
                </button>
              )}

              <div ref={envPopoverRef} className="relative">
                <button
                  type="button"
                  onClick={() => setEnvPopoverOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-xs font-medium zp-surface-transition hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
                  style={{ color: 'var(--zp-text-primary)' }}
                  title="切换运行环境、直接新建环境或配置环境变量"
                >
                  <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--zp-accent)' }} />
                  <span className="max-w-[130px] truncate">{activeEnv?.name || '选择环境'}</span>
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
                      className="absolute right-0 top-full mt-1.5 w-72 rounded-[12px] border p-2 z-50 zp-popover-shadow"
                      style={{
                        backgroundColor: 'var(--zp-bg-surface)',
                        borderColor: 'var(--zp-border)',
                        color: 'var(--zp-text-primary)',
                      }}
                    >
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
                          className="inline-flex items-center gap-1 h-6 px-2 rounded-[6px] text-[11px] font-medium transition-opacity hover:opacity-85"
                          style={{
                            backgroundColor: 'var(--zp-accent-soft)',
                            color: 'var(--zp-accent)',
                          }}
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          <span>编辑变量表</span>
                        </button>
                      </div>

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
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[6px] text-xs cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5 group"
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
                                    className="text-[10px] truncate"
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
                                  className="px-1.5 py-0.5 rounded-[4px] text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{
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
                          className="flex-1 min-w-0 h-8 px-2.5 rounded-[6px] border text-xs focus:outline-none focus:border-[var(--zp-accent)]"
                          style={{
                            backgroundColor: 'var(--zp-bg-input)',
                            borderColor: 'var(--zp-border)',
                            color: 'var(--zp-text-primary)',
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleQuickCreateEnvInline}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-[6px] text-xs font-semibold whitespace-nowrap shrink-0 transition-opacity hover:opacity-90"
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
            </div>
          </div>

          {activeRequest ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* ================================================================
                  STREAMLINED REQUEST CONTROL BLOCK (CLEAN, BORDER-MINIMAL POSTMAN FLOW)
                 ================================================================ */}
              <div
                className="px-4 pt-2.5 pb-2 space-y-2 shrink-0 zp-surface-transition"
                style={{
                  backgroundColor: 'var(--zp-bg-canvas)',
                }}
              >
                {/* Compact Top Row: Borderless Folder Breadcrumb + Request Title + Ghost Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1 flex-1 min-w-[260px]">
                    <CustomSelect
                      value={activeRequest.folderId}
                      onChange={(folderId) => updateActiveRequest({ folderId })}
                      variant="ghost"
                      minWidth={190}
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
                      className="font-semibold text-xs bg-transparent border border-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.03] focus:border-[var(--zp-accent)] rounded-[6px] focus:outline-none h-7 px-2 flex-1 max-w-md zp-surface-transition"
                      style={{ color: 'var(--zp-text-primary)' }}
                      placeholder="输入接口名称..."
                    />
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleSaveRequest}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap shrink-0 transition-colors"
                      style={{
                        color: savedRequestNotice ? '#10B981' : 'var(--zp-text-secondary)',
                      }}
                      title="立即保存当前接口信息至本地磁盘 (快捷键 Ctrl+S / Cmd+S)"
                    >
                      {savedRequestNotice ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      <span>{savedRequestNotice || '保存'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const curlStr = generateCodeSnippet(activeRequest, activeEnv, 'curl');
                        navigator.clipboard.writeText(curlStr);
                        setCopiedCurlQuick(true);
                        setTimeout(() => setCopiedCurlQuick(false), 1800);
                      }}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap shrink-0 transition-colors"
                      style={{ color: 'var(--zp-text-secondary)' }}
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

                {/* Bottom Row: Flush Rounded-[6px] URL Omnibar + Primary Send CTA */}
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 flex items-center h-9 rounded-[6px] border zp-surface-transition focus-within:border-[var(--zp-accent)]"
                    style={{
                      backgroundColor: 'var(--zp-bg-input)',
                      borderColor: 'var(--zp-border)',
                    }}
                  >
                    <CustomSelect
                      value={activeRequest.method}
                      onChange={(m) => {
                        const nextMethod = m as HttpMethod;
                        const needsBody =
                          nextMethod === 'POST' ||
                          nextMethod === 'PUT' ||
                          nextMethod === 'PATCH';
                        if (needsBody && activeRequest.body.type === 'none') {
                          updateActiveRequest({
                            method: nextMethod,
                            body: {
                              ...activeRequest.body,
                              type: 'json',
                            },
                          });
                          setReqSubTab('body');
                        } else {
                          updateActiveRequest({ method: nextMethod });
                        }
                      }}
                      variant="method"
                      minWidth={108}
                      options={HTTP_METHODS.map((m) => ({
                        value: m,
                        label: m,
                        textClassName: METHOD_COLORS[m].text,
                      }))}
                    />

                    <input
                      type="text"
                      value={activeRequest.url}
                      onChange={(e) => updateActiveRequest({ url: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSendRequest();
                        }
                      }}
                      placeholder="输入接口地址（按 Enter 直接发送），如 https://api.example.com/v1/users 或 {{baseUrl}}/users"
                      className="flex-1 h-full px-3 text-xs bg-transparent focus:outline-none"
                      style={{ color: 'var(--zp-text-primary)' }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSendRequest()}
                    disabled={loadingReqId === activeRequest.id}
                    className="inline-flex items-center justify-center gap-2 h-9 px-5 rounded-[6px] text-xs font-semibold transition-opacity hover:opacity-95 disabled:opacity-50 whitespace-nowrap shrink-0"
                    style={{
                      backgroundColor: 'var(--zp-accent)',
                      color: 'var(--zp-accent-fg)',
                    }}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {loadingReqId === activeRequest.id ? '请求中...' : '发送请求'}
                    </span>
                  </button>
                </div>
              </div>

              {/* ================================================================
                  SPLIT PANE: TOP = REQUEST CONFIG, BOTTOM = RESPONSE
                 ================================================================ */}
              <div className="flex-1 grid grid-rows-12 min-h-0">
                {/* TOP PANE: Request Builder */}
                <div
                  className={`${
                    responseExpanded ? 'row-span-3' : 'row-span-6'
                  } flex flex-col border-b min-h-0 zp-surface-transition`}
                  style={{ borderColor: 'var(--zp-border-subtle)' }}
                >
                  {/* Postman-style Flat Underline Sub-Tabs (Aligned with ResponseViewer) */}
                  <div
                    className="flex items-center justify-between px-4 border-b text-xs shrink-0 zp-surface-transition"
                    style={{
                      backgroundColor: 'var(--zp-bg-canvas)',
                      borderColor: 'var(--zp-border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-5 overflow-x-auto">
                      {reqSubTabItems.map((tab) => {
                        const active = reqSubTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setReqSubTab(tab.id)}
                            className="relative inline-flex items-center gap-1.5 py-2.5 font-medium transition-colors whitespace-nowrap shrink-0 hover:opacity-90"
                            style={{
                              color: active
                                ? 'var(--zp-text-primary)'
                                : 'var(--zp-text-secondary)',
                            }}
                          >
                            <span>{tab.label}</span>
                            {typeof tab.count === 'number' && tab.count > 0 && (
                              <span
                                className="text-xs font-semibold"
                                style={{ color: 'var(--zp-accent)' }}
                              >
                                ({tab.count})
                              </span>
                            )}
                            {tab.hasDot && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            {active && (
                              <span
                                className="absolute bottom-0 left-0 right-0 h-[2px]"
                                style={{ backgroundColor: 'var(--zp-accent)' }}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
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
                          <AuthPanel
                            auth={activeRequest.auth}
                            onChange={(nextAuth) => updateActiveRequest({ auth: nextAuth })}
                            parentFolder={folders.find((f) => f.id === activeRequest.folderId)}
                            onUpdateFolderAuth={(folderId, nextFolderAuth) =>
                              setFolders((prev) =>
                                prev.map((f) =>
                                  f.id === folderId ? { ...f, auth: nextFolderAuth } : f
                                )
                              )
                            }
                            activeEnv={activeEnv}
                          />
                        )}

                        {reqSubTab === 'body' && (
                          <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex items-center justify-between gap-2 px-4 py-2 text-xs shrink-0 overflow-x-auto">
                              <SegmentedControl
                                value={activeRequest.body.type}
                                onChange={(nextType) =>
                                  updateActiveRequest({
                                    body: { ...activeRequest.body, type: nextType },
                                  })
                                }
                                layoutId="req-body-type"
                                variant="quiet"
                                activeStyle="soft-accent"
                                options={[
                                  { id: 'none', label: 'none' },
                                  { id: 'json', label: 'JSON' },
                                  { id: 'form-data', label: 'form-data' },
                                  { id: 'urlencoded', label: 'x-www-form-urlencoded' },
                                  { id: 'raw', label: 'raw (Text/XML)' },
                                  { id: 'graphql', label: 'GraphQL' },
                                ]}
                              />

                              {activeRequest.body.type === 'json' && (
                                <div className="flex items-center gap-2 shrink-0">
                                  <span
                                    className={`font-mono-tabular whitespace-nowrap ${
                                      jsonSyntaxStatus.valid ? 'text-emerald-500' : 'text-rose-500'
                                    }`}
                                  >
                                    {jsonSyntaxStatus.message}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleFormatJsonBody(false)}
                                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] border text-xs whitespace-nowrap shrink-0 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                                    style={{
                                      borderColor: 'var(--zp-border-subtle)',
                                      color: 'var(--zp-text-secondary)',
                                    }}
                                  >
                                    <Wand2 className="w-3.5 h-3.5" />
                                    <span>美化 JSON</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleFormatJsonBody(true)}
                                    className="h-7 px-2.5 rounded-[6px] border text-xs whitespace-nowrap shrink-0 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                                    style={{
                                      borderColor: 'var(--zp-border-subtle)',
                                      color: 'var(--zp-text-secondary)',
                                    }}
                                  >
                                    压缩
                                  </button>
                                </div>
                              )}
                            </div>

                            <div
                              className={`flex-1 min-h-0 flex flex-col ${
                                activeRequest.body.type === 'json' ||
                                activeRequest.body.type === 'raw' ||
                                activeRequest.body.type === 'graphql'
                                  ? 'border-t'
                                  : ''
                              }`}
                              style={{ borderColor: 'var(--zp-border-subtle)' }}
                            >
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
                            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-2.5 pb-1 text-xs shrink-0">
                              <div className="flex flex-wrap items-center gap-1.5">
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
                                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] font-medium whitespace-nowrap shrink-0"
                                  style={{
                                    backgroundColor: 'var(--zp-accent-soft)',
                                    color: 'var(--zp-accent)',
                                  }}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>状态码 = 200</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextRule: AssertionRule = {
                                      id: `as_${Date.now()}`,
                                      enabled: true,
                                      type: 'time_lt',
                                      target: 'time',
                                      expected: '500',
                                    };
                                    updateActiveRequest({
                                      assertions: [...activeRequest.assertions, nextRule],
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] border font-medium whitespace-nowrap shrink-0 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                                  style={{
                                    borderColor: 'var(--zp-border-subtle)',
                                    backgroundColor: 'var(--zp-bg-surface)',
                                    color: 'var(--zp-text-secondary)',
                                  }}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>耗时 &lt; 500ms</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextRule: AssertionRule = {
                                      id: `as_${Date.now()}`,
                                      enabled: true,
                                      type: 'json_path_exists',
                                      target: 'data',
                                      expected: '',
                                    };
                                    updateActiveRequest({
                                      assertions: [...activeRequest.assertions, nextRule],
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] border font-medium whitespace-nowrap shrink-0 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                                  style={{
                                    borderColor: 'var(--zp-border-subtle)',
                                    backgroundColor: 'var(--zp-bg-surface)',
                                    color: 'var(--zp-text-secondary)',
                                  }}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>JSON 字段非空</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextRule: AssertionRule = {
                                      id: `as_${Date.now()}`,
                                      enabled: true,
                                      type: 'extract_env',
                                      target: 'data.token',
                                      expected: 'authToken',
                                    };
                                    updateActiveRequest({
                                      assertions: [...activeRequest.assertions, nextRule],
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] border font-medium whitespace-nowrap shrink-0 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                                  style={{
                                    borderColor: 'var(--zp-border-subtle)',
                                    backgroundColor: 'var(--zp-bg-surface)',
                                    color: 'var(--zp-text-secondary)',
                                  }}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>提取字段至环境变量</span>
                                </button>
                              </div>
                              <span style={{ color: 'var(--zp-text-muted)' }}>
                                发送请求后自动执行校验并在当前行展示结果
                              </span>
                            </div>

                            <div className="flex-1 overflow-y-auto p-3.5 space-y-2 text-xs">
                              {activeRequest.assertions.length === 0 ? (
                                <div
                                  className="p-6 text-center rounded-[8px] border border-dashed"
                                  style={{
                                    borderColor: 'var(--zp-border)',
                                    color: 'var(--zp-text-muted)',
                                  }}
                                >
                                  暂无断言或变量提取规则，点击上方快捷按钮一键添加。
                                </div>
                              ) : (
                                activeRequest.assertions.map((rule) => {
                                  const liveResult = activeResponse?.assertionResults.find(
                                    (r) => r.id === rule.id
                                  );
                                  return (
                                    <div
                                      key={rule.id}
                                      className="flex flex-wrap items-center gap-2 p-2.5 rounded-[8px] border"
                                      style={{
                                        backgroundColor: 'var(--zp-bg-surface)',
                                        borderColor: 'var(--zp-border)',
                                      }}
                                    >
                                      <UiCheckbox
                                        checked={rule.enabled}
                                        onChange={(next) =>
                                          updateActiveRequest({
                                            assertions: activeRequest.assertions.map((a) =>
                                              a.id === rule.id ? { ...a, enabled: next } : a
                                            ),
                                          })
                                        }
                                        title="启用或禁用此规则"
                                      />

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
                                          className="flex-1 min-w-[160px] h-8 px-3 rounded-[6px] border text-xs focus:outline-none focus:border-[var(--zp-accent)]"
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
                                          className="flex-1 min-w-[140px] h-8 px-3 rounded-[6px] border text-xs focus:outline-none focus:border-[var(--zp-accent)]"
                                          style={{
                                            backgroundColor: 'var(--zp-bg-input)',
                                            borderColor: 'var(--zp-border)',
                                            color: 'var(--zp-accent)',
                                          }}
                                        />
                                      )}

                                      {liveResult && (
                                        <span
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-xs font-medium ${
                                            liveResult.passed
                                              ? 'bg-emerald-500/10 text-emerald-500'
                                              : 'bg-rose-500/10 text-rose-500'
                                          }`}
                                          title={liveResult.label}
                                        >
                                          <span>{liveResult.passed ? '通过' : '失败'}</span>
                                          {liveResult.actual && (
                                            <span className="opacity-80 max-w-[140px] truncate">
                                              ({liveResult.actual})
                                            </span>
                                          )}
                                        </span>
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
                                        className="w-7 h-7 inline-flex items-center justify-center rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 hover:text-rose-500 transition-colors shrink-0"
                                        style={{ color: 'var(--zp-text-muted)' }}
                                        title="删除此规则"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}

                        {reqSubTab === 'code' && (
                          <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex items-center justify-between gap-2 px-4 py-2 text-xs shrink-0 overflow-x-auto">
                              <SegmentedControl
                                value={codeLang}
                                onChange={setCodeLang}
                                layoutId="req-code-lang"
                                variant="quiet"
                                activeStyle="soft-accent"
                                options={[
                                  { id: 'curl', label: 'cURL' },
                                  { id: 'fetch', label: 'JavaScript (fetch)' },
                                  { id: 'axios', label: 'Node.js (axios)' },
                                  { id: 'python', label: 'Python (requests)' },
                                  { id: 'go', label: 'Go (net/http)' },
                                  { id: 'rust', label: 'Rust (reqwest)' },
                                ]}
                              />

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
                                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] border text-xs whitespace-nowrap shrink-0 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                                style={{
                                  borderColor: 'var(--zp-border-subtle)',
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
                              className="flex-1 overflow-auto p-4 border-t font-mono-tabular text-xs leading-relaxed zp-surface-transition"
                              style={{
                                borderColor: 'var(--zp-border-subtle)',
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
                <div
                  className={`${
                    responseExpanded ? 'row-span-9' : 'row-span-6'
                  } flex flex-col min-h-0 zp-surface-transition`}
                >
                  <ResponseViewer
                    response={activeResponse}
                    loading={loadingReqId === activeRequest.id}
                    onQuickSaveEnvVar={handleQuickSaveEnvVar}
                    isExpanded={responseExpanded}
                    onToggleExpand={() => setResponseExpanded((v) => !v)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
              <img
                src="/icons/openpost_icon_pack/png/transparent/openpost-128-transparent.png"
                alt="OpenPost"
                className="w-16 h-16 object-contain mb-4 opacity-80"
              />
              <h3 className="text-sm font-semibold font-display mb-1">
                当前未打开任何接口标签页
              </h3>
              <p
                className="text-xs max-w-md mb-5 leading-relaxed"
                style={{ color: 'var(--zp-text-muted)' }}
              >
                可从左侧集合列表中点击任意接口打开，或直接新建接口、导入 cURL 命令进行调试。
              </p>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleCreateNewRequest()}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[6px] text-xs font-semibold transition-opacity hover:opacity-95 whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--zp-accent)',
                    color: 'var(--zp-accent-fg)',
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新建接口请求</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[6px] border text-xs font-medium hover:opacity-85 whitespace-nowrap"
                  style={{
                    borderColor: 'var(--zp-border)',
                    backgroundColor: 'var(--zp-bg-surface)',
                    color: 'var(--zp-text-primary)',
                  }}
                >
                  <FolderSync className="w-3.5 h-3.5" style={{ color: 'var(--zp-accent)' }} />
                  <span>导入 cURL / Postman</span>
                </button>
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
    </div>
  );
}
