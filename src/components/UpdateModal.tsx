import React, { useMemo, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  X,
  Sparkles,
  TrendingUp,
  Wrench,
  Download,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Tag,
  Calendar,
  ArrowRight,
  Settings,
  Package,
} from 'lucide-react';
import {
  ReleaseAsset,
  ReleaseVersionEntry,
  StructuredChangelog,
  UpdateCheckResult,
} from '../types/api';
import { SegmentedControl } from './UiControls';
import {
  compareSemver,
  detectClientPlatform,
  formatBytesCompact,
  formatReleaseDate,
  getLocalChangelogs,
  normalizeVersion,
} from '../utils/updateEngine';

interface UpdateModalProps {
  isOpen: boolean;
  initialMode?: 'release' | 'history';
  onClose: () => void;
  currentVersion: string;
  githubRepo: string;
  checking: boolean;
  updateResult: UpdateCheckResult | null;
  onCheckNow: () => void;
  onSkipVersion: (version: string) => void;
  onOpenUpdateSettings: () => void;
}

const PLATFORM_LABELS: Record<'windows' | 'macos' | 'linux' | 'other', string> = {
  windows: 'Windows 安装包',
  macos: 'macOS 安装包',
  linux: 'Linux 安装包',
  other: '发行包',
};

const ChangelogSectionsView: React.FC<{
  changelog: StructuredChangelog;
  emptyFallback?: string;
}> = ({ changelog, emptyFallback = '该版本未填写详细变更记录。' }) => {
  const allSections: Array<{
    key: keyof StructuredChangelog;
    title: string;
    icon: React.ReactNode;
    accentColor: string;
    items: string[];
  }> = [
    {
      key: 'features',
      title: '新功能',
      icon: <Sparkles className="w-3.5 h-3.5" />,
      accentColor: '#10B981',
      items: changelog.features,
    },
    {
      key: 'improvements',
      title: '改进',
      icon: <TrendingUp className="w-3.5 h-3.5" />,
      accentColor: '#3B82F6',
      items: changelog.improvements,
    },
    {
      key: 'fixes',
      title: '问题修复',
      icon: <Wrench className="w-3.5 h-3.5" />,
      accentColor: '#F59E0B',
      items: changelog.fixes,
    },
  ];
  const sections = allSections.filter((sec) => sec.items.length > 0);

  if (sections.length === 0) {
    return (
      <div
        className="py-6 text-center text-xs rounded-[8px] border border-dashed"
        style={{
          borderColor: 'var(--zp-border)',
          color: 'var(--zp-text-muted)',
        }}
      >
        {emptyFallback}
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {sections.map((sec) => (
        <div
          key={sec.key}
          className="rounded-[8px] border p-3.5"
          style={{
            backgroundColor: 'var(--zp-bg-surface)',
            borderColor: 'var(--zp-border-subtle)',
          }}
        >
          <div className="flex items-center gap-1.5 mb-2.5">
            <span
              className="inline-flex items-center justify-center shrink-0"
              style={{ color: sec.accentColor }}
            >
              {sec.icon}
            </span>
            <span className="text-xs font-semibold tracking-tight">{sec.title}</span>
          </div>
          <ul className="space-y-1.5 pl-1">
            {sec.items.map((item, idx) => (
              <li
                key={`${sec.key}-${idx}`}
                className="flex items-start gap-2 text-xs leading-relaxed select-text"
                style={{ color: 'var(--zp-text-secondary)' }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full mt-[7px] shrink-0"
                  style={{ backgroundColor: sec.accentColor, opacity: 0.85 }}
                />
                <span className="flex-1 break-words">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export const UpdateNotificationModal: React.FC<UpdateModalProps> = ({
  isOpen,
  initialMode = 'release',
  onClose,
  currentVersion,
  githubRepo,
  checking,
  updateResult,
  onCheckNow,
  onSkipVersion,
  onOpenUpdateSettings,
}) => {
  const [viewMode, setViewMode] = useState<'release' | 'history'>(initialMode);
  const clientPlatform = useMemo(() => detectClientPlatform(), []);
  const localChangelogs = useMemo(() => getLocalChangelogs(), []);

  // Merge remote GitHub releases and local changelogs directory entries (deduplicated by version)
  const mergedHistory = useMemo<ReleaseVersionEntry[]>(() => {
    const byVersion = new Map<string, ReleaseVersionEntry>();
    for (const localItem of localChangelogs) {
      byVersion.set(normalizeVersion(localItem.version), localItem);
    }
    if (updateResult?.ok && Array.isArray(updateResult.releases)) {
      for (const remoteItem of updateResult.releases) {
        const key = normalizeVersion(remoteItem.version);
        const existing = byVersion.get(key);
        const hasRemoteBody =
          remoteItem.changelog.features.length > 0 ||
          remoteItem.changelog.improvements.length > 0 ||
          remoteItem.changelog.fixes.length > 0;
        byVersion.set(key, {
          ...remoteItem,
          changelog: hasRemoteBody
            ? remoteItem.changelog
            : existing?.changelog || remoteItem.changelog,
          rawBody: remoteItem.rawBody || existing?.rawBody || '',
          publishedAt: remoteItem.publishedAt || existing?.publishedAt || '',
        });
      }
    }
    return Array.from(byVersion.values()).sort((a, b) => compareSemver(b.version, a.version));
  }, [localChangelogs, updateResult]);

  // All newer releases between currentVersion and latestVersion (for cumulative visibility)
  const newerReleases = useMemo(() => {
    if (!updateResult?.ok || !updateResult.hasUpdate) return [];
    const list = updateResult.releases.filter(
      (r) => compareSemver(r.version, currentVersion) > 0
    );
    if (list.length > 0) return list;
    return [
      {
        tag: updateResult.latestTag,
        version: updateResult.latestVersion,
        name: updateResult.releaseName,
        publishedAt: updateResult.publishedAt,
        htmlUrl: updateResult.htmlUrl,
        rawBody: updateResult.rawChangelog,
        changelog: updateResult.changelog,
        assets: updateResult.assets,
        source: 'github' as const,
      },
    ];
  }, [updateResult, currentVersion]);

  const [selectedHistoryTag, setSelectedHistoryTag] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setViewMode(initialMode);
      if (mergedHistory.length > 0) {
        setSelectedHistoryTag(mergedHistory[0].tag);
      }
    }
  }, [isOpen, initialMode, mergedHistory]);

  const selectedHistoryEntry = useMemo(
    () => mergedHistory.find((e) => e.tag === selectedHistoryTag) || mergedHistory[0] || null,
    [mergedHistory, selectedHistoryTag]
  );

  const recommendedAsset = useMemo<ReleaseAsset | null>(() => {
    const assets = updateResult?.assets || [];
    if (assets.length === 0) return null;
    return (
      assets.find((a) => a.platform === clientPlatform) ||
      assets.find((a) => a.platform !== 'other') ||
      assets[0]
    );
  }, [updateResult, clientPlatform]);

  const otherAssets = useMemo(() => {
    const assets = updateResult?.assets || [];
    if (!recommendedAsset) return assets;
    return assets.filter((a) => a.downloadUrl !== recommendedAsset.downloadUrl);
  }, [updateResult, recommendedAsset]);

  const hasUpdate = Boolean(updateResult?.ok && updateResult.hasUpdate);
  const primaryDownloadUrl =
    recommendedAsset?.downloadUrl ||
    updateResult?.htmlUrl ||
    (githubRepo ? `https://github.com/${githubRepo}/releases` : '');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/60 backdrop-blur-[3px] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[680px] rounded-[12px] border overflow-hidden flex flex-col max-h-[84vh] zp-popover-shadow"
            style={{
              backgroundColor: 'var(--zp-bg-canvas)',
              borderColor: 'var(--zp-border-subtle)',
              color: 'var(--zp-text-primary)',
            }}
          >
            {/* MODAL HEADER */}
            <div
              className="flex items-center justify-between gap-3 px-5 py-3.5 border-b shrink-0"
              style={{
                backgroundColor: 'var(--zp-bg-surface)',
                borderColor: 'var(--zp-border-subtle)',
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src="/icons/openpost_icon_pack/png/transparent/openpost-64-transparent.png"
                  alt="OpenPost"
                  className="w-8 h-8 object-contain shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold tracking-tight">
                      {hasUpdate ? '发现 OpenPost 新版本' : '版本更新与日志'}
                    </h2>
                    {hasUpdate && updateResult ? (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-[4px]"
                        style={{
                          backgroundColor: 'var(--zp-accent-soft)',
                          color: 'var(--zp-accent)',
                        }}
                      >
                        <span>v{normalizeVersion(currentVersion)}</span>
                        <ArrowRight className="w-3 h-3" />
                        <span>{updateResult.latestTag}</span>
                      </span>
                    ) : (
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded-[4px]"
                        style={{
                          backgroundColor: 'var(--zp-bg-elevated)',
                          color: 'var(--zp-text-secondary)',
                        }}
                      >
                        当前 v{normalizeVersion(currentVersion)}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-[11px] mt-0.5 truncate"
                    style={{ color: 'var(--zp-text-muted)' }}
                  >
                    GitHub Releases · {githubRepo}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <SegmentedControl
                  value={viewMode}
                  onChange={setViewMode}
                  layoutId="update-modal-view-mode"
                  tone="canvas"
                  activeStyle="elevated"
                  options={[
                    { id: 'release', label: hasUpdate ? '新版本说明' : '更新状态' },
                    { id: 'history', label: '更新日志' },
                  ]}
                />

                <button
                  type="button"
                  onClick={onCheckNow}
                  disabled={checking}
                  title="立即重新检查 GitHub 新版本"
                  className="w-7 h-7 inline-flex items-center justify-center rounded-[6px] border hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors disabled:opacity-50"
                  style={{
                    borderColor: 'var(--zp-border-subtle)',
                    color: 'var(--zp-text-secondary)',
                  }}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-7 h-7 inline-flex items-center justify-center rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--zp-text-muted)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* MODAL BODY */}
            <div className="flex-1 overflow-y-auto min-h-[300px]">
              {viewMode === 'release' ? (
                <div className="p-5 space-y-4">
                  {/* STATE 1: NEW VERSION FOUND */}
                  {hasUpdate && updateResult ? (
                    <>
                      {/* Release metadata banner */}
                      <div
                        className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[8px] border text-xs"
                        style={{
                          backgroundColor: 'var(--zp-bg-surface)',
                          borderColor: 'var(--zp-border-subtle)',
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <Tag className="w-3.5 h-3.5" style={{ color: 'var(--zp-accent)' }} />
                            <span>{updateResult.releaseName || `OpenPost ${updateResult.latestTag}`}</span>
                          </span>
                          {updateResult.publishedAt && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px]"
                              style={{ color: 'var(--zp-text-muted)' }}
                            >
                              <Calendar className="w-3 h-3" />
                              <span>{formatReleaseDate(updateResult.publishedAt)}</span>
                            </span>
                          )}
                        </div>
                        {updateResult.htmlUrl && (
                          <a
                            href={updateResult.htmlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline shrink-0"
                            style={{ color: 'var(--zp-accent)' }}
                          >
                            <span>GitHub Release</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      {/* Structured 3-theme changelog for new version(s) */}
                      <div className="space-y-4">
                        {newerReleases.map((rel, idx) => (
                          <div key={rel.tag} className="space-y-2">
                            {newerReleases.length > 1 && (
                              <div className="flex items-center justify-between px-0.5">
                                <span className="text-xs font-semibold">
                                  {rel.tag}
                                  {idx === 0 && (
                                    <span
                                      className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-[4px]"
                                      style={{
                                        backgroundColor: 'var(--zp-accent-soft)',
                                        color: 'var(--zp-accent)',
                                      }}
                                    >
                                      最新
                                    </span>
                                  )}
                                </span>
                                {rel.publishedAt && (
                                  <span
                                    className="text-[11px]"
                                    style={{ color: 'var(--zp-text-muted)' }}
                                  >
                                    {formatReleaseDate(rel.publishedAt)}
                                  </span>
                                )}
                              </div>
                            )}
                            <ChangelogSectionsView
                              changelog={rel.changelog}
                              emptyFallback="该版本暂未提供「新功能 / 改进 / 问题修复」更新日志，可点击右上角前往 GitHub Release 查看详情。"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Downloadable GitHub Release Assets */}
                      {updateResult.assets.length > 0 && (
                        <div
                          className="rounded-[8px] border p-3.5 space-y-2.5"
                          style={{
                            backgroundColor: 'var(--zp-bg-surface)',
                            borderColor: 'var(--zp-border-subtle)',
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                              <Package
                                className="w-3.5 h-3.5"
                                style={{ color: 'var(--zp-accent)' }}
                              />
                              <span>GitHub 原生安装包直链</span>
                            </span>
                            <span
                              className="text-[11px]"
                              style={{ color: 'var(--zp-text-muted)' }}
                            >
                              每个 Tag 对应独立发行包
                            </span>
                          </div>

                          {recommendedAsset && (
                            <a
                              href={recommendedAsset.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[6px] border transition-colors hover:opacity-95"
                              style={{
                                backgroundColor: 'var(--zp-accent-soft)',
                                borderColor: 'var(--zp-accent)',
                              }}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-xs font-semibold truncate"
                                    style={{ color: 'var(--zp-text-primary)' }}
                                  >
                                    {recommendedAsset.name}
                                  </span>
                                  <span
                                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] shrink-0"
                                    style={{
                                      backgroundColor: 'var(--zp-accent)',
                                      color: 'var(--zp-accent-fg)',
                                    }}
                                  >
                                    推荐 · {PLATFORM_LABELS[recommendedAsset.platform]}
                                  </span>
                                </div>
                                {recommendedAsset.size > 0 && (
                                  <div
                                    className="text-[11px] mt-0.5"
                                    style={{ color: 'var(--zp-text-secondary)' }}
                                  >
                                    文件大小：{formatBytesCompact(recommendedAsset.size)}
                                  </div>
                                )}
                              </div>
                              <Download
                                className="w-4 h-4 shrink-0"
                                style={{ color: 'var(--zp-accent)' }}
                              />
                            </a>
                          )}

                          {otherAssets.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                              {otherAssets.map((asset) => (
                                <a
                                  key={asset.downloadUrl}
                                  href={asset.downloadUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-[6px] border text-[11px] transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                                  style={{
                                    borderColor: 'var(--zp-border-subtle)',
                                    backgroundColor: 'var(--zp-bg-canvas)',
                                  }}
                                >
                                  <div className="min-w-0">
                                    <div className="font-medium truncate">{asset.name}</div>
                                    <div
                                      className="text-[10px]"
                                      style={{ color: 'var(--zp-text-muted)' }}
                                    >
                                      {PLATFORM_LABELS[asset.platform]}
                                      {asset.size > 0 ? ` · ${formatBytesCompact(asset.size)}` : ''}
                                    </div>
                                  </div>
                                  <Download
                                    className="w-3.5 h-3.5 shrink-0"
                                    style={{ color: 'var(--zp-text-muted)' }}
                                  />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : checking ? (
                    <div className="py-14 flex flex-col items-center justify-center gap-3 text-xs">
                      <RefreshCw
                        className="w-6 h-6 animate-spin"
                        style={{ color: 'var(--zp-accent)' }}
                      />
                      <span className="font-medium">正在从 GitHub 检查最新版本...</span>
                      {githubRepo && (
                        <span
                          className="text-[11px]"
                          style={{ color: 'var(--zp-text-muted)' }}
                        >
                          https://github.com/{githubRepo}/releases
                        </span>
                      )}
                    </div>
                  ) : updateResult && !updateResult.ok ? (
                    <div className="py-10 px-4 flex flex-col items-center text-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-rose-500/10 text-rose-500">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div className="space-y-1 max-w-md">
                        <div className="text-xs font-semibold">检查更新未能完成</div>
                        <p
                          className="text-xs leading-relaxed"
                          style={{ color: 'var(--zp-text-secondary)' }}
                        >
                          {updateResult.error}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <a
                          href={`https://github.com/${githubRepo}/releases`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border text-xs font-medium hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                          style={{
                            borderColor: 'var(--zp-border)',
                            backgroundColor: 'var(--zp-bg-surface)',
                          }}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>打开 Releases 页面</span>
                        </a>
                        <button
                          type="button"
                          onClick={onCheckNow}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] text-xs font-medium hover:opacity-90"
                          style={{
                            backgroundColor: 'var(--zp-accent)',
                            color: 'var(--zp-accent-fg)',
                          }}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>重试检查</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* UP TO DATE OR NOT YET CHECKED */
                    <div className="space-y-4">
                      <div
                        className="flex items-center justify-between gap-3 px-4 py-3 rounded-[8px] border"
                        style={{
                          backgroundColor: 'var(--zp-bg-surface)',
                          borderColor: 'var(--zp-border-subtle)',
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold">
                              {updateResult?.ok
                                ? `当前已是最新版本 (v${normalizeVersion(currentVersion)})`
                                : `当前版本 v${normalizeVersion(currentVersion)}`}
                            </div>
                            <div
                              className="text-[11px] truncate"
                              style={{ color: 'var(--zp-text-muted)' }}
                            >
                              {updateResult?.checkedAt
                                ? `最近检查时间：${new Date(updateResult.checkedAt).toLocaleString()}`
                                : '点击右侧按钮立即连接 GitHub 检查是否有新版本 Tag'}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={onCheckNow}
                          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] border text-xs font-medium shrink-0 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                          style={{
                            borderColor: 'var(--zp-border)',
                            backgroundColor: 'var(--zp-bg-canvas)',
                          }}
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>检查更新</span>
                        </button>
                      </div>

                      {/* Show current version's 3-theme changelog from /changelogs/ */}
                      {mergedHistory.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between px-0.5">
                            <span
                              className="text-[11px] font-semibold"
                              style={{ color: 'var(--zp-text-secondary)' }}
                            >
                              当前版本 ({mergedHistory[0].tag}) 更新说明
                            </span>
                            {mergedHistory[0].publishedAt && (
                              <span
                                className="text-[11px]"
                                style={{ color: 'var(--zp-text-muted)' }}
                              >
                                {formatReleaseDate(mergedHistory[0].publishedAt)}
                              </span>
                            )}
                          </div>
                          <ChangelogSectionsView changelog={mergedHistory[0].changelog} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* VIEW 2: VERSION CHANGELOG ARCHIVE (/changelogs/ + GitHub Releases) */
                <div className="flex min-h-[360px] max-h-[58vh]">
                  {/* Left Version Sidebar */}
                  <div
                    className="w-[168px] border-r p-2.5 overflow-y-auto shrink-0 space-y-1"
                    style={{
                      backgroundColor: 'var(--zp-bg-surface)',
                      borderColor: 'var(--zp-border-subtle)',
                    }}
                  >
                    <div
                      className="px-2 pt-0.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--zp-text-muted)' }}
                    >
                      版本标签 (Tag)
                    </div>
                    {mergedHistory.map((entry) => {
                      const isSelected = selectedHistoryEntry?.tag === entry.tag;
                      const isCurrent =
                        compareSemver(entry.version, currentVersion) === 0;
                      const isNewer =
                        compareSemver(entry.version, currentVersion) > 0;
                      return (
                        <button
                          key={entry.tag}
                          type="button"
                          onClick={() => setSelectedHistoryTag(entry.tag)}
                          className="w-full text-left px-2.5 py-2 rounded-[6px] transition-colors flex flex-col gap-0.5"
                          style={{
                            backgroundColor: isSelected
                              ? 'var(--zp-bg-elevated)'
                              : 'transparent',
                            color: isSelected
                              ? 'var(--zp-text-primary)'
                              : 'var(--zp-text-secondary)',
                          }}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold truncate">
                              {entry.tag}
                            </span>
                            {isNewer ? (
                              <span
                                className="text-[10px] font-semibold px-1.5 py-0.2 rounded-[4px]"
                                style={{
                                  backgroundColor: 'var(--zp-accent-soft)',
                                  color: 'var(--zp-accent)',
                                }}
                              >
                                新版
                              </span>
                            ) : isCurrent ? (
                              <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-[4px] bg-emerald-500/10 text-emerald-500">
                                当前
                              </span>
                            ) : null}
                          </div>
                          {entry.publishedAt && (
                            <span
                              className="text-[10px]"
                              style={{ color: 'var(--zp-text-muted)' }}
                            >
                              {formatReleaseDate(entry.publishedAt)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Right Selected Version Details */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-3.5 min-w-0">
                    {selectedHistoryEntry ? (
                      <>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">
                              {selectedHistoryEntry.tag}
                            </span>
                            {selectedHistoryEntry.publishedAt && (
                              <span
                                className="text-[11px]"
                                style={{ color: 'var(--zp-text-muted)' }}
                              >
                                发布于 {formatReleaseDate(selectedHistoryEntry.publishedAt)}
                              </span>
                            )}
                          </div>

                          {selectedHistoryEntry.htmlUrl && (
                            <a
                              href={selectedHistoryEntry.htmlUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
                              style={{ color: 'var(--zp-accent)' }}
                            >
                              <span>在 GitHub 查看</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>

                        <ChangelogSectionsView changelog={selectedHistoryEntry.changelog} />

                        {selectedHistoryEntry.assets.length > 0 && (
                          <div className="pt-1 space-y-1.5">
                            <div
                              className="text-[11px] font-semibold"
                              style={{ color: 'var(--zp-text-secondary)' }}
                            >
                              该版本发行包
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedHistoryEntry.assets.map((asset) => (
                                <a
                                  key={asset.downloadUrl}
                                  href={asset.downloadUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] border text-[11px] font-medium hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                                  style={{
                                    borderColor: 'var(--zp-border-subtle)',
                                    backgroundColor: 'var(--zp-bg-surface)',
                                  }}
                                >
                                  <Download className="w-3 h-3" style={{ color: 'var(--zp-accent)' }} />
                                  <span>{asset.name}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div
                        className="py-12 text-center text-xs"
                        style={{ color: 'var(--zp-text-muted)' }}
                      >
                        暂无版本日志记录
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* MODAL FOOTER */}
            <div
              className="flex items-center justify-between gap-3 px-5 py-3 border-t shrink-0 text-xs"
              style={{
                backgroundColor: 'var(--zp-bg-surface)',
                borderColor: 'var(--zp-border-subtle)',
              }}
            >
              <div className="flex items-center gap-2">
                {hasUpdate && updateResult ? (
                  <button
                    type="button"
                    onClick={() => {
                      onSkipVersion(updateResult.latestVersion);
                      onClose();
                    }}
                    className="h-7 px-2.5 rounded-[6px] text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ color: 'var(--zp-text-muted)' }}
                  >
                    跳过此版本
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenUpdateSettings}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ color: 'var(--zp-text-secondary)' }}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>更新设置</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8 px-3.5 rounded-[6px] border text-xs font-medium transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  style={{
                    borderColor: 'var(--zp-border)',
                    backgroundColor: 'var(--zp-bg-canvas)',
                    color: 'var(--zp-text-primary)',
                  }}
                >
                  {hasUpdate ? '稍后提醒' : '关闭'}
                </button>

                {hasUpdate && updateResult && primaryDownloadUrl && (
                  <a
                    href={primaryDownloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-8 px-4 rounded-[6px] text-xs font-semibold transition-opacity hover:opacity-90 whitespace-nowrap"
                    style={{
                      backgroundColor: 'var(--zp-accent)',
                      color: 'var(--zp-accent-fg)',
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {recommendedAsset
                        ? `下载 ${updateResult.latestTag}`
                        : `前往下载 ${updateResult.latestTag}`}
                    </span>
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
