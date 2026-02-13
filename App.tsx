
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Users, BookOpen, Clock, ChevronLeft, Save, Sparkles, 
  Settings, RefreshCw, Link, CheckCircle2, Calendar as CalendarIcon, Search, X, ChevronRight, AlertCircle, Info, Edit2, Loader2, Copy, ExternalLink, ShieldCheck, Key, Zap
} from 'lucide-react';
import { ClassGroup, Student, ActivityRecord, ViewMode } from './types';
import { polishRecord } from './services/geminiService';

const GAS_CODE = `
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const data = sheets.map(sheet => {
    const name = sheet.getName();
    if (name.includes("_기록")) return null;
    const values = sheet.getDataRange().getValues();
    const students = values.slice(1).map(row => ({
      id: name + "_" + row[0],
      number: row[0],
      name: row[1]
    })).filter(s => s.name);
    return { id: name, name: name, students: students };
  }).filter(d => d !== null);
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = data.className + "_기록";
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["날짜", "번호", "이름", "내용"]);
    sheet.getRange("A1:D1").setBackground("#4f46e5").setFontColor("white").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  
  const now = new Date();
  const dateStr = Utilities.formatDate(now, "GMT+9", "yyyy-MM-dd HH:mm");
  sheet.appendRow([dateStr, data.studentNumber, data.studentName, data.content]);
  return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
}
`.trim();

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<'main' | 'recent'>('main');
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [editingRecord, setEditingRecord] = useState<ActivityRecord | null>(null);
  
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [sheetUrl, setSheetUrl] = useState<string>(localStorage.getItem('edulog_sheet_url') || '');
  const [userApiKey, setUserApiKey] = useState<string>(localStorage.getItem('edulog_api_key') || '');
  
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string, type: 'success' | 'info' | 'error' } | null>(null);

  const [content, setContent] = useState('');
  const [isPolishing, setIsPolishing] = useState(false);
  const [polishStatus, setPolishStatus] = useState('AI 문체 변환');
  const [classSearchQuery, setClassSearchQuery] = useState('');

  useEffect(() => {
    if (sheetUrl) fetchClasses();
    const saved = localStorage.getItem('edulog_records');
    if (saved) setRecords(JSON.parse(saved));
    if (userApiKey) localStorage.setItem('edulog_api_key', userApiKey);
  }, []);

  useEffect(() => {
    localStorage.setItem('edulog_records', JSON.stringify(records));
  }, [records]);

  const fetchClasses = async (urlOverride?: string) => {
    const targetUrl = (urlOverride || sheetUrl).trim();
    if (!targetUrl) return;
    setIsLoading(true);
    try {
      const response = await fetch(targetUrl);
      const data = await response.json();
      if (Array.isArray(data)) {
        setClasses(data);
        setIsConnected(true);
        localStorage.setItem('edulog_sheet_url', targetUrl);
        showToast('학급 데이터를 성공적으로 가져왔습니다.');
      }
    } catch (error) {
      setIsConnected(false);
      showToast('명단 불러오기 실패. URL을 확인해 주세요.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSaveSettings = () => {
    localStorage.setItem('edulog_sheet_url', sheetUrl);
    localStorage.setItem('edulog_api_key', userApiKey);
    fetchClasses();
    setIsSettingsOpen(false);
    showToast('설정이 저장되었습니다.');
  };

  const activeClass = classes.find(c => c.id === selectedClassId);
  const filteredClasses = useMemo(() => {
    return classes.filter(c => c.name.toLowerCase().includes(classSearchQuery.toLowerCase()));
  }, [classes, classSearchQuery]);

  const groupedRecords = useMemo(() => {
    const groups: { [key: string]: ActivityRecord[] } = {};
    records.forEach(record => {
      const date = new Date(record.timestamp).toLocaleDateString('ko-KR');
      if (!groups[date]) groups[date] = [];
      groups[date].push(record);
    });
    return Object.entries(groups).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
  }, [records]);

  const handleOpenLog = (student: Student) => {
    setSelectedStudent(student);
    setEditingRecord(null);
    setContent('');
    setPolishStatus('AI 문체 변환');
    setIsLogModalOpen(true);
  };

  const handleSaveRecord = async () => {
    if (!selectedStudent || !content.trim() || isPolishing) return;
    const currentContent = content.trim();
    const currentStudent = { ...selectedStudent };
    const currentClassName = activeClass?.name || editingRecord?.className || '';

    if (editingRecord) {
      setRecords(records.map(r => r.id === editingRecord.id ? { ...r, content: currentContent } : r));
      showToast('기록이 수정되었습니다.');
    } else {
      const newRecord: ActivityRecord = {
        id: crypto.randomUUID(),
        studentId: currentStudent.id,
        studentName: currentStudent.name,
        studentNumber: currentStudent.number,
        classId: selectedClassId || '',
        className: currentClassName,
        type: '활동',
        content: currentContent,
        timestamp: Date.now()
      };
      setRecords([newRecord, ...records]);
      showToast('임시 저장되었습니다.');
    }
    setIsLogModalOpen(false);

    if (sheetUrl && !selectedClassId?.startsWith('demo') && !editingRecord) {
      setIsSyncing(true);
      try {
        await fetch(sheetUrl, {
          method: 'POST',
          mode: 'no-cors',
          body: JSON.stringify({
            className: currentClassName,
            studentNumber: currentStudent.number,
            studentName: currentStudent.name,
            content: currentContent
          })
        });
        showToast('구글 시트 전송 완료');
      } catch (e) {
        showToast('시트 전송 실패', 'error');
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleAIPolish = async () => {
    if (!content.trim() || isPolishing) return;
    setIsPolishing(true);
    try {
      const polished = await polishRecord(content, (status) => setPolishStatus(status));
      setContent(polished);
      showToast('AI 변환 완료');
    } catch (e) {
      showToast('변환 실패', 'error');
    } finally {
      setIsPolishing(false);
      setPolishStatus('AI 문체 변환');
    }
  };

  return (
    <div className="min-h-screen max-w-4xl mx-auto bg-slate-50 flex flex-col shadow-2xl border-x border-slate-200 overflow-hidden">
      {toastMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4">
          <div className={`px-6 py-3 rounded-full shadow-xl border flex items-center gap-3 text-white font-bold text-sm
            ${toastMessage.type === 'success' ? 'bg-emerald-600 border-emerald-400' : 
              toastMessage.type === 'error' ? 'bg-red-600 border-red-400' : 'bg-slate-800 border-slate-600'}`}>
            {toastMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {toastMessage.text}
          </div>
        </div>
      )}

      <header className="bg-indigo-700 text-white p-5 sticky top-0 z-50 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-4">
          {selectedClassId || viewMode === 'recent' ? (
            <button onClick={() => { setSelectedClassId(null); setViewMode('main'); }} className="p-2 hover:bg-white/10 rounded-full transition-all">
              <ChevronLeft size={24} strokeWidth={3} />
            </button>
          ) : (
            <div className="p-2 bg-white/10 rounded-xl"><BookOpen size={24} /></div>
          )}
          <div>
            <h1 className="text-xl font-black tracking-tight">
              {selectedClassId ? activeClass?.name : viewMode === 'recent' ? '기록 보관소' : '에듀로그 (EduLog)'}
            </h1>
            <div className="flex items-center gap-1.5 opacity-70">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-slate-400'}`}></div>
              <span className="text-[10px] font-bold uppercase tracking-widest">{isConnected ? '연결됨' : '연결 안 됨'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <button onClick={() => setViewMode(viewMode === 'main' ? 'recent' : 'main')} title="기록 보관함" className={`p-2.5 rounded-xl transition-all ${viewMode === 'recent' ? 'bg-white text-indigo-700 shadow-md' : 'hover:bg-white/10'}`}>
            <Clock size={22} />
          </button>
          <button onClick={() => fetchClasses()} title="명단 새로고침" className="p-2.5 hover:bg-white/10 rounded-xl transition-all active:scale-95">
            <RefreshCw size={22} className={isLoading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setIsSettingsOpen(true)} title="환경 설정" className="p-2.5 hover:bg-white/10 rounded-xl transition-all">
            <Settings size={22} />
          </button>
        </div>
      </header>

      <main className="flex-1 p-5 overflow-y-auto pb-24 no-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400 gap-4">
            <Loader2 size={40} className="animate-spin text-indigo-600" />
            <p className="font-black">데이터를 불러오는 중입니다...</p>
          </div>
        ) : !selectedClassId && viewMode === 'main' ? (
          <div className="space-y-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                type="text" 
                placeholder="학급 이름을 입력하세요..." 
                value={classSearchQuery}
                onChange={(e) => setClassSearchQuery(e.target.value)}
                className="w-full bg-white border-2 border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-indigo-500 font-bold shadow-sm"
              />
            </div>
            
            {classes.length === 0 ? (
              <div className="bg-white rounded-[2.5rem] p-12 text-center border-2 border-dashed border-slate-200 space-y-6 shadow-sm">
                <ShieldCheck size={64} className="mx-auto text-slate-300" />
                <h3 className="text-xl font-black text-slate-800">연결된 학급이 없습니다</h3>
                <p className="text-slate-400 font-medium leading-relaxed">상단 설정(⚙️) 메뉴에서<br/>API 키와 구글 시트를 연동해 주세요.</p>
                <button onClick={() => setIsSettingsOpen(true)} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all">설정 바로가기</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredClasses.map(c => (
                  <button key={c.id} onClick={() => setSelectedClassId(c.id)} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:border-indigo-500 hover:shadow-xl transition-all text-left flex items-center justify-between group">
                    <div>
                      <h3 className="text-xl font-black text-slate-800 group-hover:text-indigo-600 transition-colors">{c.name}</h3>
                      <p className="text-xs text-slate-400 font-bold mt-1">{c.students.length}명의 학생</p>
                    </div>
                    <ChevronRight className="text-slate-300 group-hover:text-indigo-500 transition-all" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : selectedClassId && viewMode === 'main' ? (
          <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {activeClass?.students.map(student => (
              <button key={student.id} onClick={() => handleOpenLog(student)} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:border-indigo-500 hover:bg-indigo-50 transition-all flex flex-col items-center gap-3 active:scale-95">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-500 font-black text-lg border border-slate-100">{student.number}</div>
                <span className="font-black text-slate-700 text-sm">{student.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-10">
            {groupedRecords.length === 0 ? (
              <div className="py-32 text-center text-slate-300 space-y-4">
                <CalendarIcon size={64} className="mx-auto opacity-10" />
                <p className="font-black text-sm">기록된 활동이 없습니다.</p>
              </div>
            ) : (
              groupedRecords.map(([date, dateRecords]) => (
                <div key={date} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="bg-indigo-50 text-indigo-600 px-4 py-1 rounded-full text-[10px] font-black border border-indigo-100 uppercase">{date}</span>
                    <div className="flex-1 h-px bg-slate-200"></div>
                  </div>
                  {dateRecords.map(record => (
                    <div key={record.id} onClick={() => { setEditingRecord(record); setContent(record.content); setSelectedStudent({id: record.studentId, name: record.studentName, number: record.studentNumber}); setIsLogModalOpen(true); }} 
                         className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center font-black text-indigo-600 text-xs">{record.studentNumber}</div>
                          <div>
                            <span className="font-black text-slate-800 text-lg">{record.studentName}</span>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">{record.className}</p>
                          </div>
                        </div>
                        <Edit2 size={16} className="text-slate-300" />
                      </div>
                      <p className="text-slate-600 font-semibold text-sm leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-50">{record.content}</p>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex items-center justify-center p-5">
          <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl p-8 space-y-8 max-h-[90vh] overflow-y-auto no-scrollbar animate-in zoom-in-95">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                <Settings className="text-indigo-600" /> 연동 설정 가이드
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:bg-slate-100 transition-colors"><X size={20} /></button>
            </div>

            <div className="space-y-10">
              <section className="space-y-4">
                <h3 className="text-sm font-black text-slate-600 border-l-4 border-indigo-600 pl-3 flex items-center gap-2">
                  <Zap size={16} className="text-amber-500 fill-amber-500" /> 1단계: OpenRouter API 키 입력
                </h3>
                <div className="bg-amber-50 p-6 rounded-[2rem] border border-amber-100 text-[12px] font-bold text-slate-600 leading-relaxed space-y-3">
                  <p>1. <a href="https://openrouter.ai/keys" target="_blank" className="text-indigo-600 underline font-black">OpenRouter Keys</a>에 접속하여 로그인합니다.</p>
                  <p>2. <span className="text-indigo-600">'Create Key'</span>를 눌러 키를 생성하고 **복사**합니다.</p>
                  <p>3. **중요:** OpenRouter에 최소 5달러 정도 크레딧이 충전되어 있어야 429 에러 없이 안정적으로 작동합니다.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 px-2 uppercase tracking-widest">OpenRouter API 키 붙여넣기</label>
                  <input 
                    type="password" 
                    value={userApiKey} 
                    onChange={(e) => setUserApiKey(e.target.value)}
                    placeholder="sk-or-v1-..."
                    className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl outline-none font-bold text-[11px] focus:border-indigo-500 shadow-sm transition-all"
                  />
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-black text-slate-600 border-l-4 border-indigo-600 pl-3">2단계: 구글 시트 연동</h3>
                  <button onClick={() => { navigator.clipboard.writeText(GAS_CODE); showToast('코드가 복사되었습니다.'); }} className="text-[10px] font-bold text-indigo-600 flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors">
                    <Copy size={12} /> 스크립트 복사
                  </button>
                </div>
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 text-[12px] font-bold text-slate-600 leading-relaxed space-y-3">
                  <p>1. 구글 시트 상단 <span className="text-indigo-600">[확장 프로그램] &gt; [Apps Script]</span>를 엽니다.</p>
                  <p>2. 기존 코드를 모두 지우고 위 <span className="text-indigo-600">[스크립트 복사]</span> 버튼으로 복사한 내용을 붙여넣습니다.</p>
                  <p>3. <span className="text-indigo-600">[배포] &gt; [새 배포]</span>를 누르고 유형을 <span className="text-indigo-600">[웹 앱]</span>으로 선택합니다.</p>
                  <p>4. 액세스 권한을 <span className="text-indigo-600">[모든 사람]</span>으로 설정한 뒤 배포합니다.</p>
                  <p>5. 생성된 <span className="text-indigo-600">[웹 앱 URL]</span>을 아래 칸에 붙여넣으세요.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 px-2 uppercase tracking-widest">구글 시트 웹 앱 URL</label>
                  <input 
                    type="text" 
                    value={sheetUrl} 
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl outline-none font-bold text-[11px] focus:border-indigo-500 shadow-sm transition-all"
                  />
                </div>
              </section>
            </div>
            <button onClick={handleSaveSettings} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black shadow-xl hover:bg-indigo-700 transition-all active:scale-95">모든 설정 저장 및 시작하기</button>
          </div>
        </div>
      )}

      {isLogModalOpen && selectedStudent && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center p-0 sm:p-5">
          <div className="bg-white w-full max-w-lg rounded-t-[3.5rem] sm:rounded-[3.5rem] shadow-2xl animate-in slide-in-from-bottom-12 overflow-hidden flex flex-col">
            <div className="p-8 pb-4 flex justify-between items-center border-b border-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg border-2 border-white">{selectedStudent.number}</div>
                <div>
                  <h2 className="text-xl font-black text-slate-800">{selectedStudent.name}</h2>
                  <p className="text-[10px] text-indigo-500 font-black uppercase tracking-tighter">{editingRecord ? editingRecord.className : activeClass?.name}</p>
                </div>
              </div>
              <button onClick={() => setIsLogModalOpen(false)} disabled={isPolishing} className="p-3 bg-slate-50 text-slate-400 rounded-full hover:bg-red-50 hover:text-red-500 transition-all disabled:opacity-50"><X size={20} /></button>
            </div>

            <div className="p-8 pt-6 space-y-6">
              <div className="relative">
                <textarea 
                  autoFocus 
                  disabled={isPolishing}
                  value={content} 
                  onChange={(e) => setContent(e.target.value)} 
                  placeholder="활동 메모를 입력하세요... AI가 생기부 문체로 변환해 줍니다."
                  className="w-full h-72 p-6 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] outline-none text-slate-800 font-bold leading-relaxed shadow-inner focus:border-indigo-500 transition-all disabled:opacity-50"
                />
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <button onClick={handleAIPolish} disabled={isPolishing || !content.trim()} title="AI 문체 변환" 
                          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[12px] font-black shadow-xl transition-all active:scale-95 disabled:bg-slate-200 
                          ${isPolishing ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                    {isPolishing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {polishStatus}
                  </button>
                </div>
              </div>

              <div className="flex gap-4 pb-4">
                <button onClick={() => setIsLogModalOpen(false)} disabled={isPolishing} className="flex-1 py-4 text-slate-400 font-black hover:bg-slate-50 rounded-2xl transition-all disabled:opacity-50">취소</button>
                <button onClick={handleSaveRecord} disabled={!content.trim() || isPolishing} className="flex-2 grow-[2] bg-indigo-600 text-white py-4 rounded-[1.5rem] font-black flex items-center justify-center gap-2 shadow-xl hover:bg-indigo-700 transition-all active:scale-95 disabled:bg-slate-100 disabled:text-slate-300">
                  <Save size={20} /> {editingRecord ? '기록 수정' : '시트에 저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
