# 💾 网页保存器 - Chrome 扩展

一个基于 Manifest V3 的 Chrome 浏览器扩展，将当前网页保存为本地 HTML 文件，并下载所有媒体资源到 `media` 文件夹，确保离线后可完整查看。

支持 **Windows / macOS / Linux** 全平台运行。

## ✨ 功能特性

- **保存完整网页**：将当前页面 DOM 结构、样式、内联脚本保存为 `.html` 文件
- **下载媒体资源**：自动提取并下载页面中的图片、视频、音频资源到对应子目录
- **嵌入 JSON 音频提取**：扫描 `__NEXT_DATA__` 等页面嵌入 JSON 中的音频/视频 URL（支持播客等 JS 播放器页面）
- **路径自动重写**：HTML 中的媒体引用自动替换为本地相对路径
- **媒体按类型分目录**：图片 → `pictures/`、视频 → `videos/`、音频 → `audios/`
- **跨域资源支持**：通过 `fetch + blob` 方式尝试下载跨域资源
- **重名自动处理**：资源文件名冲突时自动添加序号
- **进度实时显示**：弹出界面显示下载进度
- **用户选项**：可选择是否下载图片/视频/音频、是否保留内联样式
- **跨平台兼容**：文件名清理覆盖 Windows/macOS/Linux，处理保留名、非法字符、大小写等

## 📁 项目结构

```
chrome-web-saver/
├── manifest.json        # 扩展清单文件（Manifest V3）
├── background.js        # Service Worker，协调下载逻辑
├── content.js           # 内容脚本，页面 DOM 操作和资源收集
├── popup.html           # 弹出界面 HTML
├── popup.js             # 弹出界面逻辑
├── icons/
│   ├── icon16.png       # 16x16 图标
│   ├── icon48.png       # 48x48 图标
│   └── icon128.png      # 128x128 图标
└── README.md            # 本文件
```

## 🔧 安装步骤

1. **克隆或下载本项目**到本地：
   ```bash
   git clone https://github.com/hlizao/WebPageSaver_GLM.git
   cd WebPageSaver_GLM
   ```

2. **打开 Chrome 扩展管理页面**：
   - 地址栏输入 `chrome://extensions/` 回车
   - 或通过菜单 → 更多工具 → 扩展程序

3. **开启开发者模式**：
   - 右上角打开「开发者模式」开关

4. **加载扩展**：
   - 点击「加载已解压的扩展程序」
   - 选择本项目根目录（包含 `manifest.json` 的文件夹）
   - 点击「选择文件夹」

5. **开始使用**：
   - 工具栏出现 💾 图标
   - 浏览任意网页，点击图标即可保存

## 📖 使用方法

1. 在 Chrome 中打开你想保存的网页
2. 点击工具栏的 💾 扩展图标
3. 弹出界面显示页面标题和 URL
4. 勾选/取消选项：
   - ☑️ 下载图片资源
   - ☑️ 下载视频资源
   - ☑️ 下载音频资源
   - ☑️ 保留内联样式
5. 点击「保存当前网页」
6. 等待进度完成
7. 文件下载到浏览器默认下载目录的 `WebPageSaver/` 文件夹中

## 📂 下载文件结构

```
下载目录/
└── WebPageSaver/
    ├── 页面标题.html               # 保存的 HTML 文件
    └── media/
        ├── pictures/
        │   ├── cover.jpg           # 页面中的图片
        │   ├── avatar_small.png    # CDN @后缀自动转换
        │   └── icon.svg
        ├── videos/
        │   └── clip.mp4            # 页面中的视频
        └── audios/
            └── episode.m4a         # 页面中的音频（含嵌入JSON提取）
```

## 🌐 跨平台兼容性

扩展在 Windows、macOS、Linux 上均可正常运行，已做以下跨平台适配：

| 适配项 | 说明 |
|--------|------|
| **MV3 Service Worker** | 不支持 `URL.createObjectURL`，使用 `data: URL` 替代；失败时自动回退为原始 URL 下载 |
| **文件名非法字符** | 清理 `<>:"/\|?*` 及控制字符 `\x00-\x1f`，覆盖三平台 |
| **Windows 保留文件名** | `CON`/`PRN`/`AUX`/`NUL`/`COM1-9`/`LPT1-9` 自动加 `_` 前缀 |
| **大小写敏感** | macOS/Windows 不区分大小写，去重时统一小写比较，避免同名覆盖 |
| **隐藏文件** | 禁止以 `.` 开头（防止 macOS/Linux 产生隐藏文件） |
| **文件名长度** | 限制 200 字符，兼容各平台路径限制 |
| **路径分隔符** | Chrome downloads API 统一使用 `/`，通过 `PATH_SEP` 常量管理 |
| **CDN @后缀** | `image.jpg@small` → `image_small.jpg`，确保扩展名正确 |

## ⚠️ 注意事项

- 部分跨域资源可能因 CORS 限制无法下载，扩展会跳过这些资源
- `blob:` 和 `data:` URL 的资源无法单独下载（已在 HTML 内联中保留）
- 动态加载的内容（JavaScript 渲染的部分）以点击保存时的 DOM 状态为准
- 保存的 HTML 会移除 `<script>` 标签以确保安全，含媒体数据的脚本转为 `application/json` 保留数据
- 大文件下载时 `data: URL` 可能失败，扩展会自动回退为原始 URL 直接下载

## 🔑 权限说明

| 权限 | 用途 |
|------|------|
| `activeTab` | 访问当前标签页信息 |
| `scripting` | 注入内容脚本到页面 |
| `downloads` | 下载 HTML 和媒体文件到本地 |
| `storage` | 存储用户偏好设置 |

## 📜 许可证

MIT License
