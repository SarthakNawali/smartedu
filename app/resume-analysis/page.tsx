'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Snowfall from 'react-snowfall';

import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

// ─── Types ───────────────────────────────────────────────────────────────────
interface SectionScore {
  score: number;
  title: string;
  msg: string;
  tips: string[];
}

interface AnalysisResult {
  final: number;
  ruleTotal: number;
  grade: string;
  gradeColor: string;
  heroMsg: string;
  overallSection: number;
  sections: {
    contact: SectionScore;
    summary: SectionScore;
    experience: SectionScore;
    skills: SectionScore;
    education: SectionScore;
  };
  kwScore: number;
  semScore: number;
  skScore: number;
  expScore: number;
  fmtScore: number;
  matchedKw: string[];
  missingKw: string[];
  jdSkills: string[];
  resSkills: string[];
  missSkills: string[];
  reqYrs: number;
  resYrs: number;
  wc: number;
  fmtIssues: string[];
  tfidfSim: number;
  semSim: number;
  specRatio: number;
  hasTables: boolean;
}

// ─── Animated Score Counter ──────────────────────────────────────────────────
function AnimatedScore({ score, className }: { score: number; className?: string }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 1200;
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * score));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);
  return <span className={className}>{current}</span>;
}

// ─── SVG Circular Gauge ──────────────────────────────────────────────────────
function CircularGauge({ score, size = 160 }: { score: number; size?: number }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444';

  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 1500;
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(eased * score);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const r = 58, cx = 80, cy = 80;
  const startAngle = 135, span = 270;
  const filled = span * (animatedScore / 100);

  const arc = (sd: number, sw: number) => {
    const sr = (sd * Math.PI) / 180;
    const er = ((sd + sw) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(sr), y1 = cy + r * Math.sin(sr);
    const x2 = cx + r * Math.cos(er), y2 = cy + r * Math.sin(er);
    const lg = sw > 180 ? 1 : 0;
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${lg},1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  };

  return (
    <svg width={size} height={size} viewBox="0 0 160 160">
      <path d={arc(startAngle, span)} fill="none" stroke="#2a3555" strokeWidth="12" strokeLinecap="round" />
      <path d={arc(startAngle, Math.max(filled, 0.1))} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        style={{ transition: 'stroke 0.5s ease' }} />
      <text x="80" y="76" textAnchor="middle" fontFamily="Inter,sans-serif"
        fontSize="30" fontWeight="800" fill={color}>
        {Math.round(animatedScore)}
      </text>
      <text x="80" y="94" textAnchor="middle" fontFamily="Inter,sans-serif"
        fontSize="11" fill="#64748b">
        out of 100
      </text>
    </svg>
  );
}

// ─── Progress Bar ────────────────────────────────────────────────────────────
function ProgressBar({ score, delay = 0 }: { score: number; delay?: number }) {
  const [width, setWidth] = useState(0);
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444';
  useEffect(() => {
    const timer = setTimeout(() => setWidth(score), delay);
    return () => clearTimeout(timer);
  }, [score, delay]);
  return (
    <div className="w-full h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-1000 ease-out"
        style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

// ─── Section Card ────────────────────────────────────────────────────────────
function SectionCard({ data, delay = 0 }: { data: SectionScore; delay?: number }) {
  const color = data.score >= 80 ? '#22c55e' : data.score >= 60 ? '#eab308' : data.score >= 40 ? '#f97316' : '#ef4444';
  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 h-full
      hover:border-[#334155] transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/5 group">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-sm font-semibold text-slate-300">{data.title}</span>
        <AnimatedScore score={data.score}
          className="text-2xl font-extrabold tabular-nums"
        />
        <style>{`.tabular-nums { font-variant-numeric: tabular-nums; color: ${color}; }`}</style>
      </div>
      <ProgressBar score={data.score} delay={delay} />
      <p className="text-xs text-slate-500 mt-3 mb-3 leading-relaxed">{data.msg}</p>
      <div className="space-y-1.5">
        {data.tips.slice(0, 3).map((tip, i) => (
          <div key={i} className="flex gap-2 items-start text-xs text-slate-400 leading-relaxed
            p-2.5 bg-[#162032] rounded-lg group-hover:bg-[#1a2540] transition-colors">
            <span className="text-indigo-400 flex-shrink-0 mt-0.5">›</span>
            <span>{tip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ATS Mini Card ───────────────────────────────────────────────────────────
function ATSMiniCard({ label, value, max, icon }: { label: string; value: number; max: number; icon: string }) {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : pct >= 40 ? '#f97316' : '#ef4444';
  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 text-center
      hover:border-[#334155] transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/5">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-center gap-1.5">
        <span>{icon}</span> {label}
      </div>
      <div className="text-2xl font-extrabold" style={{ color }}>
        <AnimatedScore score={Math.round(value * 10) / 10} />
        <span className="text-xs text-slate-600 font-normal ml-0.5">/{max}</span>
      </div>
      <div className="mt-2">
        <ProgressBar score={pct} delay={200} />
      </div>
    </div>
  );
}

// ─── Chip ────────────────────────────────────────────────────────────────────
function Chip({ text, variant }: { text: string; variant: 'green' | 'red' | 'yellow' }) {
  const styles = {
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    yellow: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium m-1 border ${styles[variant]}
      transition-transform duration-200 hover:scale-105`}>
      {text}
    </span>
  );
}

// ─── Score color helpers ─────────────────────────────────────────────────────
function getScoreColor(s: number): string {
  if (s >= 80) return '#22c55e';
  if (s >= 60) return '#eab308';
  if (s >= 40) return '#f97316';
  return '#ef4444';
}

function getScoreBg(s: number): string {
  if (s >= 80) return 'bg-emerald-500/10 border-emerald-500/30';
  if (s >= 60) return 'bg-amber-500/10 border-amber-500/30';
  if (s >= 40) return 'bg-orange-500/10 border-orange-500/30';
  return 'bg-red-500/10 border-red-500/30';
}

// ─── Collapsible Section ─────────────────────────────────────────────────────
function Collapsible({ title, count, defaultOpen = false, children }: {
  title: string; count: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#1e293b] rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 bg-[#0f172a] hover:bg-[#162032]
          transition-colors text-sm text-slate-300 cursor-pointer">
        <span>{title} ({count})</span>
        <svg className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="p-3 bg-[#0a0f1a]">{children}</div>}
    </div>
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
  const [jobDescription, setJobDescription] = useState('');
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
    if (!jobDescription || jobDescription.trim().length < 50) {
      setError('Please paste a job description (minimum 50 characters).');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setLoadingMsg('Validating PDF…');

    try {
      const formData = new FormData();
      formData.append('resume', file);
      formData.append('jobDescription', jobDescription);

      setLoadingMsg('Analysing resume against job description…');

      const res = await fetch('/api/analyze-resume', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed.');
        return;
      }

      setResult(data as AnalysisResult);
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

  // Collect improvement tips
  const improvementTips: { section: string; tip: string; score: number }[] = [];
  if (result) {
    for (const sec of Object.values(result.sections)) {
      if (sec.score < 80) {
        for (const tip of sec.tips.slice(0, 2)) {
          improvementTips.push({ section: sec.title, tip, score: sec.score });
        }
      }
    }
    for (const issue of result.fmtIssues) {
      improvementTips.push({ section: 'Formatting', tip: issue, score: Math.round((result.fmtScore / 5) * 100) });
    }
    improvementTips.sort((a, b) => a.score - b.score);
  }

  return (
    <div className="min-h-screen bg-[#0a0e17] text-slate-200">
      <Snowfall color="#ffffff08" snowflakeCount={30} speed={[0.2, 0.5]}
        wind={[-0.3, 0.3]} radius={[1, 3]} />

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-[#0a0e17]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold
            bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent
            hover:opacity-80 transition-opacity no-underline">
            🎓 FocusEdu
          </Link>
          <h1 className="text-base font-semibold text-slate-300 hidden sm:block">
            📄 ATS Resume Scorer
          </h1>
          <div className="text-sm text-slate-500">
            {user.displayName || user.email?.split('@')[0]}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* ─── Upload Section ───────────────────────────────────────────── */}
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-3
            bg-gradient-to-r from-slate-100 via-indigo-200 to-violet-300 bg-clip-text text-transparent">
            ATS Resume Scorer
          </h2>
          <p className="text-slate-500 text-sm max-w-lg mx-auto">
            Upload your resume PDF and paste a job description to get a detailed ATS compatibility score
            with section-by-section breakdown.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Resume Upload */}
          <div>
            <label className="text-sm font-semibold text-slate-400 mb-2 block flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Resume PDF
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={handleDrag} onDragOver={handleDrag}
              onDragLeave={handleDrag} onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                transition-all duration-300 group
                ${isDragging
                  ? 'border-indigo-500 bg-indigo-500/5 scale-[1.02]'
                  : file
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-[#334155] bg-[#0f172a] hover:border-indigo-500/50 hover:bg-[#0f172a]/80'
                }`}
            >
              <input ref={fileInputRef} type="file" accept=".pdf"
                className="hidden" onChange={handleFileInput} />

              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center
                    text-emerald-400 text-xl">
                    ✓
                  </div>
                  <p className="text-emerald-400 font-semibold text-sm">{file.name}</p>
                  <p className="text-slate-500 text-xs">{(file.size / 1024).toFixed(1)} KB</p>
                  <button onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }}
                    className="text-xs text-slate-500 hover:text-red-400 mt-1 transition-colors cursor-pointer">
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-[#1e293b] flex items-center justify-center
                    text-slate-400 text-2xl group-hover:bg-indigo-500/10 group-hover:text-indigo-400
                    transition-all duration-300">
                    📄
                  </div>
                  <div>
                    <p className="text-slate-300 font-medium text-sm">
                      Drop your resume here or <span className="text-indigo-400">browse</span>
                    </p>
                    <p className="text-slate-600 text-xs mt-1">PDF only · Max 10 MB · Text-based only</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Job Description */}
          <div>
            <label className="text-sm font-semibold text-slate-400 mb-2 block flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Job Description
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here…&#10;&#10;Include responsibilities, requirements, and required skills for the best analysis."
              className="w-full h-[222px] bg-[#0f172a] border border-[#334155] rounded-xl p-4
                text-sm text-slate-300 placeholder-slate-600 resize-none
                focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20
                transition-all duration-300"
            />
            <p className="text-xs text-slate-600 mt-1.5 text-right">
              {jobDescription.length} characters {jobDescription.length < 50 && jobDescription.length > 0 ? '(min 50)' : ''}
            </p>
          </div>
        </div>

        {/* Analyze Button */}
        <div className="flex justify-center mb-8">
          <button onClick={analyzeResume} disabled={loading || !file || jobDescription.trim().length < 50}
            className="relative px-10 py-3.5 rounded-xl font-bold text-white text-sm
              bg-gradient-to-r from-indigo-600 to-violet-600
              hover:from-indigo-500 hover:to-violet-500
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-indigo-600
              transition-all duration-300 shadow-lg shadow-indigo-500/20
              hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.02]
              active:scale-[0.98] cursor-pointer
              flex items-center gap-2.5 group">
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {loadingMsg}
              </>
            ) : (
              <>
                <span className="text-lg group-hover:rotate-12 transition-transform">⚡</span>
                Analyse Resume
              </>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="max-w-2xl mx-auto mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-xl
            text-sm text-red-400 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <span className="text-lg flex-shrink-0">⚠️</span>
            <div>
              <p className="font-semibold mb-1">Analysis Error</p>
              <p className="text-red-400/80">{error}</p>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            RESULTS
           ═══════════════════════════════════════════════════════════════ */}
        {result && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* ─── Hero Banner ────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-2xl p-8 sm:p-10
              bg-gradient-to-br from-[#1c2333] via-[#1a2744] to-[#1c2520]
              border border-[#2a3555]">
              {/* Glow effects */}
              <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full opacity-10 blur-3xl"
                style={{ background: result.gradeColor }} />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full opacity-5 blur-3xl bg-indigo-400" />

              <div className="relative flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="text-center sm:text-left">
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-100 mb-2">
                    Overall Resume Score
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed max-w-md mb-4">
                    {result.heroMsg}
                  </p>
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border-2"
                    style={{
                      background: `${result.gradeColor}10`,
                      borderColor: `${result.gradeColor}50`,
                      color: result.gradeColor
                    }}>
                    📈 {result.grade}
                  </span>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>📐 Rule-based score</span>
                    <span>·</span>
                    <span>TF-IDF: {result.tfidfSim}</span>
                    <span>·</span>
                    <span>Semantic: {result.semSim}</span>
                    <span>·</span>
                    <span>{result.wc} words</span>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <CircularGauge score={result.final} size={180} />
                </div>
              </div>
            </div>

            {/* ─── Section Breakdown ──────────────────────────────────── */}
            <div>
              <h3 className="text-xl font-bold text-slate-200 mb-5 flex items-center gap-2.5">
                <span className="text-lg">📊</span> Section Breakdown
                <span className="text-xs text-slate-500 font-normal ml-2">
                  Average: {result.overallSection}/100
                </span>
              </h3>

              {/* Row 1 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <SectionCard data={result.sections.contact} delay={100} />
                <SectionCard data={result.sections.summary} delay={200} />
                <SectionCard data={result.sections.experience} delay={300} />
              </div>
              {/* Row 2 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
                <SectionCard data={result.sections.skills} delay={400} />
                <SectionCard data={result.sections.education} delay={500} />
              </div>
            </div>

            {/* ─── ATS Compatibility ──────────────────────────────────── */}
            <div>
              <h3 className="text-xl font-bold text-slate-200 mb-5 flex items-center gap-2.5">
                <span className="text-lg">🎯</span> ATS Compatibility Score
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <ATSMiniCard icon="🔑" label="Keyword Match" value={result.kwScore} max={40} />
                <ATSMiniCard icon="🧠" label="Semantic Sim." value={result.semScore} max={30} />
                <ATSMiniCard icon="🛠️" label="Skills Coverage" value={result.skScore} max={10} />
                <ATSMiniCard icon="📅" label="Experience" value={result.expScore} max={15} />
                <ATSMiniCard icon="📄" label="Formatting" value={result.fmtScore} max={5} />
              </div>
            </div>

            {/* ─── Keyword & Skills Gap ───────────────────────────────── */}
            <div>
              <h3 className="text-xl font-bold text-slate-200 mb-5 flex items-center gap-2.5">
                <span className="text-lg">🔍</span> Keyword & Skills Gap
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Keywords */}
                <div className="space-y-3">
                  <p className="text-sm text-slate-400">
                    <span className="font-semibold text-slate-300">Keywords</span>
                    <span className="ml-2 text-xs">
                      <span className="text-emerald-400 font-mono">{result.matchedKw.length}</span> matched ·
                      <span className="text-red-400 font-mono ml-1">{result.missingKw.length}</span> missing
                    </span>
                  </p>
                  <Collapsible title={`✅ Keywords found in resume`} count={result.matchedKw.length} defaultOpen>
                    <div className="flex flex-wrap">
                      {result.matchedKw.length > 0
                        ? result.matchedKw.map((kw, i) => <Chip key={i} text={kw} variant="green" />)
                        : <p className="text-xs text-slate-600 italic">None found</p>
                      }
                    </div>
                  </Collapsible>
                  <Collapsible title={`❌ Missing keywords — add these`} count={result.missingKw.length}>
                    <div className="flex flex-wrap">
                      {result.missingKw.length > 0
                        ? result.missingKw.map((kw, i) => <Chip key={i} text={kw} variant="red" />)
                        : <p className="text-xs text-emerald-500 italic">Great — no missing keywords!</p>
                      }
                    </div>
                  </Collapsible>
                </div>

                {/* Skills */}
                <div className="space-y-3">
                  <p className="text-sm text-slate-400">
                    <span className="font-semibold text-slate-300">Skills</span>
                    <span className="ml-2 text-xs">
                      <span className="text-emerald-400 font-mono">{result.resSkills.length}</span> found ·
                      <span className="text-amber-400 font-mono ml-1">{result.missSkills.length}</span> missing from JD
                    </span>
                  </p>
                  <Collapsible title={`✅ Skills matched`}
                    count={result.jdSkills.filter(s => result.resSkills.includes(s)).length} defaultOpen>
                    <div className="flex flex-wrap">
                      {result.jdSkills.filter(s => result.resSkills.includes(s)).length > 0
                        ? result.jdSkills.filter(s => result.resSkills.includes(s))
                          .map((s, i) => <Chip key={i} text={s} variant="green" />)
                        : <p className="text-xs text-slate-600 italic">No matching skills</p>
                      }
                    </div>
                  </Collapsible>
                  <Collapsible title={`⚠️ Skills to add`} count={result.missSkills.length}>
                    <div className="flex flex-wrap">
                      {result.missSkills.length > 0
                        ? result.missSkills.map((s, i) => <Chip key={i} text={s} variant="yellow" />)
                        : <p className="text-xs text-emerald-500 italic">All JD skills covered!</p>
                      }
                    </div>
                  </Collapsible>
                </div>
              </div>
            </div>

            {/* ─── Experience & Formatting ─────────────────────────────── */}
            <div>
              <h3 className="text-xl font-bold text-slate-200 mb-5 flex items-center gap-2.5">
                <span className="text-lg">📅</span> Experience & Formatting
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Experience */}
                <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 space-y-4">
                  <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Experience</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#162032] rounded-lg p-4">
                      <p className="text-xs text-slate-500 mb-1">JD Requirement</p>
                      <p className="text-lg font-bold text-slate-200">
                        {result.reqYrs > 0 ? `${result.reqYrs} yrs` : 'Not specified'}
                      </p>
                    </div>
                    <div className="bg-[#162032] rounded-lg p-4">
                      <p className="text-xs text-slate-500 mb-1">Detected</p>
                      <p className="text-lg font-bold text-slate-200">
                        {result.resYrs > 0 ? `${result.resYrs} yrs` : 'Not detected'}
                      </p>
                    </div>
                  </div>
                  {result.reqYrs > 0 && result.resYrs < result.reqYrs && (
                    <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
                      <span>⚠️</span>
                      <span>Gap: ~{Math.round(result.reqYrs - result.resYrs)} year(s) short. Include internships and projects to bridge the gap.</span>
                    </div>
                  )}
                  {result.reqYrs > 0 && result.resYrs >= result.reqYrs && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400">
                      <span>✅</span> Experience requirement met
                    </div>
                  )}
                </div>

                {/* Formatting */}
                <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 space-y-4">
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Formatting</h4>
                    <span className="text-lg font-extrabold" style={{ color: getScoreColor(result.fmtScore / 5 * 100) }}>
                      {result.fmtScore} <span className="text-xs text-slate-600 font-normal">/ 5</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                    <span>📝 {result.wc} words</span>
                    <span>🔣 {(result.specRatio * 100).toFixed(1)}% special chars</span>
                    <span>📊 Tables: {result.hasTables ? 'Yes' : 'No'}</span>
                  </div>
                  {result.fmtIssues.length > 0 ? (
                    <div className="space-y-2">
                      {result.fmtIssues.map((issue, i) => (
                        <div key={i} className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20
                          rounded-lg text-xs text-amber-400">
                          <span>⚠️</span> <span>{issue}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400">
                      <span>✅</span> Formatting looks clean and ATS-friendly
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ─── Improvement Checklist ───────────────────────────────── */}
            <div>
              <h3 className="text-xl font-bold text-slate-200 mb-5 flex items-center gap-2.5">
                <span className="text-lg">💡</span> Top Improvement Actions
              </h3>
              {improvementTips.length === 0 ? (
                <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center">
                  <p className="text-emerald-400 font-semibold text-sm">
                    🎉 Excellent! Your resume is well-optimised.
                  </p>
                  <p className="text-slate-500 text-xs mt-1">Focus on tailoring your cover letter for maximum impact.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {improvementTips.slice(0, 8).map((item, i) => (
                    <div key={i}
                      className="flex items-start gap-4 p-3.5 bg-[#0f172a] rounded-xl border-l-[3px]
                        hover:bg-[#131c2e] transition-colors duration-200"
                      style={{ borderColor: getScoreColor(item.score) }}>
                      <span className="text-[11px] font-bold whitespace-nowrap pt-0.5 min-w-[110px]"
                        style={{ color: getScoreColor(item.score) }}>
                        {item.section}
                      </span>
                      <span className="text-sm text-slate-400 leading-relaxed">› {item.tip}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─── Footer ─────────────────────────────────────────────── */}
            <div className="border-t border-[#1e293b] pt-6 text-center">
              <p className="text-xs text-slate-600">
                ATS Resume Scorer · Rule-based analysis · No data stored externally
              </p>
            </div>

          </div>
        )}

        {/* ─── Empty State ──────────────────────────────────────────────── */}
        {!result && !loading && !error && (
          <div className="text-center py-20 opacity-40">
            <div className="text-6xl mb-4">📄</div>
            <p className="text-xl font-semibold text-slate-300">
              Upload a resume and paste a job description to begin
            </p>
            <p className="text-sm text-slate-500 mt-2">
              You&apos;ll get a full section-by-section breakdown just like a real ATS system
            </p>
          </div>
        )}

      </main>
    </div>
  );
}
