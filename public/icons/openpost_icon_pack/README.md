# OpenPost 应用图标资源包

本资源包基于你确认的「蓝色星球 + 环绕轨道 + 星光」图标整理，主要提供 PNG，另附 Windows ICO、Android mipmap 和 macOS iconset。

## 目录
- `png/white/`：白色背景 PNG，适合常规桌面/移动端应用图标
- `png/transparent/`：透明背景 PNG，适合网页、启动页或自定义背景
- `platform/windows/openpost.ico`：Windows 多尺寸 ICO
- `platform/android/`：Android launcher 图标 mipmap
- `platform/macos/openpost.iconset/`：macOS iconutil 所需的 iconset PNG

## PNG 尺寸
16、24、32、48、64、128、256、512、1024 px（均为正方形）。

## 使用建议
- Electron / Windows：优先使用 `platform/windows/openpost.ico`，或 `png/white/openpost-256.png`
- Web favicon：使用 16、32、48 px PNG
- Android：按 mipmap 目录放入对应资源
- macOS：在 macOS 环境执行 `iconutil -c icns openpost.iconset` 生成 `.icns`
- 透明版：如需保留原始白色轨道与透明背景，请先在目标界面检查实际显示效果；白色轨道在浅色背景上可能不明显。

## 说明
源图为用户提供的预览图，本资源包按图形内容裁切、居中并生成多尺寸资源；白底版保留原图视觉，透明版通过背景连通区域处理生成。
