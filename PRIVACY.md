# 隐私政策 / Privacy Policy

**最后更新 / Last Updated：2026年4月30日**

---

## 中文版

### 概述

「网页保存器」（WebPageSaver_GLM）是一款 Chrome 浏览器扩展，帮助用户将网页保存为本地 HTML 文件并下载媒体资源。我们非常重视您的隐私。

### 数据收集

**本扩展不收集任何用户数据。** 具体而言：

- ❌ 不收集个人信息（姓名、邮箱、手机号等）
- ❌ 不收集浏览历史或访问的网页内容
- ❌ 不收集设备信息或系统配置
- ❌ 不使用 Cookie 或任何追踪技术
- ❌ 不与任何第三方共享数据

### 数据存储

本扩展使用 `chrome.storage.local` 在本地存储以下数据：

| 存储内容 | 用途 | 保留期限 |
|----------|------|----------|
| 下载历史记录 | 避免同一会话内重复下载同一文件 | 最近 500 条，自动清理 |
| 用户偏好设置 | 记住用户勾选的下载选项 | 持久保存，用户可随时修改 |

所有数据均存储在用户本地浏览器中，不会上传到任何服务器。

### 网络请求

本扩展仅在用户主动点击「保存当前网页」时，才会发起网络请求：

- 请求目标：当前网页中包含的媒体资源（图片、视频、音频）
- 请求目的：下载资源到用户本地计算机
- 所有请求均为用户主动触发，不会在后台自动发起

### 权限说明

| 权限 | 用途 | 是否涉及数据收集 |
|------|------|------------------|
| `activeTab` | 获取当前标签页权限以读取页面内容 | 否 |
| `scripting` | 注入内容脚本以收集媒体资源信息 | 否 |
| `downloads` | 下载 HTML 和媒体文件到本地 | 否 |
| `storage` | 本地存储用户偏好和下载历史 | 否 |
| `notifications` | 下载完成后发送系统通知 | 否 |

### 第三方服务

本扩展不集成任何第三方服务、SDK 或分析工具。

### 儿童隐私

本扩展不面向 13 岁以下儿童，也不会有意收集儿童的个人信息。

### 政策变更

如本隐私政策发生变更，我们将在此页面更新并修改「最后更新」日期。重大变更将通过扩展更新说明告知用户。

### 联系我们

如有关于隐私政策的疑问，请通过以下方式联系：

- GitHub Issues：[https://github.com/hlizao/WebPageSaver_GLM/issues](https://github.com/hlizao/WebPageSaver_GLM/issues)

---

## English Version

### Overview

WebPageSaver_GLM is a Chrome browser extension that helps users save web pages as local HTML files and download media resources. We take your privacy seriously.

### Data Collection

**This extension does not collect any user data.** Specifically:

- ❌ No personal information (name, email, phone number, etc.)
- ❌ No browsing history or web page content
- ❌ No device information or system configuration
- ❌ No cookies or tracking technologies
- ❌ No data sharing with third parties

### Data Storage

This extension uses `chrome.storage.local` to store the following data locally:

| Data | Purpose | Retention |
|------|---------|-----------|
| Download history | Prevent duplicate downloads in the same session | Last 500 entries, auto-cleaned |
| User preferences | Remember user-selected download options | Persisted, user can modify at any time |

All data is stored locally in the user's browser and is never uploaded to any server.

### Network Requests

This extension only makes network requests when the user actively clicks "Save Current Page":

- Request targets: Media resources (images, videos, audio) contained in the current web page
- Request purpose: Download resources to the user's local computer
- All requests are user-initiated; no background requests are made

### Permissions

| Permission | Purpose | Data Collection |
|------------|---------|-----------------|
| `activeTab` | Access current tab to read page content | No |
| `scripting` | Inject content script to collect media resource info | No |
| `downloads` | Download HTML and media files locally | No |
| `storage` | Store user preferences and download history locally | No |
| `notifications` | Send system notification when download completes | No |

### Third-Party Services

This extension does not integrate any third-party services, SDKs, or analytics tools.

### Children's Privacy

This extension is not directed at children under 13 and does not knowingly collect personal information from children.

### Policy Changes

If this privacy policy changes, we will update this page and modify the "Last Updated" date. Significant changes will be communicated through extension update notes.

### Contact

If you have questions about this privacy policy, please contact us through:

- GitHub Issues: [https://github.com/hlizao/WebPageSaver_GLM/issues](https://github.com/hlizao/WebPageSaver_GLM/issues)
