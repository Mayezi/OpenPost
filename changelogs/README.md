# OpenPost 版本更新日志目录 (`changelogs/`)

本目录用于集中存储 OpenPost 每个正式版本的更新日志，每个 Git Tag（如 `v0.6.0`）对应一个独立的 Markdown 文件（`changelogs/v0.6.0.md`）。

## 发版与自动打包规则

1. **仅通过 Git Tag 触发自动打包**
   - 推送代码到 `main` / `master` 等普通分支**不会**触发跨平台自动打包。
   - 只有推送形如 `v*` 的标签（例如 `v0.7.0`）时，GitHub Actions（`.github/workflows/release.yml`）才会自动构建 Windows (`.exe`)、macOS (`.dmg`) 与 Linux (`.deb`) 原生安装包并发布到 GitHub Releases。

2. **统一三主题格式规范**
   每个版本的更新日志文件命名必须与 Tag 完全一致（如 `changelogs/v0.7.0.md`），且版本说明严格包含以下三大主题：
   - `## 新功能`
   - `## 改进`
   - `## 问题修复`

## 标准模板

```markdown
# v0.7.0 (YYYY-MM-DD)

## 新功能
- 描述新增的核心能力或功能模块

## 改进
- 描述交互体验、性能、界面或工作流优化

## 问题修复
- 描述已修复的缺陷或边界问题
```

## 标准发版流程

```bash
# 1. 新增当前版本更新日志
#    创建 changelogs/v0.7.0.md 并填写 新功能 / 改进 / 问题修复

# 2. 同步更新版本号（package.json 与 rust-desktop/Cargo.toml）并提交
git add changelogs/v0.7.0.md package.json rust-desktop/Cargo.toml
git commit -m "chore(release): prepare v0.7.0"
git push

# 3. 创建并推送版本 Tag，自动触发三端打包与 GitHub Releases 发布
git tag v0.7.0
git push origin v0.7.0
```
