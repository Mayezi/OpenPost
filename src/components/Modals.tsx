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
  FolderSync,
  HardDrive,
  Sliders,
  FolderOpen,
  RefreshCw,
  Sun,
  Moon,
  Sparkles,
} from 'lucide-react';
import {
  ApiRequestItem,
  CollectionFolder,
  EnvironmentProfile,
  HistoryEntry,
  HttpMethod,
  ThemePalette,
} from '../types/api';
import { KeyValueTable } from './KeyValueTable';
import { CustomSelect } from './CustomSelect';
import {
  exportWorkspaceBundle,
  parseCurlCommand,
} from '../utils/requestEngine';

export type SettingsTabId = 'themes' | 'storage' | 'network';

/* ==========================================================================
   1. UNIFIED MODERN SETTINGS & PREFERENCES CENTER MODAL
   Includes:
   - AI Themes (5 Dark + 5 Light with instant preview)
   - Custom Data Storage Directory (avoid occupying default system disk)
   - Network & Local Proxy Engine Preferences
   - Multi-Platform Packaging (Win / macOS / Linux) & Security Audit
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
  initialTab = 'themes',
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
  const [themeModeFilter, setThemeModeFilter] = useState<'all' | 'dark' | 'light'>('all');

  // Storage directory state
  const [pathInput, setPathInput] = useState(customStoragePath);
  const [suggestedPaths, setSuggestedPaths] = useState<string[]>([
    'D:\\openPost_Data\\Vault',
    'E:\\DevWorkspace\\openPost_Vault',
    '/Volumes/ExternalSSD/openPost_Vault',
    '/mnt/data/openpost_vault',
  ]);
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

  // Network settings
  const [timeoutMs, setTimeoutMs] = useState(
    () => localStorage.getItem('openpost_timeout_ms') || '30000'
  );
  const [verifySsl, setVerifySsl] = useState(
    () => localStorage.getItem('openpost_verify_ssl') !== 'false'
  );
  const [maxHistoryItems, setMaxHistoryItems] = useState(
    () => localStorage.getItem('openpost_max_history') || '100'
  );

  const persistNetworkConfig = (
    nextTimeout: string,
    nextMaxHist: string,
    nextVerifySsl: boolean
  ) => {
    localStorage.setItem('openpost_timeout_ms', nextTimeout);
    localStorage.setItem('openpost_max_history', nextMaxHist);
    localStorage.setItem('openpost_verify_ssl', String(nextVerifySsl));
    fetch('/api/storage/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storageDir: pathInput.trim() || customStoragePath,
        autoSyncToDisk,
        maxHistoryItems: Number(nextMaxHist) || 100,
        requestTimeoutMs: Number(nextTimeout) || 30000,
        verifySsl: nextVerifySsl,
        migrateExisting: false,
        cleanOldDir: false,
      }),
    }).catch(() => {});
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      fetch('/api/storage/config')
        .then((r) => r.json())
        .then((data) => {
          if (data.ok && data.config) {
            if (!customStoragePath) {
              setPathInput(data.config.storageDir);
              onChangeCustomStoragePath(data.config.storageDir);
            }
            setAutoSyncToDisk(data.config.autoSyncToDisk ?? true);
            setTimeoutMs(String(data.config.requestTimeoutMs || 30000));
            setVerifySsl(data.config.verifySsl ?? true);
            setMaxHistoryItems(String(data.config.maxHistoryItems || 100));
            if (data.stats) setDiskStats(data.stats);
            if (Array.isArray(data.suggestedPaths)) setSuggestedPaths(data.suggestedPaths);
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
        // Immediately sync current workspace to the new directory
        const syncRes = await fetch('/api/storage/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folders, requests, environments, history }),
        });
        const syncData = await syncRes.json();
        if (syncData.stats) setDiskStats(syncData.stats);
        setStorageStatusMsg({
          ok: true,
          text: `已将本地数据目录切换至 ${finalDisplay}${
            cleanOldDir ? '，并已清理原默认磁盘缓存' : ''
          }。`,
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
          text: `已成功授权并直接写入您选择的本地磁盘目录「${dirHandle.name}」！`,
        });
      } else {
        setStorageStatusMsg({
          ok: false,
          text: '当前运行环境不支持直接唤起原生目录选择器，请在上方输入框直接填写目标盘符路径（如 D:\\openPost_Data）并点击应用。',
        });
      }
    } catch {
      // User cancelled picker
    }
  };

  const filteredThemes = themes.filter((t) =>
    themeModeFilter === 'all' ? true : t.mode === themeModeFilter
  );

  const navItems: Array<{ id: SettingsTabId; label: string; sub: string; icon: React.ReactNode }> = [
    {
      id: 'themes',
      label: '主题与外观',
      sub: '10 款深浅 AI 配色',
      icon: <Palette className="w-4 h-4" />,
    },
    {
      id: 'storage',
      label: '数据存储目录',
      sub: '自定义盘符与迁移',
      icon: <HardDrive className="w-4 h-4" />,
    },
    {
      id: 'network',
      label: '代理与引擎',
      sub: '无跨域与超时策略',
      icon: <Sliders className="w-4 h-4" />,
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl rounded-2xl border overflow-hidden flex flex-col h-[82vh] zp-popover-shadow"
            style={{
              backgroundColor: 'var(--zp-bg-canvas)',
              borderColor: 'var(--zp-border)',
              color: 'var(--zp-text-primary)',
            }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b shrink-0"
              style={{
                borderColor: 'var(--zp-border)',
                backgroundColor: 'var(--zp-bg-surface)',
              }}
            >
              <div>
                <h2 className="text-base font-semibold font-display tracking-tight">
                  偏好设置与系统工作台 (Preferences)
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--zp-text-muted)' }}>
                  管理 AI 视觉主题、自定义非系统盘数据存储目录与本地网络引擎
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:opacity-80 transition-colors"
                style={{
                  backgroundColor: 'var(--zp-bg-elevated)',
                  color: 'var(--zp-text-secondary)',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body: Left Rail + Right Content */}
            <div className="flex-1 flex min-h-0">
              {/* Left Settings Rail */}
              <div
                className="w-56 border-r p-3 space-y-1 shrink-0"
                style={{
                  borderColor: 'var(--zp-border)',
                  backgroundColor: 'var(--zp-bg-surface)',
                }}
              >
                {navItems.map((item) => {
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className="relative w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-colors"
                      style={{
                        color: active ? 'var(--zp-text-primary)' : 'var(--zp-text-secondary)',
                      }}
                    >
                      {active && (
                        <motion.div
                          layoutId="settings-active-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          className="absolute inset-0 rounded-xl border"
                          style={{
                            backgroundColor: 'var(--zp-bg-elevated)',
                            borderColor: 'var(--zp-border)',
                          }}
                        />
                      )}
                      <span
                        className="relative z-10 shrink-0"
                        style={{ color: active ? 'var(--zp-accent)' : 'var(--zp-text-muted)' }}
                      >
                        {item.icon}
                      </span>
                      <div className="relative z-10 min-w-0">
                        <div className="font-semibold truncate">{item.label}</div>
                        <div
                          className="text-[11px] truncate mt-0.5"
                          style={{ color: 'var(--zp-text-muted)' }}
                        >
                          {item.sub}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right Content Area */}
              <div className="flex-1 overflow-y-auto p-6">
                <AnimatePresence mode="wait">
                  {/* TAB 1: THEMES (5 DARK + 5 LIGHT) */}
                  {activeTab === 'themes' && (
                    <motion.div
                      key="tab-themes"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}
                      className="space-y-5"
                    >
                      {/* Font Size & UI Scale Card */}
                      <div
                        className="p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4"
                        style={{
                          backgroundColor: 'var(--zp-bg-surface)',
                          borderColor: 'var(--zp-border)',
                        }}
                      >
                        <div>
                          <h3 className="text-sm font-semibold font-display">
                            全局字体大小与界面缩放 (Typography & Scale)
                          </h3>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--zp-text-secondary)' }}>
                            同步调节菜单、表格、输入框及 JSON 代码阅读区的字号大小
                          </p>
                        </div>

                        <div
                          className="flex items-center gap-1 p-1 rounded-xl border text-xs"
                          style={{
                            backgroundColor: 'var(--zp-bg-canvas)',
                            borderColor: 'var(--zp-border)',
                          }}
                        >
                          {(
                            [
                              { id: 'compact', label: '紧凑 (13px)' },
                              { id: 'default', label: '标准 (15px · 默认)' },
                              { id: 'comfortable', label: '舒适 (16px)' },
                              { id: 'large', label: '大字号 (17.5px)' },
                            ] as const
                          ).map((sz) => {
                            const active = fontSizeScale === sz.id;
                            return (
                              <button
                                key={sz.id}
                                type="button"
                                onClick={() => onChangeFontSizeScale(sz.id)}
                                className="px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0"
                                style={{
                                  backgroundColor: active ? 'var(--zp-accent)' : 'transparent',
                                  color: active ? 'var(--zp-accent-fg)' : 'var(--zp-text-secondary)',
                                }}
                              >
                                {sz.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold font-display">
                            主流 AI 工具与现代 IDE 主题库
                          </h3>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--zp-text-secondary)' }}>
                            包含 5 款经典深色主题与 5 款高对比度浅色日间主题（Claude、GitHub、ChatGPT、DeepSeek、Linear）
                          </p>
                        </div>

                        {/* Mode Filter Segmented Control */}
                        <div
                          className="flex items-center gap-1 p-1 rounded-xl border text-xs"
                          style={{
                            backgroundColor: 'var(--zp-bg-surface)',
                            borderColor: 'var(--zp-border)',
                          }}
                        >
                          {(
                            [
                              { id: 'all', label: '全部 (10)', icon: <Sparkles className="w-3.5 h-3.5" /> },
                              { id: 'light', label: '浅色 Light (5)', icon: <Sun className="w-3.5 h-3.5" /> },
                              { id: 'dark', label: '深色 Dark (5)', icon: <Moon className="w-3.5 h-3.5" /> },
                            ] as const
                          ).map((f) => {
                            const active = themeModeFilter === f.id;
                            return (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => setThemeModeFilter(f.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0"
                                style={{
                                  backgroundColor: active ? 'var(--zp-accent)' : 'transparent',
                                  color: active ? 'var(--zp-accent-fg)' : 'var(--zp-text-secondary)',
                                }}
                              >
                                {f.icon}
                                <span>{f.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {filteredThemes.map((theme) => {
                          const isSelected = theme.id === activeThemeId;
                          return (
                            <button
                              key={theme.id}
                              type="button"
                              onClick={() => onSelectTheme(theme.id)}
                              className="text-left p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 group hover:scale-[1.01]"
                              style={{
                                backgroundColor: theme.colors.bgSurface,
                                borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                                color: theme.colors.textPrimary,
                                boxShadow: isSelected
                                  ? `0 0 0 1px ${theme.colors.accent}`
                                  : 'none',
                              }}
                            >
                              <div className="flex items-start justify-between gap-2 w-full">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold font-display">
                                      {theme.name}
                                    </span>
                                    <span
                                      className="text-xs"
                                      style={{ color: theme.colors.textMuted }}
                                    >
                                      · {theme.brand}
                                    </span>
                                  </div>
                                  <p
                                    className="text-xs mt-1 leading-relaxed"
                                    style={{ color: theme.colors.textSecondary }}
                                  >
                                    {theme.description}
                                  </p>
                                </div>
                                <div
                                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 border"
                                  style={{
                                    borderColor: isSelected
                                      ? theme.colors.accent
                                      : theme.colors.border,
                                    backgroundColor: isSelected
                                      ? theme.colors.accent
                                      : 'transparent',
                                    color: theme.colors.accentFg,
                                  }}
                                >
                                  {isSelected && <Check className="w-3 h-3" />}
                                </div>
                              </div>

                              <div
                                className="flex items-center justify-between pt-2.5 border-t"
                                style={{ borderColor: theme.colors.borderSubtle }}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-5 h-5 rounded-md border"
                                    style={{
                                      backgroundColor: theme.colors.bgCanvas,
                                      borderColor: theme.colors.border,
                                    }}
                                    title={`画布: ${theme.colors.bgCanvas}`}
                                  />
                                  <span
                                    className="w-5 h-5 rounded-md border"
                                    style={{
                                      backgroundColor: theme.colors.bgElevated,
                                      borderColor: theme.colors.border,
                                    }}
                                    title={`浮层: ${theme.colors.bgElevated}`}
                                  />
                                  <span
                                    className="w-5 h-5 rounded-md border"
                                    style={{
                                      backgroundColor: theme.colors.accent,
                                      borderColor: theme.colors.border,
                                    }}
                                    title={`强调色: ${theme.colors.accent}`}
                                  />
                                  <span
                                    className="w-5 h-5 rounded-md border"
                                    style={{
                                      backgroundColor: theme.colors.codeBg,
                                      borderColor: theme.colors.border,
                                    }}
                                    title={`代码区: ${theme.colors.codeBg}`}
                                  />
                                </div>
                                <span
                                  className="font-mono-tabular text-xs font-medium"
                                  style={{ color: theme.colors.accent }}
                                >
                                  {theme.mode === 'light' ? 'Light 浅色' : 'Dark 深色'} · {theme.colors.accent}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 2: CUSTOM DATA STORAGE DIRECTORY */}
                  {activeTab === 'storage' && (
                    <motion.div
                      key="tab-storage"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}
                      className="space-y-5 text-xs"
                    >
                      <div>
                        <h3 className="text-sm font-semibold font-display">
                          自定义本地数据存储目录 (避免占用默认系统盘 C 盘)
                        </h3>
                        <p className="mt-1 leading-relaxed" style={{ color: 'var(--zp-text-secondary)' }}>
                          传统工具强制将上百 MB 的缓存、日志与集合塞入系统盘（如 Windows 的 <code className="font-mono-tabular">C:\Users\AppData</code>）。openPost 允许您将所有集合、环境变量与请求历史指向任意非系统盘（如 <code className="font-mono-tabular">D:\</code>、<code className="font-mono-tabular">E:\</code> 或外置硬盘），并支持一键迁移清理原目录。
                        </p>
                      </div>

                      {storageStatusMsg && (
                        <div
                          className={`p-3.5 rounded-xl border font-medium flex items-center gap-2 ${
                            storageStatusMsg.ok
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                              : 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>{storageStatusMsg.text}</span>
                        </div>
                      )}

                      {/* Current Disk Directory Card */}
                      <div
                        className="p-4 rounded-xl border space-y-4"
                        style={{
                          backgroundColor: 'var(--zp-bg-surface)',
                          borderColor: 'var(--zp-border)',
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-semibold text-sm">当前工作区数据落盘路径</span>
                            <p className="font-mono-tabular mt-0.5" style={{ color: 'var(--zp-accent)' }}>
                              {customStoragePath || './openpost_vault'}
                            </p>
                          </div>
                          <div className="text-right font-mono-tabular" style={{ color: 'var(--zp-text-secondary)' }}>
                            <div>磁盘占用: {(diskStats.totalBytes / 1024).toFixed(2)} KB</div>
                            <div className="text-[11px]" style={{ color: 'var(--zp-text-muted)' }}>
                              包含 {diskStats.fileCount} 个纯明文 JSON 数据文件
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--zp-border-subtle)' }}>
                          <label className="block font-medium" style={{ color: 'var(--zp-text-secondary)' }}>
                            设置新的自定义存储目录路径（支持 Windows 盘符路径、macOS 外置卷或 Linux 挂载点）：
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={pathInput}
                              onChange={(e) => setPathInput(e.target.value)}
                              placeholder="例如: D:\openPost_Data\Vault 或 /Volumes/SSD/openPost_Vault"
                              className="flex-1 px-3 py-2 rounded-lg border font-mono-tabular text-xs focus:outline-none"
                              style={{
                                backgroundColor: 'var(--zp-bg-input)',
                                borderColor: 'var(--zp-border)',
                                color: 'var(--zp-text-primary)',
                              }}
                            />
                            <button
                              type="button"
                              onClick={handleNativeFolderPicker}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border font-medium whitespace-nowrap shrink-0 hover:opacity-85"
                              style={{
                                borderColor: 'var(--zp-border)',
                                backgroundColor: 'var(--zp-bg-elevated)',
                                color: 'var(--zp-text-primary)',
                              }}
                              title="调用系统原生文件夹选择器挂载本地目录"
                            >
                              <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--zp-accent)' }} />
                              <span>浏览选择本地文件夹...</span>
                            </button>
                          </div>

                          {/* Quick Non-System Disk Presets */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span style={{ color: 'var(--zp-text-muted)' }}>常用非系统盘快速填入:</span>
                            {suggestedPaths.map((sp) => (
                              <button
                                key={sp}
                                type="button"
                                onClick={() => setPathInput(sp)}
                                className="px-2 py-0.5 rounded border font-mono-tabular text-[11px] transition-colors hover:opacity-85"
                                style={{
                                  borderColor: 'var(--zp-border)',
                                  backgroundColor: 'var(--zp-bg-canvas)',
                                  color: 'var(--zp-text-secondary)',
                                }}
                              >
                                {sp}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Migration Options */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                          <label
                            className="flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer"
                            style={{
                              borderColor: 'var(--zp-border-subtle)',
                              backgroundColor: 'var(--zp-bg-canvas)',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={migrateExisting}
                              onChange={(e) => setMigrateExisting(e.target.checked)}
                              className="accent-current"
                            />
                            <span>自动迁移现有接口与环境变量</span>
                          </label>

                          <label
                            className="flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer"
                            style={{
                              borderColor: 'var(--zp-border-subtle)',
                              backgroundColor: 'var(--zp-bg-canvas)',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={cleanOldDir}
                              onChange={(e) => setCleanOldDir(e.target.checked)}
                              className="accent-current"
                            />
                            <span>迁移后清理原默认磁盘目录文件</span>
                          </label>

                          <label
                            className="flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer"
                            style={{
                              borderColor: 'var(--zp-border-subtle)',
                              backgroundColor: 'var(--zp-bg-canvas)',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={autoSyncToDisk}
                              onChange={(e) => setAutoSyncToDisk(e.target.checked)}
                              className="accent-current"
                            />
                            <span>修改集合时实时落盘同步 (.json)</span>
                          </label>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                          <button
                            type="button"
                            onClick={handleApplyStorageDir}
                            disabled={syncingDisk}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
                            style={{
                              backgroundColor: 'var(--zp-accent)',
                              color: 'var(--zp-accent-fg)',
                            }}
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${syncingDisk ? 'animate-spin' : ''}`} />
                            <span>
                              {syncingDisk ? '正在迁移并同步磁盘...' : '应用新存储目录并立即迁移'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 3: NETWORK & ENGINE SETTINGS */}
                  {activeTab === 'network' && (
                    <motion.div
                      key="tab-network"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}
                      className="space-y-5 text-xs"
                    >
                      <div>
                        <h3 className="text-sm font-semibold font-display">
                          请求执行引擎与网络参数配置
                        </h3>
                        <p className="mt-1" style={{ color: 'var(--zp-text-secondary)' }}>
                          配置默认请求发送方式、超时阈值及历史记录保留上限
                        </p>
                      </div>

                      <div
                        className="p-4 rounded-xl border space-y-4"
                        style={{
                          backgroundColor: 'var(--zp-bg-surface)',
                          borderColor: 'var(--zp-border)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="font-semibold">默认 HTTP 执行引擎</div>
                            <p className="mt-0.5" style={{ color: 'var(--zp-text-muted)' }}>
                              「本地代理引擎」由本地 Node 进程直接发包，彻底绕过浏览器 CORS 跨域限制并支持自定义受限 Header
                            </p>
                          </div>
                          <CustomSelect
                            value={engineMode}
                            onChange={(v) =>
                              onChangeEngineMode(v as 'local-proxy' | 'browser-direct')
                            }
                            minWidth={210}
                            align="right"
                            options={[
                              {
                                value: 'local-proxy',
                                label: '本地无跨域代理 (Local Proxy)',
                                sublabel: '推荐：无 CORS 限制，支持任意请求头',
                                colorDot: '#10B981',
                              },
                              {
                                value: 'browser-direct',
                                label: '浏览器原生直连 (Browser Fetch)',
                                sublabel: '受限于目标服务端 CORS 策略',
                                colorDot: '#3B82F6',
                              },
                            ]}
                          />
                        </div>

                        <div
                          className="flex items-center justify-between gap-4 pt-3 border-t"
                          style={{ borderColor: 'var(--zp-border-subtle)' }}
                        >
                          <div>
                            <div className="font-semibold">请求超时阈值 (Request Timeout)</div>
                            <p className="mt-0.5" style={{ color: 'var(--zp-text-muted)' }}>
                              超过该时间未响应将自动中断连接
                            </p>
                          </div>
                          <CustomSelect
                            value={timeoutMs}
                            onChange={(val) => {
                              setTimeoutMs(val);
                              persistNetworkConfig(val, maxHistoryItems, verifySsl);
                            }}
                            minWidth={160}
                            align="right"
                            options={[
                              { value: '5000', label: '5,000 ms (5 秒)' },
                              { value: '15000', label: '15,000 ms (15 秒)' },
                              { value: '30000', label: '30,000 ms (30 秒 · 默认)' },
                              { value: '60000', label: '60,000 ms (60 秒)' },
                            ]}
                          />
                        </div>

                        <div
                          className="flex items-center justify-between gap-4 pt-3 border-t"
                          style={{ borderColor: 'var(--zp-border-subtle)' }}
                        >
                          <div>
                            <div className="font-semibold">本地历史记录保留条数</div>
                            <p className="mt-0.5" style={{ color: 'var(--zp-text-muted)' }}>
                              限制历史记录体积，防止磁盘无限膨胀
                            </p>
                          </div>
                          <CustomSelect
                            value={maxHistoryItems}
                            onChange={(val) => {
                              setMaxHistoryItems(val);
                              persistNetworkConfig(timeoutMs, val, verifySsl);
                            }}
                            minWidth={160}
                            align="right"
                            options={[
                              { value: '30', label: '最多 30 条记录' },
                              { value: '60', label: '最多 60 条记录' },
                              { value: '100', label: '最多 100 条记录' },
                              { value: '300', label: '最多 300 条记录' },
                            ]}
                          />
                        </div>

                        <div
                          className="flex items-center justify-between gap-4 pt-3 border-t"
                          style={{ borderColor: 'var(--zp-border-subtle)' }}
                        >
                          <div>
                            <div className="font-semibold">SSL 证书严格校验 (Verify SSL Certificates)</div>
                            <p className="mt-0.5" style={{ color: 'var(--zp-text-muted)' }}>
                              调试自签名本地 HTTPS 服务时可关闭此选项
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const next = !verifySsl;
                              setVerifySsl(next);
                              persistNetworkConfig(timeoutMs, maxHistoryItems, next);
                            }}
                            className="px-3 py-1.5 rounded-lg border font-medium transition-colors"
                            style={{
                              backgroundColor: verifySsl ? 'var(--zp-accent-soft)' : 'var(--zp-bg-canvas)',
                              borderColor: verifySsl ? 'var(--zp-accent)' : 'var(--zp-border)',
                              color: verifySsl ? 'var(--zp-accent)' : 'var(--zp-text-secondary)',
                            }}
                          >
                            {verifySsl ? '已开启校验' : '已忽略自签名证书'}
                          </button>
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
   2. ENVIRONMENT VARIABLES MANAGER MODAL (WITH SMOOTH MOTION)
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
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl rounded-2xl border overflow-hidden flex flex-col h-[78vh] zp-popover-shadow"
            style={{
              backgroundColor: 'var(--zp-bg-canvas)',
              borderColor: 'var(--zp-border)',
              color: 'var(--zp-text-primary)',
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-3.5 border-b"
              style={{ borderColor: 'var(--zp-border)', backgroundColor: 'var(--zp-bg-surface)' }}
            >
              <div>
                <h2 className="text-sm font-semibold font-display">
                  本地环境变量管理 (Environment Vault)
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--zp-text-muted)' }}>
                  在 URL、请求头、认证或 Body 中使用 <code className="font-mono-tabular">{'{{变量名}}'}</code> 即可动态注入；所有密钥仅保存在本地。
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:opacity-80"
                style={{ backgroundColor: 'var(--zp-bg-elevated)', color: 'var(--zp-text-secondary)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 flex min-h-0">
              <div
                className="w-60 border-r flex flex-col justify-between p-3"
                style={{ borderColor: 'var(--zp-border)', backgroundColor: 'var(--zp-bg-surface)' }}
              >
                <div className="space-y-1 overflow-y-auto">
                  {environments.map((env) => {
                    const isSelected = env.id === currentEnv?.id;
                    const isActive = env.id === activeEnvId;
                    return (
                      <div
                        key={env.id}
                        className="flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors"
                        style={{
                          backgroundColor: isSelected ? 'var(--zp-bg-elevated)' : 'transparent',
                          color: isSelected ? 'var(--zp-text-primary)' : 'var(--zp-text-secondary)',
                        }}
                        onClick={() => setSelectedId(env.id)}
                      >
                        <div className="truncate flex items-center gap-1.5">
                          <span className="truncate font-medium">{env.name}</span>
                          {isActive && (
                            <span className="text-[11px]" style={{ color: 'var(--zp-accent)' }}>
                              · 当前使用
                            </span>
                          )}
                        </div>
                        {environments.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteEnv(env.id);
                            }}
                            className="p-1 hover:text-rose-500"
                            style={{ color: 'var(--zp-text-muted)' }}
                            title="删除环境"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--zp-border-subtle)' }}>
                  <input
                    type="text"
                    value={newEnvName}
                    onChange={(e) => setNewEnvName(e.target.value)}
                    placeholder="新环境名称 (如 Staging)"
                    className="w-full px-3 py-1.5 rounded-lg border text-xs focus:outline-none"
                    style={{
                      backgroundColor: 'var(--zp-bg-input)',
                      borderColor: 'var(--zp-border)',
                      color: 'var(--zp-text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCreateEnv}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                    style={{
                      backgroundColor: 'var(--zp-accent)',
                      color: 'var(--zp-accent-fg)',
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新建环境配置</span>
                  </button>
                </div>
              </div>

              {currentEnv && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div
                    className="flex items-center justify-between px-4 py-2.5 border-b text-xs"
                    style={{ borderColor: 'var(--zp-border-subtle)' }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm">{currentEnv.name}</span>
                      {currentEnv.id !== activeEnvId && (
                        <button
                          type="button"
                          onClick={() => onSelectEnv(currentEnv.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
                          style={{
                            backgroundColor: 'var(--zp-accent-soft)',
                            color: 'var(--zp-accent)',
                          }}
                        >
                          设为当前激活环境
                        </button>
                      )}
                    </div>
                    <span className="font-mono-tabular" style={{ color: 'var(--zp-text-muted)' }}>
                      内置动态变量: {'{{$timestamp}}'} · {'{{$guid}}'} · {'{{$randomInt}}'}
                    </span>
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
                      keyPlaceholder="变量名 (如 baseUrl 或 auth_token)"
                      valuePlaceholder="变量值 (如 https://api.example.com)"
                      descriptionPlaceholder="变量用途说明"
                    />
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

/* ==========================================================================
   3. CURL / POSTMAN IMPORT & LOCAL FILE VAULT MODAL
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
    `curl -X POST 'https://httpbin.org/post?source=curl_import' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer zp_local_token_99' \\\n  -d '{"service": "openPost-Desktop", "localFirst": true, "message": "Real HTTP Request"}'`
  );
  const [targetFolderId, setTargetFolderId] = useState(folders[0]?.id || 'folder_local_sandbox');
  const [jsonInput, setJsonInput] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

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
    setStatusMsg('已成功导出 Postman v2.1 兼容的本地工作区 JSON 文件。');
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
          suggestedName: 'openpost-local-vault.json',
          types: [
            {
              description: 'openPost / Postman JSON Vault',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(bundle);
        await writable.close();
        setStatusMsg('已通过本地文件系统直接写入磁盘文件！');
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
        setStatusMsg('已完整恢复 openPost 本地工作区数据！');
        setTimeout(() => onClose(), 700);
        return;
      }

      if (Array.isArray(parsed.item)) {
        const newFolders: CollectionFolder[] = [...folders];
        const newRequests: ApiRequestItem[] = [...requests];
        const importedFolderId = `folder_pm_${Date.now()}`;
        newFolders.push({
          id: importedFolderId,
          name: parsed.info?.name || 'Postman 导入集合',
          description: parsed.info?.description || '从 Postman v2.1 JSON 导入',
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
        setStatusMsg('成功解析并导入 Postman Collection v2.1 集合！');
        setTimeout(() => onClose(), 700);
        return;
      }

      setStatusMsg('未能识别该 JSON 结构，请确认是 Postman v2.1 或 openPost 导出文件。');
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
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border overflow-hidden flex flex-col max-h-[85vh] zp-popover-shadow"
            style={{
              backgroundColor: 'var(--zp-bg-canvas)',
              borderColor: 'var(--zp-border)',
              color: 'var(--zp-text-primary)',
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-3.5 border-b"
              style={{ borderColor: 'var(--zp-border)', backgroundColor: 'var(--zp-bg-surface)' }}
            >
              <div className="flex items-center gap-2">
                <FolderSync className="w-4 h-4" style={{ color: 'var(--zp-accent)' }} />
                <h2 className="text-sm font-semibold font-display">
                  cURL 解析 / Postman 导入导出 / 本地磁盘直存
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:opacity-80"
                style={{ backgroundColor: 'var(--zp-bg-elevated)', color: 'var(--zp-text-secondary)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              className="flex items-center gap-2 px-5 py-2.5 border-b text-xs"
              style={{ borderColor: 'var(--zp-border-subtle)', backgroundColor: 'var(--zp-bg-surface)' }}
            >
              {(
                [
                  { id: 'curl', label: '粘贴 cURL 命令导入' },
                  { id: 'json', label: '导入 Postman v2.1 / JSON' },
                  { id: 'vault', label: '导出备份与离线落盘' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className="px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: tab === item.id ? 'var(--zp-accent)' : 'transparent',
                    color: tab === item.id ? 'var(--zp-accent-fg)' : 'var(--zp-text-secondary)',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {statusMsg && (
                <div
                  className="p-3 rounded-xl border font-medium"
                  style={{
                    backgroundColor: 'var(--zp-accent-soft)',
                    borderColor: 'var(--zp-accent)',
                    color: 'var(--zp-accent)',
                  }}
                >
                  {statusMsg}
                </div>
              )}

              {tab === 'curl' && (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <label className="font-medium" style={{ color: 'var(--zp-text-secondary)' }}>
                      粘贴任意终端 / 浏览器 DevTools 复制的 cURL 命令：
                    </label>
                    <CustomSelect
                      value={targetFolderId}
                      onChange={setTargetFolderId}
                      prefixLabel="保存至:"
                      align="right"
                      minWidth={210}
                      options={folders.map((f) => ({
                        value: f.id,
                        label: f.name,
                      }))}
                    />
                  </div>
                  <textarea
                    rows={7}
                    value={curlText}
                    onChange={(e) => setCurlText(e.target.value)}
                    className="w-full p-3.5 rounded-xl border font-mono-tabular text-xs focus:outline-none"
                    style={{
                      backgroundColor: 'var(--zp-bg-input)',
                      borderColor: 'var(--zp-border)',
                      color: 'var(--zp-text-primary)',
                    }}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleParseCurl}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0"
                      style={{
                        backgroundColor: 'var(--zp-accent)',
                        color: 'var(--zp-accent-fg)',
                      }}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>立即解析并打开请求</span>
                    </button>
                  </div>
                </>
              )}

              {tab === 'json' && (
                <div className="space-y-4">
                  <div
                    className="p-5 rounded-xl border border-dashed text-center"
                    style={{
                      borderColor: 'var(--zp-border)',
                      backgroundColor: 'var(--zp-bg-surface)',
                    }}
                  >
                    <Upload className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--zp-accent)' }} />
                    <p className="font-medium mb-1">
                      选择本地 Postman Collection v2.1 或 openPost JSON 文件
                    </p>
                    <p className="mb-3" style={{ color: 'var(--zp-text-muted)' }}>
                      完全在本地内存中解析，不经过任何外部服务器
                    </p>
                    <label
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-medium cursor-pointer"
                      style={{
                        backgroundColor: 'var(--zp-accent)',
                        color: 'var(--zp-accent-fg)',
                      }}
                    >
                      <span>选择本地 .json 文件</span>
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

                  <div className="space-y-2">
                    <label className="font-medium block" style={{ color: 'var(--zp-text-secondary)' }}>
                      或者直接粘贴 JSON 内容导入：
                    </label>
                    <textarea
                      rows={5}
                      value={jsonInput}
                      onChange={(e) => setJsonInput(e.target.value)}
                      placeholder='{"info": {"name": "My Collection"}, "item": [...]}'
                      className="w-full p-3 rounded-xl border font-mono-tabular text-xs focus:outline-none"
                      style={{
                        backgroundColor: 'var(--zp-bg-input)',
                        borderColor: 'var(--zp-border)',
                        color: 'var(--zp-text-primary)',
                      }}
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleImportJsonString(jsonInput)}
                        disabled={!jsonInput.trim()}
                        className="px-4 py-1.5 rounded-lg font-medium disabled:opacity-40 whitespace-nowrap shrink-0"
                        style={{
                          backgroundColor: 'var(--zp-accent)',
                          color: 'var(--zp-accent-fg)',
                        }}
                      >
                        解析导入 JSON
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'vault' && (
                <div
                  className="p-4 rounded-xl border space-y-3"
                  style={{
                    backgroundColor: 'var(--zp-bg-surface)',
                    borderColor: 'var(--zp-border)',
                  }}
                >
                  <h3 className="font-semibold text-sm">
                    纯本地 JSON 仓库存储 (Git 友好 & 零云端锁定)
                  </h3>
                  <p className="leading-relaxed" style={{ color: 'var(--zp-text-secondary)' }}>
                    openPost 将全部集合（{folders.length} 个目录，{requests.length} 个接口）与环境变量（{environments.length} 套环境）保存在本地，支持直接导出为标准 JSON 文件纳入本地 Git 仓库管理。
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveToLocalFileSystem}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium whitespace-nowrap shrink-0"
                      style={{
                        backgroundColor: 'var(--zp-accent)',
                        color: 'var(--zp-accent-fg)',
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>直接落盘保存至本地硬盘 (.json)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportDownload}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border font-medium whitespace-nowrap shrink-0"
                      style={{
                        borderColor: 'var(--zp-border)',
                        color: 'var(--zp-text-primary)',
                      }}
                    >
                      <span>下载 Postman v2.1 兼容包</span>
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
