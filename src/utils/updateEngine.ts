import {
  ProxyConfig,
  ReleaseAsset,
  ReleaseVersionEntry,
  StructuredChangelog,
  UpdateCheckResult,
  UpdateConfig,
} from '../types/api';

export const UPDATE_CONFIG_STORAGE_KEY = 'openpost_update_config_v1';

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__
    ? __APP_VERSION__.replace(/^v/i, '')
    : '0.6.0';

export const GITHUB_UPDATE_REPO = 'Mayezi/OpenPost';

export const DEFAULT_GITHUB_REPO: string = GITHUB_UPDATE_REPO;

export const DEFAULT_UPDATE_CONFIG: UpdateConfig = {
  githubRepo: GITHUB_UPDATE_REPO,
  autoCheckOnStartup: true,
  includePrerelease: false,
  ignoredVersion: '',
  lastCheckedAt: '',
};

export const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function sanitizeGithubRepoInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return GITHUB_UPDATE_REPO;
  const urlMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/i
  );
  if (urlMatch) {
    return urlMatch[1];
  }
  return trimmed.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
}

export function isValidGithubRepo(repo: string): boolean {
  return GITHUB_REPO_PATTERN.test(repo.trim());
}

export function loadUpdateConfig(): UpdateConfig {
  try {
    const raw = localStorage.getItem(UPDATE_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UpdateConfig>;
      return {
        ...DEFAULT_UPDATE_CONFIG,
        ...parsed,
        githubRepo: GITHUB_UPDATE_REPO,
      };
    }
  } catch {
    // Fallback to defaults
  }
  return { ...DEFAULT_UPDATE_CONFIG };
}

export function saveUpdateConfig(cfg: UpdateConfig): void {
  try {
    localStorage.setItem(UPDATE_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // Ignore storage quota errors
  }
}

export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

function parseSemver(input: string): ParsedSemver | null {
  const cleaned = normalizeVersion(input);
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/);
  if (!match) return null;
  return {
    major: Number(match[1] || 0),
    minor: Number(match[2] || 0),
    patch: Number(match[3] || 0),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

/**
 * Returns > 0 if a > b, < 0 if a < b, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) {
    return normalizeVersion(a).localeCompare(normalizeVersion(b), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }

  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;

  const aHasPre = pa.prerelease.length > 0;
  const bHasPre = pb.prerelease.length > 0;
  if (!aHasPre && !bHasPre) return 0;
  if (!aHasPre && bHasPre) return 1;
  if (aHasPre && !bHasPre) return -1;

  const maxLen = Math.max(pa.prerelease.length, pb.prerelease.length);
  for (let i = 0; i < maxLen; i++) {
    const segA = pa.prerelease[i];
    const segB = pb.prerelease[i];
    if (segA === undefined) return -1;
    if (segB === undefined) return 1;
    const numA = /^\d+$/.test(segA) ? Number(segA) : null;
    const numB = /^\d+$/.test(segB) ? Number(segB) : null;
    if (numA !== null && numB !== null) {
      if (numA !== numB) return numA - numB;
    } else if (numA !== null) {
      return -1;
    } else if (numB !== null) {
      return 1;
    } else {
      const cmp = segA.localeCompare(segB);
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

/**
 * Strictly parses release notes into the 3 standardized themes:
 * - features (新功能)
 * - improvements (改进)
 * - fixes (问题修复)
 */
export function parseStructuredChangelog(markdown: string): StructuredChangelog {
  const result: StructuredChangelog = {
    features: [],
    improvements: [],
    fixes: [],
  };
  if (!markdown || !markdown.trim()) return result;

  let currentSection: keyof StructuredChangelog | null = null;
  const uncategorized: string[] = [];

  const cleanLineText = (text: string): string =>
    text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
      .trim();

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // Detect Markdown heading (# .. ####) or bold-only section header
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/) || line.match(/^\*\*(.+?)\*\*[:：]?$/);
    if (headingMatch) {
      const heading = headingMatch[1].trim().toLowerCase();
      // Ignore top-level version title like "# v2.0.3 (2026-11-22)"
      if (/^v?\d+\.\d+/.test(heading)) {
        continue;
      }
      if (/新功能|新增|特性|feature|added|what's new|new\b/.test(heading)) {
        currentSection = 'features';
      } else if (/问题修复|修复|缺陷|bug|fix|resolved/.test(heading)) {
        currentSection = 'fixes';
      } else if (/改进|优化|变更|增强|提升|improv|chang|enhanc|perf|refactor|update/.test(heading)) {
        currentSection = 'improvements';
      } else {
        currentSection = null;
      }
      continue;
    }

    // Ignore installer download link boilerplate if any legacy release had it
    if (/^>\s*/.test(line) || /^---+$/.test(line)) {
      continue;
    }

    const bulletMatch = line.match(/^(?:[-*•+]|\d+[.)])\s+(.+)$/);
    if (bulletMatch) {
      const cleaned = cleanLineText(bulletMatch[1]);
      if (!cleaned) continue;
      if (currentSection) {
        result[currentSection].push(cleaned);
      } else {
        uncategorized.push(cleaned);
      }
    } else if (currentSection && !line.startsWith('http')) {
      const cleaned = cleanLineText(line);
      if (cleaned) {
        result[currentSection].push(cleaned);
      }
    }
  }

  // If the release notes had bullets without explicit headings, classify them intelligently into the 3 themes
  if (
    result.features.length === 0 &&
    result.improvements.length === 0 &&
    result.fixes.length === 0 &&
    uncategorized.length > 0
  ) {
    for (const item of uncategorized) {
      if (/^(feat|新增|支持|推出)/i.test(item)) {
        result.features.push(item);
      } else if (/^(fix|修复|解决|bug)/i.test(item)) {
        result.fixes.push(item);
      } else {
        result.improvements.push(item);
      }
    }
  }

  return result;
}

export function detectClientPlatform(): 'windows' | 'macos' | 'linux' {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos';
  if (ua.includes('linux') && !ua.includes('android')) return 'linux';
  return 'windows';
}

export function classifyAssetPlatform(filename: string): 'windows' | 'macos' | 'linux' | 'other' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.exe') || lower.endsWith('.msi') || lower.includes('windows') || lower.includes('win')) {
    return 'windows';
  }
  if (lower.endsWith('.dmg') || lower.endsWith('.pkg') || lower.includes('macos') || lower.includes('darwin')) {
    return 'macos';
  }
  if (
    lower.endsWith('.deb') ||
    lower.endsWith('.appimage') ||
    lower.endsWith('.rpm') ||
    lower.includes('linux')
  ) {
    return 'linux';
  }
  return 'other';
}

export function formatBytesCompact(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatReleaseDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Bundle all local changelogs from /changelogs/*.md at build time
const LOCAL_CHANGELOG_FILES = import.meta.glob('/changelogs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function getLocalChangelogs(): ReleaseVersionEntry[] {
  const entries: ReleaseVersionEntry[] = [];

  for (const [filePath, rawContent] of Object.entries(LOCAL_CHANGELOG_FILES)) {
    const fileName = filePath.split('/').pop() || '';
    if (!fileName || fileName.toLowerCase() === 'readme.md') continue;

    const tag = fileName.replace(/\.md$/i, '');
    const version = normalizeVersion(tag);
    const firstLine = rawContent.split(/\r?\n/).find((l) => l.trim().startsWith('#')) || '';
    const dateMatch = firstLine.match(/\((\d{4}-\d{2}-\d{2})\)/);
    const publishedAt = dateMatch ? dateMatch[1] : '';

    entries.push({
      tag: tag.startsWith('v') || tag.startsWith('V') ? tag : `v${tag}`,
      version,
      name: `OpenPost ${tag.startsWith('v') || tag.startsWith('V') ? tag : `v${tag}`}`,
      publishedAt,
      rawBody: rawContent,
      changelog: parseStructuredChangelog(rawContent),
      assets: [],
      source: 'local',
    });
  }

  entries.sort((a, b) => compareSemver(b.version, a.version));
  return entries;
}

interface RawBackendRelease {
  tag?: string;
  version?: string;
  name?: string;
  publishedAt?: string;
  htmlUrl?: string;
  prerelease?: boolean;
  body?: string;
  assets?: Array<{
    name: string;
    size: number;
    downloadUrl: string;
    contentType?: string;
    platform?: 'windows' | 'macos' | 'linux' | 'other';
  }>;
}

/**
 * Checks for updates from GitHub Releases (each tag = one version).
 * Routes through local backend `/api/update/check` (which honors HTTP/HTTPS/SOCKS5 proxy
 * and works in both Node dev server & Rust desktop binary), with browser fetch fallback.
 */
export async function checkGithubUpdates(options?: {
  currentVersion?: string;
  includePrerelease?: boolean;
  proxy?: ProxyConfig | null;
}): Promise<UpdateCheckResult> {
  const repo = GITHUB_UPDATE_REPO;
  const currentVersion = normalizeVersion(options?.currentVersion || APP_VERSION);
  const includePrerelease = Boolean(options?.includePrerelease);
  const checkedAt = new Date().toISOString();

  // 1. Primary path: local Node/Rust backend endpoint (supports proxy & CORS-free GitHub API)
  try {
    const res = await fetch('/api/update/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentVersion,
        includePrerelease,
        proxy: options?.proxy || undefined,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (!data.ok) {
        return {
          ok: false,
          currentVersion,
          latestVersion: currentVersion,
          latestTag: `v${currentVersion}`,
          hasUpdate: false,
          releaseName: '',
          publishedAt: '',
          htmlUrl: `https://github.com/${repo}/releases`,
          rawChangelog: '',
          changelog: { features: [], improvements: [], fixes: [] },
          assets: [],
          releases: [],
          checkedAt: data.checkedAt || checkedAt,
          repo,
          error: data.error || '检查更新失败，请检查网络连接或仓库地址。',
        };
      }

      const rawReleases: RawBackendRelease[] = Array.isArray(data.releases) ? data.releases : [];
      const releases: ReleaseVersionEntry[] = rawReleases.map((r) => {
        const tag = r.tag || `v${r.version || ''}`;
        const ver = normalizeVersion(r.version || tag);
        const body = r.body || '';
        const assets: ReleaseAsset[] = Array.isArray(r.assets)
          ? r.assets.map((a) => ({
              name: a.name,
              size: Number(a.size) || 0,
              downloadUrl: a.downloadUrl,
              contentType: a.contentType || 'application/octet-stream',
              platform: a.platform || classifyAssetPlatform(a.name),
            }))
          : [];
        return {
          tag,
          version: ver,
          name: r.name || `OpenPost ${tag}`,
          publishedAt: r.publishedAt || '',
          htmlUrl: r.htmlUrl || `https://github.com/${repo}/releases/tag/${tag}`,
          prerelease: Boolean(r.prerelease),
          rawBody: body,
          changelog: parseStructuredChangelog(body),
          assets,
          source: 'github',
        };
      });

      const latestVersion = normalizeVersion(data.latestVersion || data.latestTag || currentVersion);
      const latestTag = data.latestTag || `v${latestVersion}`;
      const rawChangelog = data.rawChangelog || '';
      const assets: ReleaseAsset[] = Array.isArray(data.assets)
        ? data.assets.map((a: ReleaseAsset) => ({
            name: a.name,
            size: Number(a.size) || 0,
            downloadUrl: a.downloadUrl,
            contentType: a.contentType || 'application/octet-stream',
            platform: a.platform || classifyAssetPlatform(a.name),
          }))
        : [];

      const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;

      return {
        ok: true,
        currentVersion,
        latestVersion,
        latestTag,
        hasUpdate,
        releaseName: data.releaseName || `OpenPost ${latestTag}`,
        publishedAt: data.publishedAt || '',
        htmlUrl: data.htmlUrl || `https://github.com/${repo}/releases/tag/${latestTag}`,
        rawChangelog,
        changelog: parseStructuredChangelog(rawChangelog),
        assets,
        releases,
        checkedAt: data.checkedAt || checkedAt,
        repo,
      };
    }
  } catch {
    // Fallback to direct GitHub REST API fetch if backend route is unavailable
  }

  // 2. Fallback path: direct browser GitHub REST API
  try {
    const ghRes = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=15`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (ghRes.status === 404) {
      throw new Error(`未找到 GitHub 仓库 ${repo} 或该仓库尚未公开。`);
    }
    if (ghRes.status === 403) {
      throw new Error('GitHub API 访问频率受限，请稍后重试或在代理设置中切换出口。');
    }
    if (!ghRes.ok) {
      throw new Error(`GitHub API 返回异常状态码 HTTP ${ghRes.status}`);
    }

    const list = (await ghRes.json()) as Array<{
      tag_name: string;
      name?: string;
      body?: string;
      draft?: boolean;
      prerelease?: boolean;
      published_at?: string;
      html_url?: string;
      assets?: Array<{
        name: string;
        size: number;
        browser_download_url: string;
        content_type?: string;
      }>;
    }>;

    const valid = list
      .filter((r) => !r.draft && (includePrerelease || !r.prerelease) && Boolean(r.tag_name))
      .sort((a, b) => compareSemver(b.tag_name, a.tag_name));

    if (valid.length === 0) {
      return {
        ok: true,
        currentVersion,
        latestVersion: currentVersion,
        latestTag: `v${currentVersion}`,
        hasUpdate: false,
        releaseName: `OpenPost v${currentVersion}`,
        publishedAt: '',
        htmlUrl: `https://github.com/${repo}/releases`,
        rawChangelog: '',
        changelog: { features: [], improvements: [], fixes: [] },
        assets: [],
        releases: [],
        checkedAt,
        repo,
      };
    }

    const releases: ReleaseVersionEntry[] = valid.map((r) => {
      const assets: ReleaseAsset[] = (r.assets || []).map((a) => ({
        name: a.name,
        size: a.size,
        downloadUrl: a.browser_download_url,
        contentType: a.content_type || 'application/octet-stream',
        platform: classifyAssetPlatform(a.name),
      }));
      const body = r.body || '';
      return {
        tag: r.tag_name,
        version: normalizeVersion(r.tag_name),
        name: r.name || `OpenPost ${r.tag_name}`,
        publishedAt: r.published_at || '',
        htmlUrl: r.html_url || `https://github.com/${repo}/releases/tag/${r.tag_name}`,
        prerelease: Boolean(r.prerelease),
        rawBody: body,
        changelog: parseStructuredChangelog(body),
        assets,
        source: 'github',
      };
    });

    const latest = releases[0];
    const hasUpdate = compareSemver(latest.version, currentVersion) > 0;

    return {
      ok: true,
      currentVersion,
      latestVersion: latest.version,
      latestTag: latest.tag,
      hasUpdate,
      releaseName: latest.name,
      publishedAt: latest.publishedAt,
      htmlUrl: latest.htmlUrl || `https://github.com/${repo}/releases/tag/${latest.tag}`,
      rawChangelog: latest.rawBody,
      changelog: latest.changelog,
      assets: latest.assets,
      releases,
      checkedAt,
      repo,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      currentVersion,
      latestVersion: currentVersion,
      latestTag: `v${currentVersion}`,
      hasUpdate: false,
      releaseName: '',
      publishedAt: '',
      htmlUrl: `https://github.com/${repo}/releases`,
      rawChangelog: '',
      changelog: { features: [], improvements: [], fixes: [] },
      assets: [],
      releases: [],
      checkedAt,
      repo,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
