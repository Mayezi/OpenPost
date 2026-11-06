import React, { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  XCircle,
  Copy,
  Download,
  Check,
  AlertTriangle,
  Clock,
  HardDrive,
  Terminal,
  Table2,
  FileCode2,
  ListFilter,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { ApiResponseData } from '../types/api';
import { getByJsonPath } from '../utils/requestEngine';

interface ResponseViewerProps {
  response: ApiResponseData | null;
  loading: boolean;
  onQuickSaveEnvVar?: (key: string, value: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const ResponseViewer: React.FC<ResponseViewerProps> = ({
  response,
  loading,
  onQuickSaveEnvVar,
  isExpanded = false,
  onToggleExpand,
}) => {
  const [activeTab, setActiveTab] = useState<
    'pretty' | 'table' | 'raw' | 'headers' | 'cookies' | 'tests'
  >('pretty');
  const [jsonPathQuery, setJsonPathQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [envVarNameInput, setEnvVarNameInput] = useState('');
  const [savedEnvNotice, setSavedEnvNotice] = useState('');

  const parsedJson = useMemo(() => {
    if (!response?.body) return null;
    try {
      return JSON.parse(response.body);
    } catch {
      return null;
    }
  }, [response?.body]);

  const formattedBody = useMemo(() => {
    if (!response?.body) return '';
    if (parsedJson !== null) {
      if (jsonPathQuery.trim()) {
        const extracted = getByJsonPath(parsedJson, jsonPathQuery);
        if (extracted === undefined) {
          return `// JSONPath "${jsonPathQuery}" 未匹配到任何节点\n// 可尝试如: data.0.name 或 choices.0.message.content`;
        }
        return typeof extracted === 'object'
          ? JSON.stringify(extracted, null, 2)
          : String(extracted);
      }
      return JSON.stringify(parsedJson, null, 2);
    }
    return response.body;
  }, [response?.body, parsedJson, jsonPathQuery]);

  // Detect array of objects for Table View
  const tableRows = useMemo<Record<string, unknown>[]>(() => {
    if (!parsedJson || typeof parsedJson !== 'object') return [];
    if (Array.isArray(parsedJson) && parsedJson.length > 0 && typeof parsedJson[0] === 'object') {
      return parsedJson as Record<string, unknown>[];
    }
    const record = parsedJson as Record<string, unknown>;
    const candidateKeys = ['data', 'items', 'results', 'users', 'rows', 'choices', 'list'];
    for (const key of candidateKeys) {
      if (Array.isArray(record[key]) && (record[key] as unknown[]).length > 0) {
        const first = (record[key] as unknown[])[0];
        if (first && typeof first === 'object') {
          return record[key] as Record<string, unknown>[];
        }
      }
    }
    return [];
  }, [parsedJson]);

  const tableColumns = useMemo(() => {
    if (tableRows.length === 0) return [];
    const keys = new Set<string>();
    tableRows.slice(0, 20).forEach((row) => {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach((k) => keys.add(k));
      }
    });
    return Array.from(keys);
  }, [tableRows]);

  const handleCopyBody = () => {
    if (!formattedBody) return;
    navigator.clipboard.writeText(formattedBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadBody = () => {
    if (!response) return;
    const isJson = parsedJson !== null;
    const blob = new Blob([formattedBody || response.body], {
      type: isJson ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openpost-response-${Date.now()}.${isJson ? 'json' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveQueriedToEnv = () => {
    if (!parsedJson || !jsonPathQuery.trim() || !envVarNameInput.trim() || !onQuickSaveEnvVar) {
      return;
    }
    const extracted = getByJsonPath(parsedJson, jsonPathQuery);
    if (extracted !== undefined) {
      const valStr = typeof extracted === 'object' ? JSON.stringify(extracted) : String(extracted);
      onQuickSaveEnvVar(envVarNameInput.trim(), valStr);
      setSavedEnvNotice(`已写入 {{${envVarNameInput.trim()}}}`);
      setEnvVarNameInput('');
      setTimeout(() => setSavedEnvNotice(''), 2500);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(2)} KB`;
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col h-full zp-surface-transition">
        <div
          className="flex items-center justify-between px-4 py-2.5 border-b text-xs zp-surface-transition"
          style={{ borderColor: 'var(--zp-border)', backgroundColor: 'var(--zp-bg-surface)' }}
        >
          <span className="font-medium" style={{ color: 'var(--zp-text-secondary)' }}>
            响应控制台 (Response Inspector)
          </span>
          <span className="font-mono-tabular" style={{ color: 'var(--zp-accent)' }}>
            正在通过本地引擎发送请求...
          </span>
        </div>
        <div className="flex-1 p-4 space-y-2.5 overflow-hidden">
          <div
            className="h-5 w-1/3 rounded-lg animate-pulse"
            style={{ backgroundColor: 'var(--zp-bg-elevated)' }}
          />
          <div
            className="h-4 w-2/3 rounded-lg animate-pulse"
            style={{ backgroundColor: 'var(--zp-bg-elevated)' }}
          />
          <div
            className="h-4 w-1/2 rounded-lg animate-pulse"
            style={{ backgroundColor: 'var(--zp-bg-elevated)' }}
          />
          <div
            className="h-32 w-full rounded-xl animate-pulse mt-4"
            style={{ backgroundColor: 'var(--zp-bg-elevated)' }}
          />
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full zp-surface-transition">
        <img
          src="/icons/openpost_icon_pack/png/transparent/openpost-128-transparent.png"
          alt="openPost"
          className="w-12 h-12 object-contain mb-3"
        />
        <p className="text-sm font-semibold font-display mb-1" style={{ color: 'var(--zp-text-primary)' }}>
          准备就绪 · 等待发送请求
        </p>
        <p className="text-xs max-w-md leading-relaxed" style={{ color: 'var(--zp-text-muted)' }}>
          配置上方 URL 与参数后点击「发送」(快捷键 <code className="font-mono-tabular">⌘/Ctrl + Enter</code>)。所有报文均在本地直接发起，零云端中转与遥测记录。
        </p>
      </div>
    );
  }

  const headerEntries = Object.entries(response.headers || {});
  const passedCount = response.assertionResults.filter((r) => r.passed).length;
  const totalAssertions = response.assertionResults.length;

  const isSuccessStatus = response.status >= 200 && response.status < 300;
  const isRedirectStatus = response.status >= 300 && response.status < 400;
  const statusColorClass =
    response.status === 0 || response.status >= 400
      ? 'text-rose-500'
      : isRedirectStatus
      ? 'text-amber-500'
      : isSuccessStatus
      ? 'text-emerald-500'
      : 'text-sky-500';

  const lines = formattedBody.split('\n');

  const tabItems = [
    { id: 'pretty' as const, label: '格式化 (Pretty)', icon: <FileCode2 className="w-3.5 h-3.5" /> },
    ...(tableRows.length > 0
      ? [
          {
            id: 'table' as const,
            label: `数据表 (${tableRows.length})`,
            icon: <Table2 className="w-3.5 h-3.5" />,
          },
        ]
      : []),
    { id: 'raw' as const, label: '原始报文 (Raw)' },
    { id: 'headers' as const, label: `响应头 (${headerEntries.length})` },
    { id: 'cookies' as const, label: `Cookies (${response.cookies.length})` },
    { id: 'tests' as const, label: `断言与耗时 (${passedCount}/${totalAssertions})` },
  ];

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 zp-surface-transition">
      {/* Response Status & Telemetry Strip */}
      <div
        onDoubleClick={() => onToggleExpand?.()}
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-1.5 border-b text-xs zp-surface-transition"
        style={{
          borderColor: 'var(--zp-border)',
          backgroundColor: 'var(--zp-bg-surface)',
        }}
      >
        {/* Left: Smooth Animated Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          {tabItems.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className="relative inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0"
                style={{
                  color: active ? 'var(--zp-text-primary)' : 'var(--zp-text-secondary)',
                }}
              >
                {active && (
                  <motion.div
                    layoutId="response-viewer-tab-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                    className="absolute inset-0 rounded-lg border"
                    style={{
                      backgroundColor: 'var(--zp-bg-elevated)',
                      borderColor: 'var(--zp-border)',
                    }}
                  />
                )}
                {t.icon && <span className="relative z-10">{t.icon}</span>}
                <span className="relative z-10">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Clean Unboxed Metadata with Typographic Separators + Copy/Download */}
        <div className="flex items-center gap-2 text-xs shrink-0">
          <span className={`inline-flex items-center gap-1 font-semibold ${statusColorClass}`}>
            {isSuccessStatus ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            <span>
              {response.status > 0
                ? `${response.status} ${response.statusText}`
                : response.statusText}
            </span>
          </span>
          <span aria-hidden="true" style={{ color: 'var(--zp-text-muted)' }}>
            ·
          </span>
          <span
            className="inline-flex items-center gap-1"
            style={{ color: 'var(--zp-text-secondary)' }}
            title={`首字节 (TTFB): ${response.timing.ttfbMs} ms | 下载耗时: ${response.timing.downloadMs} ms`}
          >
            <Clock className="w-3 h-3" />
            <span>{response.timing.totalMs} ms</span>
          </span>
          <span aria-hidden="true" style={{ color: 'var(--zp-text-muted)' }}>
            ·
          </span>
          <span
            className="inline-flex items-center gap-1"
            style={{ color: 'var(--zp-text-secondary)' }}
          >
            <HardDrive className="w-3 h-3" />
            <span>{formatBytes(response.sizeBytes)}</span>
          </span>
          <span aria-hidden="true" style={{ color: 'var(--zp-text-muted)' }}>
            ·
          </span>
          <button
            type="button"
            onClick={handleCopyBody}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap shrink-0 hover:opacity-85"
            style={{
              borderColor: 'var(--zp-border)',
              backgroundColor: 'var(--zp-bg-canvas)',
              color: 'var(--zp-text-secondary)',
            }}
            title="复制响应内容"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadBody}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap shrink-0 hover:opacity-85"
            style={{
              borderColor: 'var(--zp-border)',
              backgroundColor: 'var(--zp-bg-canvas)',
              color: 'var(--zp-text-secondary)',
            }}
            title="保存响应报文到本地文件"
          >
            <Download className="w-3.5 h-3.5" />
            <span>保存</span>
          </button>
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border transition-colors whitespace-nowrap shrink-0 hover:opacity-85"
              style={{
                borderColor: 'var(--zp-border)',
                backgroundColor: isExpanded ? 'var(--zp-accent-soft)' : 'var(--zp-bg-canvas)',
                color: isExpanded ? 'var(--zp-accent)' : 'var(--zp-text-secondary)',
              }}
              title={isExpanded ? '还原分屏比例 (双击顶部栏也可切换)' : '放大响应面板 (双击顶部栏也可切换)'}
            >
              {isExpanded ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
              <span>{isExpanded ? '还原' : '展开'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Banner if request failed */}
      {response.error && (
        <div className="px-4 py-2.5 border-b border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs flex items-center justify-between gap-2">
          <span>{response.error}</span>
        </div>
      )}

      {/* Extracted Environment Variables Banner */}
      {response.extractedVars.length > 0 && (
        <div
          className="px-4 py-1.5 border-b text-xs flex items-center gap-2"
          style={{
            borderColor: 'var(--zp-border-subtle)',
            backgroundColor: 'var(--zp-accent-soft)',
            color: 'var(--zp-accent)',
          }}
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            断言规则已自动更新本地环境变量：
            {response.extractedVars
              .map((v) => ` {{${v.key}}} = ${v.value.slice(0, 32)}`)
              .join(' · ')}
          </span>
        </div>
      )}

      {/* Active Tab Content with Smooth Fade */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.14 }}
          className="flex-1 flex flex-col min-h-0"
        >
          {activeTab === 'pretty' && (
            <div className="flex-1 flex flex-col min-h-0">
              {parsedJson !== null && (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-1.5 border-b text-xs"
                  style={{
                    borderColor: 'var(--zp-border-subtle)',
                    backgroundColor: 'var(--zp-bg-canvas)',
                  }}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                    <ListFilter
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--zp-text-muted)' }}
                    />
                    <input
                      type="text"
                      value={jsonPathQuery}
                      onChange={(e) => setJsonPathQuery(e.target.value)}
                      placeholder="JSONPath 实时提取过滤 (例如: data.0.name 或 access_token)"
                      className="w-full bg-transparent font-mono-tabular text-xs focus:outline-none"
                      style={{ color: 'var(--zp-text-primary)' }}
                    />
                    {jsonPathQuery && (
                      <button
                        type="button"
                        onClick={() => setJsonPathQuery('')}
                        className="text-xs px-1.5 py-0.5 rounded hover:opacity-80 whitespace-nowrap shrink-0"
                        style={{ color: 'var(--zp-text-muted)' }}
                      >
                        清除
                      </button>
                    )}
                  </div>

                  {jsonPathQuery.trim() && onQuickSaveEnvVar && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="text"
                        value={envVarNameInput}
                        onChange={(e) => setEnvVarNameInput(e.target.value)}
                        placeholder="保存为变量名 (如 token)"
                        className="px-2.5 py-1 rounded-lg border font-mono-tabular text-xs focus:outline-none w-40"
                        style={{
                          backgroundColor: 'var(--zp-bg-input)',
                          borderColor: 'var(--zp-border)',
                          color: 'var(--zp-text-primary)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleSaveQueriedToEnv}
                        className="px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
                        style={{
                          backgroundColor: 'var(--zp-accent)',
                          color: 'var(--zp-accent-fg)',
                        }}
                      >
                        存入环境变量
                      </button>
                      {savedEnvNotice && (
                        <span className="text-emerald-500 font-mono-tabular">
                          {savedEnvNotice}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div
                className="flex-1 overflow-auto p-3 font-mono-tabular text-xs leading-relaxed zp-surface-transition"
                style={{ backgroundColor: 'var(--zp-code-bg)' }}
              >
                <table className="w-full border-collapse">
                  <tbody>
                    {lines.map((line, i) => (
                      <tr key={i} className="hover:bg-black/[0.03] dark:hover:bg-white/[0.02]">
                        <td
                          className="select-none pr-4 text-right w-10 align-top"
                          style={{ color: 'var(--zp-text-muted)' }}
                        >
                          {i + 1}
                        </td>
                        <td
                          className="whitespace-pre-wrap break-all"
                          style={{ color: 'var(--zp-text-primary)' }}
                        >
                          {line}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'table' && (
            <div className="flex-1 overflow-auto">
              {tableRows.length === 0 ? (
                <div className="p-6 text-center text-xs" style={{ color: 'var(--zp-text-muted)' }}>
                  当前 JSON 报文不包含对象数组，无法转换为数据表。
                </div>
              ) : (
                <table className="w-full border-collapse text-left text-xs font-mono-tabular">
                  <thead>
                    <tr
                      className="border-b"
                      style={{
                        borderColor: 'var(--zp-border)',
                        backgroundColor: 'var(--zp-bg-surface)',
                        color: 'var(--zp-text-muted)',
                      }}
                    >
                      <th className="py-2 px-3 w-12 text-right">#</th>
                      {tableColumns.map((col) => (
                        <th
                          key={col}
                          className="py-2 px-3 border-l font-semibold"
                          style={{ borderColor: 'var(--zp-border-subtle)' }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, idx) => (
                      <tr
                        key={idx}
                        className="border-b hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                        style={{ borderColor: 'var(--zp-border-subtle)' }}
                      >
                        <td
                          className="py-2 px-3 text-right"
                          style={{ color: 'var(--zp-text-muted)' }}
                        >
                          {idx + 1}
                        </td>
                        {tableColumns.map((col) => {
                          const val = row[col];
                          const displayVal =
                            val === null || val === undefined
                              ? '-'
                              : typeof val === 'object'
                              ? JSON.stringify(val)
                              : String(val);
                          return (
                            <td
                              key={col}
                              className="py-2 px-3 border-l"
                              style={{
                                borderColor: 'var(--zp-border-subtle)',
                                color: 'var(--zp-text-primary)',
                              }}
                            >
                              {displayVal}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'raw' && (
            <div
              className="flex-1 overflow-auto p-4 font-mono-tabular text-xs whitespace-pre-wrap break-all zp-surface-transition"
              style={{
                backgroundColor: 'var(--zp-code-bg)',
                color: 'var(--zp-text-primary)',
              }}
            >
              {response.body || '(空响应体)'}
            </div>
          )}

          {activeTab === 'headers' && (
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-left text-xs font-mono-tabular">
                <thead>
                  <tr
                    className="border-b"
                    style={{
                      borderColor: 'var(--zp-border)',
                      backgroundColor: 'var(--zp-bg-surface)',
                      color: 'var(--zp-text-muted)',
                    }}
                  >
                    <th className="py-2 px-4 w-1/3 font-medium">响应头名称 (Header Name)</th>
                    <th
                      className="py-2 px-4 font-medium border-l"
                      style={{ borderColor: 'var(--zp-border-subtle)' }}
                    >
                      响应头值 (Header Value)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {headerEntries.map(([k, v]) => (
                    <tr
                      key={k}
                      className="border-b"
                      style={{ borderColor: 'var(--zp-border-subtle)' }}
                    >
                      <td className="py-2 px-4 font-medium" style={{ color: 'var(--zp-accent)' }}>
                        {k}
                      </td>
                      <td
                        className="py-2 px-4 border-l break-all"
                        style={{
                          borderColor: 'var(--zp-border-subtle)',
                          color: 'var(--zp-text-primary)',
                        }}
                      >
                        {v}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'cookies' && (
            <div className="flex-1 overflow-auto p-4">
              {response.cookies.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--zp-text-muted)' }}>
                  当前响应未携带 Set-Cookie 头信息。
                </p>
              ) : (
                <div className="space-y-2">
                  {response.cookies.map((cookieStr, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border font-mono-tabular text-xs break-all"
                      style={{
                        backgroundColor: 'var(--zp-bg-surface)',
                        borderColor: 'var(--zp-border)',
                        color: 'var(--zp-text-primary)',
                      }}
                    >
                      {cookieStr}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'tests' && (
            <div className="flex-1 overflow-auto p-4 space-y-5">
              <div
                className="p-3.5 rounded-xl border"
                style={{
                  backgroundColor: 'var(--zp-bg-surface)',
                  borderColor: 'var(--zp-border)',
                }}
              >
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-medium" style={{ color: 'var(--zp-text-primary)' }}>
                    网络传输耗时分解 (Local Engine Timing Waterfall)
                  </span>
                  <span className="font-mono-tabular" style={{ color: 'var(--zp-accent)' }}>
                    总耗时: {response.timing.totalMs} ms
                  </span>
                </div>
                <div
                  className="w-full h-2.5 rounded-full overflow-hidden flex"
                  style={{ backgroundColor: 'var(--zp-bg-input)' }}
                >
                  <div
                    style={{
                      width: `${Math.max(
                        15,
                        Math.round(
                          (response.timing.ttfbMs / Math.max(1, response.timing.totalMs)) * 100
                        )
                      )}%`,
                      backgroundColor: 'var(--zp-accent)',
                    }}
                    title={`首字节等待 (TTFB): ${response.timing.ttfbMs} ms`}
                  />
                  <div
                    className="bg-emerald-500/80 flex-1"
                    title={`报文下载 (Content Download): ${response.timing.downloadMs} ms`}
                  />
                </div>
                <div
                  className="flex items-center justify-between text-xs mt-2 font-mono-tabular"
                  style={{ color: 'var(--zp-text-secondary)' }}
                >
                  <span>首字节响应 (TTFB): {response.timing.ttfbMs} ms</span>
                  <span>内容下载 (Download): {response.timing.downloadMs} ms</span>
                  <span>
                    执行引擎:{' '}
                    {response.engine === 'local-proxy' ? 'Local Node Proxy (无跨域)' : 'Browser Fetch'}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold" style={{ color: 'var(--zp-text-secondary)' }}>
                  断言检验结果 ({passedCount} 通过 / {totalAssertions} 总计)
                </h4>
                {response.assertionResults.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--zp-text-muted)' }}>
                    当前请求未配置启用状态的断言规则。可在上方请求编辑器的「断言与变量提取」标签页中添加。
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {response.assertionResults.map((res) => (
                      <div
                        key={res.id}
                        className="flex items-center justify-between gap-4 px-3.5 py-2.5 rounded-xl border text-xs"
                        style={{
                          backgroundColor: 'var(--zp-bg-surface)',
                          borderColor: 'var(--zp-border)',
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {res.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                          )}
                          <span
                            className="font-medium truncate"
                            style={{ color: 'var(--zp-text-primary)' }}
                          >
                            {res.label}
                          </span>
                        </div>
                        <div
                          className="flex items-center gap-2 font-mono-tabular shrink-0"
                          style={{ color: 'var(--zp-text-secondary)' }}
                        >
                          <span>实际值: {res.actual}</span>
                          <span aria-hidden="true">·</span>
                          <span>期望: {res.expected}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
