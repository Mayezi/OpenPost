import React, { useState } from 'react';
import { Plus, Trash2, Code2, Table2 } from 'lucide-react';
import { KeyValueItem } from '../types/api';
import { UiCheckbox } from './UiControls';

interface KeyValueTableProps {
  items: KeyValueItem[];
  onChange: (next: KeyValueItem[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  descriptionPlaceholder?: string;
  suggestions?: string[];
  emptyHint?: string;
}

export const KeyValueTable: React.FC<KeyValueTableProps> = ({
  items,
  onChange,
  keyPlaceholder = '参数名 (Key)',
  valuePlaceholder = '参数值 (支持 {{变量}})',
  descriptionPlaceholder = '备注说明 (可选)',
  suggestions = [],
  emptyHint = '暂无键值参数，点击下方按钮新增或切换至批量文本模式粘贴。',
}) => {
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const handleToggleBulk = () => {
    if (!bulkMode) {
      const text = items
        .map((item) => `${item.enabled ? '' : '# '}${item.key}: ${item.value}`)
        .join('\n');
      setBulkText(text);
      setBulkMode(true);
    } else {
      const lines = bulkText.split('\n');
      const parsed: KeyValueItem[] = [];
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const isCommented = trimmed.startsWith('#');
        const cleanLine = isCommented ? trimmed.replace(/^#\s*/, '') : trimmed;
        const colonIdx = cleanLine.indexOf(':');
        const eqIdx = cleanLine.indexOf('=');
        const splitIdx =
          colonIdx !== -1 && (eqIdx === -1 || colonIdx < eqIdx) ? colonIdx : eqIdx;

        if (splitIdx !== -1) {
          parsed.push({
            id: `kv_bulk_${Date.now()}_${idx}`,
            key: cleanLine.slice(0, splitIdx).trim(),
            value: cleanLine.slice(splitIdx + 1).trim(),
            description: '',
            enabled: !isCommented,
          });
        }
      });
      onChange(parsed);
      setBulkMode(false);
    }
  };

  const handleAddRow = () => {
    onChange([
      ...items,
      {
        id: `kv_${Date.now()}_${items.length}`,
        key: '',
        value: '',
        description: '',
        enabled: true,
      },
    ]);
  };

  const handleUpdateRow = (id: string, patch: Partial<KeyValueItem>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const handleDeleteRow = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const allEnabled = items.length > 0 && items.every((i) => i.enabled);
  const someEnabled = items.some((i) => i.enabled) && !allEnabled;

  const handleToggleAll = () => {
    onChange(items.map((i) => ({ ...i, enabled: !allEnabled })));
  };

  const datalistId = React.useId();

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddRow}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] font-medium transition-opacity whitespace-nowrap shrink-0 hover:opacity-90"
            style={{
              backgroundColor: 'var(--zp-accent-soft)',
              color: 'var(--zp-accent)',
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新增参数行</span>
          </button>
          {items.length > 0 && !bulkMode && (
            <button
              type="button"
              onClick={handleToggleAll}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] border transition-colors whitespace-nowrap shrink-0 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
              style={{
                borderColor: 'var(--zp-border-subtle)',
                color: 'var(--zp-text-secondary)',
              }}
            >
              <span>{allEnabled ? '全部取消' : '全部启用'}</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleToggleBulk}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] border transition-colors whitespace-nowrap shrink-0 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
          style={{
            borderColor: 'var(--zp-border-subtle)',
            color: bulkMode ? 'var(--zp-text-primary)' : 'var(--zp-text-secondary)',
            backgroundColor: bulkMode ? 'var(--zp-bg-elevated)' : 'transparent',
          }}
        >
          {bulkMode ? (
            <>
              <Table2 className="w-3.5 h-3.5" />
              <span>应用并返回表格</span>
            </>
          ) : (
            <>
              <Code2 className="w-3.5 h-3.5" />
              <span>批量文本编辑 (Key: Value)</span>
            </>
          )}
        </button>
      </div>

      {suggestions.length > 0 && (
        <datalist id={datalistId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}

      {bulkMode ? (
        <div className="flex-1 p-3.5 flex flex-col gap-2">
          <p className="text-xs" style={{ color: 'var(--zp-text-muted)' }}>
            每行输入一对键值（格式：<code className="font-mono-tabular">Key: Value</code> 或{' '}
            <code className="font-mono-tabular">Key=Value</code>，以{' '}
            <code className="font-mono-tabular">#</code> 开头表示禁用该行）：
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={'Accept: application/json\nX-Trace-Id: {{$guid}}\n# Disabled-Key: value'}
            className="flex-1 w-full p-3.5 rounded-[8px] border font-mono-tabular text-xs resize-none focus:outline-none focus:border-[var(--zp-accent)]"
            style={{
              backgroundColor: 'var(--zp-bg-input)',
              borderColor: 'var(--zp-border)',
              color: 'var(--zp-text-primary)',
            }}
          />
        </div>
      ) : items.length === 0 ? (
        <div
          className="flex-1 flex flex-col items-center justify-center p-6 text-center"
          style={{ color: 'var(--zp-text-muted)' }}
        >
          <p className="text-xs mb-3">{emptyHint}</p>
          <button
            type="button"
            onClick={handleAddRow}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] text-xs font-medium border transition-colors whitespace-nowrap shrink-0 hover:opacity-85"
            style={{
              borderColor: 'var(--zp-border)',
              color: 'var(--zp-text-primary)',
              backgroundColor: 'var(--zp-bg-elevated)',
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加第一项参数</span>
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr
                className="border-y"
                style={{
                  borderColor: 'var(--zp-border-subtle)',
                  backgroundColor: 'var(--zp-bg-surface)',
                  color: 'var(--zp-text-muted)',
                }}
              >
                <th className="w-10 py-2 text-center font-medium">
                  <div className="inline-flex items-center justify-center">
                    <UiCheckbox
                      checked={allEnabled}
                      indeterminate={someEnabled}
                      onChange={handleToggleAll}
                      title={allEnabled ? '全部禁用' : '全部启用'}
                    />
                  </div>
                </th>
                <th
                  className="w-[32%] py-2 px-3 font-medium border-l"
                  style={{ borderColor: 'var(--zp-border-subtle)' }}
                >
                  键名 (Key)
                </th>
                <th
                  className="w-[38%] py-2 px-3 font-medium border-l"
                  style={{ borderColor: 'var(--zp-border-subtle)' }}
                >
                  键值 (Value)
                </th>
                <th
                  className="py-2 px-3 font-medium border-l"
                  style={{ borderColor: 'var(--zp-border-subtle)' }}
                >
                  说明 (Description)
                </th>
                <th
                  className="w-10 py-2 text-center font-medium border-l"
                  style={{ borderColor: 'var(--zp-border-subtle)' }}
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                  style={{
                    borderColor: 'var(--zp-border-subtle)',
                    opacity: item.enabled ? 1 : 0.55,
                  }}
                >
                  <td className="py-1.5 text-center">
                    <div className="inline-flex items-center justify-center">
                      <UiCheckbox
                        checked={item.enabled}
                        onChange={(next) => handleUpdateRow(item.id, { enabled: next })}
                        title={item.enabled ? '点击禁用此参数' : '点击启用此参数'}
                      />
                    </div>
                  </td>
                  <td
                    className="p-0 border-l"
                    style={{ borderColor: 'var(--zp-border-subtle)' }}
                  >
                    <input
                      type="text"
                      list={suggestions.length > 0 ? datalistId : undefined}
                      value={item.key}
                      onChange={(e) => handleUpdateRow(item.id, { key: e.target.value })}
                      placeholder={keyPlaceholder}
                      className="w-full px-3 py-2 bg-transparent font-mono-tabular text-xs focus:outline-none"
                      style={{ color: 'var(--zp-text-primary)' }}
                    />
                  </td>
                  <td
                    className="p-0 border-l"
                    style={{ borderColor: 'var(--zp-border-subtle)' }}
                  >
                    <input
                      type="text"
                      value={item.value}
                      onChange={(e) => handleUpdateRow(item.id, { value: e.target.value })}
                      placeholder={valuePlaceholder}
                      className="w-full px-3 py-2 bg-transparent font-mono-tabular text-xs focus:outline-none"
                      style={{ color: 'var(--zp-accent)' }}
                    />
                  </td>
                  <td
                    className="p-0 border-l"
                    style={{ borderColor: 'var(--zp-border-subtle)' }}
                  >
                    <input
                      type="text"
                      value={item.description || ''}
                      onChange={(e) => handleUpdateRow(item.id, { description: e.target.value })}
                      placeholder={descriptionPlaceholder}
                      className="w-full px-3 py-2 bg-transparent text-xs focus:outline-none"
                      style={{ color: 'var(--zp-text-secondary)' }}
                    />
                  </td>
                  <td
                    className="py-1 text-center border-l"
                    style={{ borderColor: 'var(--zp-border-subtle)' }}
                  >
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(item.id)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-[6px] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                      style={{ color: 'var(--zp-text-muted)' }}
                      title="删除行"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
