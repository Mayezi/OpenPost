import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  X,
  Check,
  Palette,
  Terminal,
  Upload,
  Download,
  CheckCircle2,
  Plus,
  Trash2,
  HardDrive,
  Sliders,
  FolderOpen,
  RefreshCw,
  Sun,
  Moon,
  Network,
  FileJson,
} from 'lucide-react';
import {
  ApiRequestItem,
  CollectionFolder,
  EnvironmentProfile,
  HistoryEntry,
  HttpMethod,
  ProxyConfig,
  ProxyProtocol,
  ThemePalette,
} from '../types/api';
import { KeyValueTable } from './KeyValueTable';
import { CustomSelect } from './CustomSelect';
import { SegmentedControl, ToggleSwitch } from './UiControls';
import {
  exportWorkspaceBundle,
  parseCurlCommand,
} from '../utils/requestEngine';

export type SettingsTabId = 'general' | 'themes' | 'network' | 'storage';

/* ==========================================================================
   1. MODERN SPLIT-PANE PREFERENCES MODAL
   ========================================================================== */
interface SettingsCenterModalProps {
  isOpen: boolean;
  initialTab?: SettingsTabId;
  onClose: () => void;
  themes: ThemePalette[];
  activeThemeId: string;
  onSelectTheme: (id: string) => void;
  engineMode: 'local-proxy' | 'browser-direct';
  onChangeEngineMode: (mode: 'local-proxy' | 'browser-direct') => void;
  fontSizeScale: 'compact' | 'default' | 'comfortable' | 'large';
  onChangeFontSizeScale: (scale: 'compact' | 'default' | 'comfortable' | 'large') => void;
  customStoragePath: string;
  onChangeCustomStoragePath: (path: string) => void;
  folders: CollectionFolder[];
  requests: ApiRequestItem[];
  environments: EnvironmentProfile[];
  history: HistoryEntry[];
}

export const SettingsCenterModal: React.FC<SettingsCenterModalProps> = ({
  isOpen,
  initialTab = 'general',
  onClose,
  themes,
  activeThemeId,
  onSelectTheme,
  engineMode,
  onChangeEngineMode,
  fontSizeScale,
  onChangeFontSizeScale,
  customStoragePath,
  onChangeCustomStoragePath,
  folders,
  requests,
  environments,
  history,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);

  // Storage directory state
  const [pathInput, setPathInput] = useState(customStoragePath);
  const [migrateExisting, setMigrateExisting] = useState(true);
  const [cleanOldDir, setCleanOldDir] = useState(true);
  const [autoSyncToDisk, setAutoSyncToDisk] = useState(true);
  const [diskStats, setDiskStats] = useState<{ fileCount: number; totalBytes: number; files: string[] }>({
    fileCount: 0,
    totalBytes: 0,
    files: [],
  });
  const [storageStatusMsg, setStorageStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncingDisk, setSyncingDisk] = useState(false);

  const DEFAULT_PROXY: ProxyConfig = {
    mode: 'none',
    protocol: 'http',
    host: '127.0.0.1',
    port: '7890',
    username: '',
    password: '',
    bypass: 'localhost,127.0.0.1,::1',
  };

  // Network & General settings
  const [timeoutMs, setTimeoutMs] = useState(
    () => localStorage.getItem('openpost_timeout_ms') || '30000'
  );
  const [verifySsl, setVerifySsl] = useState(
    () => localStorage.getItem('openpost_verify_ssl') !== 'false'
  );
  const [maxHistoryItems, setMaxHistoryItems] = useState(
    () => localStorage.getItem('openpost_max_history') || '100'
  );
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig>(() => {
    try {
      const saved = localStorage.getItem('openpost_proxy_config');
      return saved ? { ...DEFAULT_PROXY, ...JSON.parse(saved) } : DEFAULT_PROXY;
    } catch {
      return DEFAULT_PROXY;
    }
  });
  const [proxyTestStatus, setProxyTestStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [testingProxy, setTestingProxy] = useState(false);

  const persistNetworkConfig = (
    nextTimeout: string,
    nextMaxHist: string,
    nextVerifySsl: boolean,
    nextProxy: ProxyConfig = proxyConfig,
    nextAutoSync: boolean = autoSyncToDisk
  ) => {
    localStorage.setItem('openpost_timeout_ms', nextTimeout);
    localStorage.setItem('openpost_max_history', nextMaxHist);
    localStorage.setItem('openpost_verify_ssl', String(nextVerifySsl));
    localStorage.setItem('openpost_proxy_config', JSON.stringify(nextProxy));
    fetch('/api/storage/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storageDir: pathInput.trim() || customStoragePath,
        autoSyncToDisk: nextAutoSync,
        maxHistoryItems: Number(nextMaxHist) || 100,
        requestTimeoutMs: Number(nextTimeout) || 30000,
        verifySsl: nextVerifySsl,
        proxy: nextProxy,
        migrateExisting: false,
        cleanOldDir: false,
      }),
    }).catch(() => {});
  };

  const updateProxyField = <K extends keyof ProxyConfig>(key: K, val: ProxyConfig[K]) => {
    const next = { ...proxyConfig, [key]: val };
    setProxyConfig(next);
    setProxyTestStatus(null);
    persistNetworkConfig(timeoutMs, maxHistoryItems, verifySsl, next);
  };

  const handleTestProxyConnection = async () => {
    setTestingProxy(true);
    setProxyTestStatus(null);
    try {
      const res = await fetch('/api/proxy/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy: proxyConfig }),
      });
      const data = await res.json();
      setProxyTestStatus({
        ok: Boolean(data.ok),
        text: data.ok ? data.message : data.error || '连接失败',
      });
    } catch (e: unknown) {
      setProxyTestStatus({
        ok: false,
        text: `测试异常: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setTestingProxy(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setProxyTestStatus(null);
      setStorageStatusMsg(null);
      fetch('/api/storage/config')
        .then((r) => r.json())
        .then((data) => {
          if (data.ok && data.config) {
            if (!customStoragePath) {
              setPathInput(data.config.storageDir);
              onChangeCustomStoragePath(data.config.storageDir);
            } else {
              setPathInput(customStoragePath);
            }
            setAutoSyncToDisk(data.config.autoSyncToDisk ?? true);
            setTimeoutMs(String(data.config.requestTimeoutMs || 30000));
            setVerifySsl(data.config.verifySsl ?? true);
            setMaxHistoryItems(String(data.config.maxHistoryItems || 100));
            if (data.config.proxy) {
              const merged = { ...DEFAULT_PROXY, ...data.config.proxy };
              setProxyConfig(merged);
              localStorage.setItem('openpost_proxy_config', JSON.stringify(merged));
            }
            if (data.stats) setDiskStats(data.stats);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, initialTab]);

  const handleApplyStorageDir = async () => {
    if (!pathInput.trim()) return;
    setSyncingDisk(true);
    setStorageStatusMsg(null);
    try {
      const res = await fetch('/api/storage/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storageDir: pathInput.trim(),
          autoSyncToDisk,
          maxHistoryItems: Number(maxHistoryItems) || 100,
          requestTimeoutMs: Number(timeoutMs) || 30000,
          verifySsl,
          migrateExisting,
          cleanOldDir,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const finalDisplay = data.displayPath || data.config.storageDir;
        onChangeCustomStoragePath(finalDisplay);
        setPathInput(finalDisplay);
        const syncRes = await fetch('/api/storage/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folders, requests, environments, history }),
        });
        const syncData = await syncRes.json();
        if (syncData.stats) setDiskStats(syncData.stats);
        setStorageStatusMsg({
          ok: true,
          text: `已应用目录 ${finalDisplay}`,
        });
      } else {
        setStorageStatusMsg({ ok: false, text: data.error || '目录配置失败' });
      }
    } catch (e: unknown) {
      setStorageStatusMsg({
        ok: false,
        text: `请求失败: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setSyncingDisk(false);
    }
  };

  const handleNativeFolderPicker = async () => {
    try {
      const win = window as unknown as {
        showDirectoryPicker?: (opts?: { mode?: string }) => Promise<{
          name: string;
          getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<{
            createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>;
          }>;
        }>;
      };
      if (typeof win.showDirectoryPicker === 'function') {
        const dirHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
        const fileHandle = await dirHandle.getFileHandle('openpost-workspace-vault.json', {
          create: true,
        });
        const writable = await fileHandle.createWritable();
        await writable.write(exportWorkspaceBundle(folders, requests, environments));
        await writable.close();
        const chosenLabel = `[本地挂载卷] ${dirHandle.name}/openpost-workspace-vault.json`;
        setPathInput(chosenLabel);
        onChangeCustomStoragePath(chosenLabel);
        setStorageStatusMsg({
          ok: true,
          text: `已挂载目录「${dirHandle.name}」`,
        });
      } else {
        setStorageStatusMsg({
          ok: false,
          text: '当前环境不支持原生目录选择器，请直接输入路径后点击应用',
        });
      }
    } catch {
      // User cancelled picker
    }
  };

  const navItems: Array<{ id: SettingsTabId; label: string; icon: React.ReactNode }> = [
    {
      id: 'general',
      label: '常规与请求',
      icon: <Sliders className="w-3.5 h-3.5" />,
    },
    {
      id: 'themes',
      label: '外观与字号',
      icon: <Palette className="w-3.5 h-3.5" />,
    },
    {
      id: 'network',
      label: '网络代理',
      icon: <Network className="w-3.5 h-3.5" />,
    },
    {
      id: 'storage',
      label: '存储与数据',
      icon: <HardDrive className="w-3.5 h-3.5" />,
    },
  ];

  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label || '偏好设置';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 dark:bg-black/55 backdrop-blur-[3px] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[620px] rounded-[12px] border overflow-hidden flex h-[430px] max-h-[82vh] zp-popover-shadow"
            style={{
              backgroundColor: 'var(--zp-bg-canvas)',
              borderColor: 'var(--zp-border-subtle)',
              color: 'var(--zp-text-primary)',
            }}
          >
            {/* Full-Height Left Sidebar Rail */}
            <div
              className="w-[160px] border-r p-2.5 flex flex-col shrink-0"
              style={{
                borderColor: 'var(--zp-border-subtle)',
                backgroundColor: 'var(--zp-bg-surface)',
              }}
            >
              <div
                className="px-2.5 pt-1.5 pb-3 text-[11px] font-semibold tracking-wider uppercase select-none"
                style={{ color: 'var(--zp-text-muted)' }}
              >
                偏好设置
              </div>

              <div className="space-y-0.5">
                {navItems.map((item) => {
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className="relative w-full text-left flex items-center gap-2.5 h-8 px-2.5 rounded-[6px] text-xs font-medium transition-colors hover:text-[var(--zp-text-primary)]"
                      style={{
                        color: active ? 'var(--zp-text-primary)' : 'var(--zp-text-secondary)',
                      }}
                    >
                      {active && (
                        <motion.div
                          layoutId="settings-active-pill"
                          transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                          className="absolute inset-0 rounded-[6px]"
                          style={{
                            backgroundColor: 'var(--zp-bg-elevated)',
                          }}
                        />
                      )}
                      <span
                        className="relative z-10 shrink-0"
                        style={{ color: active ? 'var(--zp-accent)' : 'var(--zp-text-muted)' }}
                      >
                        {item.icon}
                      </span>
                      <span className="relative z-10 truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Content Pane */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Right Pane Header */}
              <div
                className="flex items-center justify-between px-6 h-12 border-b shrink-0"
                style={{ borderColor: 'var(--zp-border-subtle)' }}
              >
                <h2 className="text-xs font-semibold tracking-tight">
                  {activeNavLabel}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-6 h-6 inline-flex items-center justify-center rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--zp-text-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Right Pane Body */}
              <div className="flex-1 overflow-y-auto px-6 py-3 text-xs">
                <AnimatePresence mode="wait">
                  {/* TAB 1: GENERAL & REQUESTS */}
                  {activeTab === 'general' && (
                    <motion.div
                      key="tab-general"
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.12 }}
                    >
                      <div
                        className="flex items-center justify-between gap-4 py-3.5 border-b"
                        style={{ borderColor: 'var(--zp-border-subtle)' }}
                      >
                        <span className="font-medium">请求执行引擎</span>
                        <SegmentedControl
                          value={engineMode}
                          onChange={onChangeEngineMode}
                          layoutId="settings-engine-mode"
                          tone="canvas"
                          activeStyle="elevated"
                          options={[
                            { id: 'local-proxy', label: '本地引擎 (无跨域)' },
                            { id: 'browser-direct', label: '浏览器直连' },
                          ]}
                        />
                      </div>

                      <div
                        className="flex items-center justify-between gap-4 py-3.5 border-b"
                        style={{ borderColor: 'var(--zp-border-subtle)' }}
                      >
                        <span className="font-medium">请求超时时间</span>
                        <CustomSelect
                          value={timeoutMs}
                          onChange={(val) => {
                            setTimeoutMs(val);
                            persistNetworkConfig(val, maxHistoryItems, verifySsl);
                          }}
                          minWidth={136}
                          align="right"
                          options={[
                            { value: '5000', label: '5 秒' },
                            { value: '15000', label: '15 秒' },
                            { value: '30000', label: '30 秒 (默认)' },
                            { value: '60000', label: '60 秒' },
                          ]}
                        />
                      </div>

                      <div
                        className="flex items-center justify-between gap-4 py-3.5 border-b"
                        style={{ borderColor: 'var(--zp-border-subtle)' }}
                      >
                        <span className="font-medium">SSL 证书严格校验</span>
                        <ToggleSwitch
                          checked={verifySsl}
                          onChange={(next) => {
                            setVerifySsl(next);
                            persistNetworkConfig(timeoutMs, maxHistoryItems, next);
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-4 py-3.5">
                        <span className="font-medium">历史记录保留上限</span>
                        <CustomSelect
                          value={maxHistoryItems}
                          onChange={(val) => {
                            setMaxHistoryItems(val);
                            persistNetworkConfig(timeoutMs, val, verifySsl);
                          }}
                          minWidth={136}
                          align="right"
                          options={[
                            { value: '30', label: '30 条' },
                            { value: '60', label: '60 条' },
                            { value: '100', label: '100 条 (默认)' },
                            { value: '300', label: '300 条' },
                          ]}
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 2: APPEARANCE & TYPOGRAPHY */}
                  {activeTab === 'themes' && (
                    <motion.div
                      key="tab-themes"
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.12 }}
                      className="space-y-4 py-1"
                    >
                      {/* Font Scale Row */}
                      <div
                        className="flex items-center justify-between gap-4 pb-3.5 border-b"
                        style={{ borderColor: 'var(--zp-border-subtle)' }}
                      >
                        <span className="font-medium">界面字号</span>
                        <SegmentedControl
                          value={fontSizeScale}
                          onChange={onChangeFontSizeScale}
                          layoutId="settings-font-scale"
                          tone="canvas"
                          activeStyle="elevated"
                          options={[
                            { id: 'compact', label: '紧凑' },
                            { id: 'default', label: '标准' },
                            { id: 'comfortable', label: '舒适' },
                            { id: 'large', label: '大字号' },
                          ]}
                        />
                      </div>

                      {/* Theme Grid */}
                      <div className="space-y-2">
                        <span
                          className="block text-[11px] font-medium"
                          style={{ color: 'var(--zp-text-secondary)' }}
                        >
                          主题配色
                        </span>
                        <div className="grid grid-cols-2 gap-2.5">
                          {themes.map((theme) => {
                            const isSelected = theme.id === activeThemeId;
                            return (
                              <button
                                key={theme.id}
                                type="button"
                                onClick={() => onSelectTheme(theme.id)}
                                className="text-left p-3 rounded-[8px] border transition-all flex flex-col justify-between gap-2.5"
                                style={{
                                  backgroundColor: theme.colors.bgSurface,
                                  borderColor: isSelected
                                    ? theme.colors.accent
                                    : theme.colors.borderSubtle,
                                  color: theme.colors.textPrimary,
                                  boxShadow: isSelected
                                    ? `0 0 0 1px ${theme.colors.accent}`
                                    : 'none',
                                }}
                              >
                                <div className="flex items-center justify-between gap-2 w-full">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {theme.mode === 'light' ? (
                                      <Sun
                                        className="w-3.5 h-3.5 shrink-0"
                                        style={{ color: theme.colors.accent }}
                                      />
                                    ) : (
                                      <Moon
                                        className="w-3.5 h-3.5 shrink-0"
                                        style={{ color: theme.colors.accent }}
                                      />
                                    )}
                                    <span className="text-xs font-medium truncate">
                                      {theme.name}
                                    </span>
                                  </div>
                                  {isSelected && (
                                    <span
                                      className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                                      style={{
                                        backgroundColor: theme.colors.accent,
                                        color: theme.colors.accentFg,
                                      }}
                                    >
                                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1">
                                    {[
                                      theme.colors.bgCanvas,
                                      theme.colors.bgElevated,
                                      theme.colors.accent,
                                      theme.colors.textPrimary,
                                    ].map((swatch, idx) => (
                                      <span
                                        key={idx}
                                        className="w-3.5 h-3.5 rounded-full border"
                                        style={{
                                          backgroundColor: swatch,
                                          borderColor: theme.colors.border,
                                        }}
                                      />
                                    ))}
                                  </div>
                                  <span
                                    className="font-mono-tabular text-[10px]"
                                    style={{ color: theme.colors.textMuted }}
                                  >
                                    {theme.mode === 'light' ? 'Light' : 'Dark'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 3: NETWORK PROXY */}
                  {activeTab === 'network' && (
                    <motion.div
                      key="tab-network"
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.12 }}
                      className="space-y-4 py-1"
                    >
                      <div
                        className="flex items-center justify-between gap-3 pb-3.5 border-b"
                        style={{ borderColor: 'var(--zp-border-subtle)' }}
                      >
                        <span className="font-medium">代理模式</span>
                        <SegmentedControl
                          value={proxyConfig.mode}
                          onChange={(m) => updateProxyField('mode', m)}
                          layoutId="settings-proxy-mode"
                          tone="canvas"
                          activeStyle="elevated"
                          options={[
                            { id: 'none', label: '直连' },
                            { id: 'system', label: '系统代理' },
                            { id: 'custom', label: '自定义代理' },
                          ]}
                        />
                      </div>

                      {proxyConfig.mode === 'custom' && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-12 gap-2.5">
                            <div className="col-span-3 space-y-1">
                              <label
                                className="block text-[11px]"
                                style={{ color: 'var(--zp-text-secondary)' }}
                              >
                                协议
                              </label>
                              <CustomSelect
                                value={proxyConfig.protocol}
                                onChange={(v) => updateProxyField('protocol', v as ProxyProtocol)}
                                minWidth={90}
                                options={[
                                  { value: 'http', label: 'HTTP' },
                                  { value: 'https', label: 'HTTPS' },
                                  { value: 'socks5', label: 'SOCKS5' },
                                ]}
                              />
                            </div>

                            <div className="col-span-6 space-y-1">
                              <label
                                className="block text-[11px]"
                                style={{ color: 'var(--zp-text-secondary)' }}
                              >
                                主机地址
                              </label>
                              <input
                                type="text"
                                value={proxyConfig.host}
                                onChange={(e) => updateProxyField('host', e.target.value)}
                                placeholder="127.0.0.1"
                                className="w-full h-7 px-2.5 rounded-[6px] border text-xs focus:outline-none focus:border-[var(--zp-accent)]"
                                style={{
                                  backgroundColor: 'var(--zp-bg-input)',
                                  borderColor: 'var(--zp-border-subtle)',
                                  color: 'var(--zp-text-primary)',
                                }}
                              />
                            </div>

                            <div className="col-span-3 space-y-1">
                              <label
                                className="block text-[11px]"
                                style={{ color: 'var(--zp-text-secondary)' }}
                              >
                                端口
                              </label>
                              <input
                                type="text"
                                value={proxyConfig.port}
                                onChange={(e) => updateProxyField('port', e.target.value)}
                                placeholder="7890"
                                className="w-full h-7 px-2.5 rounded-[6px] border font-mono-tabular text-xs focus:outline-none focus:border-[var(--zp-accent)]"
                                style={{
                                  backgroundColor: 'var(--zp-bg-input)',
                                  borderColor: 'var(--zp-border-subtle)',
                                  color: 'var(--zp-text-primary)',
                                }}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                              <label
                                className="block text-[11px]"
                                style={{ color: 'var(--zp-text-secondary)' }}
                              >
                                用户名 (可选)
                              </label>
                              <input
                                type="text"
                                value={proxyConfig.username || ''}
                                onChange={(e) => updateProxyField('username', e.target.value)}
                                placeholder="免认证留空"
                                className="w-full h-7 px-2.5 rounded-[6px] border text-xs focus:outline-none focus:border-[var(--zp-accent)]"
                                style={{
                                  backgroundColor: 'var(--zp-bg-input)',
                                  borderColor: 'var(--zp-border-subtle)',
                                  color: 'var(--zp-text-primary)',
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <label
                                className="block text-[11px]"
                                style={{ color: 'var(--zp-text-secondary)' }}
                              >
                                密码 (可选)
                              </label>
                              <input
                                type="password"
                                value={proxyConfig.password || ''}
                                onChange={(e) => updateProxyField('password', e.target.value)}
                                placeholder="免认证留空"
                                className="w-full h-7 px-2.5 rounded-[6px] border text-xs focus:outline-none focus:border-[var(--zp-accent)]"
                                style={{
                                  backgroundColor: 'var(--zp-bg-input)',
                                  borderColor: 'var(--zp-border-subtle)',
                                  color: 'var(--zp-text-primary)',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {proxyConfig.mode !== 'none' && (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label
                              className="block text-[11px]"
                              style={{ color: 'var(--zp-text-secondary)' }}
                            >
                              绕过代理地址 (逗号分隔)
                            </label>
                            <input
                              type="text"
                              value={proxyConfig.bypass || ''}
                              onChange={(e) => updateProxyField('bypass', e.target.value)}
                              placeholder="localhost,127.0.0.1,::1"
                              className="w-full h-7 px-2.5 rounded-[6px] border font-mono-tabular text-xs focus:outline-none focus:border-[var(--zp-accent)]"
                              style={{
                                backgroundColor: 'var(--zp-bg-input)',
                                borderColor: 'var(--zp-border-subtle)',
                                color: 'var(--zp-text-primary)',
                              }}
                            />
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleTestProxyConnection}
                              disabled={testingProxy}
                              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] border font-medium hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors disabled:opacity-50"
                              style={{
                                borderColor: 'var(--zp-border-subtle)',
                                backgroundColor: 'var(--zp-bg-surface)',
                                color: 'var(--zp-text-primary)',
                              }}
                            >
                              <RefreshCw
                                className={`w-3 h-3 ${testingProxy ? 'animate-spin' : ''}`}
                                style={{ color: 'var(--zp-accent)' }}
                              />
                              <span>{testingProxy ? '测试中...' : '测试连通性'}</span>
                            </button>

                            {proxyTestStatus && (
                              <span
                                className={`text-xs font-medium truncate ${
                                  proxyTestStatus.ok ? 'text-emerald-500' : 'text-rose-500'
                                }`}
                              >
                                {proxyTestStatus.text}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* TAB 4: STORAGE & DATA */}
                  {activeTab === 'storage' && (
                    <motion.div
                      key="tab-storage"
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.12 }}
                      className="space-y-4 py-1"
                    >
                      {/* Directory Path Bar */}
                      <div
                        className="space-y-2.5 pb-4 border-b"
                        style={{ borderColor: 'var(--zp-border-subtle)' }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">本地数据目录</span>
                          <span
                            className="font-mono-tabular text-[11px]"
                            style={{ color: 'var(--zp-text-muted)' }}
                          >
                            {diskStats.fileCount} 文件 · {(diskStats.totalBytes / 1024).toFixed(1)} KB
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={pathInput}
                            onChange={(e) => setPathInput(e.target.value)}
                            placeholder="输入本地存储路径"
                            className="flex-1 h-8 px-2.5 rounded-[6px] border font-mono-tabular text-xs focus:outline-none focus:border-[var(--zp-accent)]"
                            style={{
                              backgroundColor: 'var(--zp-bg-input)',
                              borderColor: 'var(--zp-border-subtle)',
                              color: 'var(--zp-text-primary)',
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleNativeFolderPicker}
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[6px] border font-medium whitespace-nowrap shrink-0 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
                            style={{
                              borderColor: 'var(--zp-border-subtle)',
                              backgroundColor: 'var(--zp-bg-surface)',
                              color: 'var(--zp-text-primary)',
                            }}
                          >
                            <FolderOpen
                              className="w-3.5 h-3.5"
                              style={{ color: 'var(--zp-text-secondary)' }}
                            />
                            <span>浏览</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleApplyStorageDir}
                            disabled={syncingDisk}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] font-medium transition-opacity disabled:opacity-50 whitespace-nowrap shrink-0 hover:opacity-90"
                            style={{
                              backgroundColor: 'var(--zp-accent)',
                              color: 'var(--zp-accent-fg)',
                            }}
                          >
                            {syncingDisk && <RefreshCw className="w-3 h-3 animate-spin" />}
                            <span>{syncingDisk ? '应用中' : '应用'}</span>
                          </button>
                        </div>

                        {storageStatusMsg && (
                          <div
                            className={`text-[11px] font-medium flex items-center gap-1.5 ${
                              storageStatusMsg.ok ? 'text-emerald-500' : 'text-rose-500'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{storageStatusMsg.text}</span>
                          </div>
                        )}
                      </div>

                      {/* Clean Single-Line Toggle Rows (No Black Divider!) */}
                      <div>
                        <div
                          className="py-3 border-b"
                          style={{ borderColor: 'var(--zp-border-subtle)' }}
                        >
                          <ToggleSwitch
                            size="sm"
                            checked={autoSyncToDisk}
                            onChange={(next) => {
                              setAutoSyncToDisk(next);
                              persistNetworkConfig(
                                timeoutMs,
                                maxHistoryItems,
                                verifySsl,
                                proxyConfig,
                                next
                              );
                            }}
                            label="实时同步到本地 JSON 文件"
                          />
                        </div>

                        <div
                          className="py-3 border-b"
                          style={{ borderColor: 'var(--zp-border-subtle)' }}
                        >
                          <ToggleSwitch
                            size="sm"
                            checked={migrateExisting}
                            onChange={setMigrateExisting}
                            label="切换目录时自动迁移现有数据"
                          />
                        </div>

                        <div className="py-3">
                          <ToggleSwitch
                            size="sm"
                            checked={cleanOldDir}
                            onChange={setCleanOldDir}
                            label="迁移后清理原目录缓存"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ==========================================================================
   2. MODERN SPLIT-PANE ENVIRONMENT VARIABLES MODAL
   ========================================================================== */
interface EnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  environments: EnvironmentProfile[];
  activeEnvId: string;
  onSelectEnv: (id: string) => void;
  onUpdateEnvironments: (next: EnvironmentProfile[]) => void;
}

export const EnvironmentModal: React.FC<EnvironmentModalProps> = ({
  isOpen,
  onClose,
  environments,
  activeEnvId,
  onSelectEnv,
  onUpdateEnvironments,
}) => {
  const [selectedId, setSelectedId] = useState(activeEnvId || environments[0]?.id || '');
  const [newEnvName, setNewEnvName] = useState('');

  const currentEnv =
    environments.find((e) => e.id === selectedId) || environments[0];

  const handleCreateEnv = () => {
    const trimmed = newEnvName.trim() || `新环境 ${environments.length + 1}`;
    const created: EnvironmentProfile = {
      id: `env_${Date.now()}`,
      name: trimmed,
      variables: [
        { id: `v_${Date.now()}`, key: 'baseUrl', value: 'https://httpbin.org', enabled: true },
      ],
    };
    onUpdateEnvironments([...environments, created]);
    setSelectedId(created.id);
    onSelectEnv(created.id);
    setNewEnvName('');
  };

  const handleDeleteEnv = (id: string) => {
    if (environments.length <= 1) return;
    const next = environments.filter((e) => e.id !== id);
    onUpdateEnvironments(next);
    if (selectedId === id) {
      setSelectedId(next[0].id);
    }
    if (activeEnvId === id) {
      onSelectEnv(next[0].id);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 dark:bg-black/55 backdrop-blur-[3px] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl rounded-[12px] border overflow-hidden flex h-[500px] max-h-[82vh] zp-popover-shadow"
            style={{
              backgroundColor: 'var(--zp-bg-canvas)',
              borderColor: 'var(--zp-border-subtle)',
              color: 'var(--zp-text-primary)',
            }}
          >
            {/* Full-Height Left Sidebar */}
            <div
              className="w-52 border-r p-2.5 flex flex-col justify-between shrink-0"
              style={{
                borderColor: 'var(--zp-border-subtle)',
                backgroundColor: 'var(--zp-bg-surface)',
              }}
            >
              <div className="space-y-1 overflow-y-auto min-h-0">
                <div
                  className="px-2.5 pt-1.5 pb-2.5 text-[11px] font-semibold tracking-wider uppercase select-none"
                  style={{ color: 'var(--zp-text-muted)' }}
                >
                  环境变量
                </div>

                {environments.map((env) => {
                  const isSelected = env.id === currentEnv?.id;
                  const isActive = env.id === activeEnvId;
                  return (
                    <div
                      key={env.id}
                      onClick={() => setSelectedId(env.id)}
                      className="group flex items-center justify-between h-8 px-2.5 rounded-[6px] text-xs cursor-pointer transition-colors"
                      style={{
                        backgroundColor: isSelected ? 'var(--zp-bg-elevated)' : 'transparent',
                        color: isSelected ? 'var(--zp-text-primary)' : 'var(--zp-text-secondary)',
                      }}
                    >
                      <div className="truncate flex items-center gap-2 min-w-0">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: isActive ? '#10b981' : 'var(--zp-border)',
                          }}
                        />
                        <span className="truncate font-medium">{env.name}</span>
                      </div>
                      {environments.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEnv(env.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-[4px] hover:text-rose-500 transition-opacity"
                          style={{ color: 'var(--zp-text-muted)' }}
                          title="删除环境"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Compact Bottom Creator */}
              <div
                className="pt-2.5 border-t flex items-center gap-1.5"
                style={{ borderColor: 'var(--zp-border-subtle)' }}
              >
                <input
                  type="text"
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateEnv();
                  }}
                  placeholder="新建环境名称..."
                  className="flex-1 min-w-0 h-7 px-2 rounded-[6px] border text-xs focus:outline-none focus:border-[var(--zp-accent)]"
                  style={{
                    backgroundColor: 'var(--zp-bg-input)',
                    borderColor: 'var(--zp-border-subtle)',
                    color: 'var(--zp-text-primary)',
                  }}
                />
                <button
                  type="button"
                  onClick={handleCreateEnv}
                  className="w-7 h-7 inline-flex items-center justify-center rounded-[6px] shrink-0 transition-opacity hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--zp-accent)',
                    color: 'var(--zp-accent-fg)',
                  }}
                  title="新建环境"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Right Pane */}
            {currentEnv && (
              <div className="flex-1 flex flex-col min-w-0">
                <div
                  className="flex items-center justify-between px-5 h-12 border-b text-xs shrink-0"
                  style={{ borderColor: 'var(--zp-border-subtle)' }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-semibold truncate">{currentEnv.name}</span>
                    {currentEnv.id === activeEnvId ? (
                      <span className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium bg-emerald-500/10 text-emerald-500 shrink-0">
                        当前激活
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectEnv(currentEnv.id)}
                        className="h-6 px-2 rounded-[4px] text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors hover:opacity-90"
                        style={{
                          backgroundColor: 'var(--zp-bg-elevated)',
                          color: 'var(--zp-text-primary)',
                        }}
                      >
                        设为当前环境
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className="font-mono-tabular text-[11px] hidden sm:inline"
                      style={{ color: 'var(--zp-text-muted)' }}
                    >
                      {'{{$timestamp}}'} · {'{{$guid}}'} · {'{{$randomInt}}'}
                    </span>
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-6 h-6 inline-flex items-center justify-center rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      style={{ color: 'var(--zp-text-muted)' }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0">
                  <KeyValueTable
                    items={currentEnv.variables}
                    onChange={(vars) => {
                      onUpdateEnvironments(
                        environments.map((e) =>
                          e.id === currentEnv.id ? { ...e, variables: vars } : e
                        )
                      );
                    }}
                    keyPlaceholder="变量名 (如 baseUrl)"
                    valuePlaceholder="变量值 (如 https://api.example.com)"
                    descriptionPlaceholder="备注 (可选)"
                  />
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ==========================================================================
   3. MODERN DATA IMPORT & BACKUP MODAL
   ========================================================================== */
interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: CollectionFolder[];
  requests: ApiRequestItem[];
  environments: EnvironmentProfile[];
  onImportCurlRequest: (req: ApiRequestItem) => void;
  onImportWorkspaceData: (
    folders: CollectionFolder[],
    requests: ApiRequestItem[],
    environments?: EnvironmentProfile[]
  ) => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  folders,
  requests,
  environments,
  onImportCurlRequest,
  onImportWorkspaceData,
}) => {
  const [tab, setTab] = useState<'curl' | 'json' | 'vault'>('curl');
  const [curlText, setCurlText] = useState(
    `curl -X POST 'https://httpbin.org/post?source=curl_import' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer zp_local_token_99' \\\n  -d '{"service": "OpenPost", "localFirst": true}'`
  );
  const [targetFolderId, setTargetFolderId] = useState(folders[0]?.id || 'folder_local_sandbox');
  const [jsonInput, setJsonInput] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStatusMsg('');
    }
  }, [isOpen]);

  const handleParseCurl = () => {
    if (!curlText.trim()) return;
    const reqItem = parseCurlCommand(
      curlText,
      targetFolderId || folders[0]?.id || 'folder_local_sandbox'
    );
    onImportCurlRequest(reqItem);
    onClose();
  };

  const handleExportDownload = () => {
    const bundle = exportWorkspaceBundle(folders, requests, environments);
    const blob = new Blob([bundle], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openpost-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg('已导出工作区 JSON 文件');
  };

  const handleSaveToLocalFileSystem = async () => {
    const bundle = exportWorkspaceBundle(folders, requests, environments);
    try {
      const win = window as unknown as {
        showSaveFilePicker?: (opts: unknown) => Promise<{
          createWritable: () => Promise<{
            write: (data: string) => Promise<void>;
            close: () => Promise<void>;
          }>;
        }>;
      };
      if (typeof win.showSaveFilePicker === 'function') {
        const handle = await win.showSaveFilePicker({
          suggestedName: 'openpost-workspace.json',
          types: [
            {
              description: 'OpenPost / Postman JSON',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(bundle);
        await writable.close();
        setStatusMsg('已保存至本地磁盘');
      } else {
        handleExportDownload();
      }
    } catch {
      handleExportDownload();
    }
  };

  const handleImportJsonString = (rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson);
      const nativeBundle = parsed.openpost_native || parsed.zeropost_native;
      if (nativeBundle?.folders && nativeBundle?.requests) {
        onImportWorkspaceData(
          nativeBundle.folders,
          nativeBundle.requests,
          nativeBundle.environments
        );
        setStatusMsg('已恢复 OpenPost 工作区数据');
        setTimeout(() => onClose(), 600);
        return;
      }

      if (Array.isArray(parsed.item)) {
        const newFolders: CollectionFolder[] = [...folders];
        const newRequests: ApiRequestItem[] = [...requests];
        const importedFolderId = `folder_pm_${Date.now()}`;
        newFolders.push({
          id: importedFolderId,
          name: parsed.info?.name || 'Postman 导入集合',
          description: parsed.info?.description || '从 Postman v2.1 导入',
          expanded: true,
        });

        const extractItems = (items: Record<string, unknown>[], fId: string) => {
          items.forEach((it, idx) => {
            if (Array.isArray(it.item)) {
              const subFolderId = `folder_pm_${Date.now()}_${idx}`;
              newFolders.push({
                id: subFolderId,
                name: String(it.name || `子目录 ${idx + 1}`),
                expanded: true,
              });
              extractItems(it.item as Record<string, unknown>[], subFolderId);
            } else if (it.request && typeof it.request === 'object') {
              const rObj = it.request as Record<string, unknown>;
              const method = String(rObj.method || 'GET').toUpperCase() as HttpMethod;
              const rawUrl =
                typeof rObj.url === 'string'
                  ? rObj.url
                  : String((rObj.url as Record<string, unknown>)?.raw || 'https://httpbin.org/get');
              const headersArr = Array.isArray(rObj.header) ? rObj.header : [];
              const bodyObj = (rObj.body as Record<string, unknown>) || {};
              const rawBody = String(bodyObj.raw || '');

              newRequests.push({
                id: `req_pm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                name: String(it.name || `${method} Request`),
                folderId: fId,
                method,
                url: rawUrl.split('?')[0],
                params: [],
                headers: headersArr.map((h: Record<string, unknown>, hIdx: number) => ({
                  id: `h_pm_${hIdx}`,
                  key: String(h.key || ''),
                  value: String(h.value || ''),
                  enabled: !h.disabled,
                })),
                auth: { type: 'none' },
                body: {
                  type: rawBody ? 'json' : 'none',
                  json: rawBody,
                  raw: rawBody,
                  formData: [],
                  urlencoded: [],
                  graphqlQuery: '',
                  graphqlVariables: '{}',
                },
                assertions: [
                  { id: `as_pm_${idx}`, enabled: true, type: 'status_eq', target: 'status', expected: '200' },
                ],
              });
            }
          });
        };

        extractItems(parsed.item as Record<string, unknown>[], importedFolderId);
        onImportWorkspaceData(newFolders, newRequests);
        setStatusMsg('已导入 Postman Collection v2.1 集合');
        setTimeout(() => onClose(), 600);
        return;
      }

      setStatusMsg('未识别的 JSON 格式，请确认是 Postman v2.1 或 OpenPost 备份文件');
    } catch (e: unknown) {
      setStatusMsg(`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 dark:bg-black/55 backdrop-blur-[3px] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[560px] rounded-[12px] border overflow-hidden flex flex-col zp-popover-shadow"
            style={{
              backgroundColor: 'var(--zp-bg-canvas)',
              borderColor: 'var(--zp-border-subtle)',
              color: 'var(--zp-text-primary)',
            }}
          >
            {/* Unified Single Header Bar */}
            <div
              className="flex items-center justify-between px-5 h-12 border-b shrink-0"
              style={{
                borderColor: 'var(--zp-border-subtle)',
                backgroundColor: 'var(--zp-bg-surface)',
              }}
            >
              <span className="text-xs font-semibold tracking-tight">
                数据导入与备份
              </span>

              <div className="flex items-center gap-3">
                <SegmentedControl
                  value={tab}
                  onChange={(next) => {
                    setTab(next);
                    setStatusMsg('');
                  }}
                  layoutId="import-modal-tabs"
                  tone="canvas"
                  activeStyle="elevated"
                  options={[
                    { id: 'curl', label: 'cURL 导入' },
                    { id: 'json', label: 'JSON 导入' },
                    { id: 'vault', label: '导出备份' },
                  ]}
                />

                <button
                  type="button"
                  onClick={onClose}
                  className="w-6 h-6 inline-flex items-center justify-center rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--zp-text-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-3.5 text-xs">
              {statusMsg && (
                <div
                  className="px-3 py-2 rounded-[6px] border text-xs font-medium flex items-center gap-2"
                  style={{
                    backgroundColor: 'var(--zp-accent-soft)',
                    borderColor: 'var(--zp-accent)',
                    color: 'var(--zp-accent)',
                  }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{statusMsg}</span>
                </div>
              )}

              {tab === 'curl' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: 'var(--zp-text-secondary)' }}
                    >
                      cURL 命令
                    </span>
                    <CustomSelect
                      value={targetFolderId}
                      onChange={setTargetFolderId}
                      prefixLabel="保存至:"
                      align="right"
                      minWidth={190}
                      options={folders.map((f) => ({
                        value: f.id,
                        label: f.name,
                      }))}
                    />
                  </div>

                  <textarea
                    rows={6}
                    value={curlText}
                    onChange={(e) => setCurlText(e.target.value)}
                    placeholder="粘贴 cURL 命令..."
                    className="w-full p-3 rounded-[8px] border font-mono-tabular text-xs leading-relaxed focus:outline-none focus:border-[var(--zp-accent)] resize-none"
                    style={{
                      backgroundColor: 'var(--zp-bg-surface)',
                      borderColor: 'var(--zp-border-subtle)',
                      color: 'var(--zp-text-primary)',
                    }}
                  />

                  <div className="flex justify-end pt-0.5">
                    <button
                      type="button"
                      onClick={handleParseCurl}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] font-medium transition-opacity hover:opacity-90"
                      style={{
                        backgroundColor: 'var(--zp-accent)',
                        color: 'var(--zp-accent-fg)',
                      }}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>解析并打开</span>
                    </button>
                  </div>
                </div>
              )}

              {tab === 'json' && (
                <div className="space-y-3">
                  {/* Compact File Upload Strip */}
                  <div
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-[8px] border"
                    style={{
                      borderColor: 'var(--zp-border-subtle)',
                      backgroundColor: 'var(--zp-bg-surface)',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileJson
                        className="w-4 h-4 shrink-0"
                        style={{ color: 'var(--zp-accent)' }}
                      />
                      <span className="font-medium truncate">
                        从本地文件导入 (Postman v2.1 / OpenPost JSON)
                      </span>
                    </div>
                    <label
                      className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] border font-medium cursor-pointer shrink-0 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
                      style={{
                        borderColor: 'var(--zp-border-subtle)',
                        backgroundColor: 'var(--zp-bg-canvas)',
                        color: 'var(--zp-text-primary)',
                      }}
                    >
                      <Upload className="w-3 h-3" />
                      <span>选择文件</span>
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === 'string') {
                              handleImportJsonString(reader.result);
                            }
                          };
                          reader.readAsText(file);
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Paste Raw JSON */}
                  <textarea
                    rows={5}
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder="或在此直接粘贴 JSON 内容..."
                    className="w-full p-3 rounded-[8px] border font-mono-tabular text-xs leading-relaxed focus:outline-none focus:border-[var(--zp-accent)] resize-none"
                    style={{
                      backgroundColor: 'var(--zp-bg-surface)',
                      borderColor: 'var(--zp-border-subtle)',
                      color: 'var(--zp-text-primary)',
                    }}
                  />

                  <div className="flex justify-end pt-0.5">
                    <button
                      type="button"
                      onClick={() => handleImportJsonString(jsonInput)}
                      disabled={!jsonInput.trim()}
                      className="h-8 px-3.5 rounded-[6px] font-medium disabled:opacity-40 transition-opacity hover:opacity-90"
                      style={{
                        backgroundColor: 'var(--zp-accent)',
                        color: 'var(--zp-accent-fg)',
                      }}
                    >
                      解析导入
                    </button>
                  </div>
                </div>
              )}

              {tab === 'vault' && (
                <div className="space-y-2.5 py-1">
                  {/* Action Row 1: Native Workspace Vault */}
                  <div
                    className="flex items-center justify-between gap-4 p-3.5 rounded-[8px] border"
                    style={{
                      backgroundColor: 'var(--zp-bg-surface)',
                      borderColor: 'var(--zp-border-subtle)',
                    }}
                  >
                    <div className="min-w-0">
                      <div className="font-medium">OpenPost 工作区完整备份 (.json)</div>
                      <div
                        className="text-[11px] mt-0.5 font-mono-tabular"
                        style={{ color: 'var(--zp-text-muted)' }}
                      >
                        {folders.length} 个集合 · {requests.length} 个接口 · {environments.length} 套环境
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveToLocalFileSystem}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] font-medium whitespace-nowrap shrink-0 transition-opacity hover:opacity-90"
                      style={{
                        backgroundColor: 'var(--zp-accent)',
                        color: 'var(--zp-accent-fg)',
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>保存至本地</span>
                    </button>
                  </div>

                  {/* Action Row 2: Postman v2.1 Export */}
                  <div
                    className="flex items-center justify-between gap-4 p-3.5 rounded-[8px] border"
                    style={{
                      backgroundColor: 'var(--zp-bg-surface)',
                      borderColor: 'var(--zp-border-subtle)',
                    }}
                  >
                    <div className="min-w-0">
                      <div className="font-medium">Postman Collection v2.1 兼容包</div>
                      <div
                        className="text-[11px] mt-0.5"
                        style={{ color: 'var(--zp-text-muted)' }}
                      >
                        兼容 Postman、Apifox、Insomnia 导入
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportDownload}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] border font-medium whitespace-nowrap shrink-0 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
                      style={{
                        borderColor: 'var(--zp-border-subtle)',
                        backgroundColor: 'var(--zp-bg-canvas)',
                        color: 'var(--zp-text-primary)',
                      }}
                    >
                      <span>下载 .json</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
