// lessTabs Background Script

// 监听插件图标的点击事件
chrome.action.onClicked.addListener((tab) => {
  // 切换侧边栏的显示状态
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// 安装或更新时设置declarativeNetRequest规则
chrome.runtime.onInstalled.addListener((details) => {
  // 初始化语言设置
  chrome.storage.local.get(['language'], function(result) {
    if (!result.language) {
      // 如果没有设置语言，则使用浏览器默认语言
      const browserLanguage = chrome.i18n.getUILanguage();
      chrome.storage.local.set({ language: browserLanguage });
    }
  });
  
  // 设置动态规则来移除阻止iframe加载的响应头
  chrome.declarativeNetRequest.getDynamicRules((rules) => {
    // 获取现有规则ID
    const ruleIds = rules.map((rule) => rule.id);

    // 如果存在规则，先移除
    if (ruleIds.length > 0) {
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIds
      }, () => {
        addNetRequestRules();
      });
    } else {
      // 直接添加新规则
      addNetRequestRules();
    }
  });

  function addNetRequestRules() {
    chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [
        // 移除CSP、X-Frame-Options和Cookie响应头
        {
          id: 1,
          priority: 1,
          action: {
            type: "modifyHeaders",
            responseHeaders: [
              { header: "Content-Security-Policy", operation: "remove" },
              { header: "X-Frame-Options", operation: "remove" },
              { header: "Cookie", operation: "remove" }
            ]
          },
          condition: {
            urlFilter: "*://*/*",
            resourceTypes: ["sub_frame"]
          }
        },
        {
          id: 2,
          priority: 2,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              {
                header: "User-Agent",
                operation: "set",
                value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36"
              }
            ]
          },
          condition: {
            urlFilter: "https://www.xiaohongshu.com/*",
            resourceTypes: ["sub_frame"]
          }
        }
      ],
      removeRuleIds: []
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('[NoTab Background] 更新动态规则错误:', chrome.runtime.lastError);
      }
    });
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  // console.log('[NoTab Background] 收到消息:', request);
  
  if (request.action === 'languageChanged') {
    // console.log('[NoTab Background] 语言已更改为:', request.language);
    
    // 保存语言设置到本地存储
    chrome.storage.local.set({ language: request.language }, function() {
      // console.log('[NoTab Background] 语言设置已保存到存储:', request.language);
      
      // 广播语言变更消息给所有打开的标签页
      chrome.tabs.query({}, function(tabs) {
        tabs.forEach(function(tab) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'updateLanguage',
            language: request.language
          }).catch(error => {
            // 内容脚本可能尚未加载，这是正常的
            // console.log('[NoTab Background] 无法发送消息到内容脚本:', error);
          });
        });
      });
      
      sendResponse({ success: true });
    });
    
    return true;
  }

  if (request.action === 'getLanguageMessages') {
    const language = request.language || 'en';
    // console.log('[NoTab Background] 请求加载语言文件:', language);
    
    // 加载语言文件
    fetch(chrome.runtime.getURL(`_locales/${language}/messages.json`))
      .then(response => {
        if (!response.ok) {
          throw new Error(`无法加载语言文件: ${language}`);
        }
        return response.json();
      })
      .then(messages => {
        // console.log('[NoTab Background] 语言文件加载成功:', language);
        sendResponse({ success: true, messages: messages });
      })
      .catch(error => {
        console.error('[NoTab Background] 语言文件加载失败:', error);
        // 如果请求的不是英语，尝试回退到英语
        if (language !== 'en') {
          fetch(chrome.runtime.getURL('_locales/en/messages.json'))
            .then(response => response.json())
            .then(messages => {
              // console.log('[NoTab Background] 回退到英语');
              sendResponse({ success: true, messages: messages });
            })
            .catch(err => {
              sendResponse({ success: false, error: err.message });
            });
        } else {
          sendResponse({ success: false, error: error.message });
        }
      });
    
    return true; // 保持消息通道开放以进行异步响应
  }

  return true;
});
