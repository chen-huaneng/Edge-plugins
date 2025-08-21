// 格式化延迟时间显示（支持毫秒和秒）
function formatDelayTime(value) {
  const delay = parseInt(value);
  if (delay < 1000) {
    return delay + 'ms';
  } else {
    const seconds = (delay / 1000).toFixed(1);
    return seconds + 's';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  // 加载链接预览设置
  loadLinkPreviewSettings();
  // 初始化链接预览设置
  initLinkPreviewSettings();
});

// 显示通知
function showNotification(message, type = 'info') {
  // 移除现有通知
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // 创建新通知
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // 3秒后淡出
  setTimeout(function() {
    notification.classList.add('fade-out');
    setTimeout(function() {
      notification.remove();
    }, 300);
  }, 3000);
}

// 加载链接预览设置
function loadLinkPreviewSettings() {
  chrome.storage.local.get(['linkPreviewSettings', 'lastPreviewState'], function(result) {
    if (result.linkPreviewSettings) {
      const settings = result.linkPreviewSettings;
      
      // 确保延时值在有效范围内（200ms-10s）
      const longPressDelay = Math.max(200, Math.min(10000, settings.longPressDelay || 500));
      const altHoverDelay = Math.max(200, Math.min(10000, settings.altHoverDelay || 200));
      const hoverDelay = Math.max(200, Math.min(10000, settings.hoverDelay || 500));
      
      document.getElementById('linkPreviewTrigger').value = settings.triggerMode;
      document.getElementById('longPressDelay').value = longPressDelay;
      document.getElementById('altHoverDelay').value = altHoverDelay;
      document.getElementById('hoverDelay').value = hoverDelay;
      
      // 加载新增设置
      document.getElementById('previewSize').value = settings.previewSize || 'medium';
      document.getElementById('previewPosition').value = settings.previewPosition || 'cursor';
      document.getElementById('previewTheme').value = settings.previewTheme || 'light';
      
      // 修复透明度加载逻辑，正确处理值为0的情况
      const opacityValue = settings.overlayOpacity !== undefined ? settings.overlayOpacity : 50;
      document.getElementById('overlayOpacity').value = opacityValue;
      document.getElementById('overlayOpacityValue').textContent = opacityValue + '%';
      
      // 加载网站黑名单
      if (settings.blacklistSites) {
        document.getElementById('blacklistSites').value = settings.blacklistSites.join('\n');
      }
      
      // 加载自定义快捷键设置
      document.getElementById('customTriggerKey').value = settings.customTriggerKey || 'alt';
      
      // Update display values
      document.getElementById('longPressDelayValue').textContent = formatDelayTime(longPressDelay);
      document.getElementById('altHoverDelayValue').textContent = formatDelayTime(altHoverDelay);
      document.getElementById('hoverDelayValue').textContent = formatDelayTime(hoverDelay);
      
      // 更新触发模式选项的文本
      document.getElementById('hover-text').textContent = getMessage('hover');
      
      // Show/hide delay settings based on trigger mode
      updateDelaySettingsVisibility(settings.triggerMode);
    }
  });
}

// Update delay settings visibility based on trigger mode
function updateDelaySettingsVisibility(triggerMode) {
  const longPressContainer = document.getElementById('longPressDelayContainer');
  const altHoverContainer = document.getElementById('altHoverDelayContainer');
  const hoverContainer = document.getElementById('hoverDelayContainer');
  const customTriggerKeyContainer = document.getElementById('customTriggerKeyContainer');
  
  if (triggerMode === 'long_press') {
    longPressContainer.style.display = 'flex';
    altHoverContainer.style.display = 'none';
    hoverContainer.style.display = 'none';
    customTriggerKeyContainer.style.display = 'none';
  } else if (triggerMode === 'alt_hover') {
    longPressContainer.style.display = 'none';
    altHoverContainer.style.display = 'flex';
    hoverContainer.style.display = 'none';
    customTriggerKeyContainer.style.display = 'flex';
  } else if (triggerMode === 'alt_click') {
    longPressContainer.style.display = 'none';
    altHoverContainer.style.display = 'none';
    hoverContainer.style.display = 'none';
    customTriggerKeyContainer.style.display = 'flex';
  } else if (triggerMode === 'hover') {
    longPressContainer.style.display = 'none';
    altHoverContainer.style.display = 'none';
    hoverContainer.style.display = 'flex';
    customTriggerKeyContainer.style.display = 'none';
  } else {
    // 拖动链接和禁用模式不需要延迟设置和自定义快捷键
    longPressContainer.style.display = 'none';
    altHoverContainer.style.display = 'none';
    hoverContainer.style.display = 'none';
    customTriggerKeyContainer.style.display = 'none';
  }
}

// Initialize link preview settings
function initLinkPreviewSettings() {
  const triggerSelect = document.getElementById('linkPreviewTrigger');
  const longPressDelay = document.getElementById('longPressDelay');
  const altHoverDelay = document.getElementById('altHoverDelay');
  const hoverDelay = document.getElementById('hoverDelay');
  
  const previewSize = document.getElementById('previewSize');
  const previewPosition = document.getElementById('previewPosition');
  const previewTheme = document.getElementById('previewTheme');
  const blacklistSites = document.getElementById('blacklistSites');
  const overlayOpacity = document.getElementById('overlayOpacity');
  const customTriggerKey = document.getElementById('customTriggerKey');
  
  // 初始化主题选择器
  initThemeSelector();
  
  // 保存设置的函数
  function saveSettings() {
    // 处理黑名单域名
    const blacklist = blacklistSites.value.trim()
      ? blacklistSites.value.split('\n').map(site => site.trim()).filter(site => site)
      : [];
      
    // 确保延时值在有效范围内（200ms-10s）
    const longPressDelayValue = Math.max(200, Math.min(10000, parseInt(longPressDelay.value)));
    const altHoverDelayValue = Math.max(200, Math.min(10000, parseInt(altHoverDelay.value)));
    const hoverDelayValue = Math.max(200, Math.min(10000, parseInt(hoverDelay.value)));
      
    const settings = {
      triggerMode: triggerSelect.value,
      longPressDelay: longPressDelayValue,
      altHoverDelay: altHoverDelayValue,
      hoverDelay: hoverDelayValue,
      previewSize: previewSize.value,
      previewPosition: previewPosition.value,
      previewTheme: previewTheme.value,
      overlayOpacity: parseInt(overlayOpacity.value),
      blacklistSites: blacklist,
      customTriggerKey: customTriggerKey.value
    };
    
    // 保存当前自定义主题设置(如果有)
    chrome.storage.local.get(['linkPreviewSettings'], function(result) {
      if (result.linkPreviewSettings && result.linkPreviewSettings.customThemeColors) {
        settings.customThemeColors = result.linkPreviewSettings.customThemeColors;
      }
      
      // 保存到存储
      chrome.storage.local.set({ linkPreviewSettings: settings }, function() {
        // 通知所有活动标签页更新主题设置
        chrome.tabs.query({}, function(tabs) {
          tabs.forEach(tab => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'updateLinkPreviewSettings',
                settings: settings
              }, function(response) {
                // 忽略可能出现的错误，有些标签页可能不包含我们的content script
                const lastError = chrome.runtime.lastError;
              });
            }
          });
        });
        showNotification(getMessage('linkPreviewSettingsUpdated'), 'success');
      });
    });
  }
  
  // 处理触发模式变更
  triggerSelect.addEventListener('change', function() {
    updateDelaySettingsVisibility(this.value);
    saveSettings(); // 自动保存
  });
  
  // 处理长按延迟输入变更
  longPressDelay.addEventListener('input', function() {
    document.getElementById('longPressDelayValue').textContent = formatDelayTime(this.value);
  });
  
  longPressDelay.addEventListener('change', function() {
    saveSettings(); // 在滑块调整完成后自动保存
  });
  
  // 处理Alt+悬停延迟输入变更
  altHoverDelay.addEventListener('input', function() {
    document.getElementById('altHoverDelayValue').textContent = formatDelayTime(this.value);
  });
  
  altHoverDelay.addEventListener('change', function() {
    saveSettings(); // 在滑块调整完成后自动保存
  });
  
  // 处理纯悬停延迟输入变更
  hoverDelay.addEventListener('input', function() {
    document.getElementById('hoverDelayValue').textContent = formatDelayTime(this.value);
  });
  
  hoverDelay.addEventListener('change', function() {
    saveSettings(); // 在滑块调整完成后自动保存
  });
  
  // 处理预览大小变更
  previewSize.addEventListener('change', saveSettings);
  
  // 处理预览位置变更
  previewPosition.addEventListener('change', saveSettings);
  
  // 处理自定义快捷键变更
  customTriggerKey.addEventListener('change', saveSettings);

  // 处理遮罩透明度变更
  overlayOpacity.addEventListener('input', function() {
    document.getElementById('overlayOpacityValue').textContent = this.value + '%';
  });
  
  overlayOpacity.addEventListener('change', saveSettings);
  
  // 处理黑名单域名变更
  blacklistSites.addEventListener('change', saveSettings);
  blacklistSites.addEventListener('blur', saveSettings);
  
  // 增加输入事件监听，支持实时输入保存
  let blacklistTimer;
  blacklistSites.addEventListener('input', function() {
    clearTimeout(blacklistTimer);
    blacklistTimer = setTimeout(saveSettings, 1000); // 输入停止1秒后保存
  });
}

// 自定义i18n消息获取函数，替代chrome.i18n.getMessage
function getMessage(messageName) {
  // 如果消息已加载到全局对象
  if (window.i18nMessages && window.i18nMessages[messageName]) {
    return window.i18nMessages[messageName].message;
  }
  
  // 否则，回退到chrome.i18n
  return chrome.i18n.getMessage(messageName);
}

// 添加样式
const style = document.createElement('style');
style.textContent = `
  .notification {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    border-radius: 4px;
    color: white;
    font-size: 14px;
    z-index: 9999;
    opacity: 1;
    transition: opacity 0.3s;
  }
  
  .notification.info {
    background-color: #4A90E2;
  }
  
  .notification.success {
    background-color: #4CAF50;
  }
  
  .notification.error {
    background-color: #F44336;
  }
  
  .notification.fade-out {
    opacity: 0;
  }
`;
document.head.appendChild(style);

// 初始化主题选择器
function initThemeSelector() {
  const themeOptions = document.querySelectorAll('.theme-option');
  const hiddenSelect = document.getElementById('previewTheme');
  const customThemeContainer = document.getElementById('customThemeContainer');
  const customThemeOption = document.getElementById('customThemeOption');
  const customThemeColorBg = document.getElementById('customThemeColorBg');
  const customThemeColorText = document.getElementById('customThemeColorText');
  const applyCustomThemeBtn = document.getElementById('applyCustomTheme');
  
  // 设置初始选中状态
  function updateThemeSelection(selectedTheme) {
    themeOptions.forEach(option => {
      option.classList.remove('selected');
      if (option.dataset.theme === selectedTheme) {
        option.classList.add('selected');
      }
    });
    hiddenSelect.value = selectedTheme;
    
    // 显示/隐藏自定义主题设置区域
    if (selectedTheme === 'custom') {
      // 使用自定义主题
      chrome.storage.local.get(['user_info'], function(result) {
        customThemeContainer.style.display = 'block';
      });
    } else {
      customThemeContainer.style.display = 'none';
    }
  }
  
  // 从存储中获取当前主题并设置选中状态
  chrome.storage.local.get(['linkPreviewSettings'], function(result) {
    const currentTheme = result.linkPreviewSettings?.previewTheme || 'light';
    
    // 检查是否为自定义主题
    chrome.storage.local.get(['user_info'], function(userResult) {
      
      updateThemeSelection(currentTheme);
      
      // 如果有自定义颜色，加载它们
      if (result.linkPreviewSettings?.customThemeColors) {
        const colors = result.linkPreviewSettings.customThemeColors;
        customThemeColorBg.value = colors.bg || '#ffffff';
        customThemeColorText.value = colors.text || '#333333';
      } else {
        // 设置默认颜色
        customThemeColorBg.value = '#ffffff';
        customThemeColorText.value = '#333333';
      }
    });
  });
  
  // 为每个主题选项添加点击事件
  themeOptions.forEach(option => {
    option.addEventListener('click', function(e) {
      // 如果主题选项被禁用，则忽略点击事件
      if (this.classList.contains('disabled')) {
        return;
      }
      
      const selectedTheme = this.dataset.theme;
      
      // 检查是否为自定义主题
      if (selectedTheme === 'custom') {
        chrome.storage.local.get(['user_info'], function(result) {
          
          updateThemeSelection(selectedTheme);
          saveThemeSettings(selectedTheme);
        });
      } else {
        // 普通主题所有用户都可以使用
        updateThemeSelection(selectedTheme);
        saveThemeSettings(selectedTheme);
      }
    });
  });
  
  // 颜色选择器变更事件
  customThemeColorBg.addEventListener('input', function() {
    autoSaveCustomTheme();
  });
  
  customThemeColorText.addEventListener('input', function() {
    autoSaveCustomTheme();
  });
  
  // 自动保存自定义主题颜色
  function autoSaveCustomTheme() {
    const bgColor = customThemeColorBg.value;
    const textColor = customThemeColorText.value;
    
    // 保存自定义颜色设置
    saveCustomThemeColors(bgColor, textColor);
  }
  
  // 应用自定义主题按钮点击事件
  applyCustomThemeBtn.addEventListener('click', function() {
    const bgColor = customThemeColorBg.value;
    const textColor = customThemeColorText.value;
    
    // 保存自定义颜色设置
    saveCustomThemeColors(bgColor, textColor);
    showNotification(getMessage('themeUpdated') || '主题已更新', 'success');
  });
  
  // 保存主题设置
  function saveThemeSettings(theme) {
    chrome.storage.local.get(['linkPreviewSettings'], function(result) {
      const settings = result.linkPreviewSettings || {};
      settings.previewTheme = theme;
      
      // 保存到存储
      chrome.storage.local.set({ linkPreviewSettings: settings }, function() {
        // 通知所有活动标签页更新主题设置
        chrome.tabs.query({}, function(tabs) {
          tabs.forEach(tab => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'updateLinkPreviewSettings',
                settings: settings
              }, function(response) {
                // 忽略可能出现的错误，有些标签页可能不包含我们的content script
                const lastError = chrome.runtime.lastError;
              });
            }
          });
        });
        
        showNotification(getMessage('themeUpdated') || '主题已更新', 'success');
      });
    });
  }
  
  // 保存自定义主题颜色
  function saveCustomThemeColors(bgColor, textColor) {
    chrome.storage.local.get(['linkPreviewSettings'], function(result) {
      const settings = result.linkPreviewSettings || {};
      settings.previewTheme = 'custom'; // 确保主题设置为自定义
      settings.customThemeColors = {
        bg: bgColor,
        text: textColor
      };
      
      // 更新选中状态为自定义主题
      updateThemeSelection('custom');
      
      // 保存到存储
      chrome.storage.local.set({ linkPreviewSettings: settings }, function() {
        // 通知所有活动标签页更新自定义主题
        chrome.tabs.query({}, function(tabs) {
          tabs.forEach(tab => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'updateCustomTheme',
                colors: settings.customThemeColors
              }, function(response) {
                // 忽略可能出现的错误，有些标签页可能不包含我们的content script
                const lastError = chrome.runtime.lastError;
              });
            }
          });
        });
      });
    });
  }
}
