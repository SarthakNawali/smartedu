'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/app/components/Navbar';
import Snowfall from 'react-snowfall';
import ReactMarkdown from 'react-markdown';

import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// ─── Types ───────────────────────────────────────────────────────────────────
interface AnalysisResult {
  rejection_risk: number;
  confidence: number;
  skills_found: string[];
  missing_skills: Record<string, string[]>;
  skill_counts: Record<string, number>;
  years_experience: number;
  word_count: number;
  total_skills_found: number;
  recommendations: string | null;
  final?: number;
  grade?: string;
  gradeColor?: string;
  sections?: Record<string, any>;
}

// ─── Animated Number Component ───────────────────────────────────────────────
function AnimatedNumber({ value }: { value: number }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 1200;
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * value));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span>{current}</span>;
}

// ─── Chip Component ──────────────────────────────────────────────────────────
function Chip({ text, variant }: { text: string; variant: 'green' | 'red' | 'blue' | 'yellow' }) {
  const styles = {
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    blue: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    yellow: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };
  return (
    <span className={`inline-block px-3 py-1.5 rounded-full text-xs font-semibold m-1 border ${styles[variant]}
      transition-transform duration-200 hover:scale-105`}>
      {text}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function ResumeAnalysisPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [rejectionCount, setRejectionCount] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Auth check
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (!u) router.push('/login');
    });
    return () => unsub();
  }, [router]);

  // Drag & Drop
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setIsDragging(true);
    else if (e.type === 'dragleave') setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }, []);

  const handleFile = (f: File) => {
    setError('');
    if (f.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File size must be under 10 MB.');
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  // ─── Analyze ─────────────────────────────────────────────────────────────
  const analyzeResume = async () => {
    if (!file) { setError('Please upload a resume PDF.'); return; }

    setLoading(true);
    setError('');
    setResult(null);
    setLoadingMsg('Analysing resume with AI models…');

    try {
      const formData = new FormData();
      formData.append('resume', file);
      formData.append('rejectionCount', rejectionCount.toString());

      const res = await fetch('/api/analyze-it-resume', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed.');
        return;
      }

      setResult(data as AnalysisResult);

      // Save to Firestore for dashboard history
      if (user) {
        try {
          const sections = data.sections 
            ? Object.values(data.sections).map((s: any) => ({
                title: s.title,
                score: s.score,
              }))
            : [];

          await addDoc(collection(db, 'resumeAnalysis'), {
            userId: user.uid,
            overallScore: data.final || Math.max(0, 100 - (data.rejection_risk * 15)),
            grade: data.grade || (data.rejection_risk < 2 ? 'A' : 'C'),
            rejectionRisk: data.rejection_risk,
            confidence: data.confidence,
            skillsFound: data.total_skills_found,
            skillsFoundList: data.skills_found || [],
            missingSkills: data.missing_skills || {},
            analysis: { sections },
            createdAt: serverTimestamp(),
          });
        } catch (e) {
          console.warn('Could not save to dashboard history:', e);
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-200 font-['Inter',sans-serif] relative overflow-hidden">
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl animate-pulse pointer-events-none z-0"></div>
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-fuchsia-600/20 rounded-full blur-3xl animate-pulse pointer-events-none z-0" style={{ animationDelay: '1s' }}></div>
      <Snowfall color="#ffffff08" snowflakeCount={30} speed={[0.2, 0.5]}
        wind={[-0.3, 0.3]} radius={[1, 3]} />

      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 relative z-10 pt-20">

        {/* ─── Top Banner ───────────────────────────────────────────────── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#667eea] to-[#764ba2] 
            rounded-2xl p-8 sm:p-10 mb-10 shadow-lg shadow-indigo-500/20 border border-[#855cb1]">
          <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-white opacity-5 rounded-full blur-3xl" />
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2 relative z-10">
            💼 IT Engineer ATS System
          </h1>
          <p className="text-indigo-100 text-sm sm:text-base opacity-90 relative z-10 max-w-xl">
            Upload your resume and get comprehensive ML-driven predictions for rejection risk, 
            skills tracking, and actionable insights from Groq AI.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
          
          {/* ─── Sidebar / Inputs ─────────────────────────────────────────── */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Upload Box */}
            <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6">
              <h3 className="text-lg font-bold text-slate-300 mb-4 flex items-center gap-2">
                📤 Upload Resume
              </h3>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={handleDrag} onDragOver={handleDrag}
                onDragLeave={handleDrag} onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 group
                  ${isDragging ? 'border-indigo-500 bg-indigo-500/5 scale-[1.02]'
                  : file ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-[#334155] bg-[#162032] hover:border-indigo-500/50 hover:bg-[#1a2540]'
                  }`}
              >
                <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 text-xl">✓</div>
                    <p className="text-emerald-400 font-semibold text-sm">{file.name}</p>
                    <p className="text-slate-500 text-xs">{(file.size / 1024).toFixed(1)} KB</p>
                    <button onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }}
                      className="text-xs text-slate-500 hover:text-red-400 mt-1 transition-colors">
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-[#1e293b] flex items-center justify-center text-slate-400 text-2xl group-hover:bg-indigo-500/10 group-hover:text-indigo-400">📄</div>
                    <div>
                      <p className="text-slate-300 font-medium text-sm">Drop PDF here or <span className="text-indigo-400">browse</span></p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Rejection Count */}
            <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6">
              <h3 className="text-lg font-bold text-slate-300 mb-2 flex items-center gap-2">
                📊 Rejection History
              </h3>
              <p className="text-sm text-slate-500 mb-4">How many times have you been rejected?</p>
              
              <div className="space-y-3">
                {[
                  { val: 0, label: "0️⃣ Zero (first time / no gaps)" },
                  { val: 1, label: "1️⃣ Once (minor gaps)" },
                  { val: 2, label: "2️⃣ Twice (moderate gaps)" },
                  { val: 3, label: "3️⃣ Three times (major gaps)" },
                  { val: 4, label: "4️⃣ Four+ times (critical gaps)" }
                ].map((opt) => (
                  <label key={opt.val} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                    ${rejectionCount === opt.val ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-[#162032] border-transparent hover:border-[#334155]'}`}>
                    <input type="radio" name="rejectionCount" value={opt.val}
                      checked={rejectionCount === opt.val}
                      onChange={() => setRejectionCount(opt.val)}
                      className="text-indigo-500 focus:ring-indigo-500/50 bg-[#0a0e17] border-[#334155]" />
                    <span className="text-sm text-slate-300">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <button onClick={analyzeResume} disabled={loading || !file}
              className="w-full py-4 rounded-xl font-bold text-white text-base
                bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-90
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-all duration-300 shadow-lg shadow-indigo-500/20 active:scale-[0.98] flex items-center justify-center gap-2 group">
              {loading ? (
                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {loadingMsg}</>
              ) : (
                <><span className="text-xl group-hover:scale-110 transition-transform">⚡</span> Analyse Resume</>
              )}
            </button>
            
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400 font-medium animate-in fade-in">
                ⚠️ {error}
              </div>
            )}
            
          </div>

          {/* ─── Main Content / Results ───────────────────────────────────── */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {!result && !loading && (
               <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-[#1e293b] rounded-2xl p-12 py-24 text-center">
                  <span className="text-6xl mb-6 opacity-40 hover:opacity-100 transition-opacity">📄</span>
                  <h3 className="text-2xl font-bold text-slate-300 mb-2">Upload Resume to Start</h3>
                  <p className="text-slate-500 max-w-sm">Use the sidebar to configure your settings and start your ML analysis.</p>
               </div>
            )}

            {result && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                
                {/* Metrics */}
                <div>
                  <h2 className="text-xl font-bold text-slate-200 mb-4 pb-2 border-b-2 border-[#667eea] inline-block">
                    📊 Analysis Summary
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[
                      { l: "ATS Score", v: result.final || 0, s: "/100" },
                      { l: "Your Count", v: rejectionCount, s: "" },
                      { l: "ML Predicts", v: result.rejection_risk, s: "" },
                      { l: "Skills Found", v: result.total_skills_found, s: "" },
                      { l: "Experience", v: result.years_experience, s: "y" },
                    ].map((m, i) => (
                      <div key={i} className="bg-[#0f172a] border-l-4 border-[#667eea] p-5 rounded-xl text-left shadow-lg">
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">{m.l}</p>
                        <p className="text-3xl font-extrabold text-slate-200">
                          <AnimatedNumber value={m.v} />
                          <span className="text-lg text-slate-500 ml-1">{m.s}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Skills Breakdown */}
                <div>
                  <h2 className="text-xl font-bold text-slate-200 mb-4 pb-2 border-b-2 border-[#667eea] inline-block">
                    🛠️ Skills Breakdown
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-[#0f172a] border border-[#1e293b] p-6 rounded-xl">
                      <p className="font-semibold text-slate-300 mb-4">✅ Found Skills:</p>
                      <div className="flex flex-wrap">
                        {result.skills_found.length > 0 ? (
                           result.skills_found.sort().map((s, i) => <Chip key={i} text={s} variant="green" />)
                        ) : (
                           <p className="text-amber-500/80 text-sm">No IT skills detected.</p>
                        )}
                      </div>
                    </div>
                    <div className="bg-[#0f172a] border border-[#1e293b] p-6 rounded-xl">
                      <p className="font-semibold text-slate-300 mb-4">Skills by Category:</p>
                      <ul className="space-y-3">
                        {Object.entries(result.skill_counts).map(([cat, count]) => count > 0 && (
                          <li key={cat} className="flex justify-between items-center text-sm border-b border-[#1e293b] pb-2 last:border-0 last:pb-0">
                            <span className="text-slate-400">{cat}</span>
                            <span className="bg-indigo-500/10 text-indigo-400 font-bold px-2 py-0.5 rounded text-xs">{count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* AI Recommendations */}
                <div>
                  <h2 className="text-xl font-bold text-slate-200 mb-4 pb-2 border-b-2 border-[#667eea] inline-block">
                    🤖 AI-Powered Recommendations
                  </h2>
                  {result.recommendations && !result.recommendations.includes("⚠️") ? (
                    <div className="bg-[#0f172a] border border-[#1e293b] p-6 rounded-xl 
                        prose prose-invert max-w-none text-slate-300 marker:text-indigo-400
                        prose-h3:text-indigo-300 prose-a:text-indigo-400 prose-strong:text-slate-200">
                      <ReactMarkdown>{result.recommendations}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="bg-amber-500/10 border-l-4 border-amber-500 p-5 rounded-xl text-amber-500/90 text-sm">
                      {result.recommendations || "⚠️ Could not generate recommendations. Ensure the Groq API key is correctly configured in your .env file."}
                    </div>
                  )}
                </div>

                {/* Missing Skills */}
                <div>
                  <h2 className="text-xl font-bold text-slate-200 mb-4 pb-2 border-b-2 border-[#667eea] inline-block">
                    📚 Skills to Add
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {['Languages', 'Databases', 'Cloud & DevOps', 'Frameworks', 'Data & ML', 'Architecture'].map(cat => {
                      const miss = result.missing_skills[cat];
                      if (!miss || miss.length === 0) return null;
                      return (
                        <div key={cat} className="bg-[#162032] border border-[#1e293b] p-4 rounded-xl">
                          <p className="text-sm font-semibold text-slate-400 mb-3">{cat}:</p>
                          <div className="flex flex-wrap">
                            {miss.slice(0, 5).map((s, i) => <Chip key={i} text={s} variant="red" />)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </main>
      
      <div className="border-t border-[#1e293b] py-6 text-center text-xs text-slate-600">
        💼 IT Engineer ATS • Resume Analysis • Groq AI Powered
      </div>
    </div>
  );
}
