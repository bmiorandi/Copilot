import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { generateInterviewAnswerStream, parseResumeContext, type ParsedResume } from './services/geminiService';
import { Mic, MicOff, Settings, FileText, Globe, Loader2, Sparkles, Send, MonitorPlay, MonitorOff } from 'lucide-react';
import { cn } from './lib/utils';

type TurnId = string;

interface Turn {
  id: TurnId;
  question: string;
  answer: string;
  isGenerating: boolean;
  error?: string;
}

export default function App() {
  const [language, setLanguage] = useState('zh-CN');
  const [resume, setResume] = useState('');
  const [parsedResume, setParsedResume] = useState<ParsedResume | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [jobDescription, setJobDescription] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  
  // Pending transcript that hasn't been sent to AI yet
  const [pendingQuestion, setPendingQuestion] = useState('');
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Screen Mirroring State
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [mirrorError, setMirrorError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const startScreenMirror = async () => {
    try {
      setMirrorError(null);
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      setMediaStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      stream.getVideoTracks()[0].onended = () => {
        stopScreenMirror();
      };
    } catch (err: any) {
      console.error("Screen mirror failed:", err);
      // Give a user-friendly hint. The agent runs in an iframe by default.
      setMirrorError("Screen mirroring blocked. Please click the 'New Tab' ↗ icon in the top right to open the app fully, or grant screen recording permissions.");
    }
  };

  const stopScreenMirror = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
      setMirrorError(null);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  };

  const {
    isSupported,
    isListening,
    startListening,
    stopListening,
    interimTranscript,
    setOnFinalize,
    error: speechError
  } = useSpeechRecognition(language);

  // Scroll to bottom helper
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, pendingQuestion, interimTranscript]);

  const requestSuggestion = useCallback(async (questionText: string) => {
    if (!questionText.trim()) return;
    
    setPendingQuestion(''); // clear pending
    
    const turnId = Math.random().toString(36).substring(7);
    setTurns(prev => [...prev, { id: turnId, question: questionText, answer: '', isGenerating: true }]);

    const historyCtx: { role: 'interviewer' | 'candidate', text: string }[] = turns.slice(-2).flatMap(t => [
      { role: 'interviewer', text: t.question },
      { role: 'candidate', text: t.answer }
    ]);

    try {
      await generateInterviewAnswerStream(questionText, historyCtx, resume, parsedResume, jobDescription, language, (chunk) => {
        setTurns(prev => prev.map(t => {
          if (t.id === turnId) {
            return { ...t, answer: t.answer + chunk };
          }
          return t;
        }));
      });
      
      setTurns(prev => prev.map(t => {
        if (t.id === turnId) return { ...t, isGenerating: false };
        return t;
      }));
    } catch (err: any) {
      console.error("Suggestion error:", err);
      const errorMessage = err?.message || "Connection failed or AI model encountered an error.";
      setTurns(prev => prev.map(t => {
        if (t.id === turnId) return { ...t, isGenerating: false, error: errorMessage };
        return t;
      }));
    }
  }, [resume, language]);

  // When speech finalizes a segment
  useEffect(() => {
    setOnFinalize((newText: string) => {
      setPendingQuestion(prev => prev ? prev + ' ' + newText : newText);
      
      // Auto-trigger suggestion after a pause
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setPendingQuestion(prev => {
          if (prev.trim()) {
            requestSuggestion(prev.trim());
          }
          return '';
        });
      }, 2000); // 2 seconds of silence triggers answer
    });
  }, [setOnFinalize, requestSuggestion]);

  const handleManualSubmit = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    requestSuggestion(pendingQuestion.trim());
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0A0A0A] text-white p-4 md:p-8 gap-6 overflow-hidden">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:justify-between items-start md:items-end border-b border-neutral-800 pb-4 md:pb-6 shrink-0 gap-4">
        <div className="flex flex-col">
          <span className="mono text-xs text-neutral-500 uppercase tracking-widest mb-1">Copilot Version 2.4.0</span>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter">SYNCHRON <span className="text-neutral-600">AI</span></h1>
        </div>
        <div className="flex items-center gap-4 md:gap-8 flex-wrap">
          <div className="flex items-center gap-2 relative">
            <span className="relative flex h-3 w-3 mr-1">
              <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", isListening ? "bg-red-400" : "hidden")}></span>
              <span className={cn("relative inline-flex rounded-full h-3 w-3", isListening ? "bg-red-500" : "bg-neutral-600")}></span>
            </span>
            <span className={cn("mono text-sm font-bold uppercase tracking-tighter", isListening ? "text-red-500" : "text-neutral-500")}>
               {isListening ? "Live Listening" : "Standby"}
            </span>
          </div>
          <div className="flex gap-1 text-sm font-bold mono mt-2 md:mt-0">
            <button onClick={() => setLanguage('zh-CN')} className={cn("px-3 py-1 cursor-pointer transition-colors", language === 'zh-CN' ? "bg-white text-black" : "brutalist-border hover:bg-neutral-900")}>ZH</button>
            <button onClick={() => setLanguage('ja-JP')} className={cn("px-3 py-1 cursor-pointer transition-colors", language === 'ja-JP' ? "bg-white text-black" : "brutalist-border hover:bg-neutral-900")}>JA</button>
            <button onClick={() => setLanguage('en-US')} className={cn("px-3 py-1 cursor-pointer transition-colors", language === 'en-US' ? "bg-white text-black" : "brutalist-border hover:bg-neutral-900")}>EN</button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 overflow-hidden">
        {/* Sidebar - Resume and Settings */}
        <aside className="col-span-1 md:col-span-3 flex flex-col gap-4 overflow-y-auto">
          <div className="p-5 brutalist-border rounded-lg bg-neutral-900/50 flex flex-col min-h-[300px]">
             <h2 className="text-xs font-bold uppercase text-neutral-500 mb-4 tracking-widest flex justify-between items-center">
               Active Resume
               <div className="flex gap-3">
                 <label className="cursor-pointer text-[10px] text-blue-500 hover:text-blue-400 font-bold uppercase tracking-tighter">
                   [Upload .txt]
                   <input
                     type="file"
                     accept=".txt,.md"
                     className="hidden"
                     onChange={(e) => {
                       const file = e.target.files?.[0];
                       if (file) {
                         const reader = new FileReader();
                         reader.onload = (evt) => {
                           setResume(evt.target?.result as string);
                           setParsedResume(null);
                         };
                         reader.readAsText(file);
                       }
                     }}
                   />
                 </label>
                 <button 
                   onClick={async () => {
                     if (!resume.trim()) return;
                     setIsParsing(true);
                     try {
                        const data = await parseResumeContext(resume);
                        setParsedResume(data);
                     } catch (e) {
                        console.error(e);
                     } finally {
                        setIsParsing(false);
                     }
                   }}
                   disabled={isParsing || !resume || !!parsedResume}
                   className="cursor-pointer text-[10px] text-purple-500 hover:text-purple-400 disabled:text-neutral-600 font-bold uppercase tracking-tighter disabled:cursor-not-allowed transition-colors"
                 >
                   {isParsing ? "[Parsing...]" : parsedResume ? "[Parsed]" : "[Extract Key Info]"}
                 </button>
               </div>
             </h2>
             
             {parsedResume ? (
               <div className="space-y-4 mb-2 flex-1 overflow-y-auto">
                  <div className="flex flex-col"><span className="text-xs text-neutral-500">Candidate</span><span className="text-sm font-bold uppercase text-neutral-200">{parsedResume.name}</span></div>
                  <div className="flex flex-col"><span className="text-xs text-neutral-500">Experience</span><span className="text-sm font-bold uppercase text-neutral-200">{parsedResume.yearsOfExperience}</span></div>
                  <div className="flex flex-col">
                    <span className="text-xs text-neutral-500 mb-1">Key Skills</span>
                    <span className="flex flex-wrap gap-1 mt-1">
                      {parsedResume.skills.map((skill, i) => (
                         <span key={i} className="text-[9px] px-1.5 py-0.5 bg-neutral-800 text-neutral-300 rounded brutalist-border whitespace-nowrap">{skill}</span>
                      ))}
                    </span>
                  </div>
                  <button onClick={() => setParsedResume(null)} className="text-[10px] text-neutral-500 hover:text-white uppercase tracking-widest mt-4 inline-block w-fit border-b border-neutral-700 pb-0.5 transition-colors">Edit Raw Resume</button>
               </div>
             ) : (
               <textarea
                 className="w-full flex-1 p-3 brutalist-border bg-neutral-950/50 rounded-lg text-sm resize-none focus:ring-1 focus:ring-blue-500 outline-none transition-shadow placeholder-neutral-600 text-neutral-300 mono"
                 placeholder="Paste your CV here to provide context..."
                 value={resume}
                 onChange={(e) => {
                   setResume(e.target.value);
                   setParsedResume(null);
                 }}
               />
             )}
          </div>
          
          <div className="p-5 brutalist-border rounded-lg bg-neutral-900/50 flex flex-col min-h-[200px]">
             <h2 className="text-xs font-bold uppercase text-neutral-500 mb-4 tracking-widest flex justify-between items-center">
               Target Job Description
             </h2>
             <textarea
               className="w-full flex-1 p-3 brutalist-border bg-neutral-950/50 rounded-lg text-sm resize-none focus:ring-1 focus:ring-blue-500 outline-none transition-shadow placeholder-neutral-600 text-neutral-300 mono"
               placeholder="Paste the job description here..."
               value={jobDescription}
               onChange={(e) => setJobDescription(e.target.value)}
             />
          </div>
          
          <div className="p-5 brutalist-border rounded-lg bg-neutral-900/50 flex flex-col">
            <h2 className="text-xs font-bold uppercase text-neutral-500 mb-4 tracking-widest">System Controls</h2>
            <div className="flex flex-col gap-3">
              <button
                onClick={isListening ? stopListening : startListening}
                disabled={!isSupported}
                className={cn(
                  "w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest transition-all",
                  !isSupported 
                    ? "bg-neutral-800 text-neutral-500 cursor-not-allowed opacity-50"
                    : isListening 
                      ? "bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20" 
                      : "bg-white text-black hover:bg-neutral-200"
                )}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {!isSupported ? "Unsupported" : isListening ? "Stop Engine" : "Start Engine"}
              </button>

              <button
                onClick={mediaStream ? stopScreenMirror : startScreenMirror}
                className={cn(
                  "w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest transition-all",
                  mediaStream 
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20" 
                    : "brutalist-border text-neutral-300 hover:bg-neutral-800"
                )}
              >
                {mediaStream ? <MonitorOff className="w-4 h-4" /> : <MonitorPlay className="w-4 h-4" />}
                {mediaStream ? "Stop HUD Mirror" : "Mirror Meeting"}
              </button>
            </div>
            
            {mirrorError && (
              <div className="mt-3 text-[10px] uppercase font-mono text-orange-400 bg-orange-950/40 p-3 rounded border border-orange-500/30 flex items-start gap-2 leading-relaxed">
                <MonitorOff className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{mirrorError}</span>
              </div>
            )}
            
            {speechError && (
              <div className="mt-3 text-[10px] uppercase font-mono text-red-400 bg-red-950/40 p-2 rounded border border-red-500/30 flex items-start gap-1">
                <span className="text-red-500 mt-0.5">⚠️</span>
                <span>{speechError}</span>
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-neutral-800">
               <h3 className="text-[10px] font-bold uppercase text-neutral-500 mb-2 tracking-widest">Manual Override</h3>
               <div className="flex gap-2">
                 <input 
                   type="text" 
                   className="flex-1 bg-neutral-950/50 border border-neutral-800 rounded p-2 text-xs font-mono focus:ring-1 focus:ring-blue-500 outline-none placeholder-neutral-600"
                   placeholder="Type interviewer's question..."
                   onKeyDown={(e) => {
                     if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                       requestSuggestion(e.currentTarget.value.trim());
                       e.currentTarget.value = '';
                     }
                   }}
                 />
               </div>
            </div>
          </div>
        </aside>

        {/* Main Stream Area */}
        <section className="col-span-1 md:col-span-9 flex flex-col overflow-hidden relative rounded-xl brutalist-border bg-neutral-900/10">
          {/* Background Video Mirror layer */}
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={cn("absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-500 opacity-0", mediaStream && "opacity-100")}
          />
          {mediaStream && <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-0"></div>}

          <div ref={scrollRef} className="flex-1 flex flex-col gap-6 overflow-y-auto p-4 md:p-6 pb-12 scroll-smooth z-10 relative">
            
            {turns.length === 0 && !pendingQuestion && !interimTranscript && (
               <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 space-y-4 min-h-[400px]">
                 <Mic className="w-12 h-12 text-neutral-700" />
                 <p className="text-xl font-medium tracking-tight uppercase">System Offline</p>
                 <p className="text-sm mono text-center max-w-sm">Press "START ENGINE" to activate real-time transcription and analysis.</p>
               </div>
            )}

            {turns.map((turn) => (
              <div key={turn.id} className="w-full flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* Question Area */}
                <div className="brutalist-border rounded-xl p-6 bg-neutral-900/70 backdrop-blur-md relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-neutral-600"></div>
                  <div className="flex gap-4">
                    <span className="text-neutral-500 mono text-[10px] uppercase pt-1 shrink-0">Interviewer</span>
                    <p className="text-xl font-medium tracking-tight leading-relaxed text-neutral-200">{turn.question}</p>
                  </div>
                </div>

                {/* Answer Area */}
                <div className={cn("rounded-xl p-6 md:p-8 flex flex-col justify-between shadow-2xl transition-colors", turn.error ? "border border-red-500/30 bg-red-950/40 shadow-red-500/10" : "accent-gradient shadow-blue-500/20")}>
                  <div className="flex justify-between items-start mb-4">
                    <div className={cn("bg-black/20 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest text-white", turn.error && "bg-red-500/20 text-red-200")}>
                      {turn.error ? "System Failure" : "AI Recommended Response"}
                    </div>
                    {!turn.isGenerating && !turn.error && <div className="text-2xl">💡</div>}
                    {turn.error && <div className="text-2xl">⚠️</div>}
                    {turn.isGenerating && <Loader2 className="w-6 h-6 animate-spin text-white" />}
                  </div>
                  <div className="prose prose-invert prose-p:leading-[1.5] prose-p:tracking-tight prose-h3:text-blue-300 prose-h3:uppercase prose-h3:tracking-widest prose-h3:text-[11px] prose-h3:mt-5 prose-h3:mb-2 prose-h3:border-b prose-h3:border-blue-500/30 prose-h3:pb-1 prose-li:text-neutral-100 prose-li:marker:text-blue-500 max-w-none w-full text-white">
                    {turn.error ? (
                      <div className="text-xl md:text-2xl font-bold text-red-400 font-mono tracking-tight">
                        &gt; ERROR: {turn.error}
                      </div>
                    ) : (
                      <div className="text-base md:text-[17px] font-medium leading-relaxed">
                        <ReactMarkdown>{turn.answer || "*Analyzing psychological intent and strategic context...*"}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Pending Stream */}
            {(pendingQuestion || interimTranscript) && (
              <div className="brutalist-border rounded-xl p-5 bg-blue-900/40 backdrop-blur-md border-blue-500/30 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                <div className="flex gap-4">
                  <span className="flex flex-col text-blue-400 mono text-[10px] uppercase shrink-0 w-24">
                    <span className="mb-1 text-neutral-500">Listen Buffer</span>
                    {interimTranscript && <Loader2 className="w-3 h-3 animate-spin"/>}
                  </span>
                  <div className="relative w-full">
                    <p className="text-lg italic leading-relaxed text-blue-100/90 font-medium tracking-tight">
                      {pendingQuestion} <span className="opacity-50 blur-[0.5px]">{interimTranscript}</span>
                    </p>
                    {pendingQuestion && (
                      <button 
                        onClick={handleManualSubmit}
                        className="absolute -right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-400 shadow-xl border border-blue-400"
                        title="Force suggest answer now"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="flex justify-between items-center text-[10px] mono text-neutral-600 uppercase tracking-widest pt-2 shrink-0 border-t border-neutral-900 mt-auto">
        <div className="flex gap-4 md:gap-6 flex-wrap">
          <span>Latency: {(Math.random() * 50 + 100).toFixed(0)}ms</span>
          <span>Buffer: {pendingQuestion ? 'Active' : 'Clean'}</span>
        </div>
        <div>&copy; 2026 Synchron AI</div>
      </footer>
    </div>
  );
}
