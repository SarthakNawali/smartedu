import { NextRequest, NextResponse } from "next/server";

const PYTHON_SERVER = process.env.ATS_PYTHON_URL || "http://localhost:8000";

// ─── Resume validation patterns ─────────────────────────────────────────────
const RESUME_PATTERNS: RegExp[] = [
    /\bexperience\b/i, /\beducation\b/i, /\bskills\b/i, /\bsummary\b/i,
    /\bobjective\b/i, /\bcertification\b/i, /\bproject/i, /\bemployment\b/i,
    /\bqualification\b/i, /\bachievement\b/i, /\binternship\b/i,
    /(bachelor|master|degree|b\.s|m\.s|ph\.d)/i,
    /\bgpa\b/i, /\buniversity\b/i, /\bcollege\b/i,
];

// ─── POST handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("resume") as File | null;
        const jdText = formData.get("jobDescription") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No resume file provided." }, { status: 400 });
        }
        if (!jdText || jdText.trim().length < 50) {
            return NextResponse.json({ error: "Job description must be at least 50 characters." }, { status: 400 });
        }

        // Extract text from PDF
        const buffer = Buffer.from(await file.arrayBuffer());

        // Validate PDF header
        if (!buffer.subarray(0, 5).toString().startsWith("%PDF")) {
            return NextResponse.json({ error: "Invalid PDF file (bad header)." }, { status: 400 });
        }

        let text = "";
        try {
            // Import from lib path directly to avoid pdf-parse's test file loading bug
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const pdfParse = require("pdf-parse/lib/pdf-parse.js");
            const data = await pdfParse(buffer);
            text = data.text || "";
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            return NextResponse.json({ error: `Cannot parse PDF: ${msg}` }, { status: 400 });
        }

        if (text.trim().length < 100) {
            return NextResponse.json({
                error: "No readable text found. Scanned PDFs are not supported — use a text-based PDF.",
            }, { status: 400 });
        }

        // Validate it looks like a resume
        const hits = RESUME_PATTERNS.filter(p => p.test(text)).length;
        if (hits < 3) {
            return NextResponse.json({
                error: `This doesn't appear to be a resume (${hits}/3 required sections found). Make sure it includes Experience, Education, and Skills sections.`,
            }, { status: 400 });
        }

        // ── Call Python scoring server ──────────────────────────────────
        try {
            const pyRes = await fetch(`${PYTHON_SERVER}/score`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resume_text: text,
                    job_description: jdText,
                    has_tables: false,
                }),
            });

            if (!pyRes.ok) {
                const pyErr = await pyRes.json().catch(() => ({ detail: "Unknown error" }));
                return NextResponse.json(
                    { error: pyErr.detail || "Python scoring server error." },
                    { status: pyRes.status }
                );
            }

            const result = await pyRes.json();
            return NextResponse.json(result);

        } catch (fetchErr: unknown) {
            // Python server unreachable — fall back to rule-based scoring
            console.warn("Python server unreachable, using rule-based fallback:", fetchErr);
            const result = runFallbackScoring(text, false, jdText);
            return NextResponse.json(result);
        }

    } catch (e: unknown) {
        console.error("Resume analysis error:", e);
        const msg = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ error: `Analysis failed: ${msg}` }, { status: 500 });
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// RULE-BASED FALLBACK (used when Python server is offline)
// ═══════════════════════════════════════════════════════════════════════════════

const SKILL_PATTERNS: string[] = [
    "python", "matlab", "c\\+\\+", "java", "sql", "labview", "spice", "pcb", "rf",
    "fpga", "vhdl", "verilog", "excel", "numpy", "pandas", "tensorflow", "keras",
    "scikit", "git", "docker", "linux", "aws", "azure", "gcp", "javascript", "html",
    "css", "react", "node", "django", "flask", "machine learning", "deep learning",
    "data analysis", "data science", "statistics", "agile", "scrum", "devops",
    "kubernetes", "rest api", "power bi", "tableau", "spark", "mongodb", "postgresql",
    "mysql", "typescript", "angular", "vue", "redis", "graphql", "rust", "golang",
    "swift", "kotlin", "php", "ruby", "scala", "hadoop", "airflow", "jenkins",
    "terraform", "ansible", "figma", "jira",
];

const STOP_WORDS = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
    "from", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do",
    "does", "did", "will", "would", "could", "should", "may", "might", "can", "shall",
    "this", "that", "these", "those", "it", "its", "i", "me", "my", "we", "our", "you",
    "your", "he", "his", "she", "her", "they", "their", "them", "not", "no", "nor",
    "so", "if", "then", "than", "too", "very", "just", "about", "above", "after", "again",
    "all", "also", "am", "any", "as", "because", "before", "between", "both", "each",
    "few", "get", "got", "here", "how", "into", "more", "most", "must", "new", "now",
    "off", "old", "once", "only", "other", "out", "over", "own", "same", "some", "still",
    "such", "take", "tell", "through", "under", "up", "us", "use", "using", "want",
    "well", "what", "when", "where", "which", "while", "who", "why", "work", "working",
    "etc", "per", "via", "able", "across", "within", "without", "along", "including",
    "include", "includes", "based", "ensure", "strong", "good", "great", "excellent",
]);

function clean(t: string): string {
    return t.replace(/[^\x00-\x7F]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function getSkills(text: string): string[] {
    const found = new Set<string>();
    for (const pat of SKILL_PATTERNS) {
        if (new RegExp(`\\b${pat}\\b`, "i").test(text))
            found.add(pat.replace(/\\\+/g, "+").replace(/\\\./g, ".").trim());
    }
    return Array.from(found);
}

function getYears(text: string): number {
    const m = text.match(/(\d+)\+?\s*years?\s+(?:of\s+)?experience/i);
    if (m) return parseFloat(m[1]);
    const ranges = [...text.matchAll(/(\d{4})\s*(?:to|-|–)\s*(\d{4}|current|present)/gi)];
    const cy = new Date().getFullYear();
    let total = 0;
    for (const [, s, e] of ranges) {
        total += Math.max(0, (/current|present/i.test(e) ? cy : parseInt(e)) - parseInt(s));
    }
    return total;
}

function extractKeywords(text: string): string[] {
    const words = text.toLowerCase().replace(/[^a-z0-9\s\-\/.]/g, " ").split(/\s+/);
    const kw = new Set<string>();
    for (const w of words)
        if (w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w)) kw.add(w);
    for (let i = 0; i < words.length - 1; i++) {
        const w1 = words[i], w2 = words[i + 1];
        if (w1.length > 2 && w2.length > 2 && !STOP_WORDS.has(w1) && !STOP_WORDS.has(w2))
            kw.add(`${w1} ${w2}`);
    }
    return Array.from(kw).slice(0, 80);
}

function scoreContact(text: string) {
    const checks: Record<string, RegExp> = {
        email: /[\w.+-]+@[\w-]+\.\w+/, phone: /(\+?\d[\d\s\-().]{7,})/,
        linkedin: /linkedin\.com/i, location: /\b(\d{5}|remote|[A-Z][a-z]+,\s*[A-Z]{2})\b/,
    };
    const tipMap: Record<string, string> = {
        email: "Add a professional email address", phone: "Include a phone number",
        linkedin: "Add your LinkedIn profile URL", location: "Add your city/state or mention 'Remote'",
    };
    let score = 0; const tips: string[] = [];
    for (const [k, p] of Object.entries(checks)) { if (p.test(text)) score += 25; else tips.push(tipMap[k]); }
    return {
        score: Math.min(score, 100),
        msg: score >= 75 ? "Good contact information provided" : score >= 50 ? "Some contact details are missing" : "Contact section is incomplete",
        tips
    };
}

function scoreSummary(text: string) {
    const has = /\b(summary|objective|profile|about me|professional summary)\b/i.test(text);
    const lines = text.split("\n"); let inS = false, bl = 0;
    for (const l of lines) {
        if (/\b(summary|objective|profile)\b/i.test(l)) { inS = true; continue; }
        if (inS) { const s = l.trim(); if (s && !/\b(experience|education|skills|work)\b/i.test(s)) bl++; else if (bl > 0) break; }
    }
    if (!has) return {
        score: 30, msg: "No clear professional summary found",
        tips: ["Add a professional summary at the top highlighting your key strengths",
            "Include 3-4 sentences covering your experience, skills, and career goals"]
    };
    if (bl < 2) return {
        score: 60, msg: "Summary section found but it's too brief",
        tips: ["Expand your summary to 3-4 sentences", "Mention your top skills, years of experience, and career goal"]
    };
    return {
        score: 90, msg: "Strong professional summary present",
        tips: ["Tailor your summary keywords to match each specific job description"]
    };
}

function scoreExperience(text: string) {
    const sec = /\b(experience|work history|employment|positions?)\b/i.test(text);
    const bul = (text.match(/[•·\-]/g) || []).length > 3;
    const dat = /\d{4}\s*[-–]\s*(\d{4}|present|current)/i.test(text);
    const num = /\d+\s*(%|percent|million|\$|k\b|x\b)/i.test(text);
    let score = 0; const tips: string[] = [];
    if (sec) score += 35; else tips.push("Add a clear 'Work Experience' section heading");
    if (bul) score += 25; else tips.push("Use bullet points to describe your responsibilities and achievements");
    if (dat) score += 25; else tips.push("Add start and end dates for each role (e.g. Jan 2020 – Present)");
    if (num) score += 15; else tips.push("Quantify achievements with numbers (e.g. 'Increased efficiency by 30%')");
    return {
        score: Math.min(score, 100),
        msg: score >= 85 ? "Strong experience section with good details" : score >= 65 ? "Good experience section, minor improvements needed" : score >= 40 ? "Experience section needs more detail" : "Experience section is missing or very weak",
        tips
    };
}

function scoreSkills(text: string, res: string[], jd: string[], miss: string[]) {
    const has = /\b(skills|technologies|tools|competencies|expertise|proficiencies)\b/i.test(text);
    const cov = jd.filter(s => res.includes(s)).length / Math.max(jd.length, 1);
    let score = 0; const tips: string[] = [];
    if (has) score += 40; else tips.push("Add a dedicated 'Skills & Technologies' section");
    score += Math.round(cov * 60);
    if (res.length < 5) tips.push("Add more technical and domain-specific skills");
    if (miss.length > 0) tips.push(`Consider adding in-demand skills: ${miss.slice(0, 5).join(", ")}`);
    if (tips.length === 0) tips.push("Keep your skills section updated as you gain new tools");
    return {
        score: Math.min(score, 100),
        msg: score >= 80 ? "Comprehensive skills section present" : score >= 50 ? "Skills section could be more comprehensive" : "Skills section is weak or missing",
        tips
    };
}

function scoreEducation(text: string) {
    const edu = /\b(education|degree|university|college|bachelor|master|ph\.?d|institute)\b/i.test(text);
    const gpa = /\bgpa\b/i.test(text);
    const yr = /(20\d{2}|19\d{2})/.test(text);
    const cert = /\b(certified|certification|certificate|coursework|course|bootcamp|aws|pmp)\b/i.test(text);
    let score = 0; const tips: string[] = [];
    if (edu) score += 55; else tips.push("Add your educational background (degree, institution, year)");
    if (yr) score += 15; else tips.push("Include your graduation year");
    if (gpa) score += 15; else tips.push("Include GPA if it is 3.5 or above");
    if (cert) score += 15; else tips.push("Include relevant coursework or certifications");
    return {
        score: Math.min(score, 100),
        msg: score >= 80 ? "Strong education section" : score >= 55 ? "Education section present" : "Education section is incomplete or missing",
        tips
    };
}

function runFallbackScoring(resumeRaw: string, hasTables: boolean, jdRaw: string) {
    const rc = clean(resumeRaw), jc = clean(jdRaw);
    const jdKw = extractKeywords(jc);
    const matchedKw = jdKw.filter(k => rc.includes(k));
    const missingKw = jdKw.filter(k => !rc.includes(k));
    const jdSkills = getSkills(jc), resSkills = getSkills(rc);
    const missSkills = jdSkills.filter(s => !resSkills.includes(s));
    const reqYrs = getYears(jc), resYrs = getYears(rc);

    const tfidfSim = (() => {
        const rW = new Set(rc.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w)));
        const jW = new Set(jc.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w)));
        if (!jW.size) return 0; let o = 0; for (const w of jW) if (rW.has(w)) o++; return o / jW.size;
    })();

    const semSim = (() => {
        const rBi = new Set<string>(); const rW = rc.split(/\s+/);
        for (let i = 0; i < rW.length - 1; i++) rBi.add(`${rW[i]} ${rW[i + 1]}`);
        const jW = jc.split(/\s+/); let m = 0, t = 0;
        for (let i = 0; i < jW.length - 1; i++) { t++; if (rBi.has(`${jW[i]} ${jW[i + 1]}`)) m++; }
        return Math.min(0.7 * tfidfSim + 0.3 * (t > 0 ? m / t : 0) + 0.1, 1.0);
    })();

    const kwScore = Math.round((0.6 * tfidfSim + 0.4 * (matchedKw.length / Math.max(jdKw.length, 1))) * 40 * 100) / 100;
    const semScore = Math.round(semSim * 30 * 100) / 100;
    const skScore = Math.round((jdSkills.filter(s => resSkills.includes(s)).length / Math.max(jdSkills.length, 1)) * 10 * 100) / 100;
    const expScore = reqYrs > 0 ? Math.round(Math.min(resYrs / reqYrs, 1) * 15 * 100) / 100 : resYrs > 0 ? 15 : 7.5;
    const wc = rc.split(/\s+/).length;
    const specRatio = (resumeRaw.match(/[^a-zA-Z0-9\s.,;:\-/()]/g) || []).length / Math.max(resumeRaw.length, 1);
    let fmt = 5; const fmtIssues: string[] = [];
    if (hasTables) { fmt -= 2; fmtIssues.push("Replace tables with bullet lists for better ATS parsing"); }
    if (specRatio > 0.05) { fmt -= 1; fmtIssues.push(`Reduce special characters (current: ${(specRatio * 100).toFixed(1)}%)`); }
    if (wc < 300) { fmt -= 2; fmtIssues.push(`Resume too short (${wc} words) — aim for 400+`); }
    const fmtScore = Math.max(0, fmt);

    const ruleTotal = Math.min(kwScore + semScore + skScore + expScore + fmtScore, 100);
    const final = Math.round(ruleTotal * 10) / 10;

    let grade: string, gradeColor: string;
    if (final >= 85) { grade = "Excellent"; gradeColor = "#22c55e"; }
    else if (final >= 70) { grade = "Good Progress"; gradeColor = "#eab308"; }
    else if (final >= 50) { grade = "Average"; gradeColor = "#f97316"; }
    else { grade = "Needs Work"; gradeColor = "#ef4444"; }

    const heroMsgs: Record<string, string> = {
        Excellent: "Outstanding! Your resume is highly optimised and ready to impress recruiters.",
        "Good Progress": "Good foundation! With some improvements, your resume can stand out more to recruiters.",
        Average: "Your resume shows potential but needs several improvements to pass ATS filters.",
        "Needs Work": "Your resume needs substantial improvements to be competitive in ATS screening.",
    };

    const contact = scoreContact(resumeRaw), summary = scoreSummary(resumeRaw);
    const experience = scoreExperience(resumeRaw), skills = scoreSkills(rc, resSkills, jdSkills, missSkills);
    const education = scoreEducation(resumeRaw);
    const overallSection = Math.round((contact.score + summary.score + experience.score + skills.score + education.score) / 5);

    return {
        final, ruleTotal: Math.round(ruleTotal * 10) / 10, rfScore: null, usedRf: false,
        grade, gradeColor, heroMsg: heroMsgs[grade], overallSection,
        sections: {
            contact: { score: contact.score, title: "Contact Information", msg: contact.msg, tips: contact.tips },
            summary: { score: summary.score, title: "Professional Summary", msg: summary.msg, tips: summary.tips },
            experience: { score: experience.score, title: "Work Experience", msg: experience.msg, tips: experience.tips },
            skills: { score: skills.score, title: "Skills & Technologies", msg: skills.msg, tips: skills.tips },
            education: { score: education.score, title: "Education", msg: education.msg, tips: education.tips },
        },
        kwScore, semScore, skScore, expScore, fmtScore,
        matchedKw: matchedKw.slice(0, 30), missingKw: missingKw.slice(0, 20),
        jdSkills, resSkills, missSkills, reqYrs, resYrs, wc, fmtIssues,
        tfidfSim: Math.round(tfidfSim * 10000) / 10000,
        semSim: Math.round(semSim * 10000) / 10000,
        specRatio: Math.round(specRatio * 1000) / 1000, hasTables: false,
    };
}
