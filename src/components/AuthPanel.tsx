import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderKey,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  AuthConfig,
  AuthType,
  CollectionFolder,
  EnvironmentProfile,
} from '../types/api';
import { CustomSelect, SelectOption } from './CustomSelect';
import { exchangeOAuth2Token } from '../utils/authEngine';

interface AuthPanelProps {
  auth: AuthConfig;
  onChange: (nextAuth: AuthConfig) => void;
  parentFolder?: CollectionFolder | null;
  onUpdateFolderAuth?: (folderId: string, nextAuth: AuthConfig) => void;
  activeEnv?: EnvironmentProfile | null;
}

export const AUTH_TYPE_OPTIONS: SelectOption[] = [
  { value: 'inherit', label: 'Inherit auth from parent' },
  { value: 'none', label: 'No Auth' },
  { value: 'apikey', label: 'API Key' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'jwt', label: 'JWT Bearer' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'digest', label: 'Digest Auth' },
  { value: 'oauth1', label: 'OAuth 1.0' },
  { value: 'oauth2', label: 'OAuth 2.0' },
  { value: 'hawk', label: 'Hawk Authentication' },
  { value: 'awsv4', label: 'AWS Signature' },
  { value: 'ntlm', label: 'NTLM Authentication' },
  { value: 'edgegrid', label: 'Akamai EdgeGrid' },
];

const AUTH_DESCRIPTIONS: Record<AuthType, string> = {
  inherit: '当前接口将自动复用所属目录（Collection）设置的鉴权配置。',
  none: '发送请求时不自动生成或注入额外的鉴权头与参数。',
  apikey: '发送请求时自动将 API Key 键值对注入指定请求头或 URL 查询参数。',
  bearer: '发送请求时自动在请求头中注入 Authorization: Bearer <token>。',
  jwt: '发送请求时根据 Secret 与 Payload 自动生成并签名 JWT 令牌。',
  basic: '使用用户名与密码生成 Basic Base64 凭据并注入 Authorization 头。',
  digest: '默认自动解析服务端 401 WWW-Authenticate 质询并计算摘要后重试请求。',
  oauth1: '根据 Consumer 与 Token 密钥自动计算 OAuth 1.0 签名并附加到请求中。',
  oauth2: '自动在请求头或 URL 参数中携带 Access Token，支持现场换取新令牌。',
  hawk: '根据 Hawk ID 与 Key 计算请求时间窗与资源路径的 MAC 签名头。',
  awsv4: '基于 AccessKey / SecretKey / Region / Service 自动生成 AWS SigV4 签名。',
  ntlm: '发送 NTLM Type 1 协商请求并自动响应服务端 401 Type 2 质询。',
  edgegrid: '根据 Client Token、Access Token 与 Secret 计算 Akamai EdgeGrid 签名头。',
};

const FieldRow: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div className="grid grid-cols-[150px_1fr] items-center gap-3">
    <div className="flex items-center gap-1 min-w-0">
      <span
        className="text-xs font-medium truncate"
        style={{ color: 'var(--zp-text-secondary)' }}
      >
        {label}
      </span>
      {hint && (
        <span title={hint} className="shrink-0 opacity-50 hover:opacity-100 cursor-help">
          <Info className="w-3 h-3" style={{ color: 'var(--zp-text-muted)' }} />
        </span>
      )}
    </div>
    <div className="min-w-0 max-w-md">{children}</div>
  </div>
);

const AuthInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  secret?: boolean;
}> = ({ value, onChange, placeholder, secret }) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative flex items-center">
      <input
        type={secret && !revealed ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 rounded-md border text-xs focus:outline-none focus:border-[var(--zp-accent)] transition-colors"
        style={{
          backgroundColor: 'var(--zp-bg-input)',
          borderColor: 'var(--zp-border)',
          color: 'var(--zp-text-primary)',
          paddingRight: secret ? '2rem' : undefined,
        }}
      />
      {secret && (
        <button
          type="button"
          onClick={() => setRevealed((p) => !p)}
          className="absolute right-2 p-0.5 opacity-60 hover:opacity-100"
          style={{ color: 'var(--zp-text-secondary)' }}
          title={revealed ? '隐藏' : '显示'}
        >
          {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
};

export const AuthPanel: React.FC<AuthPanelProps> = ({
  auth,
  onChange,
  parentFolder,
  onUpdateFolderAuth,
  activeEnv,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingParentAuth, setEditingParentAuth] = useState(false);
  const [showOAuth2Fetcher, setShowOAuth2Fetcher] = useState(false);
  const [oauth2Loading, setOauth2Loading] = useState(false);
  const [oauth2Msg, setOauth2Msg] = useState<{ ok: boolean; text: string } | null>(null);

  const patch = (partial: Partial<AuthConfig>) => {
    onChange({ ...auth, ...partial });
  };

  const handleFetchOAuth2Token = async () => {
    setOauth2Loading(true);
    setOauth2Msg(null);
    const res = await exchangeOAuth2Token({
      tokenUrl: auth.oauth2AccessTokenUrl || '',
      grantType: auth.oauth2GrantType || 'client_credentials',
      clientId: auth.oauth2ClientId || '',
      clientSecret: auth.oauth2ClientSecret || '',
      scope: auth.oauth2Scope,
      username: auth.oauth2Username,
      password: auth.oauth2Password,
      code: auth.oauth2Code,
      redirectUri: auth.oauth2RedirectUri,
      env: activeEnv,
    });
    setOauth2Loading(false);
    if (res.accessToken) {
      patch({
        oauth2Token: res.accessToken,
        oauth2HeaderPrefix: res.tokenType || auth.oauth2HeaderPrefix || 'Bearer',
      });
      setOauth2Msg({ ok: true, text: '已成功获取并自动填入 Access Token' });
    } else {
      setOauth2Msg({ ok: false, text: res.error || '获取失败' });
    }
  };

  const parentAuthLabel =
    AUTH_TYPE_OPTIONS.find((o) => o.value === (parentFolder?.auth?.type || 'none'))?.label ||
    'No Auth';

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden text-xs">
      {/* LEFT COLUMN: Auth Type Selector & Overview */}
      <div
        className="w-72 shrink-0 p-4 border-r flex flex-col gap-3.5 overflow-y-auto"
        style={{ borderColor: 'var(--zp-border-subtle)' }}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-medium shrink-0 w-10"
            style={{ color: 'var(--zp-text-secondary)' }}
          >
            Type
          </span>
          <CustomSelect
            value={auth.type}
            onChange={(nextType) => {
              setShowAdvanced(false);
              onChange({ ...auth, type: nextType as AuthType });
            }}
            size="md"
            minWidth={205}
            className="flex-1 min-w-0"
            options={AUTH_TYPE_OPTIONS}
          />
        </div>

        <p
          className="text-[11px] leading-relaxed"
          style={{ color: 'var(--zp-text-muted)' }}
        >
          {AUTH_DESCRIPTIONS[auth.type]}
        </p>

        {auth.type === 'digest' && (
          <label
            className="flex items-center gap-2 pt-1 cursor-pointer select-none text-[11px]"
            style={{ color: 'var(--zp-text-secondary)' }}
          >
            <input
              type="checkbox"
              checked={Boolean(auth.digestDisableRetry)}
              onChange={(e) => patch({ digestDisableRetry: e.target.checked })}
              className="rounded accent-[var(--zp-accent)]"
            />
            <span>禁用 401 质询自动重试</span>
          </label>
        )}

        {auth.type === 'ntlm' && (
          <label
            className="flex items-center gap-2 pt-1 cursor-pointer select-none text-[11px]"
            style={{ color: 'var(--zp-text-secondary)' }}
          >
            <input
              type="checkbox"
              checked={Boolean(auth.ntlmDisableRetry)}
              onChange={(e) => patch({ ntlmDisableRetry: e.target.checked })}
              className="rounded accent-[var(--zp-accent)]"
            />
            <span>禁用 401 协商自动重试</span>
          </label>
        )}
      </div>

      {/* RIGHT COLUMN: Auth Fields */}
      <div className="flex-1 min-w-0 p-4 overflow-y-auto space-y-4">
        {auth.type !== 'none' && auth.type !== 'inherit' && (
          <div
            className="flex items-center gap-2 text-[11px] pb-2 border-b"
            style={{
              color: 'var(--zp-text-muted)',
              borderColor: 'var(--zp-border-subtle)',
            }}
          >
            <Info className="w-3.5 h-3.5 shrink-0 opacity-75" />
            <span>支持使用 {'{{变量名}}'} 引用环境变量，敏感凭据建议放入环境变量统一管理。</span>
          </div>
        )}

        {/* INHERIT AUTH */}
        {auth.type === 'inherit' && (
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FolderKey className="w-4 h-4" style={{ color: 'var(--zp-accent)' }} />
                <div>
                  <div className="font-medium" style={{ color: 'var(--zp-text-primary)' }}>
                    继承自目录：{parentFolder?.name || '默认集合'}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--zp-text-muted)' }}>
                    当前目录鉴权模式：<span style={{ color: 'var(--zp-accent)' }}>{parentAuthLabel}</span>
                  </div>
                </div>
              </div>
              {parentFolder && onUpdateFolderAuth && (
                <button
                  type="button"
                  onClick={() => setEditingParentAuth((p) => !p)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--zp-accent)' }}
                >
                  {editingParentAuth ? '收起目录鉴权' : '配置目录鉴权'}
                </button>
              )}
            </div>

            {editingParentAuth && parentFolder && onUpdateFolderAuth && (
              <div
                className="pt-3 border-t space-y-3"
                style={{ borderColor: 'var(--zp-border-subtle)' }}
              >
                <FieldRow label="目录鉴权模式">
                  <CustomSelect
                    value={parentFolder.auth?.type || 'none'}
                    onChange={(v) =>
                      onUpdateFolderAuth(parentFolder.id, {
                        ...(parentFolder.auth || { type: 'none' }),
                        type: v as AuthType,
                      })
                    }
                    minWidth={200}
                    options={AUTH_TYPE_OPTIONS.filter((o) => o.value !== 'inherit')}
                  />
                </FieldRow>

                {(parentFolder.auth?.type || 'none') === 'bearer' && (
                  <FieldRow label="Bearer Token">
                    <AuthInput
                      value={parentFolder.auth?.bearerToken || ''}
                      onChange={(v) =>
                        onUpdateFolderAuth(parentFolder.id, {
                          ...(parentFolder.auth || { type: 'bearer' }),
                          type: 'bearer',
                          bearerToken: v,
                        })
                      }
                      placeholder="Token 或 {{token}}"
                    />
                  </FieldRow>
                )}

                {parentFolder.auth?.type === 'basic' && (
                  <>
                    <FieldRow label="Username">
                      <AuthInput
                        value={parentFolder.auth?.basicUsername || ''}
                        onChange={(v) =>
                          onUpdateFolderAuth(parentFolder.id, {
                            ...parentFolder.auth!,
                            basicUsername: v,
                          })
                        }
                        placeholder="Username"
                      />
                    </FieldRow>
                    <FieldRow label="Password">
                      <AuthInput
                        secret
                        value={parentFolder.auth?.basicPassword || ''}
                        onChange={(v) =>
                          onUpdateFolderAuth(parentFolder.id, {
                            ...parentFolder.auth!,
                            basicPassword: v,
                          })
                        }
                        placeholder="Password"
                      />
                    </FieldRow>
                  </>
                )}

                {parentFolder.auth?.type === 'apikey' && (
                  <>
                    <FieldRow label="Key">
                      <AuthInput
                        value={parentFolder.auth?.apiKeyName || ''}
                        onChange={(v) =>
                          onUpdateFolderAuth(parentFolder.id, {
                            ...parentFolder.auth!,
                            apiKeyName: v,
                          })
                        }
                        placeholder="X-API-Key"
                      />
                    </FieldRow>
                    <FieldRow label="Value">
                      <AuthInput
                        secret
                        value={parentFolder.auth?.apiKeyValue || ''}
                        onChange={(v) =>
                          onUpdateFolderAuth(parentFolder.id, {
                            ...parentFolder.auth!,
                            apiKeyValue: v,
                          })
                        }
                        placeholder="Value"
                      />
                    </FieldRow>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* NO AUTH */}
        {auth.type === 'none' && (
          <div className="py-6 text-center" style={{ color: 'var(--zp-text-muted)' }}>
            此请求未启用鉴权（No Auth）。可在左侧下拉框选择所需的鉴权方式。
          </div>
        )}

        {/* API KEY */}
        {auth.type === 'apikey' && (
          <div className="space-y-3">
            <FieldRow label="Key">
              <AuthInput
                value={auth.apiKeyName || ''}
                onChange={(v) => patch({ apiKeyName: v })}
                placeholder="例如 X-API-Key"
              />
            </FieldRow>
            <FieldRow label="Value">
              <AuthInput
                secret
                value={auth.apiKeyValue || ''}
                onChange={(v) => patch({ apiKeyValue: v })}
                placeholder="例如 {{api_key}}"
              />
            </FieldRow>
            <FieldRow label="Add to">
              <CustomSelect
                value={auth.apiKeyIn || 'header'}
                onChange={(v) => patch({ apiKeyIn: v as 'header' | 'query' })}
                size="md"
                minWidth={180}
                options={[
                  { value: 'header', label: 'Header' },
                  { value: 'query', label: 'Query Params' },
                ]}
              />
            </FieldRow>
          </div>
        )}

        {/* BEARER TOKEN */}
        {auth.type === 'bearer' && (
          <div className="space-y-3">
            <FieldRow label="Token">
              <AuthInput
                value={auth.bearerToken || ''}
                onChange={(v) => patch({ bearerToken: v })}
                placeholder="输入 Bearer Token 或 {{auth_token}}"
              />
            </FieldRow>
          </div>
        )}

        {/* JWT BEARER */}
        {auth.type === 'jwt' && (
          <div className="space-y-3">
            <FieldRow label="Add JWT token to">
              <CustomSelect
                value={auth.jwtAddTo || 'header'}
                onChange={(v) => patch({ jwtAddTo: v as 'header' | 'query' })}
                size="md"
                minWidth={180}
                options={[
                  { value: 'header', label: 'Request Header' },
                  { value: 'query', label: 'Query Param' },
                ]}
              />
            </FieldRow>
            <FieldRow label="Algorithm">
              <CustomSelect
                value={auth.jwtAlgorithm || 'HS256'}
                onChange={(v) =>
                  patch({ jwtAlgorithm: v as 'HS256' | 'HS384' | 'HS512' | 'none' })
                }
                size="md"
                minWidth={180}
                options={[
                  { value: 'HS256', label: 'HS256' },
                  { value: 'HS384', label: 'HS384' },
                  { value: 'HS512', label: 'HS512' },
                  { value: 'none', label: 'none (Unsigned)' },
                ]}
              />
            </FieldRow>
            <FieldRow label="Secret">
              <div className="space-y-1.5">
                <AuthInput
                  secret
                  value={auth.jwtSecret || ''}
                  onChange={(v) => patch({ jwtSecret: v })}
                  placeholder="your-256-bit-secret"
                />
                <label
                  className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer"
                  style={{ color: 'var(--zp-text-muted)' }}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(auth.jwtSecretBase64)}
                    onChange={(e) => patch({ jwtSecretBase64: e.target.checked })}
                    className="rounded accent-[var(--zp-accent)]"
                  />
                  <span>Secret Base64 encoded</span>
                </label>
              </div>
            </FieldRow>
            <FieldRow label="Payload (JSON)">
              <textarea
                rows={4}
                value={auth.jwtPayload || '{\n  "sub": "1234567890",\n  "name": "openPost",\n  "iat": 1516239022\n}'}
                onChange={(e) => patch({ jwtPayload: e.target.value })}
                className="w-full px-3 py-2 rounded-md border text-xs focus:outline-none focus:border-[var(--zp-accent)]"
                style={{
                  backgroundColor: 'var(--zp-bg-input)',
                  borderColor: 'var(--zp-border)',
                  color: 'var(--zp-text-primary)',
                }}
              />
            </FieldRow>

            <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced((p) => !p)} />
            {showAdvanced && (
              <div className="space-y-3 pt-1">
                {auth.jwtAddTo === 'query' ? (
                  <FieldRow label="Query Param Name">
                    <AuthInput
                      value={auth.jwtQueryParamName || ''}
                      onChange={(v) => patch({ jwtQueryParamName: v })}
                      placeholder="token"
                    />
                  </FieldRow>
                ) : (
                  <FieldRow label="Request Header Prefix">
                    <AuthInput
                      value={auth.jwtHeaderPrefix ?? 'Bearer'}
                      onChange={(v) => patch({ jwtHeaderPrefix: v })}
                      placeholder="Bearer"
                    />
                  </FieldRow>
                )}
                <FieldRow label="JWT Headers (JSON)">
                  <textarea
                    rows={2}
                    value={auth.jwtHeadersJson || '{}'}
                    onChange={(e) => patch({ jwtHeadersJson: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md border text-xs focus:outline-none focus:border-[var(--zp-accent)]"
                    style={{
                      backgroundColor: 'var(--zp-bg-input)',
                      borderColor: 'var(--zp-border)',
                      color: 'var(--zp-text-primary)',
                    }}
                  />
                </FieldRow>
              </div>
            )}
          </div>
        )}

        {/* BASIC AUTH */}
        {auth.type === 'basic' && (
          <div className="space-y-3">
            <FieldRow label="Username">
              <AuthInput
                value={auth.basicUsername || ''}
                onChange={(v) => patch({ basicUsername: v })}
                placeholder="Username"
              />
            </FieldRow>
            <FieldRow label="Password">
              <AuthInput
                secret
                value={auth.basicPassword || ''}
                onChange={(v) => patch({ basicPassword: v })}
                placeholder="Password"
              />
            </FieldRow>
          </div>
        )}

        {/* DIGEST AUTH */}
        {auth.type === 'digest' && (
          <div className="space-y-3">
            <FieldRow label="Username">
              <AuthInput
                value={auth.digestUsername || ''}
                onChange={(v) => patch({ digestUsername: v })}
                placeholder="Username"
              />
            </FieldRow>
            <FieldRow label="Password">
              <AuthInput
                secret
                value={auth.digestPassword || ''}
                onChange={(v) => patch({ digestPassword: v })}
                placeholder="Password"
              />
            </FieldRow>

            <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced((p) => !p)} />
            {showAdvanced && (
              <div className="space-y-3 pt-1">
                <p className="text-[11px]" style={{ color: 'var(--zp-text-muted)' }}>
                  留空时会在收到服务端 401 响应后自动解析 WWW-Authenticate 质询头并重新计算签名。
                </p>
                <FieldRow label="Realm" hint="可选，留空由 401 响应自动提取">
                  <AuthInput
                    value={auth.digestRealm || ''}
                    onChange={(v) => patch({ digestRealm: v })}
                    placeholder="testrealm@example.com"
                  />
                </FieldRow>
                <FieldRow label="Nonce" hint="可选，留空由 401 响应自动提取">
                  <AuthInput
                    value={auth.digestNonce || ''}
                    onChange={(v) => patch({ digestNonce: v })}
                    placeholder="Nonce"
                  />
                </FieldRow>
                <FieldRow label="Algorithm">
                  <CustomSelect
                    value={auth.digestAlgorithm || 'MD5'}
                    onChange={(v) =>
                      patch({
                        digestAlgorithm: v as
                          | 'MD5'
                          | 'MD5-sess'
                          | 'SHA-256'
                          | 'SHA-256-sess'
                          | 'SHA-512-256',
                      })
                    }
                    size="md"
                    minWidth={180}
                    options={[
                      { value: 'MD5', label: 'MD5' },
                      { value: 'MD5-sess', label: 'MD5-sess' },
                      { value: 'SHA-256', label: 'SHA-256' },
                      { value: 'SHA-256-sess', label: 'SHA-256-sess' },
                    ]}
                  />
                </FieldRow>
                <FieldRow label="qop">
                  <AuthInput
                    value={auth.digestQop || ''}
                    onChange={(v) => patch({ digestQop: v })}
                    placeholder="e.g. auth, auth-int"
                  />
                </FieldRow>
                <FieldRow label="Nonce Count">
                  <AuthInput
                    value={auth.digestNc || ''}
                    onChange={(v) => patch({ digestNc: v })}
                    placeholder="e.g. 00000001"
                  />
                </FieldRow>
                <FieldRow label="Client Nonce">
                  <AuthInput
                    value={auth.digestCnonce || ''}
                    onChange={(v) => patch({ digestCnonce: v })}
                    placeholder="留空自动生成"
                  />
                </FieldRow>
                <FieldRow label="Opaque">
                  <AuthInput
                    value={auth.digestOpaque || ''}
                    onChange={(v) => patch({ digestOpaque: v })}
                    placeholder="Opaque"
                  />
                </FieldRow>
              </div>
            )}
          </div>
        )}

        {/* OAUTH 1.0 */}
        {auth.type === 'oauth1' && (
          <div className="space-y-3">
            <FieldRow label="Add auth data to">
              <CustomSelect
                value={auth.oauth1AddTo || 'header'}
                onChange={(v) => patch({ oauth1AddTo: v as 'header' | 'query' })}
                size="md"
                minWidth={180}
                options={[
                  { value: 'header', label: 'Request Headers' },
                  { value: 'query', label: 'Request URL' },
                ]}
              />
            </FieldRow>
            <FieldRow label="Signature Method">
              <CustomSelect
                value={auth.oauth1SignatureMethod || 'HMAC-SHA1'}
                onChange={(v) =>
                  patch({
                    oauth1SignatureMethod: v as 'HMAC-SHA1' | 'HMAC-SHA256' | 'PLAINTEXT',
                  })
                }
                size="md"
                minWidth={180}
                options={[
                  { value: 'HMAC-SHA1', label: 'HMAC-SHA1' },
                  { value: 'HMAC-SHA256', label: 'HMAC-SHA256' },
                  { value: 'PLAINTEXT', label: 'PLAINTEXT' },
                ]}
              />
            </FieldRow>
            <FieldRow label="Consumer Key">
              <AuthInput
                value={auth.oauth1ConsumerKey || ''}
                onChange={(v) => patch({ oauth1ConsumerKey: v })}
                placeholder="Consumer Key"
              />
            </FieldRow>
            <FieldRow label="Consumer Secret">
              <AuthInput
                secret
                value={auth.oauth1ConsumerSecret || ''}
                onChange={(v) => patch({ oauth1ConsumerSecret: v })}
                placeholder="Consumer Secret"
              />
            </FieldRow>
            <FieldRow label="Access Token">
              <AuthInput
                value={auth.oauth1Token || ''}
                onChange={(v) => patch({ oauth1Token: v })}
                placeholder="Access Token"
              />
            </FieldRow>
            <FieldRow label="Token Secret">
              <AuthInput
                secret
                value={auth.oauth1TokenSecret || ''}
                onChange={(v) => patch({ oauth1TokenSecret: v })}
                placeholder="Token Secret"
              />
            </FieldRow>

            <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced((p) => !p)} />
            {showAdvanced && (
              <div className="space-y-3 pt-1">
                <FieldRow label="Callback URL">
                  <AuthInput
                    value={auth.oauth1Callback || ''}
                    onChange={(v) => patch({ oauth1Callback: v })}
                    placeholder="https://..."
                  />
                </FieldRow>
                <FieldRow label="Verifier">
                  <AuthInput
                    value={auth.oauth1Verifier || ''}
                    onChange={(v) => patch({ oauth1Verifier: v })}
                    placeholder="Verifier"
                  />
                </FieldRow>
                <FieldRow label="Timestamp">
                  <AuthInput
                    value={auth.oauth1Timestamp || ''}
                    onChange={(v) => patch({ oauth1Timestamp: v })}
                    placeholder="留空自动生成当前时间戳"
                  />
                </FieldRow>
                <FieldRow label="Nonce">
                  <AuthInput
                    value={auth.oauth1Nonce || ''}
                    onChange={(v) => patch({ oauth1Nonce: v })}
                    placeholder="留空自动随机生成"
                  />
                </FieldRow>
                <FieldRow label="Version">
                  <AuthInput
                    value={auth.oauth1Version || '1.0'}
                    onChange={(v) => patch({ oauth1Version: v })}
                    placeholder="1.0"
                  />
                </FieldRow>
                <FieldRow label="Realm">
                  <AuthInput
                    value={auth.oauth1Realm || ''}
                    onChange={(v) => patch({ oauth1Realm: v })}
                    placeholder="Realm"
                  />
                </FieldRow>
              </div>
            )}
          </div>
        )}

        {/* OAUTH 2.0 */}
        {auth.type === 'oauth2' && (
          <div className="space-y-3">
            <FieldRow label="Add auth data to">
              <CustomSelect
                value={auth.oauth2AddTo || 'header'}
                onChange={(v) => patch({ oauth2AddTo: v as 'header' | 'query' })}
                size="md"
                minWidth={180}
                options={[
                  { value: 'header', label: 'Request Headers' },
                  { value: 'query', label: 'Request URL' },
                ]}
              />
            </FieldRow>
            <FieldRow label="Access Token">
              <AuthInput
                value={auth.oauth2Token || ''}
                onChange={(v) => patch({ oauth2Token: v })}
                placeholder="输入 Access Token 或使用下方工具获取"
              />
            </FieldRow>
            {auth.oauth2AddTo !== 'query' && (
              <FieldRow label="Header Prefix">
                <AuthInput
                  value={auth.oauth2HeaderPrefix ?? 'Bearer'}
                  onChange={(v) => patch({ oauth2HeaderPrefix: v })}
                  placeholder="Bearer"
                />
              </FieldRow>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowOAuth2Fetcher((p) => !p)}
                className="inline-flex items-center gap-1.5 font-medium transition-colors hover:opacity-85"
                style={{ color: 'var(--zp-accent)' }}
              >
                {showOAuth2Fetcher ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
                <span>Configure New Token (向认证端点换取 Access Token)</span>
              </button>
            </div>

            {showOAuth2Fetcher && (
              <div
                className="space-y-3 pt-2 border-t"
                style={{ borderColor: 'var(--zp-border-subtle)' }}
              >
                <FieldRow label="Grant Type">
                  <CustomSelect
                    value={auth.oauth2GrantType || 'client_credentials'}
                    onChange={(v) =>
                      patch({
                        oauth2GrantType: v as
                          | 'client_credentials'
                          | 'password'
                          | 'authorization_code',
                      })
                    }
                    size="md"
                    minWidth={200}
                    options={[
                      { value: 'client_credentials', label: 'Client Credentials' },
                      { value: 'password', label: 'Password Credentials' },
                      { value: 'authorization_code', label: 'Authorization Code' },
                    ]}
                  />
                </FieldRow>
                <FieldRow label="Access Token URL">
                  <AuthInput
                    value={auth.oauth2AccessTokenUrl || ''}
                    onChange={(v) => patch({ oauth2AccessTokenUrl: v })}
                    placeholder="https://auth.example.com/oauth/token"
                  />
                </FieldRow>
                <FieldRow label="Client ID">
                  <AuthInput
                    value={auth.oauth2ClientId || ''}
                    onChange={(v) => patch({ oauth2ClientId: v })}
                    placeholder="Client ID"
                  />
                </FieldRow>
                <FieldRow label="Client Secret">
                  <AuthInput
                    secret
                    value={auth.oauth2ClientSecret || ''}
                    onChange={(v) => patch({ oauth2ClientSecret: v })}
                    placeholder="Client Secret"
                  />
                </FieldRow>
                {auth.oauth2GrantType === 'password' && (
                  <>
                    <FieldRow label="Username">
                      <AuthInput
                        value={auth.oauth2Username || ''}
                        onChange={(v) => patch({ oauth2Username: v })}
                        placeholder="Username"
                      />
                    </FieldRow>
                    <FieldRow label="Password">
                      <AuthInput
                        secret
                        value={auth.oauth2Password || ''}
                        onChange={(v) => patch({ oauth2Password: v })}
                        placeholder="Password"
                      />
                    </FieldRow>
                  </>
                )}
                {auth.oauth2GrantType === 'authorization_code' && (
                  <>
                    <FieldRow label="Code">
                      <AuthInput
                        value={auth.oauth2Code || ''}
                        onChange={(v) => patch({ oauth2Code: v })}
                        placeholder="Authorization Code"
                      />
                    </FieldRow>
                    <FieldRow label="Redirect URI">
                      <AuthInput
                        value={auth.oauth2RedirectUri || ''}
                        onChange={(v) => patch({ oauth2RedirectUri: v })}
                        placeholder="https://..."
                      />
                    </FieldRow>
                  </>
                )}
                <FieldRow label="Scope">
                  <AuthInput
                    value={auth.oauth2Scope || ''}
                    onChange={(v) => patch({ oauth2Scope: v })}
                    placeholder="read write (可选)"
                  />
                </FieldRow>
                <div className="grid grid-cols-[150px_1fr] items-center gap-3 pt-1">
                  <div />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={oauth2Loading}
                      onClick={handleFetchOAuth2Token}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-opacity disabled:opacity-50"
                      style={{
                        backgroundColor: 'var(--zp-accent)',
                        color: 'var(--zp-accent-fg)',
                      }}
                    >
                      {oauth2Loading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>Get New Access Token</span>
                    </button>
                    {oauth2Msg && (
                      <span
                        className="text-[11px]"
                        style={{
                          color: oauth2Msg.ok ? '#10b981' : '#f43f5e',
                        }}
                      >
                        {oauth2Msg.text}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* HAWK AUTHENTICATION */}
        {auth.type === 'hawk' && (
          <div className="space-y-3">
            <FieldRow label="Hawk Auth ID">
              <AuthInput
                value={auth.hawkId || ''}
                onChange={(v) => patch({ hawkId: v })}
                placeholder="dh37fgj492je"
              />
            </FieldRow>
            <FieldRow label="Hawk Auth Key">
              <AuthInput
                secret
                value={auth.hawkKey || ''}
                onChange={(v) => patch({ hawkKey: v })}
                placeholder="werxhqb98rpaxn39848xrunpaw3489ruxnpa98w4rxn"
              />
            </FieldRow>
            <FieldRow label="Algorithm">
              <CustomSelect
                value={auth.hawkAlgorithm || 'sha256'}
                onChange={(v) => patch({ hawkAlgorithm: v as 'sha256' | 'sha1' })}
                size="md"
                minWidth={180}
                options={[
                  { value: 'sha256', label: 'sha256' },
                  { value: 'sha1', label: 'sha1' },
                ]}
              />
            </FieldRow>

            <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced((p) => !p)} />
            {showAdvanced && (
              <div className="space-y-3 pt-1">
                <FieldRow label="Nonce">
                  <AuthInput
                    value={auth.hawkNonce || ''}
                    onChange={(v) => patch({ hawkNonce: v })}
                    placeholder="留空自动生成"
                  />
                </FieldRow>
                <FieldRow label="ext (Extra Data)">
                  <AuthInput
                    value={auth.hawkExt || ''}
                    onChange={(v) => patch({ hawkExt: v })}
                    placeholder="some-app-ext-data"
                  />
                </FieldRow>
                <FieldRow label="app">
                  <AuthInput
                    value={auth.hawkApp || ''}
                    onChange={(v) => patch({ hawkApp: v })}
                    placeholder="Application ID"
                  />
                </FieldRow>
                <FieldRow label="dlg">
                  <AuthInput
                    value={auth.hawkDlg || ''}
                    onChange={(v) => patch({ hawkDlg: v })}
                    placeholder="Delegation"
                  />
                </FieldRow>
              </div>
            )}
          </div>
        )}

        {/* AWS SIGNATURE V4 */}
        {auth.type === 'awsv4' && (
          <div className="space-y-3">
            <FieldRow label="Add auth data to">
              <CustomSelect
                value={auth.awsAddTo || 'header'}
                onChange={(v) => patch({ awsAddTo: v as 'header' | 'query' })}
                size="md"
                minWidth={180}
                options={[
                  { value: 'header', label: 'Request Headers' },
                  { value: 'query', label: 'Request URL' },
                ]}
              />
            </FieldRow>
            <FieldRow label="AccessKey">
              <AuthInput
                value={auth.awsAccessKey || ''}
                onChange={(v) => patch({ awsAccessKey: v })}
                placeholder="AKIA..."
              />
            </FieldRow>
            <FieldRow label="SecretKey">
              <AuthInput
                secret
                value={auth.awsSecretKey || ''}
                onChange={(v) => patch({ awsSecretKey: v })}
                placeholder="AWS Secret Access Key"
              />
            </FieldRow>

            <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced((p) => !p)} />
            {showAdvanced && (
              <div className="space-y-3 pt-1">
                <FieldRow label="AWS Region">
                  <AuthInput
                    value={auth.awsRegion || ''}
                    onChange={(v) => patch({ awsRegion: v })}
                    placeholder="us-east-1"
                  />
                </FieldRow>
                <FieldRow label="Service Name">
                  <AuthInput
                    value={auth.awsService || ''}
                    onChange={(v) => patch({ awsService: v })}
                    placeholder="s3 / execute-api"
                  />
                </FieldRow>
                <FieldRow label="Session Token">
                  <AuthInput
                    secret
                    value={auth.awsSessionToken || ''}
                    onChange={(v) => patch({ awsSessionToken: v })}
                    placeholder="X-Amz-Security-Token (可选)"
                  />
                </FieldRow>
              </div>
            )}
          </div>
        )}

        {/* NTLM AUTHENTICATION */}
        {auth.type === 'ntlm' && (
          <div className="space-y-3">
            <FieldRow label="Username">
              <AuthInput
                value={auth.ntlmUsername || ''}
                onChange={(v) => patch({ ntlmUsername: v })}
                placeholder="Username"
              />
            </FieldRow>
            <FieldRow label="Password">
              <AuthInput
                secret
                value={auth.ntlmPassword || ''}
                onChange={(v) => patch({ ntlmPassword: v })}
                placeholder="Password"
              />
            </FieldRow>

            <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced((p) => !p)} />
            {showAdvanced && (
              <div className="space-y-3 pt-1">
                <FieldRow label="Domain">
                  <AuthInput
                    value={auth.ntlmDomain || ''}
                    onChange={(v) => patch({ ntlmDomain: v })}
                    placeholder="WORKGROUP / DOMAIN"
                  />
                </FieldRow>
                <FieldRow label="Workstation">
                  <AuthInput
                    value={auth.ntlmWorkstation || ''}
                    onChange={(v) => patch({ ntlmWorkstation: v })}
                    placeholder="Workstation"
                  />
                </FieldRow>
              </div>
            )}
          </div>
        )}

        {/* AKAMAI EDGEGRID */}
        {auth.type === 'edgegrid' && (
          <div className="space-y-3">
            <FieldRow label="Access Token">
              <AuthInput
                value={auth.edgegridAccessToken || ''}
                onChange={(v) => patch({ edgegridAccessToken: v })}
                placeholder="akab-..."
              />
            </FieldRow>
            <FieldRow label="Client Token">
              <AuthInput
                value={auth.edgegridClientToken || ''}
                onChange={(v) => patch({ edgegridClientToken: v })}
                placeholder="akab-..."
              />
            </FieldRow>
            <FieldRow label="Client Secret">
              <AuthInput
                secret
                value={auth.edgegridClientSecret || ''}
                onChange={(v) => patch({ edgegridClientSecret: v })}
                placeholder="Client Secret"
              />
            </FieldRow>

            <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced((p) => !p)} />
            {showAdvanced && (
              <div className="space-y-3 pt-1">
                <FieldRow label="Nonce">
                  <AuthInput
                    value={auth.edgegridNonce || ''}
                    onChange={(v) => patch({ edgegridNonce: v })}
                    placeholder="留空自动生成 UUID"
                  />
                </FieldRow>
                <FieldRow label="Timestamp">
                  <AuthInput
                    value={auth.edgegridTimestamp || ''}
                    onChange={(v) => patch({ edgegridTimestamp: v })}
                    placeholder="留空自动生成 UTC 时间"
                  />
                </FieldRow>
                <FieldRow label="Base URL">
                  <AuthInput
                    value={auth.edgegridBaseUrl || ''}
                    onChange={(v) => patch({ edgegridBaseUrl: v })}
                    placeholder="https://akab-xxx.luna.akamaiapis.net"
                  />
                </FieldRow>
                <FieldRow label="Headers to Sign">
                  <AuthInput
                    value={auth.edgegridHeadersToSign || ''}
                    onChange={(v) => patch({ edgegridHeadersToSign: v })}
                    placeholder="逗号分隔，例如 x-custom-1, x-custom-2"
                  />
                </FieldRow>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const AdvancedToggle: React.FC<{ open: boolean; onToggle: () => void }> = ({
  open,
  onToggle,
}) => (
  <div className="pt-1">
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 font-medium transition-opacity hover:opacity-80"
      style={{ color: 'var(--zp-text-primary)' }}
    >
      {open ? (
        <ChevronDown className="w-3.5 h-3.5" />
      ) : (
        <ChevronRight className="w-3.5 h-3.5" />
      )}
      <span>高级配置 (Advanced configuration)</span>
    </button>
  </div>
);
