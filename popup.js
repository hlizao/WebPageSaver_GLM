/**
 * popup.js - 弹出界面逻辑
 * 负责展示页面信息、用户选项、进度反馈
 */

// ============================================================
// DOM 元素引用
// ============================================================
const pageTitle = document.getElementById('pageTitle');
const pageUrl = document.getElementById('pageUrl');
const saveBtn = document.getElementById('saveBtn');
const progressArea = document.getElementById('progressArea');
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const statusText = document.getElementById('statusText');
const statsSuccess = document.getElementById('statsSuccess');
const statsSkipped = document.getElementById('statsSkipped');
const statsFailed = document.getElementById('statsFailed');
const optImages = document.getElementById('optImages');
const optVideos = document.getElementById('optVideos');
const optAudio = document.getElementById('optAudio');
const optInlineStyles = document.getElementById('optInlineStyles');
const downloadSettingModal = document.getElementById('downloadSettingModal');
const modalCancel = document.getElementById('modalCancel');
const modalGoSettings = document.getElementById('modalGoSettings');

// 统计计数
let successCount = 0;
let skippedCount = 0;
let failedCount = 0;

// ============================================================
// 初始化：获取当前标签页信息
// ============================================================
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    pageTitle.textContent = tabs[0].title || '未知页面';
    pageUrl.textContent = tabs[0].url || '-';
  }
});

// ============================================================
// 检测浏览器"下载前询问"设置
// 通过发起一个微型测试下载来检测：
// - saveAs: false 正常完成 → 未开启，返回 true
// - 下载被中断或超时 → 已开启，返回 false
// ============================================================

/**
 * 检测浏览器是否开启了"下载前询问每个文件的保存位置"
 * @returns {Promise<boolean>} true = 未开启（可正常使用），false = 已开启（会弹窗）
 */
function checkDownloadSetting() {
  return new Promise((resolve) => {
    // 1x1 transparent PNG
    const testUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRUEFTkSuQmCC';
    const testPath = 'WebPageSaver/_detect.tmp';

    chrome.downloads.download({
      url: testUrl,
      filename: testPath,
      saveAs: false,
      conflictAction: 'overwrite',
    }, (downloadId) => {
      if (chrome.runtime.lastError || !downloadId) {
        resolve(false); // 下载 API 失败，保守判断为有问题
        return;
      }

      let resolved = false;

      // 2秒超时：如果下载没有快速完成，说明弹窗阻塞了
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanupTest(downloadId);
          resolve(false);
        }
      }, 2000);

      chrome.downloads.onChanged.addListener(function listener(delta) {
        if (delta.id !== downloadId) return;
        if (delta.state) {
          chrome.downloads.onChanged.removeListener(listener);
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            const state = delta.state.current;
            cleanupTest(downloadId);
            // complete → 未开启弹窗；interrupted → 用户在弹窗中取消了
            resolve(state === 'complete');
          }
        }
      });
    });
  });
}

function cleanupTest(downloadId) {
  chrome.downloads.removeFile(downloadId).catch(() => {});
  chrome.downloads.erase({ id: downloadId }).catch(() => {});
}

// 弹窗按钮事件
modalCancel.addEventListener('click', () => {
  downloadSettingModal.classList.remove('active');
  saveBtn.disabled = false;
  statusText.textContent = '❌ 未关闭下载前询问，无法执行';
});

modalGoSettings.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://settings/downloads' });
  downloadSettingModal.classList.remove('active');
  saveBtn.disabled = false;
  statusText.textContent = '⚠️ 请关闭设置后重新点击保存';
});

// ============================================================
// 保存按钮点击事件
// ============================================================
saveBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  // 重置状态
  saveBtn.disabled = true;
  progressArea.style.display = 'block';
  statusText.textContent = '正在检测浏览器下载设置...';
  progressFill.style.width = '0%';
  progressPercent.textContent = '0%';
  statsSuccess.textContent = '';
  statsSkipped.textContent = '';
  statsFailed.textContent = '';
  successCount = 0;
  skippedCount = 0;
  failedCount = 0;

  // 检测浏览器"下载前询问"设置
  const canDownload = await checkDownloadSetting();
  if (!canDownload) {
    // 弹出提示弹窗，阻止保存
    downloadSettingModal.classList.add('active');
    return;
  }

  // 清理测试文件（正常通过时 test file 可能还在）
  statusText.textContent = '正在分析页面...';

  const options = {
    downloadImages: optImages.checked,
    downloadVideos: optVideos.checked,
    downloadAudio: optAudio.checked,
    keepInlineStyles: optInlineStyles.checked,
  };

  chrome.runtime.sendMessage(
    {
      action: 'savePage',
      tabId: tab.id,
      options,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        statusText.textContent = '❌ 启动失败: ' + chrome.runtime.lastError.message;
        saveBtn.disabled = false;
      }
    }
  );
});

// ============================================================
// 监听来自 background 的进度消息
// ============================================================
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'progress') {
    const { current, total, status } = message;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    progressFill.style.width = percent + '%';
    progressPercent.textContent = percent + '%';
    if (status) statusText.textContent = status;
  }

  if (message.action === 'complete') {
    const stats = message.stats || {};
    successCount = stats.success || 0;
    skippedCount = stats.skipped || 0;
    failedCount = stats.failed || 0;

    statusText.textContent = '✅ 保存完成！';
    progressFill.style.width = '100%';
    progressPercent.textContent = '100%';

    // 显示统计
    statsSuccess.textContent = `✅ ${successCount}`;
    if (skippedCount > 0) statsSkipped.textContent = `⏭️ ${skippedCount}`;
    if (failedCount > 0) statsFailed.textContent = `❌ ${failedCount}`;

    saveBtn.disabled = false;
    saveBtn.textContent = '再次保存';
  }

  if (message.action === 'error') {
    statusText.textContent = '❌ ' + (message.error || '保存失败');
    progressFill.style.width = '0%';
    saveBtn.disabled = false;
  }
});
