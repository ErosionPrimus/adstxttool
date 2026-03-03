import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Globe, Play, Trash2, Download, Copy, Eye, X, CheckCircle2, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp, Check } from 'lucide-react';
import * as XLSX from 'xlsx';

// Types
type Language = 'cn' | 'en';
type Status = 'success' | 'not_found' | 'timeout' | 'error';

interface DomainResult {
  id: number;
  domain: string;
  url: string;
  status: Status;
  statusCode: number | string;
  content: string;
  timestamp: string;
  lines: number;
}

interface LogEntry {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

// Translations
const t = {
  cn: {
    title: 'Ads.txt 扫描机',
    subtitle: '发布商域名批量验证终端',
    placeholder: '输入目标域名 (支持逗号/换行分隔)...\n> google.com\n> apkpure.com',
    domainCount: '目标: {count}',
    loadExample: '载入预设',
    clear: '清除',
    start: '检查',
    processing: '扫描中...',
    progress: '进度 {current}/{total}',
    logs: '系统遥测',
    total: '总计目标',
    success: '已解析',
    failed: '未命中',
    colId: 'ID',
    colDomain: '目标',
    colUrl: '端点',
    colStatus: '状态',
    colCode: '响应码',
    colTime: '时间戳',
    colLines: '总行数',
    colPreview: '数据负载',
    colAction: '检视',
    statusSuccess: '成功',
    statusNotFound: '未找到',
    statusTimeout: '超时',
    statusError: '异常',
    modalTitle: '数据负载检视',
    copyContent: '复制负载',
    close: '关闭',
    copyExcel: '导出 TSV',
    downloadXlsx: '下载 XLSX',
    copiedToast: '已复制到剪贴板',
    emptyContent: '无数据',
    exportError: '导出失败: {error}',
    faqTitle: '常见问题 (FAQ)',
    faq1Q: '为什么有些网站会显示"Blocked by WAF/Cloudflare"？',
    faq1A: '许多大型网站（如 apkpure.com）启用了严格的 Web 应用防火墙（WAF）或 Cloudflare 5秒盾。我们的扫描机通过代理服务器访问时，容易被这些防火墙拦截。',
    faq2Q: '为什么导出 Excel 时内容被截断了？',
    faq2A: 'Excel 的单个单元格最多只能容纳 32,767 个字符。对于非常大的 ads.txt 文件，我们会自动截断超出部分以确保文件能正常导出。您可以通过"复制负载"获取完整内容。',
    faq3Q: '如何提高扫描成功率？',
    faq3A: '系统已经内置了多节点代理轮询机制。如果某个域名持续失败，建议稍后再试，或者直接在浏览器中访问该域名的 ads.txt。',
  },
  en: {
    title: 'Ads.txt Scanner',
    subtitle: 'Batch verification matrix for publisher domains',
    placeholder: 'Enter target domains (comma/newline separated)...\n> google.com\n> apkpure.com',
    domainCount: 'Targets: {count}',
    loadExample: 'Load Payload',
    clear: 'Purge',
    start: 'Check',
    processing: 'Scanning...',
    progress: 'Processed {current}/{total}',
    logs: 'System Telemetry',
    total: 'Total Targets',
    success: 'Resolved',
    failed: 'Failed',
    colId: 'ID',
    colDomain: 'Target',
    colUrl: 'Endpoint',
    colStatus: 'State',
    colCode: 'Code',
    colTime: 'Timestamp',
    colLines: 'Total Lines',
    colPreview: 'Data Payload',
    colAction: 'Inspect',
    statusSuccess: 'Success',
    statusNotFound: 'Not Found',
    statusTimeout: 'Timeout',
    statusError: 'Error',
    modalTitle: 'Payload Inspector',
    copyContent: 'Copy Payload',
    close: 'Close',
    copyExcel: 'Copy TSV',
    downloadXlsx: 'Download XLSX',
    copiedToast: 'Copied to clipboard',
    emptyContent: 'NO DATA',
    exportError: 'Export failed: {error}',
    faqTitle: 'Frequently Asked Questions',
    faq1Q: 'Why do some sites show "Blocked by WAF/Cloudflare"?',
    faq1A: 'Many large websites (like apkpure.com) use strict Web Application Firewalls (WAF) or Cloudflare protection. Our scanner uses proxy servers which are often blocked by these security measures.',
    faq2Q: 'Why is the content truncated in the Excel export?',
    faq2A: 'Excel has a hard limit of 32,767 characters per cell. For extremely large ads.txt files, we truncate the content to ensure the file can be exported successfully. You can use "Copy Payload" to get the full content.',
    faq3Q: 'How can I improve the success rate?',
    faq3A: 'The system already uses a multi-node proxy polling mechanism. If a domain consistently fails, try again later or visit the domain\'s ads.txt directly in your browser.',
  }
};

const EXAMPLE_DOMAINS = [
  'google.com', 'nytimes.com', 'apkpure.com'
];

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<DomainResult[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [modalContent, setModalContent] = useState<{ domain: string, content: string } | null>(null);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const texts = t[lang];

  // Parse domains from input
  const parsedDomains = useMemo(() => {
    if (!input.trim()) return [];
    return input
      .split(/[\n,;]+/)
      .map(d => d.trim().toLowerCase())
      .filter(d => d.length > 0)
      .map(d => d.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0])
      .filter((v, i, a) => a.indexOf(v) === i); // Unique
  }, [input]);

  // Auto focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto scroll logs
  useEffect(() => {
    if (showLogs) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  // Handle Ctrl+Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!isProcessing && parsedDomains.length > 0) {
          startProcessing();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing, parsedDomains]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleLoadExample = () => {
    setInput(EXAMPLE_DOMAINS.join('\n'));
  };

  const handleClear = () => {
    setInput('');
    setResults([]);
    setLogs([]);
    setProgress({ current: 0, total: 0 });
  };

  const getUTC8Time = () => {
    return new Date().toLocaleString('zh-CN', { 
      timeZone: 'Asia/Shanghai',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(/\//g, '-');
  };

  const fetchAdsTxt = async (domain: string): Promise<Omit<DomainResult, 'id' | 'domain' | 'url' | 'timestamp'>> => {
    try {
      const res = await fetch(`/api/fetch-ads?domain=${encodeURIComponent(domain)}`);
      const data = await res.json();
      
      if (res.ok && data.status === 200) {
        return { status: 'success', statusCode: 200, content: data.content };
      } else if (data.status === 404) {
        return { status: 'not_found', statusCode: 404, content: '' };
      } else {
        return { status: 'error', statusCode: res.status, content: data.error || 'Error' };
      }
    } catch (err: any) {
      return { status: 'error', statusCode: 500, content: err.message || 'Network error' };
    }
  };

  const startProcessing = async () => {
    if (parsedDomains.length === 0) return;
    
    setIsProcessing(true);
    setResults([]);
    setLogs([]);
    setProgress({ current: 0, total: parsedDomains.length });
    setShowLogs(true);

    const newResults: DomainResult[] = [];
    
    for (let i = 0; i < parsedDomains.length; i++) {
      const domain = parsedDomains[i];
      const url = `https://${domain}/ads.txt`;
      
      // Add log: starting
      setLogs(prev => [...prev, { id: Date.now(), message: `[TELEMETRY] ${i + 1}/${parsedDomains.length} - ${domain} - Establishing connection...`, type: 'info' }]);
      
      const fetchResult = await fetchAdsTxt(domain);
      const lines = fetchResult.content ? fetchResult.content.split('\n').length : 0;
      
      const result: DomainResult = {
        id: i,
        domain,
        url,
        timestamp: getUTC8Time(),
        lines,
        ...fetchResult
      };
      
      newResults.push(result);
      setResults([...newResults]);
      setProgress({ current: i + 1, total: parsedDomains.length });
      
      // Add log: finished
      const statusText = texts[`status${result.status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}` as keyof typeof texts] as string;
      const logType = result.status === 'success' ? 'success' : result.status === 'not_found' ? 'warning' : 'error';
      setLogs(prev => [...prev, { id: Date.now() + 1, message: `[TELEMETRY] ${i + 1}/${parsedDomains.length} - ${domain} - ${statusText} (${result.statusCode})`, type: logType }]);
    }
    
    setIsProcessing(false);
  };

  const exportExcel = () => {
    if (results.length === 0) return;
    
    try {
      const data = results.map((r, i) => ({
        [texts.colId]: i + 1,
        [texts.colDomain]: r.domain,
        [texts.colUrl]: r.url,
        [texts.colStatus]: texts[`status${r.status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}` as keyof typeof texts],
        [texts.colCode]: r.statusCode,
        [texts.colTime]: r.timestamp,
        [texts.colLines]: r.lines,
        'Ads.txt Content': r.content.length > 32000 ? r.content.substring(0, 32000) + '\n...[TRUNCATED DUE TO EXCEL LIMIT]' : r.content
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Results");
      
      const date = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `ads_txt_results_${date}.xlsx`);
    } catch (error: any) {
      showToast(texts.exportError.replace('{error}', error.message || 'Unknown error'), 'error');
    }
  };

  const copyTsv = () => {
    if (results.length === 0) return;
    
    const headers = [texts.colId, texts.colDomain, texts.colUrl, texts.colStatus, texts.colCode, texts.colTime, texts.colLines, 'Content'].join('\t');
    const rows = results.map((r, i) => {
      const status = texts[`status${r.status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}` as keyof typeof texts];
      const content = r.content.replace(/\n/g, ' \\n '); // Escape newlines for TSV
      return `${i + 1}\t${r.domain}\t${r.url}\t${status}\t${r.statusCode}\t${r.timestamp}\t${r.lines}\t${content}`;
    }).join('\n');
    
    navigator.clipboard.writeText(`${headers}\n${rows}`);
    showToast(texts.copiedToast);
  };

  const copyModalContent = () => {
    if (modalContent) {
      navigator.clipboard.writeText(modalContent.content);
      showToast(texts.copiedToast);
    }
  };

  const getStatusBadge = (status: Status) => {
    const statusText = texts[`status${status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}` as keyof typeof texts] as string;
    switch (status) {
      case 'success': return <span className="badge bg-success-bg text-success-text"><CheckCircle2 className="w-3 h-3 mr-1" />{statusText}</span>;
      case 'not_found': return <span className="badge bg-warning-bg text-warning-text"><AlertTriangle className="w-3 h-3 mr-1" />{statusText}</span>;
      case 'timeout': return <span className="badge bg-info-bg text-info-text"><Clock className="w-3 h-3 mr-1" />{statusText}</span>;
      case 'error': return <span className="badge bg-error-bg text-error-text"><XCircle className="w-3 h-3 mr-1" />{statusText}</span>;
    }
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const failedCount = results.length - successCount;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header & Language Switch */}
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
            <Globe className="w-8 h-8 text-accent-link" />
            {texts.title}
          </h1>
          <p className="text-text-paragraph text-sm md:text-base">{texts.subtitle}</p>
        </div>
        <div className="flex bg-card-bg rounded-full p-1 border border-card-border shadow-sm">
          <button 
            onClick={() => setLang('cn')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${lang === 'cn' ? 'bg-accent-link text-[#232946]' : 'text-text-paragraph hover:text-text-headline'}`}
          >
            CN
          </button>
          <button 
            onClick={() => setLang('en')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${lang === 'en' ? 'bg-accent-link text-[#232946]' : 'text-text-paragraph hover:text-text-headline'}`}
          >
            EN
          </button>
        </div>
      </header>

      <main className="space-y-6">
        {/* Input Section */}
        <section className="card p-6">
          <div className="flex justify-between items-end mb-3">
            <label className="text-sm font-semibold text-text-headline">
              {texts.domainCount.replace('{count}', parsedDomains.length.toString())}
            </label>
            <div className="flex gap-2">
              <button onClick={handleLoadExample} className="text-xs text-accent-link hover:underline px-2 py-1">
                {texts.loadExample}
              </button>
              <button onClick={handleClear} className="text-xs text-text-paragraph hover:text-error-text px-2 py-1 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> {texts.clear}
              </button>
            </div>
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={texts.placeholder}
            className="input-field h-40 resize-y mb-4"
            disabled={isProcessing}
          />
          <button 
            onClick={startProcessing} 
            disabled={isProcessing || parsedDomains.length === 0}
            className="btn btn-primary w-full md:w-auto text-base py-3 px-8 flex items-center gap-2"
          >
            {isProcessing ? (
              <><span className="animate-spin rounded-full h-4 w-4 border-2 border-[#232946] border-t-transparent"></span> {texts.processing}</>
            ) : (
              <><Play className="w-5 h-5 fill-current" /> {texts.start}</>
            )}
          </button>
        </section>

        {/* Progress & Logs */}
        {(isProcessing || logs.length > 0) && (
          <section className="card overflow-hidden">
            <div className="p-4 border-b border-card-border flex justify-between items-center bg-bg-primary/50">
              <div className="flex-1 mr-4">
                <div className="flex justify-between text-xs mb-1 font-medium">
                  <span>{texts.progress.replace('{current}', progress.current.toString()).replace('{total}', progress.total.toString())}</span>
                  <span>{progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-card-border rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-accent-link h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
              <button 
                onClick={() => setShowLogs(!showLogs)}
                className="text-text-paragraph hover:text-text-headline p-1 rounded-md hover:bg-card-border/50 transition-colors"
                title={texts.logs}
              >
                {showLogs ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>
            
            {showLogs && (
              <div className="p-4 bg-[#1a1f35] text-gray-300 font-mono text-xs h-48 overflow-y-auto">
                {logs.map(log => (
                  <div key={log.id} className={`mb-1 ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : log.type === 'warning' ? 'text-yellow-400' : 'text-blue-300'}`}>
                    {log.message}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </section>
        )}

        {/* Results Section */}
        {results.length > 0 && (
          <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card p-5 border-l-4 border-l-info-text flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-paragraph mb-1">{texts.total}</p>
                  <p className="text-3xl font-bold text-text-headline">{results.length}</p>
                </div>
                <div className="p-3 bg-info-bg rounded-xl text-info-text">
                  <Globe className="w-6 h-6" />
                </div>
              </div>
              <div className="card p-5 border-l-4 border-l-success-text flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-paragraph mb-1">{texts.success}</p>
                  <p className="text-3xl font-bold text-text-headline">{successCount}</p>
                </div>
                <div className="p-3 bg-success-bg rounded-xl text-success-text">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>
              <div className="card p-5 border-l-4 border-l-error-text flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-paragraph mb-1">{texts.failed}</p>
                  <p className="text-3xl font-bold text-text-headline">{failedCount}</p>
                </div>
                <div className="p-3 bg-error-bg rounded-xl text-error-text">
                  <XCircle className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 justify-end">
              <button onClick={copyTsv} className="btn btn-secondary text-sm">
                <Copy className="w-4 h-4 mr-2" /> {texts.copyExcel}
              </button>
              <button onClick={exportExcel} className="btn btn-secondary text-sm">
                <Download className="w-4 h-4 mr-2" /> {texts.downloadXlsx}
              </button>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-bg-primary/50 text-text-paragraph font-semibold border-b border-card-border">
                    <tr>
                      <th className="px-4 py-3 w-12">{texts.colId}</th>
                      <th className="px-4 py-3">{texts.colDomain}</th>
                      <th className="px-4 py-3">{texts.colUrl}</th>
                      <th className="px-4 py-3">{texts.colStatus}</th>
                      <th className="px-4 py-3">{texts.colCode}</th>
                      <th className="px-4 py-3">{texts.colTime}</th>
                      <th className="px-4 py-3">{texts.colLines}</th>
                      <th className="px-4 py-3 max-w-xs">{texts.colPreview}</th>
                      <th className="px-4 py-3 text-center w-20">{texts.colAction}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border">
                    {results.map((result, idx) => (
                      <tr key={result.id} className="hover:bg-bg-primary/30 transition-colors group">
                        <td className="px-4 py-3 text-text-paragraph">{idx + 1}</td>
                        <td className="px-4 py-3 font-mono text-text-headline">{result.domain}</td>
                        <td className="px-4 py-3 font-mono text-xs text-text-paragraph truncate max-w-[150px]" title={result.url}>
                          <a href={result.url} target="_blank" rel="noreferrer" className="hover:text-accent-link hover:underline">
                            {result.url}
                          </a>
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(result.status)}</td>
                        <td className="px-4 py-3 font-mono text-text-paragraph">{result.statusCode}</td>
                        <td className="px-4 py-3 font-mono text-xs text-text-paragraph">{result.timestamp}</td>
                        <td className="px-4 py-3 font-mono text-text-paragraph">{result.lines}</td>
                        <td className="px-4 py-3 font-mono text-xs text-text-paragraph truncate max-w-xs" title={result.content}>
                          {result.content ? (result.content.length > 80 ? result.content.substring(0, 80) + '...' : result.content) : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button 
                            onClick={() => setModalContent({ domain: result.domain, content: result.content })}
                            disabled={!result.content}
                            className="p-1.5 text-text-paragraph hover:text-accent-link hover:bg-accent-link/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-paragraph"
                            title={texts.modalTitle}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* FAQ Section */}
        <section className="mt-16 mb-8">
          <h2 className="text-2xl font-bold text-text-headline mb-6">{texts.faqTitle}</h2>
          <div className="space-y-4">
            <div className="card p-5">
              <h3 className="font-bold text-accent-link mb-2">Q: {texts.faq1Q}</h3>
              <p className="text-text-paragraph text-sm">{texts.faq1A}</p>
            </div>
            <div className="card p-5">
              <h3 className="font-bold text-accent-link mb-2">Q: {texts.faq2Q}</h3>
              <p className="text-text-paragraph text-sm">{texts.faq2A}</p>
            </div>
            <div className="card p-5">
              <h3 className="font-bold text-accent-link mb-2">Q: {texts.faq3Q}</h3>
              <p className="text-text-paragraph text-sm">{texts.faq3A}</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-12 pt-6 border-t border-card-border text-center text-sm text-text-paragraph/60 pb-8 relative z-10">
        &copy; 2026 Ads.txt Checker. All rights reserved.
      </footer>

      {/* Modal */}
      {modalContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setModalContent(null)}>
          <div 
            className="bg-card-bg border border-card-border rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b border-card-border bg-bg-primary/50">
              <h3 className="font-semibold text-text-headline flex items-center gap-2">
                <Globe className="w-4 h-4 text-accent-link" />
                {modalContent.domain} - {texts.modalTitle}
              </h3>
              <button 
                onClick={() => setModalContent(null)}
                className="text-text-paragraph hover:text-error-text p-1 rounded-lg hover:bg-error-bg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto bg-[#1a1f35]">
              <pre className="font-mono text-sm text-gray-300 whitespace-pre-wrap break-all">
                {modalContent.content || texts.emptyContent}
              </pre>
            </div>
            <div className="p-4 border-t border-card-border bg-bg-primary/50 flex justify-end gap-3">
              <button onClick={() => setModalContent(null)} className="btn btn-secondary text-sm">
                {texts.close}
              </button>
              <button onClick={copyModalContent} className="btn btn-primary text-sm flex items-center gap-2">
                <Copy className="w-4 h-4" /> {texts.copyContent}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-8 fade-in duration-300">
          <div className={`px-4 py-2 rounded-none border-2 shadow-[4px_4px_0px_0px_rgba(20,18,18,0.5)] flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${
            toast.type === 'error' 
              ? 'bg-[#E9967A] text-[#2B2626] border-[#B22222]' 
              : 'bg-[#8FBC8F] text-[#2B2626] border-[#6B8E23]'
          }`}>
            {toast.type === 'error' ? <XCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
