# 💾 WebPageSaver - Chrome Extension

A Manifest V3 Chrome extension that saves the current web page as a local HTML file and downloads all media resources into categorized subdirectories, ensuring the page can be viewed completely offline.

Supports **Windows / macOS / Linux**.

---

[中文版](#-网页保存器---chrome-扩展)

---

## ✨ Features

- **Save complete web pages**: Save the current page's DOM structure and styles as a `.html` file
- **Download media resources**: Automatically extract and download images, videos, and audio to corresponding subdirectories
- **Embedded JSON audio extraction**: Scan audio/video URLs from embedded JSON like `__NEXT_DATA__`
- **Media organized by type**: `pictures/` `videos/` `audios/`
- **Automatic path rewriting**: Media references in HTML are replaced with local relative paths
- **Concurrent download throttling**: Max 3 concurrent, exponential backoff retry (up to 3 times)
- **Content-Type validation**: Reject non-media responses (e.g., executable files)
- **Download history**: Avoid duplicate downloads within a session
- **Large file streaming**: Files over 10MB are downloaded directly via URL without loading into memory
- **Real-time progress**: Success / skipped / failed statistics
- **System notifications**: Notify when download is complete
- **User options**: Choose to download images/videos/audio, keep inline styles
- **Offline media playback**: Automatically inject native HTML5 players so saved pages can play audio/video
- **Browser download setting detection**: Detect "Ask where to save" setting and guide users to disable it
- **Cross-platform compatibility**: Filename sanitization for Windows/macOS/Linux

## 📁 Project Structure

```
WebPageSaver_GLM/
├── manifest.json        # Extension manifest (Manifest V3)
├── background.js        # Service Worker: download coordination, retry, security
├── content.js           # Content script: DOM ops, resource collection, snapshot generation
├── popup.html           # Popup UI
├── popup.js             # Popup logic
├── PRIVACY.md           # Privacy policy
├── .eslintrc.json       # ESLint config
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 🔧 Installation

1. **Clone or download this project**:
   ```bash
   git clone https://github.com/hlizao/WebPageSaver_GLM.git
   cd WebPageSaver_GLM
   ```

2. **Open Chrome Extensions page**: Type `chrome://extensions/` in the address bar

3. **Enable Developer mode**: Toggle "Developer mode" in the top right

4. **Load the extension**: Click "Load unpacked" → select the project root directory

5. **Start using**: The 💾 icon appears in the toolbar

## 📖 Usage

1. Open a web page in Chrome
2. Click the 💾 icon in the toolbar
3. Toggle options:
   - ☑️ Download images
   - ☑️ Download videos
   - ☑️ Download audio
   - ☑️ Keep inline styles
4. Click "Save Current Page"
5. Files are downloaded to `Downloads/WebPageSaver/`

## 📂 Download Structure

```
Downloads/
└── WebPageSaver/
    ├── Page Title.html
    └── media/
        ├── pictures/
        │   ├── cover.jpg
        │   ├── avatar_small.png    # CDN @suffix auto-conversion
        │   └── icon.svg
        ├── videos/
        │   └── clip.mp4
        └── audios/
            └── episode.m4a         # Extracted from embedded JSON
```

## 🌐 Cross-Platform Compatibility

| Item | Description |
|------|-------------|
| MV3 Service Worker | No `URL.createObjectURL`; uses `data:` URL with fallback to original URL |
| Illegal filename chars | Sanitizes `<>:"/\|?*` and control chars `\x00-\x1f` |
| Windows reserved names | `CON`/`PRN`/`AUX`/`NUL`/`COM1-9`/`LPT1-9` prefixed with `_` |
| Case sensitivity | macOS/Windows case-insensitive; lowercase comparison for dedup |
| Hidden files | Blocks filenames starting with `.` |
| Filename length | Limited to 200 characters |
| Path separator | Chrome downloads API uses `/` uniformly |
| CDN @suffix | `image.jpg@small` → `image_small.jpg` |
| URL resolution | Uses `new URL(url, document.baseURI)` for absolute URL |

## 🔒 Security

| Mechanism | Description |
|-----------|-------------|
| Minimal permissions | Uses `activeTab` only; grants access on icon click |
| Content-Type validation | Rejects non-media responses (e.g., executables) |
| Dangerous extension blacklist | `.exe` `.bat` `.cmd` `.sh` `.js` etc. are blocked |
| Script removal | Removes executable `<script>` tags; data scripts converted to `application/json` |
| MV3 compliance | No `host_permissions`, no `web_accessible_resources` |

## 🎵 Offline Media Playback

Custom players (React/Vue JS-driven) in the original page become non-functional after saving because JS is removed. The extension automatically:

1. **Injects native players**: Adds `controls` attribute to `<audio>` / `<video>` elements
2. **Removes hidden styles**: Original pages may hide `<audio>` via CSS (for custom UI); these are removed
3. **Hides broken UI**: Automatically hides non-functional custom player buttons/progress bars
4. **Timestamp jumping**: Injects script so `data-timestamp` links (e.g., podcast timestamps like `09:24`) work

> Works with Xiaoyuzhou FM, NetEase Cloud Music, and other podcast/audio sites.

## 🔍 Browser Download Setting Detection

When clicking "Save Current Page", the extension automatically detects if "Ask where to save each file before downloading" is enabled:

- **Disabled**: Saves normally
- **Enabled**: Shows a modal prompting the user to disable it at `chrome://settings/downloads`

> Without disabling this setting, a save dialog will pop up for every media file, making the extension unusable.

## ⚡ Performance

| Optimization | Description |
|-------------|-------------|
| Concurrent throttling | Max 3 concurrent downloads |
| Exponential backoff | Retry at 1s → 2s → 4s, max 3 times |
| Large file streaming | >10MB downloaded directly via URL |
| Download history | `chrome.storage.local` caches downloaded records |
| Auto-cleanup | Keeps last 500 records to prevent storage bloat |

## ⚠️ Notes

- Some cross-origin resources may fail due to CORS restrictions; the extension will skip them
- `blob:` and `data:` URL resources cannot be downloaded separately (retained in HTML)
- Dynamic content is captured based on the DOM state at the time of saving
- Large `data:` URLs may fail; the extension falls back to the original URL
- The browser's "Ask where to save" setting must be disabled
- Custom JS-driven players in the original page are replaced with native HTML5 players

## 🔑 Permissions

| Permission | Purpose |
|-----------|---------|
| `activeTab` | Access current tab when icon is clicked |
| `scripting` | Inject content script into the page |
| `downloads` | Download HTML and media files |
| `storage` | Store user preferences and download history |
| `notifications` | Send system notification on completion |

## 📜 License

MIT License

---

# 💾 网页保存器 - Chrome 扩展

一个基于 Manifest V3 的 Chrome 浏览器扩展，将当前网页保存为本地 HTML 文件，并下载所有媒体资源到分类子目录，确保离线后可完整查看。

支持 **Windows / macOS / Linux** 全平台运行。

## ✨ 功能特性

- **保存完整网页**：将当前页面 DOM 结构、样式保存为 `.html` 文件
- **下载媒体资源**：自动提取并下载图片、视频、音频到对应子目录
- **嵌入 JSON 音频提取**：扫描 `__NEXT_DATA__` 等页面嵌入 JSON 中的音频/视频 URL
- **媒体按类型分目录**：`pictures/` `videos/` `audios/`
- **路径自动重写**：HTML 中的媒体引用自动替换为本地相对路径
- **并发限流下载**：最多 3 个并发，指数退避重试（最多 3 次）
- **下载内容安全校验**：校验 Content-Type，拒绝可执行文件等危险类型
- **下载历史记录**：避免会话内重复下载
- **大文件流式下载**：超过 10MB 的文件直接用 URL 下载，不加载到内存
- **进度实时显示**：成功率 / 跳过 / 失败统计
- **系统通知**：下载完成后发送系统通知
- **用户选项**：可选择下载图片/视频/音频、保留内联样式
- **离线媒体播放**：自动注入浏览器原生 HTML5 播放器，保存的页面可正常播放音视频
- **浏览器下载设置检测**：自动检测"下载前询问"设置，引导关闭后才能使用
- **跨平台兼容**：文件名清理覆盖 Windows/macOS/Linux

## 📁 项目结构

```
WebPageSaver_GLM/
├── manifest.json        # 扩展清单（Manifest V3）
├── background.js        # Service Worker，下载协调、限流重试、安全校验
├── content.js           # 内容脚本，DOM 操作、资源收集、快照生成
├── popup.html           # 弹出界面
├── popup.js             # 弹出界面逻辑
├── PRIVACY.md           # 隐私政策
├── .eslintrc.json       # ESLint 配置
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 🔧 安装步骤

1. **克隆或下载本项目**：
   ```bash
   git clone https://github.com/hlizao/WebPageSaver_GLM.git
   cd WebPageSaver_GLM
   ```

2. **打开 Chrome 扩展管理页面**：地址栏输入 `chrome://extensions/`

3. **开启开发者模式**：右上角打开「开发者模式」开关

4. **加载扩展**：点击「加载已解压的扩展程序」→ 选择项目根目录

5. **开始使用**：工具栏出现 💾 图标，点击即可保存网页

## 📖 使用方法

1. 在 Chrome 中打开想保存的网页
2. 点击工具栏 💾 图标
3. 勾选/取消选项：
   - ☑️ 下载图片资源
   - ☑️ 下载视频资源
   - ☑️ 下载音频资源
   - ☑️ 保留内联样式
4. 点击「保存当前网页」
5. 文件下载到 `下载目录/WebPageSaver/`

## 📂 下载文件结构

```
下载目录/
└── WebPageSaver/
    ├── 页面标题.html
    └── media/
        ├── pictures/
        │   ├── cover.jpg
        │   ├── avatar_small.png    # CDN @后缀自动转换
        │   └── icon.svg
        ├── videos/
        │   └── clip.mp4
        └── audios/
            └── episode.m4a         # 含嵌入JSON提取
```

## 🌐 跨平台兼容性

| 适配项 | 说明 |
|--------|------|
| MV3 Service Worker | 不支持 `URL.createObjectURL`，使用 `data: URL`；失败回退为原始 URL |
| 文件名非法字符 | 清理 `<>:"/\|?*` 及控制字符 `\x00-\x1f` |
| Windows 保留文件名 | `CON`/`PRN`/`AUX`/`NUL`/`COM1-9`/`LPT1-9` 加 `_` 前缀 |
| 大小写敏感 | macOS/Windows 不区分，去重时统一小写比较 |
| 隐藏文件 | 禁止以 `.` 开头 |
| 文件名长度 | 限制 200 字符 |
| 路径分隔符 | Chrome downloads API 统一 `/` |
| CDN @后缀 | `image.jpg@small` → `image_small.jpg` |
| URL 解析 | 使用 `new URL(url, document.baseURI)` 解析绝对 URL |

## 🔒 安全机制

| 机制 | 说明 |
|------|------|
| 最小权限 | 仅使用 `activeTab`，点击图标时才获取页面权限 |
| Content-Type 校验 | 拒绝非媒体类型的响应（如可执行文件） |
| 危险扩展名黑名单 | `.exe` `.bat` `.cmd` `.sh` `.js` 等拒绝下载 |
| 脚本移除 | 保存的 HTML 移除 `<script>` 执行标签，含数据脚本转为 `application/json` |
| MV3 合规 | 不使用 `host_permissions`，不使用 `web_accessible_resources` |

## 🎵 离线媒体播放

保存后的网页中原有的自定义播放器（React/Vue 等 JS 驱动）会失效，因为 JS 被移除。扩展会自动进行以下处理：

1. **注入原生播放器**：为 `<audio>` / `<video>` 添加 `controls` 属性，启用浏览器内置播放控件
2. **移除隐藏样式**：原网页可能通过 CSS 隐藏原生 `<audio>`（配合自定义 UI），保存后移除 `display:none` 等隐藏样式
3. **隐藏失效 UI**：自动隐藏原自定义播放器的按钮、进度条等无效元素
4. **时间戳跳转**：注入脚本让 `data-timestamp` 链接（如播客中的 `09:24` 时间戳）可点击跳转播放

> 适用于小宇宙、网易云音乐等播客/音频站点的离线保存。

## 🔍 浏览器下载设置检测

点击「保存当前网页」时，扩展会自动检测浏览器是否开启了"下载前询问每个文件的保存位置"：

- **未开启**：正常保存
- **已开启**：弹出提示弹窗，引导用户前往 `chrome://settings/downloads` 关闭该设置

> 若不关闭该设置，每个媒体文件下载时都会弹出保存对话框，无法正常使用。

## ⚡ 性能优化

| 优化项 | 说明 |
|--------|------|
| 并发限流 | 最多 3 个并发下载，避免网络冲击 |
| 指数退避重试 | 失败后 1s → 2s → 4s 重试，最多 3 次 |
| 大文件流式下载 | >10MB 直接用原始 URL 下载，不加载到内存 |
| 下载历史 | `chrome.storage.local` 缓存已下载记录，避免重复 |
| 历史自动清理 | 保留最近 500 条记录，防止 storage 膨胀 |

## ⚠️ 注意事项

- 部分跨域资源可能因 CORS 限制无法下载，扩展会跳过
- `blob:` 和 `data:` URL 的资源无法单独下载（已在 HTML 中保留）
- 动态加载内容以点击保存时的 DOM 状态为准
- 大文件 `data: URL` 可能失败，扩展自动回退为原始 URL 下载
- 浏览器需关闭"下载前询问每个文件的保存位置"设置，否则每个文件都会弹出保存对话框
- 原网页的自定义播放器（React 等 JS 驱动）保存后会失效，扩展自动替换为浏览器原生 HTML5 播放器

## 🔑 权限说明

| 权限 | 用途 |
|------|------|
| `activeTab` | 点击图标时获取当前标签页权限 |
| `scripting` | 注入内容脚本到页面 |
| `downloads` | 下载 HTML 和媒体文件 |
| `storage` | 存储用户偏好和下载历史 |
| `notifications` | 下载完成后发送系统通知 |

## 📜 许可证

MIT License
