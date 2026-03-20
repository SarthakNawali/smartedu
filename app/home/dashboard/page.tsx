'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';

import Navbar from '@/app/components/Navbar';
import { Line, Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend
);

/* ---------------- TYPES ---------------- */

interface ResumeDoc {
  id: string;
  overallScore: number;
  grade?: string;
  analysis: {
    sections: {
      title: string;
      score: number;
    }[];
  };
  createdAt: Timestamp | null;
  isPinned?: boolean;
}

/* ---------------- COURSE MAP (matches new ATS section titles) ---------------- */

const COURSE_MAP: Record<
  string,
  { threshold: number; videoUrl: string; courseUrl: string }
> = {
  'Skills & Technologies': {
    threshold: 75,
    videoUrl: 'https://www.youtube.com/results?search_query=technical+skills+software+developer',
    courseUrl: 'https://www.udemy.com/course/the-complete-web-development-bootcamp/',
  },
  'Work Experience': {
    threshold: 70,
    videoUrl: 'https://www.youtube.com/results?search_query=software+engineering+experience+resume',
    courseUrl: 'https://www.udemy.com/course/software-engineering-career-guide/',
  },
  'Education': {
    threshold: 65,
    videoUrl: 'https://www.youtube.com/results?search_query=education+section+resume+tips',
    courseUrl: 'https://www.udemy.com/course/resume-writing/',
  },
  'Professional Summary': {
    threshold: 70,
    videoUrl: 'https://www.youtube.com/results?search_query=professional+summary+resume+tips',
    courseUrl: 'https://www.udemy.com/course/resume-writing-masterclass/',
  },
  'Contact Information': {
    threshold: 75,
    videoUrl: 'https://www.youtube.com/results?search_query=contact+information+resume+best+practices',
    courseUrl: 'https://www.udemy.com/course/job-search-skills/',
  },
};

/* ================= PAGE ================= */

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [data, setData] = useState<ResumeDoc[]>([]);
  const [activeTab, setActiveTab] = useState<
    'trend' | 'grade' | 'sections' | 'skills' | 'history' | 'export'
  >('grade');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  /* ---------------- AUTH ---------------- */

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.push('/login');
      else setUser(u);
    });
    return () => unsub();
  }, [router]);

  /* ---------------- FETCH DATA ---------------- */

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const q = query(
          collection(db, 'resumeAnalysis'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );

        const snap = await getDocs(q);
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as ResumeDoc[];

        setData(docs);
      } catch (err: any) {
        console.warn('Dashboard fetch error:', err);
        // If index not ready, try without orderBy
        if (err.message?.includes('index')) {
          setFetchError('Firestore index is still building. Please wait a few minutes and refresh.');
          try {
            const fallbackQ = query(
              collection(db, 'resumeAnalysis'),
              where('userId', '==', user.uid)
            );
            const snap = await getDocs(fallbackQ);
            const docs = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as any),
            })) as ResumeDoc[];
            setData(docs);
            setFetchError('');
          } catch {
            // still failed
          }
        } else {
          setFetchError(err.message || 'Failed to load dashboard data.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  /* ---------------- HELPERS ---------------- */

  const getGrade = (s: number) =>
    s >= 85 ? 'A+' : s >= 80 ? 'A' : s >= 70 ? 'B' : s >= 50 ? 'C' : 'D';

  const getGradeColor = (s: number) =>
    s >= 80 ? 'from-emerald-400 to-green-500' :
      s >= 70 ? 'from-yellow-400 to-amber-500' :
        s >= 50 ? 'from-orange-400 to-orange-500' :
          'from-red-400 to-red-500';

  const pinResume = async (id: string) => {
    try {
      await updateDoc(doc(db, 'resumeAnalysis', id), { isPinned: true });
      setData((prev) =>
        prev.map((r) => ({ ...r, isPinned: r.id === id }))
      );
    } catch (e) {
      console.warn('Could not pin resume:', e);
    }
  };

  const streak = () => {
    if (data.length < 2) return 0;
    let s = 0;
    for (let i = data.length - 1; i > 0; i--) {
      if (data[i - 1].overallScore > data[i].overallScore) s++;
      else break;
    }
    return s;
  };

  const formatDate = (ts: Timestamp | null) => {
    if (!ts || !ts.toDate) return 'Just now';
    try { return ts.toDate().toLocaleDateString(); } catch { return 'N/A'; }
  };

  const formatDateTime = (ts: Timestamp | null) => {
    if (!ts || !ts.toDate) return 'Just now';
    try { return ts.toDate().toLocaleString(); } catch { return 'N/A'; }
  };

  /* ---------------- CHART DATA ---------------- */

  const validData = data.filter(d => d.createdAt && d.createdAt.toDate);

  const trendData = {
    labels: [...validData].reverse().map((d) => formatDate(d.createdAt)),
    datasets: [
      {
        label: 'Resume Score',
        data: [...validData].reverse().map((d) => d.overallScore),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#8b5cf6',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
      },
    ],
  };

  /* ---------------- LOADING ---------------- */

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  /* ---------------- RENDER ---------------- */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white relative">
      {/* Decorative gradient orbs */}
      <div className="fixed top-1/4 -left-32 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl animate-pulse pointer-events-none z-0"></div>
      <div className="fixed bottom-1/4 -right-32 w-96 h-96 bg-fuchsia-600/20 rounded-full blur-3xl animate-pulse pointer-events-none z-0" style={{ animationDelay: '1s' }}></div>
      <Navbar />

      <main className="max-w-6xl mx-auto px-6 py-10 pt-24 relative z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent drop-shadow-lg">📊 Resume Dashboard</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/resume-analysis"
              className="px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-xl transition-all border-0 text-sm font-semibold shadow-md hover:shadow-violet-500/20"
            >
              + New Analysis
            </Link>
          </div>
        </div>

        {/* ERROR */}
        {fetchError && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-400">
            ⚠️ {fetchError}
          </div>
        )}

        {/* EMPTY STATE */}
        {data.length === 0 && !fetchError && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📄</div>
            <h2 className="text-2xl font-bold text-slate-300 mb-2">No analyses yet</h2>
            <p className="text-slate-500 mb-6">Run your first resume analysis to see your dashboard</p>
            <Link
              href="/resume-analysis"
              className="px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-violet-500/20 transition-all"
            >
              Analyse Resume
            </Link>
          </div>
        )}

        {data.length > 0 && (
          <>
            {/* SUMMARY STATS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="p-5 bg-slate-900/80 border border-violet-700/30 rounded-2xl">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Latest Score</p>
                <p className="text-3xl font-extrabold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                  {data[0].overallScore}
                </p>
              </div>
              <div className="p-5 bg-slate-900/80 border border-violet-700/30 rounded-2xl">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Best Score</p>
                <p className="text-3xl font-extrabold text-emerald-400">
                  {Math.max(...data.map(d => d.overallScore))}
                </p>
              </div>
              <div className="p-5 bg-slate-900/80 border border-violet-700/30 rounded-2xl">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Analyses</p>
                <p className="text-3xl font-extrabold text-sky-400">
                  {data.length}
                </p>
              </div>
              <div className="p-5 bg-gradient-to-r from-violet-600/80 to-fuchsia-600/80 border border-violet-500/30 rounded-2xl">
                <p className="text-xs text-white/60 uppercase tracking-wider mb-1">🔥 Streak</p>
                <p className="text-3xl font-extrabold text-yellow-300">
                  {streak()}
                </p>
              </div>
            </div>

            {/* TABS */}
            <div className="flex flex-wrap gap-3 mb-8">
              {([
                ['grade', '🅰️ Grades'],
                ['trend', '📈 Trend'],
                ['sections', '📊 Sections'],
                ['skills', '🧠 Skills'],
                ['history', '📄 History'],
                ['export', '📥 Export'],
              ] as [string, string][]).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setActiveTab(k as any)}
                  className={`px-5 py-2 rounded-xl border font-semibold shadow-sm transition-all duration-200 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500/50
                    ${activeTab === k
                      ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 border-violet-400 text-white scale-105 shadow-violet-500/20'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700/80 hover:text-white'}
                  `}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* TREND */}
            {activeTab === 'trend' && (
              <div className="bg-slate-900/80 p-6 rounded-2xl border border-violet-700/30">
                <h2 className="text-xl font-bold mb-4 text-slate-200">Score Trend</h2>
                {validData.length >= 2 ? (
                  <Line data={trendData} options={{
                    responsive: true,
                    plugins: { legend: { labels: { color: '#a78bfa', font: { size: 14 } } } },
                    scales: {
                      x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
                      y: { min: 0, max: 100, ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
                    },
                  }} />
                ) : (
                  <p className="text-slate-500 text-center py-10">Run at least 2 analyses to see your score trend</p>
                )}
              </div>
            )}

            {/* GRADES */}
            {activeTab === 'grade' && (
              <div className="grid md:grid-cols-3 gap-6">
                {data.map((d) => (
                  <div key={d.id} className="p-6 bg-slate-900/80 border border-violet-700/30 rounded-2xl shadow-md hover:shadow-violet-500/20 transition-all duration-200 group relative overflow-hidden">
                    <div className="absolute -top-4 -right-4 w-16 h-16 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 rounded-full blur-2xl z-0"></div>
                    <div className="relative z-10">
                      <p className="text-sm text-slate-400 mb-2">
                        {formatDate(d.createdAt)}
                      </p>
                      <p className={`text-4xl font-extrabold mb-1 bg-gradient-to-r ${getGradeColor(d.overallScore)} bg-clip-text text-transparent drop-shadow`}>
                        Grade {getGrade(d.overallScore)}
                      </p>
                      <p className="text-sm text-slate-500 mb-3">Score: {d.overallScore}/100</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => pinResume(d.id)}
                          className={`px-4 py-1.5 rounded-full font-semibold shadow hover:scale-105 transition-all text-xs cursor-pointer ${d.isPinned
                              ? 'bg-yellow-400 text-black'
                              : 'bg-slate-700 text-slate-300 hover:bg-yellow-400/80 hover:text-black'
                            }`}
                        >
                          📌 {d.isPinned ? 'Pinned' : 'Pin'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* SECTION RADAR */}
            {activeTab === 'sections' && data[0]?.analysis?.sections && (
              <div className="bg-slate-900/80 p-8 rounded-2xl border border-violet-700/30 shadow-md">
                <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">Section Breakdown (Latest)</h2>
                <div className="max-w-lg mx-auto">
                  <Radar
                    data={{
                      labels: data[0].analysis.sections.map((s) => s.title),
                      datasets: [
                        {
                          label: 'Section Scores',
                          data: data[0].analysis.sections.map((s) => s.score),
                          backgroundColor: 'rgba(139,92,246,0.2)',
                          borderColor: '#8b5cf6',
                          borderWidth: 2,
                          pointBackgroundColor: '#8b5cf6',
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { labels: { color: '#a78bfa', font: { size: 14 } } },
                      },
                      scales: {
                        r: {
                          min: 0,
                          max: 100,
                          angleLines: { color: '#a78bfa33' },
                          grid: { color: '#a78bfa22' },
                          pointLabels: { color: '#f3e8ff', font: { size: 12 } },
                          ticks: { color: '#a78bfa', backdropColor: 'transparent', stepSize: 20 },
                        },
                      },
                    }}
                  />
                </div>
                {/* Section scores list */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
                  {data[0].analysis.sections.map((s) => {
                    const color = s.score >= 80 ? 'text-emerald-400 border-emerald-500/30' :
                      s.score >= 60 ? 'text-amber-400 border-amber-500/30' :
                        'text-red-400 border-red-500/30';
                    return (
                      <div key={s.title} className={`p-3 bg-slate-800/50 rounded-xl border ${color.split(' ')[1]} text-center`}>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{s.title}</p>
                        <p className={`text-xl font-bold ${color.split(' ')[0]}`}>{s.score}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SKILL IMPROVEMENT */}
            {activeTab === 'skills' && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">Skill Improvement</h2>
                {data[0]?.analysis?.sections ? (
                  data[0].analysis.sections.map((s) => {
                    const rec = COURSE_MAP[s.title];
                    if (!rec) return null;
                    const needsHelp = s.score < rec.threshold;
                    return (
                      <div
                        key={s.title}
                        className="p-6 bg-slate-900/80 border border-fuchsia-700/30 rounded-2xl shadow-md hover:shadow-fuchsia-500/20 transition-all duration-200"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-semibold text-white">{s.title}</h3>
                          <span className={`text-sm font-bold ${s.score >= rec.threshold ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {s.score}/{rec.threshold}
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="w-full h-2 bg-slate-800 rounded-full mb-4 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${s.score >= rec.threshold ? 'bg-emerald-500' : 'bg-amber-500'
                              }`}
                            style={{ width: `${Math.min(s.score, 100)}%` }}
                          />
                        </div>
                        {needsHelp ? (
                          <div className="flex gap-3">
                            <a
                              href={rec.videoUrl}
                              target="_blank"
                              className="px-4 py-2 bg-gradient-to-r from-red-600 to-pink-600 rounded-lg text-white font-semibold shadow hover:scale-105 transition-all text-sm"
                            >
                              ▶ Video Tutorial
                            </a>
                            <a
                              href={rec.courseUrl}
                              target="_blank"
                              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-lg text-white font-semibold shadow hover:scale-105 transition-all text-sm"
                            >
                              🎓 Online Course
                            </a>
                          </div>
                        ) : (
                          <p className="text-emerald-400 text-sm font-semibold">
                            ✅ Strong performance — keep going!
                          </p>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-slate-500 text-center py-10">No section data available yet</p>
                )}
              </div>
            )}

            {/* HISTORY */}
            {activeTab === 'history' && (
              <section className="space-y-4">
                <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">Analysis History</h2>
                {data.map((resume) => (
                  <div
                    key={resume.id}
                    className={`p-5 rounded-xl border transition hover:scale-[1.01] duration-200
                      ${resume.isPinned
                        ? 'bg-yellow-500/10 border-yellow-400/50'
                        : 'bg-slate-900/80 border-slate-700 hover:bg-slate-800/80 hover:border-violet-700/30'
                      }
                    `}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm text-slate-400">
                        {formatDateTime(resume.createdAt)}
                      </p>
                      <div className="flex items-center gap-3">
                        {resume.isPinned && (
                          <span className="px-3 py-1 text-xs bg-yellow-400 text-black rounded-full font-semibold">
                            📌 Pinned
                          </span>
                        )}
                        <span className={`px-3 py-1 text-xs rounded-full font-bold bg-gradient-to-r ${getGradeColor(resume.overallScore)} text-white`}>
                          {getGrade(resume.overallScore)}
                        </span>
                      </div>
                    </div>

                    <p className="text-lg font-semibold">
                      Overall Score: <span className="text-violet-400">{resume.overallScore}</span>
                    </p>

                    {resume.analysis?.sections && (
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
                        {resume.analysis.sections.map((s) => (
                          <div
                            key={s.title}
                            className="text-xs bg-slate-800/80 rounded-lg px-3 py-2 text-center"
                          >
                            <span className="text-slate-500">{s.title}</span>
                            <br />
                            <span className="font-bold text-slate-200">{s.score}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {/* EXPORT */}
            {activeTab === 'export' && (
              <div className="p-6 bg-slate-900/80 rounded-2xl border border-violet-700/30">
                <h2 className="text-xl font-bold mb-4 text-slate-200">Export Data</h2>
                <div className="flex gap-4">
                  <button
                    onClick={() => window.print()}
                    className="px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl font-semibold text-sm cursor-pointer hover:scale-105 transition-all shadow-lg"
                  >
                    🖨️ Print / Save PDF
                  </button>
                  <button
                    onClick={() => {
                      const json = JSON.stringify(data, null, 2);
                      const blob = new Blob([json], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = 'resume-analyses.json'; a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold text-sm cursor-pointer hover:scale-105 transition-all"
                  >
                    📥 Download JSON
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
