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
- **跨平台兼容**：文件名清理覆盖 Windows/macOS/Linux

## 📁 项目结构

```
WebPageSaver_GLM/
├── manifest.json        # 扩展清单（Manifest V3）
├── background.js        # Service Worker，下载协调、限流重试、安全校验
├── content.js           # 内容脚本，DOM 操作、资源收集、快照生成
├── popup.html           # 弹出界面
├── popup.js             # 弹出界面逻辑
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
