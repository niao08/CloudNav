
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, Bot, Key, Globe, Sparkles, PauseCircle, Wrench, Box, Copy, Check, List, GripVertical, Filter, LayoutTemplate, RefreshCw, Info, Download } from 'lucide-react';
import { AIConfig, LinkItem, Category, SiteSettings } from '../types';
import { generateLinkDescription } from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIConfig;
  siteSettings: SiteSettings;
  onSave: (config: AIConfig, siteSettings: SiteSettings) => void;
  links: LinkItem[];
  categories: Category[];
  onUpdateLinks: (links: LinkItem[]) => void;
}

// 辅助函数：生成随机 HSL 颜色
const getRandomColor = () => {
    const h = Math.floor(Math.random() * 360);
    const s = 70 + Math.random() * 20; // 70-90% saturation
    const l = 45 + Math.random() * 15; // 45-60% lightness
    return `hsl(${h}, ${s}%, ${l}%)`;
};

// 辅助函数：生成 SVG Data URI 图标 (支持自定义颜色)
const generateSvgIcon = (text: string, color1: string, color2: string) => {
    const char = (text && text.length > 0 ? text.charAt(0) : 'C').toUpperCase();
    
    // 生成渐变 ID，防止多个 SVG 在同一页面导致 ID 冲突虽然这里是 base64 但是个好习惯
    const gradientId = 'g_' + Math.random().toString(36).substr(2, 9);

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
        <defs>
            <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="${color1}"/>
                <stop offset="100%" stop-color="${color2}"/>
            </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#${gradientId})" rx="16"/>
        <text x="50%" y="50%" dy=".35em" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="32" text-anchor="middle">${char}</text>
    </svg>`.trim();

    try {
        const encoded = window.btoa(unescape(encodeURIComponent(svg)));
        return `data:image/svg+xml;base64,${encoded}`;
    } catch (e) {
        console.error("SVG Icon Generation Failed", e);
        return '';
    }
};

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, onClose, config, siteSettings, onSave, links, categories, onUpdateLinks 
}) => {
  const [activeTab, setActiveTab] = useState<'site' | 'ai' | 'tools' | 'links'>('site');
  const [localConfig, setLocalConfig] = useState<AIConfig>(config);
  
  const [localSiteSettings, setLocalSiteSettings] = useState<SiteSettings>(() => ({
      title: siteSettings?.title || 'CloudNav - 我的导航',
      navTitle: siteSettings?.navTitle || 'CloudNav',
      favicon: siteSettings?.favicon || '',
      cardStyle: siteSettings?.cardStyle || 'detailed'
  }));
  
  const [generatedIcons, setGeneratedIcons] = useState<string[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const shouldStopRef = useRef(false);

  // Tools State
  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState('');
  const [browserType, setBrowserType] = useState<'chrome' | 'firefox'>('chrome');
  
  // Link Management State
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  
  const availableCategories = useMemo(() => {
      const catIds = Array.from(new Set(links.map(l => l.categoryId)));
      return catIds;
  }, [links]);

  const [copiedStates, setCopiedStates] = useState<{[key: string]: boolean}>({});

  // 生成一组随机图标
  const updateGeneratedIcons = (text: string) => {
      const newIcons: string[] = [];
      // 生成 6 个不同的随机样式
      for (let i = 0; i < 6; i++) {
          const c1 = getRandomColor();
          // 第二个颜色在色相上偏移 30-60 度，形成邻近色渐变
          const h2 = (parseInt(c1.split(',')[0].split('(')[1]) + 30 + Math.random() * 30) % 360;
          const c2 = `hsl(${h2}, 70%, 50%)`;
          newIcons.push(generateSvgIcon(text, c1, c2));
      }
      setGeneratedIcons(newIcons);
  };

  useEffect(() => {
    if (isOpen) {
      setLocalConfig(config);
      const safeSettings = {
          title: siteSettings?.title || 'CloudNav - 我的导航',
          navTitle: siteSettings?.navTitle || 'CloudNav',
          favicon: siteSettings?.favicon || '',
          cardStyle: siteSettings?.cardStyle || 'detailed'
      };
      setLocalSiteSettings(safeSettings);
      // 只有当生成的图标为空时，才自动生成，避免覆盖
      if (generatedIcons.length === 0) {
          updateGeneratedIcons(safeSettings.navTitle);
      }

      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
      shouldStopRef.current = false;
      setDomain(window.location.origin);
      const storedToken = localStorage.getItem('cloudnav_auth_token');
      if (storedToken) setPassword(storedToken);
      setDraggedId(null);
      setFilterCategory('all');
    }
  }, [isOpen, config, siteSettings]);

  const handleChange = (key: keyof AIConfig, value: string) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSiteChange = (key: keyof SiteSettings, value: string) => {
    setLocalSiteSettings(prev => {
        const next = { ...prev, [key]: value };
        return next;
    });
  };

  const handleSave = () => {
    onSave(localConfig, localSiteSettings);
    onClose();
  };

  const handleBulkGenerate = async () => {
    if (!localConfig.apiKey) {
        alert("请先配置并保存 API Key");
        return;
    }

    const missingLinks = links.filter(l => !l.description);
    if (missingLinks.length === 0) {
        alert("所有链接都已有描述！");
        return;
    }

    if (!confirm(`发现 ${missingLinks.length} 个链接缺少描述，确定要使用 AI 自动生成吗？这可能需要一些时间。`)) return;

    setIsProcessing(true);
    shouldStopRef.current = false;
    setProgress({ current: 0, total: missingLinks.length });
    
    let currentLinks = [...links];

    for (let i = 0; i < missingLinks.length; i++) {
        if (shouldStopRef.current) break;

        const link = missingLinks[i];
        try {
            const desc = await generateLinkDescription(link.title, link.url, localConfig);
            currentLinks = currentLinks.map(l => l.id === link.id ? { ...l, description: desc } : l);
            onUpdateLinks(currentLinks);
            setProgress({ current: i + 1, total: missingLinks.length });
        } catch (e) {
            console.error(`Failed to generate for ${link.title}`, e);
        }
    }

    setIsProcessing(false);
  };

  const handleCopy = (text: string, key: string) => {
      navigator.clipboard.writeText(text);
      setCopiedStates(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
          setCopiedStates(prev => ({ ...prev, [key]: false }));
      }, 2000);
  };

  // --- Drag and Drop Logic ---

  const handleDragStart = (e: React.DragEvent, id: string) => {
      setDraggedId(id);
      e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
      e.preventDefault(); 
      if (!draggedId || draggedId === targetId) return;
      
      const newLinks = [...links];
      const sourceIndex = newLinks.findIndex(l => l.id === draggedId);
      const targetIndex = newLinks.findIndex(l => l.id === targetId);

      if (sourceIndex === -1 || targetIndex === -1) return;

      const [movedItem] = newLinks.splice(sourceIndex, 1);
      newLinks.splice(targetIndex, 0, movedItem);
      
      onUpdateLinks(newLinks);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setDraggedId(null);
  };

  const filteredLinks = useMemo(() => {
      if (filterCategory === 'all') return links;
      return links.filter(l => l.categoryId === filterCategory);
  }, [links, filterCategory]);

  // Extension Generators - Dynamic based on settings
  const getManifestJson = () => {
    const json: any = {
        manifest_version: 3,
        name: localSiteSettings.navTitle || "CloudNav Assistant",
        version: "1.0",
        permissions: ["activeTab", "scripting"],
        action: {
            default_popup: "popup.html",
            default_title: `Save to ${localSiteSettings.navTitle || 'CloudNav'}`
        },
        icons: {
            "128": "icon.png"
        }
    };
    
    if (browserType === 'firefox') {
        json.browser_specific_settings = {
            gecko: {
                id: "cloudnav@example.com",
                strict_min_version: "109.0"
            }
        };
    }
    
    return JSON.stringify(json, null, 2);
  };

  const extPopupHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { width: 300px; font-family: sans-serif; padding: 12px; }
    h3 { margin: 0 0 10px 0; font-size: 16px; color: #333; }
    button { width: 100%; padding: 8px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; }
    button:hover { background: #2563eb; }
    .status { margin-top: 10px; font-size: 12px; text-align: center; color: #666; min-height: 16px; }
    .page-info { font-size: 12px; color: #64748b; margin-bottom: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #f1f5f9; padding: 6px; border-radius: 4px; display: flex; align-items: center; }
  </style>
</head>
<body>
  <h3>${localSiteSettings.navTitle || 'CloudNav'}</h3>
  <div class="page-info" id="page-title">Loading...</div>
  <button id="save-btn">保存到 ${localSiteSettings.navTitle || 'CloudNav'}</button>
  <div id="status" class="status"></div>
  <script src="popup.js"></script>
</body>
</html>`;

  const extPopupJs = `const CONFIG = {
  apiBase: "${domain}",
  password: "${password}"
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    document.getElementById('page-title').textContent = tab.title;
    
    // 显示图标预览
    if (tab.favIconUrl) {
       const img = document.createElement('img');
       img.src = tab.favIconUrl;
       img.style.cssText = 'width:16px;height:16px;margin-right:8px;vertical-align:middle;border-radius:2px;';
       document.getElementById('page-title').prepend(img);
    }

    document.getElementById('save-btn').addEventListener('click', async () => {
      const status = document.getElementById('status');
      status.textContent = 'Saving...';
      
      try {
        const res = await fetch(\`\${CONFIG.apiBase}/api/link\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-password': CONFIG.password
          },
          body: JSON.stringify({
            title: tab.title,
            url: tab.url,
            icon: tab.favIconUrl || '', // 获取网站图标
            categoryId: '' // Auto-detect
          })
        });

        if (res.ok) {
          const data = await res.json();
          status.textContent = '已保存！分类: ' + (data.categoryName || '默认');
          status.style.color = '#16a34a';
          setTimeout(() => window.close(), 1500);
        } else {
          status.textContent = 'Error: ' + res.status;
          status.style.color = '#dc2626';
        }
      } catch (e) {
        status.textContent = 'Network Error';
        status.style.color = '#dc2626';
      }
    });
  } catch(e) {
     document.getElementById('status').textContent = "Extension Error: " + e.message;
  }
});`;

  const renderCodeBlock = (filename: string, code: string) => (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
            <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300">{filename}</span>
            <button 
                onClick={() => handleCopy(code, filename)}
                className="text-xs flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
            >
                {copiedStates[filename] ? <Check size={12}/> : <Copy size={12}/>}
                {copiedStates[filename] ? 'Copied' : 'Copy'}
            </button>
        </div>
        <div className="bg-slate-900 p-3 overflow-x-auto">
            <pre className="text-[10px] md:text-xs font-mono text-slate-300 leading-relaxed whitespace-pre">
                {code}
            </pre>
        </div>
    </div>
  );

  // Download Helper for Icon
  const handleDownloadIcon = async () => {
     if (!localSiteSettings.favicon) return;
     try {
         // Attempt to fetch and download
         const response = await fetch(localSiteSettings.favicon);
         const blob = await response.blob();
         const url = window.URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = "icon.png";
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a);
         window.URL.revokeObjectURL(url);
     } catch (e) {
         // Fallback for CORS issues
         alert("由于浏览器安全限制，无法自动下载。\n\n请右键点击下方的图片，选择 '图片另存为...'，并将其命名为 'icon.png' 保存。");
     }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'site', label: '网站设置', icon: LayoutTemplate },
    { id: 'ai', label: 'AI 设置', icon: Bot },
    { id: 'links', label: '链接管理', icon: List },
    { id: 'tools', label: '扩展工具', icon: Wrench },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 dark:border-slate-700 flex max-h-[90vh] flex-col md:flex-row">
        
        {/* Sidebar */}
        <div className="w-full md:w-48 bg-slate-50 dark:bg-slate-800/50 border-r border-slate-200 dark:border-slate-700 flex flex-row md:flex-col p-2 gap-1 overflow-x-auto">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                        activeTab === tab.id 
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                >
                    <tab.icon size={18} />
                    {tab.label}
                </button>
            ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
             <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
                <h3 className="text-lg font-semibold dark:text-white">设置</h3>
                <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                    <X className="w-5 h-5 dark:text-slate-400" />
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
                
                {/* 1. Site Settings */}
                {activeTab === 'site' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">网页标题 (Title)</label>
                                <input 
                                    type="text" 
                                    value={localSiteSettings.title}
                                    onChange={(e) => handleSiteChange('title', e.target.value)}
                                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">导航栏标题</label>
                                <input 
                                    type="text" 
                                    value={localSiteSettings.navTitle}
                                    onChange={(e) => handleSiteChange('navTitle', e.target.value)}
                                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">网站图标 (Favicon URL)</label>
                                <div className="flex gap-3 items-center">
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-600">
                                        {localSiteSettings.favicon ? <img src={localSiteSettings.favicon} className="w-full h-full object-cover"/> : <Globe size={20} className="text-slate-400"/>}
                                    </div>
                                    <input 
                                        type="text" 
                                        value={localSiteSettings.favicon}
                                        onChange={(e) => handleSiteChange('favicon', e.target.value)}
                                        placeholder="https://example.com/favicon.ico"
                                        className="flex-1 p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div className="mt-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs text-slate-500">选择生成的随机图标 (点击右侧按钮刷新):</p>
                                        <button 
                                            type="button"
                                            onClick={() => updateGeneratedIcons(localSiteSettings.navTitle)}
                                            className="text-xs flex items-center gap-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 px-2 py-1 rounded transition-colors"
                                        >
                                            <RefreshCw size={12} /> 随机生成
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        {generatedIcons.map((icon, idx) => (
                                            <button 
                                                key={idx}
                                                onClick={() => handleSiteChange('favicon', icon)}
                                                className="w-8 h-8 rounded hover:ring-2 ring-blue-500 transition-all border border-slate-100 dark:border-slate-600"
                                            >
                                                <img src={icon} className="w-full h-full rounded" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            {/* Card Style Setting Removed as requested */}

                        </div>
                    </div>
                )}

                {/* 2. AI Settings */}
                {activeTab === 'ai' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">AI 提供商</label>
                            <select 
                                value={localConfig.provider}
                                onChange={(e) => handleChange('provider', e.target.value)}
                                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="gemini">Google Gemini</option>
                                <option value="openai">OpenAI Compatible (ChatGPT, DeepSeek, Claude...)</option>
                            </select>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">API Key</label>
                            <div className="relative">
                                <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="password" 
                                    value={localConfig.apiKey}
                                    onChange={(e) => handleChange('apiKey', e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full pl-10 p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                />
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Key 仅存储在本地浏览器缓存中，不会发送到我们的服务器。</p>
                        </div>

                        {localConfig.provider === 'openai' && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Base URL (API 地址)</label>
                                <input 
                                    type="text" 
                                    value={localConfig.baseUrl}
                                    onChange={(e) => handleChange('baseUrl', e.target.value)}
                                    placeholder="https://api.openai.com/v1"
                                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">模型名称 (Model Name)</label>
                            <input 
                                type="text" 
                                value={localConfig.model}
                                onChange={(e) => handleChange('model', e.target.value)}
                                placeholder={localConfig.provider === 'gemini' ? "gemini-2.5-flash" : "gpt-3.5-turbo"}
                                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                            <h4 className="text-sm font-semibold mb-2 dark:text-slate-200">批量操作</h4>
                            {isProcessing ? (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                                        <span>正在生成描述... ({progress.current}/{progress.total})</span>
                                        <button onClick={() => { shouldStopRef.current = true; setIsProcessing(false); }} className="text-red-500 flex items-center gap-1 hover:underline">
                                            <PauseCircle size={12}/> 停止
                                        </button>
                                    </div>
                                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                                    </div>
                                </div>
                            ) : (
                                <button 
                                    onClick={handleBulkGenerate}
                                    className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 px-3 py-2 rounded-lg transition-colors border border-purple-200 dark:border-purple-800"
                                >
                                    <Sparkles size={16} /> 一键补全所有缺失的描述
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* 3. Link Manager */}
                {activeTab === 'links' && (
                    <div className="space-y-4 animate-in fade-in duration-300 flex flex-col h-full">
                        <div className="flex items-center gap-2 mb-2">
                            <Filter size={16} className="text-slate-400" />
                            <select 
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                                className="p-1.5 text-sm rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                            >
                                <option value="all">全部分类</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <span className="text-xs text-slate-400 ml-auto">拖拽调整顺序</span>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                             {filteredLinks.length === 0 ? (
                                 <div className="text-center py-10 text-slate-400 text-sm">暂无链接</div>
                             ) : (
                                 filteredLinks.map(link => (
                                    <div 
                                        key={link.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, link.id)}
                                        onDragOver={(e) => handleDragOver(e, link.id)}
                                        onDrop={handleDrop}
                                        className={`flex items-center gap-3 p-3 bg-white dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 ${draggedId === link.id ? 'opacity-50 border-blue-400 border-dashed' : 'hover:border-blue-300'}`}
                                    >
                                        <div className="cursor-move text-slate-400 hover:text-slate-600">
                                            <GripVertical size={16} />
                                        </div>
                                        <div className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-600 flex items-center justify-center text-xs overflow-hidden">
                                            {link.icon ? <img src={link.icon} className="w-full h-full object-cover"/> : link.title.charAt(0)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium dark:text-slate-200 truncate">{link.title}</div>
                                            <div className="text-xs text-slate-400 truncate">{link.url}</div>
                                        </div>
                                        <div className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-600 text-slate-500">
                                            {categories.find(c => c.id === link.categoryId)?.name}
                                        </div>
                                    </div>
                                 ))
                             )}
                        </div>
                    </div>
                )}

                {/* 4. Tools (Extension) - New 3-Step UI */}
                {activeTab === 'tools' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        
                        {/* Step 1 */}
                        <div className="space-y-3">
                            <h4 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">1</span>
                                输入访问密码
                            </h4>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                <div className="space-y-3">
                                     <div>
                                        <label className="text-xs text-slate-500 mb-1 block">API 域名 (自动获取)</label>
                                        <code className="block w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-600 dark:text-slate-400 font-mono truncate">
                                            {domain}
                                        </code>
                                     </div>
                                     <div>
                                        <label className="text-xs text-slate-500 mb-1 block">访问密码 (Password)</label>
                                        <div className="flex gap-2">
                                            <input 
                                                type="text" 
                                                value={password} 
                                                readOnly 
                                                className="flex-1 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm outline-none font-mono"
                                                placeholder="未登录 / 未设置"
                                            />
                                             <button onClick={() => handleCopy(password, 'pwd')} className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:border-blue-500 rounded text-slate-600 dark:text-slate-400 transition-colors">
                                                {copiedStates['pwd'] ? <Check size={16}/> : <Copy size={16}/>}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-1">此密码对应您部署时设置的 PASSWORD 环境变量。</p>
                                     </div>
                                </div>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="space-y-3">
                            <h4 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">2</span>
                                选择浏览器类型
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                                <button 
                                    onClick={() => setBrowserType('chrome')}
                                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${browserType === 'chrome' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 bg-white dark:bg-slate-800'}`}
                                >
                                    <span className="font-semibold">Chrome / Edge</span>
                                </button>
                                <button 
                                    onClick={() => setBrowserType('firefox')}
                                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${browserType === 'firefox' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 bg-white dark:bg-slate-800'}`}
                                >
                                    <span className="font-semibold">Mozilla Firefox</span>
                                </button>
                            </div>
                        </div>

                        {/* Step 3 */}
                        <div className="space-y-4">
                            <h4 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">3</span>
                                配置步骤与代码
                            </h4>
                            
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                                <h5 className="font-semibold text-sm mb-3 dark:text-slate-200">
                                    安装指南 ({browserType === 'chrome' ? 'Chrome/Edge' : 'Firefox'}):
                                </h5>
                                <ol className="list-decimal list-inside text-sm text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
                                    <li>在电脑上新建一个文件夹，命名为 <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-xs">CloudNav-Ext</code>。</li>
                                    <li><strong>[重要]</strong> 将下方的图标保存到该文件夹中，必须命名为 <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-xs">icon.png</code>。</li>
                                    <li>在文件夹中创建以下 3 个文本文件，分别复制下方的代码粘贴进去。</li>
                                    <li>
                                        打开浏览器扩展管理页面 
                                        {browserType === 'chrome' ? (
                                            <> (Chrome: <code className="select-all bg-white dark:bg-slate-900 px-1 rounded">chrome://extensions</code>, Edge: <code className="select-all bg-white dark:bg-slate-900 px-1 rounded">edge://extensions</code>)</>
                                        ) : (
                                            <> (Firefox: <code className="select-all bg-white dark:bg-slate-900 px-1 rounded">about:debugging</code>)</>
                                        )}。
                                    </li>
                                    {browserType === 'chrome' && <li>开启右上角的 "<strong>开发者模式</strong>"。</li>}
                                    <li>点击 "<strong>{browserType === 'chrome' ? '加载已解压的扩展程序' : '临时载入附加组件'}</strong>"，选择刚才创建的文件夹。</li>
                                </ol>
                            </div>

                            <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                     <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-600">
                                        {localSiteSettings.favicon ? <img src={localSiteSettings.favicon} className="w-full h-full object-cover"/> : <Globe size={24} className="text-slate-400"/>}
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm dark:text-white">插件图标 (icon.png)</div>
                                        <div className="text-xs text-slate-500">请保存此图片为 icon.png</div>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleDownloadIcon}
                                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 rounded-lg transition-colors"
                                >
                                    <Download size={16} /> 下载图标
                                </button>
                            </div>

                            <div className="space-y-4">
                                {renderCodeBlock('manifest.json', getManifestJson())}
                                {renderCodeBlock('popup.html', extPopupHtml)}
                                {renderCodeBlock('popup.js', extPopupJs)}
                            </div>
                        </div>
                    </div>
                )}

            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end bg-slate-50 dark:bg-slate-800/50 shrink-0">
                <button 
                    onClick={handleSave}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-blue-500/20"
                >
                    <Save size={18} /> 保存更改
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
