'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Mic, StopCircle, Play, Pause, Trash2, Search, Settings, 
  ChevronLeft, Share2, FileText, CheckCircle2, AlertCircle,
  Hash, Clock, MoreVertical, Bookmark, Zap, BrainCircuit,
  Download, Copy, ExternalLink, Sparkles, Send, Wand2, Star, 
  Filter, RotateCcw, Save, ShieldCheck, Check, X, ChevronRight,
  ListFilter, History, LayoutGrid, Type, AlertTriangle, CloudOff,
  RotateCw, FastForward, Rewind, Gauge, Layers, Info, User,
  Database, Shield, Monitor, Minimize2, Maximize2
} from 'lucide-react';

// --- 1. 配置与常量 ---
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'voiceflow-v4-pro-final-refined';

const SCENES = [
  { id: 'meeting', label: '会议', icon: '👥', strategy: '自动提取行动项' },
  { id: 'lecture', label: '课堂', icon: '🎓', strategy: '重点概念提取' },
  { id: 'interview', label: '采访', icon: '🎙️', strategy: '问答结构优化' },
  { id: 'idea', label: '灵感', icon: '💡', strategy: '极简摘要' },
];

const STATUS_LABELS = {
  waiting: { text: '排队中', color: 'bg-slate-100 text-slate-500', icon: <Clock size={10}/> },
  processing: { text: '处理中', color: 'bg-blue-50 text-blue-600 animate-pulse', icon: <RotateCw size={10} className="animate-spin"/> },
  done: { text: '已就绪', color: 'bg-green-50 text-green-600', icon: <Check size={10}/> },
  failed: { text: '失败', color: 'bg-red-50 text-red-600', icon: <AlertCircle size={10}/> },
};

// --- 2. 全局工具函数 ---

const getUnifiedStatus = (rec, taskQueue) => {
  const task = taskQueue.find(t => t.id === rec.id);
  if (task) return task.status;
  const hasSegments = (rec.transcript?.segments?.length ?? 0) > 0;
  const hasAnalysis = !!rec.analysis;
  if (rec.status === 'Failed' || rec.status === 'failed') return 'failed';
  if (hasAnalysis || hasSegments) return 'done';
  return 'done'; 
};

const buildFullText = (rec) =>
  (rec?.transcript?.segments ?? [])
    .map(s => String(s.text || ""))
    .filter(Boolean)
    .join('\n');

const toMarkdown = (rec) => {
  const date = new Date(rec.createdAt).toLocaleString();
  const lines = [`# ${rec.title}`, `- 时间：${date}`, `- 时长：${Math.floor(rec.duration/60)}:${String(Math.floor(rec.duration%60)).padStart(2,'0')}`, ''];
  if (rec.analysis?.summary) lines.push(`## 摘要`, String(rec.analysis.summary), '');
  if (rec.analysis?.todoList?.length) {
    lines.push(`## 行动清单`);
    rec.analysis.todoList.forEach(t => lines.push(`- [ ] ${String(t).trim()}`));
    lines.push('');
  }
  lines.push(`## 文字实录`);
  const segs = rec.transcript?.segments ?? [];
  if (segs.length === 0) lines.push('_暂无文字实录_');
  else segs.forEach(s => {
    const ts = `${Math.floor(s.startTime/60)}:${String(Math.floor(s.startTime%60)).padStart(2,'0')}`;
    lines.push(`- **${ts}** ${String(s.text).trim()}`);
  });
  return lines.join('\n');
};

const copyText = async (text, showToast) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text ?? '');
    } else {
      const el = document.createElement('textarea');
      el.value = text ?? '';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    showToast?.('内容已成功复制');
  } catch {
    showToast?.('复制失败，请检查浏览器权限', 'error');
  }
};

const apiJson = async (url, options) => {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text ? { raw: text } : null;
  }
  if (!res.ok) {
    throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
  }
  return data;
};

// --- 3. 基础 UI 组件 ---

const Toast = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4">
      <div className={`px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2.5 text-sm font-bold ${
        type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'
      }`}>
        {type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
        {String(message)}
      </div>
    </div>
  );
};

const BottomSheet = ({ isOpen, onClose, title, children, footer, subTitle }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-white rounded-t-[40px] p-6 pb-12 relative z-10 animate-in slide-in-from-bottom duration-300 max-h-[95vh] overflow-y-auto shadow-2xl">
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6" onClick={onClose} />
        {title && (
          <div className="mb-6 px-2 text-center">
            <h3 className="text-2xl font-black text-slate-800 tracking-tighter">{String(title)}</h3>
            {subTitle && <p className="text-[10px] text-slate-400 mt-1 font-black uppercase tracking-[0.2em]">{String(subTitle)}</p>}
          </div>
        )}
        {children}
        {footer && <div className="mt-8">{footer}</div>}
      </div>
    </div>
  );
};

function StatusPill({ active, label, count, color = "text-slate-600", onClick }) {
  return (
    <button onClick={onClick} className={`px-6 py-3 rounded-full flex items-center gap-2.5 transition-all whitespace-nowrap border-2 ${active ? 'bg-slate-900 border-slate-900 text-white shadow-xl scale-105 z-10' : 'bg-white border-slate-100 text-slate-400 shadow-sm active:scale-95'}`}>
      <span className={`text-xs font-black uppercase tracking-tighter ${active ? 'text-white' : color}`}>{label}</span>
      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-lg ${active ? 'bg-white/20 text-white' : 'bg-slate-50 text-slate-400'}`}>{count}</span>
    </button>
  );
}

function SegmentButton({ active, label, count, onClick, color = "text-slate-400" }) {
  return (
    <button onClick={onClick} className={`flex-1 py-3 px-2 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1.5 ${active ? 'bg-white text-slate-900 shadow-sm scale-105 z-10' : color} active:scale-95`}>
      {label} <span className={`px-1.5 py-0.5 rounded-md ${active ? 'bg-slate-100' : 'bg-slate-200/50 text-slate-400'}`}>{count}</span>
    </button>
  );
}

function TabButton({ active, label, onClick }) {
  return <button onClick={onClick} className={`flex-1 py-5 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-4 ${active ? 'text-blue-600 border-blue-600' : 'text-slate-300 border-transparent'} active:opacity-70`}>{label}</button>;
}

function ResearchCard({ color, title, items }) {
  const colors = {
    blue: 'border-blue-100 bg-blue-50/50 text-blue-900 shadow-blue-50',
    emerald: 'border-emerald-100 bg-emerald-50/50 text-emerald-900 shadow-emerald-50'
  };
  return (
    <div className={`p-8 rounded-[40px] border-2 ${colors[color]} shadow-sm`}>
      <h5 className="font-black mb-5 flex items-center gap-3 tracking-tight text-sm uppercase"><div className="w-2.5 h-2.5 rounded-full bg-current"/> {title}</h5>
      <ul className="space-y-4">
        {Array.isArray(items) ? items.map((it, idx) => (
          <li key={idx} className="text-base opacity-80 leading-relaxed font-bold tracking-tight">• {String(it)}</li>
        )) : <li className="text-xs opacity-30 italic text-slate-400 font-bold uppercase tracking-tighter">暂无分析内容</li>}
      </ul>
    </div>
  );
}

function ParagraphAction({ icon, label, onClick }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm text-[10px] font-black text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-all active:scale-95 uppercase tracking-tighter">
      {icon} {label}
    </button>
  );
}

function WorkflowCard({ icon, title, desc, sub, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col p-8 bg-white border border-slate-100 rounded-[44px] text-left hover:bg-blue-50/20 hover:border-blue-100 transition-all active:scale-[0.98] group shadow-sm">
      <div className="text-blue-600 mb-6 group-hover:scale-110 transition-transform">{icon}</div>
      <p className="font-black text-lg text-slate-800 tracking-tighter leading-none">{title}</p>
      <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest leading-relaxed">{desc}</p>
      {sub && <p className="text-[8px] text-blue-500 font-black mt-4 uppercase tracking-[0.2em] border-t border-blue-50 pt-4 animate-in slide-in-from-left-2">{sub}</p>}
    </button>
  );
}

function ExportOption({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-4 p-8 bg-slate-50 rounded-[44px] hover:bg-blue-50 hover:text-blue-600 transition-all active:scale-95 border-2 border-transparent hover:border-blue-100 group">
      <div className="p-4 bg-white rounded-2xl shadow-sm group-hover:shadow-blue-100 transition-all">{icon}</div>
      <span className="text-[11px] font-black uppercase tracking-[0.2em]">{label}</span>
    </button>
  );
}

function ToggleItem({ icon, label, active, onClick }) {
  return (
    <div onClick={onClick} className={`flex items-center justify-between p-6 rounded-[32px] transition-all active:scale-[0.98] ${active ? 'bg-blue-50/50 border border-blue-100' : 'bg-slate-50 border border-transparent'}`}>
      <div className="flex items-center gap-4 text-slate-700">
        <div className={active ? 'text-blue-600' : 'text-slate-400'}>{icon}</div>
        <span className="font-black text-sm tracking-tight">{label}</span>
      </div>
      <div className={`w-14 h-7 rounded-full transition-all relative ${active ? 'bg-blue-600' : 'bg-slate-200'}`}>
         <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${active ? 'left-8' : 'left-1'}`} />
      </div>
    </div>
  );
}

function SettingsItem({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between p-6 bg-slate-50 rounded-[32px] border border-slate-100/30 shadow-sm">
      <div className="flex items-center gap-4 text-slate-400"> {icon} <span className="font-bold text-sm text-slate-700">{label}</span> </div>
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{value}</span>
    </div>
  );
}

function SectionHeader({ title, onEdit }) {
  return (
    <div className="flex justify-between items-center mb-6 px-2">
      <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">{title}</h4>
      {onEdit && <button onClick={onEdit} className="text-[10px] font-black text-blue-600 uppercase px-4 py-2 bg-blue-50 rounded-xl active:scale-95 transition-all">编辑</button>}
    </div>
  );
}

// --- 4. 页面组件 ---

function TaskCenterSheet({ isOpen, onClose, taskQueue, onTaskStatusChange, onNavigate, showToast, isOffline, setTaskQueue }) {
  const [activeTab, setActiveTab] = useState('pending');
  
  const counts = useMemo(() => ({
    pending: taskQueue.filter(t => t.status === 'waiting' || t.status === 'processing').length,
    failed: taskQueue.filter(t => t.status === 'failed').length,
    done: taskQueue.filter(t => t.status === 'done').length
  }), [taskQueue]);

  const filteredTasks = taskQueue.filter(t => {
    if (activeTab === 'pending') return t.status === 'waiting' || t.status === 'processing';
    if (activeTab === 'failed') return t.status === 'failed';
    return t.status === 'done';
  });

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="同步控制台" subTitle="管理资产转写与分析进度">
       <div className="space-y-6">
         <div className="flex p-1 bg-slate-100 rounded-2xl mb-4">
            <SegmentButton active={activeTab === 'pending'} onClick={() => setActiveTab('pending')} label="进行中" count={counts.pending} />
            <SegmentButton active={activeTab === 'failed'} onClick={() => setActiveTab('failed')} label="失败" count={counts.failed} color="text-red-500" />
            <SegmentButton active={activeTab === 'done'} onClick={() => setActiveTab('done')} label="已完成" count={counts.done} />
         </div>
         
         <div className="min-h-[300px] space-y-3">
           {filteredTasks.length === 0 ? (
             <div className="py-20 text-center opacity-30 flex flex-col items-center">
               <CheckCircle2 size={40} className="mb-2" />
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-800">暂无记录</p>
             </div>
           ) : (
             filteredTasks.map(t => {
                const label = STATUS_LABELS[t.status] || STATUS_LABELS.waiting;
                return (
                  <div key={t.id} className="p-5 bg-white border border-slate-100 rounded-[28px] flex justify-between items-center group transition-all">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner ${t.status === 'processing' ? 'bg-blue-50 text-blue-600 animate-pulse' : 'bg-slate-50 text-slate-300'}`}>
                        {t.status === 'processing' ? <RotateCw size={18} /> : <FileText size={18}/>}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">{String(t.title)}</p>
                        <div className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${label.color}`}>
                          {label.icon} {label.text}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => onNavigate('result', t.id)} className="p-2 text-slate-300 active:text-blue-600 transition-all"><ExternalLink size={18}/></button>
                  </div>
                );
             })
           )}
         </div>
         <div className="pt-6 border-t border-slate-50 flex justify-center">
            <button onClick={() => { setTaskQueue(prev => prev.filter(t => t.status !== 'done')); setActiveTab('pending'); }} className="text-[10px] font-black text-slate-300 uppercase tracking-widest active:scale-95 transition-all">清理归档记录</button>
         </div>
       </div>
    </BottomSheet>
  );
}

function LibraryPage({ recordings, onNavigate, searchQuery, setSearchQuery, filterMode, setFilterMode, showToast, taskQueue, setShowQueue, updateStatusUnified }) {
  const counts = useMemo(() => ({
    all: recordings.length,
    processing: taskQueue.filter(t => t.status === 'waiting' || t.status === 'processing').length,
    failed: taskQueue.filter(t => t.status === 'failed').length
  }), [recordings, taskQueue]);

  const taskMap = useMemo(() => {
    const m = new Map();
    taskQueue.forEach(t => m.set(t.id, t.status));
    return m;
  }, [taskQueue]);

  const getUnifiedStatusFast = (rec) => {
    const s = taskMap.get(rec.id);
    if (s) return s;
    const hasSegments = (rec.transcript?.segments?.length ?? 0) > 0;
    const hasAnalysis = !!rec.analysis;
    if (rec.status === 'Failed' || rec.status === 'failed') return 'failed';
    if (hasAnalysis || hasSegments) return 'done';
    return 'done';
  };

  const filtered = recordings.filter(r => {
    const matchSearch = String(r.title).toLowerCase().includes(searchQuery.toLowerCase());
    const status = getUnifiedStatusFast(r);
    if (filterMode === 'processing') return matchSearch && (status === 'waiting' || status === 'processing');
    if (filterMode === 'failed') return matchSearch && status === 'failed';
    return matchSearch;
  });

  return (
    <div className="px-6 pb-40">
      <header className="py-10 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase tracking-tight">资产库</h1>
          <p className="text-[10px] text-blue-600 font-black uppercase tracking-[0.2em] mt-2 transition-all">
            {filterMode === 'all' ? '全部音频资产' : filterMode === 'processing' ? '处理中资产' : '同步失败项'}
          </p>
        </div>
        <div className="flex gap-2">
           <button onClick={() => setShowQueue(true)} className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 relative active:scale-90 transition-all">
             <Layers size={22} className="text-slate-600" />
             {counts.processing > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 rounded-full border-2 border-white animate-pulse" />}
           </button>
           <button onClick={() => onNavigate('settings')} className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 active:scale-90 transition-all"><Settings size={22} className="text-slate-600" /></button>
        </div>
      </header>

      <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar py-2">
         <StatusPill active={filterMode === 'all'} label="全部" count={counts.all} onClick={() => setFilterMode('all')} />
         <StatusPill active={filterMode === 'processing'} label="进行中" count={counts.processing} onClick={() => setFilterMode('processing')} color="text-blue-600" />
         <StatusPill active={filterMode === 'failed'} label="故障" count={counts.failed} onClick={() => setFilterMode('failed')} color="text-red-600" />
      </div>

      <div className="relative mb-10">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
        <input type="text" placeholder="搜索资产名称..." className="w-full bg-white border-none rounded-[24px] py-4 pl-12 pr-4 shadow-sm outline-none font-bold placeholder:text-slate-200" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      <div className="space-y-6">
        {filtered.length === 0 ? (
          <div className="text-center py-24 opacity-20 flex flex-col items-center">
            <LayoutGrid size={64} className="mb-4" strokeWidth={1} />
            <p className="font-black text-lg tracking-tight uppercase">未发现匹配资产</p>
          </div>
        ) : (
          filtered.map(rec => {
            const statusKey = getUnifiedStatusFast(rec);
            const isAudioOnly = rec.level === 'audio_only';
            let stageBadge = null;
            let stageHint = "点按查看资产详细内容";
            if (statusKey === 'processing') {
              stageBadge = "分段纠错中";
              stageHint = "正在智能提取摘要与行动清单...";
            } else if (isAudioOnly && statusKey === 'done') {
              stageBadge = "本地音频";
              stageHint = "音频已加密保存，点按可播放与导出";
            }
            const label = STATUS_LABELS[statusKey] || STATUS_LABELS.waiting;

            return (
              <div key={rec.id} onClick={() => onNavigate('result', rec.id)} className="bg-white p-6 rounded-[40px] shadow-sm border border-slate-50 active:scale-[0.98] transition-all group relative overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-[18px] bg-slate-50 flex items-center justify-center text-2xl shadow-inner transition-transform group-active:scale-90">
                      {SCENES.find(s => s.id === rec.scene)?.icon}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-black text-slate-800 truncate tracking-tight">{String(rec.title)}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-black text-slate-300 tabular-nums">{Math.floor(rec.duration / 60)}:{String(Math.floor(rec.duration % 60)).padStart(2, '0')}</span>
                        {rec.analysis?.todoList?.length > 0 && <span className="text-[9px] font-black bg-blue-50 text-blue-500 px-2 py-0.5 rounded-md flex items-center gap-1"><CheckCircle2 size={8}/> 待办 {rec.analysis.todoList.length}</span>}
                      </div>
                    </div>
                  </div>
                  {rec.isStarred && <Star size={16} fill="#fbbf24" className="text-amber-400" />}
                </div>
                
                {stageBadge && (
                  <div className="mb-2 inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-600 text-white rounded-md text-[8px] font-black uppercase tracking-widest animate-pulse">
                    <RotateCw size={8} /> {stageBadge}
                  </div>
                )}

                <p className="text-sm text-slate-400 line-clamp-2 h-10 mb-5 font-bold leading-relaxed opacity-70 italic">
                  {rec.analysis?.summary ? String(rec.analysis.summary) : stageHint}
                </p>

                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">{new Date(rec.createdAt).toLocaleDateString()}</span>
                  <div className="flex items-center gap-2">
                    {statusKey === 'failed' && <button onClick={(e) => { e.stopPropagation(); updateStatusUnified(rec.id, 'task', 'processing'); }} className="px-3 py-1 bg-red-600 text-white rounded-xl text-[9px] font-black uppercase shadow-md active:scale-95 transition-all">立即重试</button>}
                    <div className={`flex items-center gap-1 px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest ${label.color}`}>
                      {label.icon} {isAudioOnly && statusKey === 'done' ? '仅音频' : label.text}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function RecordPage({ onFinish, onCancel, showToast }) {
  const [status, setStatus] = useState('idle'); // idle, starting, recording, naming
  const [duration, setDuration] = useState(0);
  const [scene, setScene] = useState('meeting');
  const [markers, setMarkers] = useState([]);
  const [tempTitle, setTempTitle] = useState('');
  const [lastMarkerHint, setLastMarkerHint] = useState(null);
  
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null); 
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);

  const cleanupAudio = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    // P0 FIX: 防止重复关闭导致的 InvalidStateError
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  // 分离“组件卸载时清理”和“状态变化逻辑”
  useEffect(() => {
    return cleanupAudio; // 仅在卸载时执行完整清理
  }, []);

  useEffect(() => {
    if (status === 'recording') {
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
      drawRealWaveform();
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      // 注意：此处不再 cleanupAudio，防止 starting -> recording 切换时关闭麦克风
    }
  }, [status]);

  const startRecording = async () => {
    setStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream; 
      
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if(e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => setStatus('naming');
      
      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setStatus('recording');
    } catch (err) {
      setStatus('idle');
      showToast("无法开启麦克风", "error");
    }
  };

  const drawRealWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current) return;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const render = () => {
      analyserRef.current.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#3b82f6';
      for (let i = 0; i < 40; i++) {
        const val = dataArray[i * 2] || 0;
        const h = Math.max(4, (val / 255) * 60);
        ctx.fillRect(i * 8, 40 - h / 2, 4, h);
      }
      animationRef.current = requestAnimationFrame(render);
    };
    render();
  };

  const addMarker = () => {
    const timeStr = `${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')}`;
    setMarkers(prev => {
      const nextIndex = prev.length + 1;
      setLastMarkerHint(`标记 ${nextIndex} · ${timeStr}`);
      setTimeout(() => setLastMarkerHint(null), 3000);
      return [...prev, { time: duration, id: Date.now(), label: `标记 ${nextIndex}` }];
    });
  };

  return (
    <div className="h-full flex flex-col px-6 pt-10 bg-white relative animate-in fade-in duration-500">
      <header className="flex justify-between items-center mb-16">
        <button 
          onClick={() => { 
            if (status === 'recording') {
              mediaRecorderRef.current?.stop();
            }
            cleanupAudio();
            if(duration > 2) { if(!confirm("丢弃当前录制内容？")) return; } 
            onCancel(); 
          }} 
          className="text-slate-400 font-black text-sm uppercase"
        >
          丢弃
        </button>
        <div className="flex items-center gap-2.5 px-5 py-2 bg-slate-50 rounded-full border border-slate-100 shadow-sm">
          <div className={`w-2.5 h-2.5 rounded-full ${status === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">{status === 'recording' ? '正在录音' : '待机中'}</span>
        </div>
        <button disabled onClick={() => showToast("暂停功能开发中")} className="text-slate-200 p-2 opacity-40 cursor-not-allowed">
          <Pause size={22}/>
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-[120px] font-mono font-thin mb-12 tracking-tighter tabular-nums leading-none text-slate-900">
          {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}
        </div>
        
        <div className="w-full max-w-sm h-1.5 bg-slate-100 rounded-full relative mb-12">
           <div className="absolute -top-8 left-0 text-[8px] font-black text-slate-300 uppercase tracking-widest h-4">
             {lastMarkerHint ? (
               <span className="text-blue-600 flex items-center gap-1 animate-in fade-in slide-in-from-bottom-2 font-black uppercase tracking-tighter transition-all text-blue-600 uppercase"><Bookmark size={8} strokeWidth={4}/> 已标记 {lastMarkerHint}</span>
             ) : "当前记录进度"}
           </div>
           {markers.map(m => (
             <div key={m.id} className="absolute -translate-x-1/2" style={{ left: `${(m.time / Math.max(duration, 1)) * 100}%` }}>
                <div className="w-3 h-3 bg-blue-500 rounded-full -mt-0.5 border-2 border-white shadow-xl" />
             </div>
           ))}
        </div>
        
        <canvas ref={canvasRef} width="320" height="80" className="mb-16 opacity-80" />
        
        <div className="grid grid-cols-4 gap-5 w-full max-w-sm mb-6">
          {SCENES.map(s => (
            <button key={s.id} onClick={() => setScene(s.id)} className={`flex flex-col items-center gap-2.5 p-5 rounded-[32px] transition-all ${scene === s.id ? 'bg-blue-600 text-white shadow-2xl scale-110' : 'bg-slate-50 text-slate-400 active:scale-95'}`}>
              <span className="text-2xl">{s.icon}</span>
              <span className="text-[10px] font-black uppercase tracking-tighter">{s.label}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-blue-500 font-black uppercase animate-pulse">{SCENES.find(s => s.id === scene).strategy}</p>
      </div>

      <div className="pb-20 flex flex-col items-center gap-10">
        <div className="flex items-center gap-12">
          <button onClick={addMarker} disabled={status !== 'recording'} className="w-16 h-16 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 disabled:opacity-20 active:scale-90 active:bg-blue-50 active:text-blue-600 transition-all shadow-sm">
            <Bookmark size={28} strokeWidth={2.5} />
          </button>
          <button 
            disabled={status === 'starting'}
            onClick={status === 'recording' 
              ? () => {
                mediaRecorderRef.current?.stop();
                cleanupAudio();
              } 
              : startRecording
            }
            className={`w-28 h-28 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 ${status === 'recording' ? 'bg-slate-900 shadow-slate-200' : 'bg-red-500 animate-pulse shadow-red-100'}`}
          >
            {status === 'recording' ? <StopCircle size={44} className="text-white" /> : <Mic size={44} className="text-white" />}
          </button>
          <button className="w-16 h-16 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 active:scale-90 active:bg-slate-50 transition-all shadow-sm">
            <Zap size={28} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <BottomSheet isOpen={status === 'naming'} onClose={() => {}} title="录制保存成功" subTitle="请选择生成的资产层级">
        <div className="space-y-6 p-2">
          <input autoFocus type="text" placeholder="资产名称 (例如：量化周会分析)" className="w-full bg-slate-50 border-none rounded-[28px] py-6 px-8 text-xl outline-none font-bold placeholder:text-slate-300 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner" value={tempTitle} onChange={(e) => setTempTitle(e.target.value)} />
          <div className="flex flex-col gap-4">
             <button onClick={() => onFinish({ id: crypto.randomUUID(), title: tempTitle || '新实录资产', level: 'asset', createdAt: Date.now(), duration, audioBlobUrl: URL.createObjectURL(new Blob(audioChunksRef.current, { type: 'audio/webm' })), audioBlob: new Blob(audioChunksRef.current, { type: 'audio/webm' }), scene, status: 'Transcribing', markers, isStarred: false, transcript: { segments: [] }, analysis: null })} className="group w-full bg-blue-600 text-white py-5 rounded-[32px] font-black text-lg shadow-2xl shadow-blue-200 active:scale-[0.98] transition-all flex flex-col items-center border border-transparent">
               生成资产 (推荐)
               <span className="text-[10px] font-bold opacity-60 mt-1 uppercase tracking-widest">≈ 30 秒生成摘要 + 行动项</span>
             </button>
             <button onClick={() => onFinish({ id: crypto.randomUUID(), title: tempTitle || '新实录资产', level: 'text', createdAt: Date.now(), duration, audioBlobUrl: URL.createObjectURL(new Blob(audioChunksRef.current, { type: 'audio/webm' })), audioBlob: new Blob(audioChunksRef.current, { type: 'audio/webm' }), scene, status: 'Transcribing', markers, isStarred: false, transcript: { segments: [] }, analysis: null })} className="w-full bg-slate-100 text-slate-600 py-5 rounded-[32px] font-black text-lg active:scale-[0.98] transition-all flex flex-col items-center border border-slate-200">
               仅生成文字稿
               <span className="text-[10px] font-bold opacity-40 uppercase mt-1 tracking-widest">≈ 15 秒生成逐段实录内容</span>
             </button>
             <button onClick={() => onFinish({ id: crypto.randomUUID(), title: tempTitle || '新实录资产', level: 'audio_only', createdAt: Date.now(), duration, audioBlobUrl: URL.createObjectURL(new Blob(audioChunksRef.current, { type: 'audio/webm' })), audioBlob: new Blob(audioChunksRef.current, { type: 'audio/webm' }), scene, status: 'Ready', markers, isStarred: false, transcript: { segments: [] }, analysis: null })} className="text-center text-[10px] font-black text-slate-300 uppercase tracking-widest py-2 active:text-slate-500">仅加密保存音频</button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

function ResultPage({ recording, onBack, onUpdate, showToast, isOffline }) {
  const audioRef = useRef(null);
  const progressContainerRef = useRef(null);

  const [activeTab, setActiveTab] = useState('transcript');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [isEditing, setIsEditing] = useState(null); 
  const [showMarkers, setShowMarkers] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [playerMode, setPlayerMode] = useState('full'); 
  
  const safeDur = useMemo(() => Math.max(1, recording.duration || 0), [recording.duration]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playSpeed;
  }, [playSpeed]);

  useEffect(() => {
    if (recording.level === 'audio_only') return;
    if (recording.status === 'Ready' || recording.status === 'Failed') return;
    if (isOffline) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const data = await apiJson(`/api/recordings/${encodeURIComponent(recording.id)}`);
        if (cancelled) return;

        const taskStatus = data?.task?.status;
        if (taskStatus === 'done') {
          onUpdate(data.recording);
          showToast("资产生成完毕");
          return;
        }
        if (taskStatus === 'failed') {
          onUpdate({ ...recording, status: 'Failed' });
          showToast(data?.task?.error || '资产生成失败', 'error');
          return;
        }
        if (taskStatus === 'processing' && recording.status !== 'Processing') {
          onUpdate({ ...recording, status: 'Processing' });
        }
      } catch {}
    };

    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [recording.id, recording.level, recording.status, isOffline]);

  const handleSeek = (e) => {
    if (!progressContainerRef.current || !audioRef.current) return;
    const rect = progressContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const newTime = pct * safeDur;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const jumpTo = (time) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(time, safeDur);
      audioRef.current.play().catch(() => {
        showToast("播放被拦截，请手动点击", "error");
      });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white relative animate-in slide-in-from-right-10 duration-500 overflow-hidden">
      <header className="px-5 py-5 flex justify-between items-center border-b border-slate-50 sticky top-0 bg-white/90 backdrop-blur-md z-20">
        <div className="flex items-center gap-4 overflow-hidden">
          <button onClick={onBack} className="p-2 -ml-2 active:scale-90 transition-all"><ChevronLeft size={28} strokeWidth={3} /></button>
          <div className="overflow-hidden">
            <h2 className="font-black truncate text-slate-800 text-lg">{String(recording.title)}</h2>
            <div className="flex items-center gap-2">
              <ShieldCheck size={12} className="text-green-500" />
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest tabular-nums font-mono tracking-tighter">Encrypted Local Archive</span>
            </div>
          </div>
        </div>
        <div className="flex items-center">
            <button onClick={() => setShowExport(true)} className="p-3 text-slate-400 active:text-blue-500 transition-colors"><Download size={22} /></button>
            <button className="p-3 text-slate-400 active:scale-90 transition-all"><MoreVertical size={22} /></button>
        </div>
      </header>

      <div className="flex px-5 bg-slate-50/20 sticky top-16 z-20 backdrop-blur-sm">
        <TabButton active={activeTab === 'transcript'} onClick={() => setActiveTab('transcript')} label="文字实录" />
        <TabButton active={activeTab === 'summary'} onClick={() => setActiveTab('summary')} label="深度复盘" />
        <TabButton active={activeTab === 'actions'} onClick={() => setActiveTab('actions')} label="分发集成" />
      </div>

      <div className={`flex-1 overflow-y-auto p-8 ${playerMode === 'full' ? 'pb-64' : 'pb-24'} transition-all duration-500 no-scrollbar`}>
        {activeTab === 'transcript' && (
          <div className="space-y-10 animate-in fade-in duration-500">
            {recording.status === 'Ready' ? (
              (recording.transcript?.segments?.length ?? 0) > 0 ? (
                recording.transcript.segments.map((seg, i) => {
                  const isActive = currentTime >= seg.startTime && (i === recording.transcript.segments.length - 1 || currentTime < recording.transcript.segments[i+1].startTime);
                  return (
                    <div key={i} className={`group relative flex gap-6 p-6 -mx-6 rounded-[40px] transition-all duration-500 ${isActive ? 'bg-blue-50/50 scale-[1.02] shadow-sm' : 'hover:bg-slate-50 opacity-60'}`}>
                      <span className={`text-[10px] font-mono mt-1 shrink-0 tabular-nums ${isActive ? 'text-blue-600 font-black' : 'text-slate-300 font-bold'}`}>
                        {Math.floor(seg.startTime / 60)}:{String(Math.floor(seg.startTime % 60)).padStart(2, '0')}
                      </span>
                      <div className="flex-1">
                        <div onClick={() => jumpTo(seg.startTime)} className="cursor-pointer group-active:opacity-70 transition-opacity">
                           <p className={`leading-relaxed text-xl tracking-tight ${isActive ? 'text-slate-900 font-bold' : 'text-slate-700 font-medium'}`}>{String(seg.text)}</p>
                        </div>
                        <div className={`flex gap-4 mt-6 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'} transition-all`}>
                          <ParagraphAction icon={<Copy size={14}/>} label="复制" onClick={() => copyText(seg.text, showToast)} />
                          <ParagraphAction icon={<Bookmark size={14}/>} label="重点" onClick={() => showToast("已标记重点资产")} />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-slate-50 border border-slate-100 rounded-[50px] p-10 text-center animate-in zoom-in-95">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">暂无文字实录</p>
                  <p className="text-slate-500 font-bold text-sm leading-relaxed tracking-tight">
                    {recording.level === 'audio_only' ? '已加密保存原始音频资产，可直接播放与导出。' : '资产生成中或文字尚未解析完毕。'}
                  </p>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center py-24 gap-6 animate-pulse opacity-40">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <div className="text-center">
                   <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500 mb-1 tracking-tighter uppercase font-mono">归档资产中</p>
                   <p className="text-sm font-bold text-slate-400 uppercase tracking-widest tracking-tighter">正在解析语音数据并优化实录稿</p>
                </div>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'summary' && recording.analysis && (
          <div className="space-y-12 animate-in slide-in-from-bottom-6 pb-20">
             <section>
                <SectionHeader title="智能摘要" onEdit={() => setIsEditing(isEditing === 'summary' ? null : 'summary')} />
                {isEditing === 'summary' ? (
                  <textarea autoFocus className="w-full bg-slate-50 rounded-3xl p-6 text-lg outline-none" defaultValue={recording.analysis.summary} onBlur={(e) => { onUpdate({...recording, analysis: {...recording.analysis, summary: e.target.value}}); setIsEditing(null); }} />
                ) : (
                  <div className="bg-blue-50/50 p-10 rounded-[50px] text-blue-900 font-bold italic text-xl tracking-tight">“ {String(recording.analysis.summary)}</div>
                )}
             </section>
             <section>
                <SectionHeader title="行动清单" />
                <div className="space-y-4">
                  {recording.analysis.todoList?.map((t, idx) => (
                    <div key={idx} className="flex items-center gap-5 p-6 bg-white border border-slate-100 rounded-[32px] shadow-sm">
                      <div className="w-8 h-8 border-3 border-slate-100 rounded-2xl flex items-center justify-center text-blue-600"><Check size={18} strokeWidth={3} /></div>
                      <span className="text-slate-700 font-black text-lg flex-1">{String(t)}</span>
                    </div>
                  ))}
                </div>
             </section>
          </div>
        )}

        {activeTab === 'actions' && (
           <div className="space-y-12">
              <WorkflowCard icon={<Send size={28}/>} title="生成跟进邮件" desc="AI 自动润色草稿" onClick={() => copyText(String(recording.analysis?.summary), showToast)} />
              <WorkflowCard icon={<LayoutGrid size={28}/>} title="结构化 Markdown" desc="导出标准归档文档" onClick={() => copyText(toMarkdown(recording), showToast)} />
           </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-3xl border-t border-slate-100 p-8 pb-12 z-[70] shadow-2xl">
        <audio 
          key={recording.audioBlobUrl}
          ref={audioRef} src={recording.audioBlobUrl} 
          onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)} 
          onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} 
        />
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-5">
            <span className="text-xs font-mono font-black text-blue-600 tabular-nums">{Math.floor(currentTime/60)}:{String(Math.floor(currentTime%60)).padStart(2,'0')}</span>
            <div ref={progressContainerRef} className="flex-1 h-2 bg-slate-100 rounded-full relative overflow-hidden cursor-pointer" onClick={handleSeek}>
                <div className="h-full bg-blue-600 transition-all duration-75 rounded-full shadow-lg" style={{ width: `${(currentTime/safeDur)*100}%` }} />
            </div>
            <span className="text-xs font-mono font-black text-slate-300 tabular-nums">{Math.floor(safeDur/60)}:{String(Math.floor(safeDur%60)).padStart(2,'0')}</span>
          </div>
          <div className="flex items-center justify-center gap-12">
             <button onClick={() => { if(audioRef.current) audioRef.current.currentTime -= 15; }} className="text-slate-400 p-2 active:scale-90 transition-transform"><Rewind size={26} strokeWidth={2.5} /></button>
             <button onClick={() => { 
                const a = audioRef.current;
                if(!a || !a.src) return; 
                a.paused ? a.play().catch(()=>{}) : a.pause(); 
              }} 
              className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center text-white shadow-2xl active:scale-90 transition-transform"
            >
              {isPlaying ? <Pause size={36} strokeWidth={2.5} /> : <Play size={36} strokeWidth={2.5} className="ml-1.5" />}
            </button>
             <button onClick={() => { if(audioRef.current) audioRef.current.currentTime += 15; }} className="text-slate-400 p-2 active:scale-90 transition-transform"><FastForward size={26} strokeWidth={2.5} /></button>
          </div>
        </div>
      </div>

      <BottomSheet isOpen={showMarkers} onClose={() => setShowMarkers(false)} title="书签库">
        <div className="space-y-4 pb-4 px-2">
          {recording.markers?.length === 0 ? (
            <div className="text-center py-20 opacity-30 font-bold uppercase tracking-widest text-slate-400">暂无标记资产</div>
          ) : (
            recording.markers?.map(m => (
              <div key={m.id} onClick={() => { jumpTo(m.time); setShowMarkers(false); }} className="p-6 bg-slate-50 rounded-[32px] flex justify-between items-center active:bg-blue-50 active:scale-[0.98] transition-all border border-slate-100 shadow-sm">
                <div className="min-w-0 flex-1 pr-4">
                  <p className="text-sm font-black text-slate-800 truncate">{String(m.label)}</p>
                  <p className="text-[10px] font-mono font-bold text-blue-400 uppercase mt-1 tracking-widest tabular-nums">{Math.floor(m.time/60)}:{String(Math.floor(m.time%60)).padStart(2,'0')}</p>
                </div>
                <ChevronRight size={18} className="text-slate-300" strokeWidth={3} />
              </div>
            ))
          )}
        </div>
      </BottomSheet>

      <BottomSheet isOpen={showExport} onClose={() => setShowExport(false)} title="资产导出" subTitle="选择分发格式">
         <div className="grid grid-cols-2 gap-5 p-2">
            <ExportOption icon={<FileText />} label="Markdown" onClick={() => { copyText(toMarkdown(recording), showToast); setShowExport(false); }} />
            <ExportOption icon={<Copy />} label="纯文本" onClick={() => { copyText(buildFullText(recording), showToast); setShowExport(false); }} />
            <ExportOption icon={<History />} label="时间戳清单" onClick={() => setShowExport(false)} />
            <ExportOption icon={<ExternalLink />} label="跨端同步" onClick={() => setShowExport(false)} />
         </div>
      </BottomSheet>
    </div>
  );
}

function SettingsPage({ onBack, isOffline, setIsOffline, showToast }) {
  return (
    <div className="h-full bg-white animate-in slide-in-from-bottom duration-500 overflow-y-auto pb-20">
      <header className="px-6 py-8 flex items-center gap-6 sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b border-slate-50">
        <button onClick={onBack} className="p-2 bg-slate-50 rounded-2xl active:scale-90 transition-all"><ChevronLeft size={24} strokeWidth={3} /></button>
        <h2 className="text-2xl font-black tracking-tighter uppercase tracking-tight">系统管理</h2>
      </header>
      <div className="p-8 space-y-12">
        <section>
          <SectionHeader title="同步环境模拟" />
          <div className="space-y-4">
            <ToggleItem icon={<CloudOff size={20}/>} label="开启模拟离线模式" active={isOffline} onClick={() => { setIsOffline(!isOffline); showToast(isOffline ? "网络环境已同步" : "已切换为单机离线模式"); }} />
          </div>
        </section>
        <section>
          <SectionHeader title="安全与资产" />
          <div className="space-y-4">
            <SettingsItem icon={<Shield size={20}/>} label="本地端到端加密" value="已启用" />
            <SettingsItem icon={<Database size={20}/>} label="资产库空间占用" value="12.4 MB" />
          </div>
        </section>
      </div>
    </div>
  );
}

// --- 5. 主应用入口 ---

export default function VoiceFlowApp() {
  const [currentPage, setCurrentPage] = useState('library'); 
  const [recordings, setRecordings] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all'); 
  const [toast, setToast] = useState(null);
  const [isOffline, setIsOffline] = useState(false); 
  const [taskQueue, setTaskQueue] = useState([]); 
  const [showQueue, setShowQueue] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const loadFromServer = async () => {
    const [{ recordings: serverRecs }, { tasks }] = await Promise.all([apiJson('/api/recordings'), apiJson('/api/tasks')]);
    setRecordings(serverRecs ?? []);
    setTaskQueue(
      (tasks ?? []).map((t) => ({
        id: t.recordingId || t.id,
        title: t.title,
        type: t.type === 'transcribe+analyze' ? '资产分析' : '转写任务',
        status: t.status
      }))
    );
  };

  useEffect(() => {
    if (isOffline) return;
    let cancelled = false;
    (async () => {
      try {
        await loadFromServer();
      } catch (e) {
        if (!cancelled) showToast(`服务端同步失败：${e?.message || 'unknown'}`, 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOffline]);

  useEffect(() => {
    if (isOffline) return;
    const timer = setInterval(async () => {
      try {
        const { tasks } = await apiJson('/api/tasks');
        const map = new Map((tasks ?? []).map((t) => [t.recordingId || t.id, t]));
        setTaskQueue(
          (tasks ?? []).map((t) => ({
            id: t.recordingId || t.id,
            title: t.title,
            type: t.type === 'transcribe+analyze' ? '资产分析' : '转写任务',
            status: t.status
          }))
        );
        setRecordings((prev) =>
          prev.map((r) => {
            const t = map.get(r.id);
            if (!t) return r;
            const status =
              t.status === 'done' ? 'Ready' : t.status === 'failed' ? 'Failed' : r.status === 'Ready' ? 'Ready' : 'Processing';
            return { ...r, status };
          })
        );
      } catch {}
    }, 3000);
    return () => clearInterval(timer);
  }, [isOffline]);

  const uploadRecording = async (rec) => {
    const form = new FormData();
    form.append('id', rec.id);
    form.append('title', rec.title);
    form.append('level', rec.level);
    form.append('scene', rec.scene);
    form.append('createdAt', String(rec.createdAt));
    form.append('duration', String(rec.duration || 0));
    form.append('markersJson', JSON.stringify(Array.isArray(rec.markers) ? rec.markers : []));
    if (rec.audioBlob) form.append('audio', rec.audioBlob, `${rec.id}.webm`);
    const { recording } = await apiJson('/api/recordings', { method: 'POST', body: form });
    return recording;
  };

  const updateStatusUnified = (id, source, newStatus) => {
    setTaskQueue(prev => {
      const exists = prev.some(t => t.id === id);
      if (exists) return prev.map(t => t.id === id ? { ...t, status: newStatus } : t);
      const rec = recordings.find(r => r.id === id);
      return [{ id, title: rec?.title ?? '新录制资产', type: '资产同步', status: newStatus }, ...prev];
    });
    setRecordings(prev => prev.map(r => r.id === id ? { ...r, status: newStatus === 'done' ? 'Ready' : newStatus === 'failed' ? 'Failed' : 'Processing' } : r));

    if (source === 'task' && newStatus === 'processing' && !isOffline) {
      (async () => {
        try {
          await apiJson(`/api/tasks/${encodeURIComponent(id)}/retry`, { method: 'POST' });
          showToast('已重新加入队列');
          await loadFromServer();
        } catch (e) {
          showToast(`重试失败：${e?.message || 'unknown'}`, 'error');
          setTaskQueue(prev => prev.map(t => t.id === id ? { ...t, status: 'failed' } : t));
        }
      })();
    }
  };

  const currentRec = useMemo(() => recordings.find(r => r.id === currentId), [recordings, currentId]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden select-none">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      
      {isOffline && (
        <div className="bg-amber-500 text-white px-5 py-2.5 flex justify-between items-center z-[90] animate-in slide-in-from-top duration-300 shadow-lg">
          <div className="flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-widest"><CloudOff size={14} strokeWidth={3} /> 当前处于离线状态</div>
          <button onClick={() => setShowQueue(true)} className="text-[10px] font-bold underline">管理队列</button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto relative">
        {currentPage === 'library' && (
          <LibraryPage recordings={recordings} onNavigate={(p, id) => { setCurrentId(id); setCurrentPage(p); }} searchQuery={searchQuery} setSearchQuery={setSearchQuery} filterMode={filterMode} setFilterMode={setFilterMode} showToast={showToast} taskQueue={taskQueue} setShowQueue={setShowQueue} updateStatusUnified={updateStatusUnified} />
        )}
        {currentPage === 'record' && (
          <RecordPage onFinish={(newRec) => { 
            setRecordings(prev => [newRec, ...prev]); 
            if(newRec.level !== 'audio_only') setTaskQueue(prev => [{ id: newRec.id, title: newRec.title, type: '资产分析', status: isOffline ? 'waiting' : 'processing' }, ...prev]); 
            setCurrentId(newRec.id); 
            setCurrentPage('result'); 
            if (isOffline) return;
            (async () => {
              try {
                const serverRec = await uploadRecording(newRec);
                setRecordings(prev => prev.map(r => r.id === newRec.id ? { ...serverRec, audioBlob: null } : r));
                await loadFromServer();
              } catch (e) {
                showToast(`上传失败：${e?.message || 'unknown'}`, 'error');
                updateStatusUnified(newRec.id, 'task', 'failed');
              }
            })();
          }} onCancel={() => setCurrentPage('library')} showToast={showToast} />
        )}
        {currentPage === 'result' && currentRec && (
          <ResultPage recording={currentRec} onBack={() => setCurrentPage('library')} onUpdate={(updated) => { setRecordings(prev => prev.map(r => r.id === updated.id ? updated : r)); if(updated.status === 'Ready') updateStatusUnified(updated.id, 'recording', 'done'); }} showToast={showToast} isOffline={isOffline} />
        )}
        {currentPage === 'settings' && <SettingsPage onBack={() => setCurrentPage('library')} isOffline={isOffline} setIsOffline={setIsOffline} showToast={showToast} />}
      </main>

      {currentPage === 'library' && (
        <div className="fixed bottom-10 left-0 right-0 flex justify-center pointer-events-none">
          <button onClick={() => setCurrentPage('record')} className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-2xl active:scale-90 transition-all pointer-events-auto">
            <Mic size={36} strokeWidth={2.5} />
          </button>
        </div>
      )}

      <TaskCenterSheet isOpen={showQueue} onClose={() => setShowQueue(false)} taskQueue={taskQueue} onTaskStatusChange={updateStatusUnified} onNavigate={(p,id) => { setCurrentId(id); setCurrentPage(p); setShowQueue(false); }} showToast={showToast} isOffline={isOffline} setTaskQueue={setTaskQueue} />
    </div>
  );
}
