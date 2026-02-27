"""
ATS Resume Scorer — FastAPI Server
===================================
Loads trained PKL models (TF-IDF + Random Forest) and exposes a /score endpoint.

Install:
    cd python_server
    pip install -r requirements.txt
    python -m spacy download en_core_web_sm

Run:
    uvicorn ats_server:app --host 0.0.0.0 --port 8000 --reload
"""

import re, os, datetime, math, warnings
warnings.filterwarnings("ignore")

import numpy as np
import joblib

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import spacy
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="ATS Resume Scorer API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE      = os.path.dirname(os.path.abspath(__file__))
MODELS    = os.path.join(os.path.dirname(BASE), "app", "ats_models")
TFIDF_PKL = os.path.join(MODELS, "tfidf_vectorizer.pkl")
RF_PKL    = os.path.join(MODELS, "rf_ats_scorer.pkl")

# ─── Skill & resume patterns ─────────────────────────────────────────────────
SKILL_PAT = [
    r'\bpython\b',r'\bmatlab\b',r'\bc\+\+\b',r'\bc/c\+\+\b',r'\bjava\b',
    r'\bsql\b',r'\blabview\b',r'\bspice\b',r'\bpcb\b',r'\brf\b',
    r'\bfpga\b',r'\bvhdl\b',r'\bverilog\b',r'\bawr\b',r'\bansoft\b',
    r'\bsas\b',r'\bspss\b',r'\bexcel\b',r'\bnumpy\b',r'\bpandas\b',
    r'\btensorflow\b',r'\bkeras\b',r'\bscikit\b',r'\bgit\b',r'\bdocker\b',
    r'\blinux\b',r'\baws\b',r'\bazure\b',r'\bgcp\b',r'\bjavascript\b',
    r'\bhtml\b',r'\bcss\b',r'\breact\b',r'\bnode\b',r'\bdjango\b',
    r'\bflask\b',r'\bmachine learning\b',r'\bdeep learning\b',
    r'\bdata analysis\b',r'\bdata science\b',r'\bstatistics\b',
    r'\bagile\b',r'\bscrum\b',r'\bdevops\b',r'\bkubernetes\b',
    r'\brest api\b',r'\bpower bi\b',r'\btableau\b',r'\bspark\b',
    r'\bmongodb\b',r'\bpostgresql\b',r'\bmysql\b',
    r'\btypescript\b',r'\bangular\b',r'\bvue\b',r'\bredis\b',r'\bgraphql\b',
    r'\brust\b',r'\bgolang\b',r'\bswift\b',r'\bkotlin\b',r'\bphp\b',
    r'\bruby\b',r'\bscala\b',r'\bhadoop\b',r'\bairflow\b',r'\bjenkins\b',
    r'\bterraform\b',r'\bansible\b',r'\bfigma\b',r'\bjira\b',
]

RESUME_PAT = [
    r'\bexperience\b',r'\beducation\b',r'\bskills\b',r'\bsummary\b',
    r'\bobjective\b',r'\bcertification\b',r'\bproject',r'\bemployment\b',
    r'\bqualification\b',r'\bachievement\b',r'\binternship\b',
    r'(bachelor|master|degree|b\.s|m\.s|ph\.d)',
    r'\bgpa\b',r'\buniversity\b',r'\bcollege\b',
]

# ─── Load models at startup ──────────────────────────────────────────────────
print("Loading NLP models...")
try:
    nlp = spacy.load("en_core_web_sm")
    print("  ✓ spaCy loaded")
except Exception as e:
    print(f"  ✗ spaCy failed: {e}")
    nlp = None

try:
    sbert = SentenceTransformer("all-MiniLM-L6-v2")
    print("  ✓ SentenceTransformer loaded")
except Exception as e:
    print(f"  ✗ SentenceTransformer failed: {e}")
    sbert = None

tfidf = None
if os.path.exists(TFIDF_PKL):
    try:
        tfidf = joblib.load(TFIDF_PKL)
        print(f"  ✓ TF-IDF vectorizer loaded from {TFIDF_PKL}")
    except Exception as e:
        print(f"  ✗ TF-IDF load error: {e}")
else:
    print(f"  ✗ TF-IDF not found at {TFIDF_PKL}")

rf = None
if os.path.exists(RF_PKL):
    try:
        rf = joblib.load(RF_PKL)
        print(f"  ✓ Random Forest model loaded from {RF_PKL}")
    except Exception as e:
        print(f"  ✗ RF load error: {e}")
else:
    print(f"  ✗ RF model not found at {RF_PKL}")

print("Model loading complete.\n")


# ─── Helpers ──────────────────────────────────────────────────────────────────
def clean(t):
    return re.sub(r"\s+", " ", re.sub(r"[^\x00-\x7F]+", " ", t)).strip().lower()

def get_kw(text):
    if not nlp:
        # Fallback: simple word extraction
        words = re.findall(r'\b[a-z]{3,}\b', text.lower())
        stop = {"the","and","for","are","was","were","been","have","has","had",
                "will","would","could","should","this","that","with","from",
                "they","their","them","your","you","our","not","but","can",
                "all","also","any","been","just","more","most","other","some",
                "such","than","very","about","after","into","over","only"}
        return list(set(w for w in words if w not in stop))[:80]

    doc = nlp(text[:50000])
    kws = set()
    for tok in doc:
        if not tok.is_stop and not tok.is_punct and tok.is_alpha and len(tok.text) > 2 \
                and tok.pos_ in ("NOUN","PROPN","ADJ"):
            kws.add(tok.lemma_.lower())
    for ch in doc.noun_chunks:
        c = ch.text.strip().lower()
        if 2 <= len(c.split()) <= 4:
            kws.add(c)
    return list(kws)[:80]

def get_skills(t):
    return list({p.replace(r"\b","").replace("\\","").strip()
                 for p in SKILL_PAT if re.search(p, t, re.IGNORECASE)})

def get_years(t):
    for pat in [r"(\d+)\+?\s*years?\s+of\s+experience",
                r"(\d+)\+?\s*years?\s+experience"]:
        m = re.search(pat, t, re.IGNORECASE)
        if m:
            return float(m.group(1))
    ranges = re.findall(r"(\d{4})\s*(?:to|-)\s*(\d{4}|current|present)", t, re.IGNORECASE)
    cy = datetime.datetime.now().year
    return float(sum(max(0, (cy if e.lower() in ("current","present") else int(e)) - int(s))
                     for s, e in ranges))


# ─── Section scorers ─────────────────────────────────────────────────────────
def score_contact(text):
    checks = {
        "email":    r"[\w.+-]+@[\w-]+\.\w+",
        "phone":    r"(\+?\d[\d\s\-().]{7,})",
        "linkedin": r"linkedin\.com",
        "location": r"\b(\d{5}|remote|[A-Z][a-z]+,\s*[A-Z]{2})\b",
    }
    tip_map = {
        "email":    "Add a professional email address",
        "phone":    "Include a phone number",
        "linkedin": "Add your LinkedIn profile URL",
        "location": "Add your city/state or mention 'Remote'",
    }
    tips, score = [], 0
    for key, pat in checks.items():
        if re.search(pat, text, re.IGNORECASE):
            score += 25
        else:
            tips.append(tip_map[key])
    msg = "Good contact information provided" if score >= 75 else \
          "Some contact details are missing" if score >= 50 else \
          "Contact section is incomplete"
    return min(score, 100), msg, tips

def score_summary(text):
    has_heading = bool(re.search(
        r"\b(summary|objective|profile|about me|professional summary)\b", text, re.IGNORECASE))
    lines = text.split("\n")
    in_sec, body_lines = False, 0
    for line in lines:
        if re.search(r"\b(summary|objective|profile)\b", line, re.IGNORECASE):
            in_sec = True; continue
        if in_sec:
            stripped = line.strip()
            if stripped and not re.search(r"\b(experience|education|skills|work)\b",
                                          stripped, re.IGNORECASE):
                body_lines += 1
            elif body_lines > 0:
                break
    if not has_heading:
        return 30, "No clear professional summary found", [
            "Add a professional summary at the top highlighting your key strengths",
            "Include 3-4 sentences covering your experience, skills, and career goals",
        ]
    if body_lines < 2:
        return 60, "Summary section found but it's too brief", [
            "Expand your summary to 3-4 sentences",
            "Mention your top skills, years of experience, and career goal",
        ]
    return 90, "Strong professional summary present", [
        "Tailor your summary keywords to match each specific job description",
    ]

def score_experience(text):
    has_section = bool(re.search(
        r"\b(experience|work history|employment|positions?)\b", text, re.IGNORECASE))
    has_bullets = (text.count("•") + text.count("·") + text.count("-")) > 3
    has_dates   = bool(re.search(
        r"\d{4}\s*[-–]\s*(\d{4}|present|current)", text, re.IGNORECASE))
    has_numbers = bool(re.search(
        r"\d+\s*(%|percent|million|\$|k\b|x\b)", text, re.IGNORECASE))

    score, tips = 0, []
    if has_section: score += 35
    else: tips.append("Add a clear 'Work Experience' section heading")
    if has_bullets: score += 25
    else: tips.append("Use bullet points to describe your responsibilities and achievements")
    if has_dates:   score += 25
    else: tips.append("Add start and end dates for each role (e.g. Jan 2020 – Present)")
    if has_numbers: score += 15
    else: tips.append("Quantify achievements with numbers (e.g. 'Increased efficiency by 30%')")

    msg = "Strong experience section with good details"          if score >= 85 else \
          "Good experience section, minor improvements needed"   if score >= 65 else \
          "Experience section needs more detail"                 if score >= 40 else \
          "Experience section is missing or very weak"
    return min(score, 100), msg, tips

def score_skills(text, res_skills, jd_skills, missing_skills):
    has_section = bool(re.search(
        r"\b(skills|technologies|tools|competencies|expertise|proficiencies)\b",
        text, re.IGNORECASE))
    matched = [s for s in jd_skills if s in res_skills]
    coverage_pct = len(matched) / max(len(jd_skills), 1)

    score, tips = 0, []
    if has_section: score += 40
    else: tips.append("Add a dedicated 'Skills & Technologies' section")
    score += int(coverage_pct * 60)

    if len(res_skills) < 5:
        tips.append("Add more technical and domain-specific skills")
    if missing_skills:
        tips.append(f"Consider adding in-demand skills: {', '.join(missing_skills[:5])}")
    if not tips:
        tips.append("Keep your skills section updated as you gain new tools")

    msg = "Comprehensive skills section present"       if score >= 80 else \
          "Skills section could be more comprehensive" if score >= 50 else \
          "Skills section is weak or missing"
    return min(score, 100), msg, tips

def score_education(text):
    has_edu   = bool(re.search(
        r"\b(education|degree|university|college|bachelor|master|ph\.?d|institute)\b",
        text, re.IGNORECASE))
    has_gpa   = bool(re.search(r"\bgpa\b", text, re.IGNORECASE))
    has_year  = bool(re.search(r"(20\d{2}|19\d{2})", text))
    has_certs = bool(re.search(
        r"\b(certified|certification|certificate|coursework|course|bootcamp|aws|pmp)\b",
        text, re.IGNORECASE))

    score, tips = 0, []
    if has_edu:   score += 55
    else: tips.append("Add your educational background (degree, institution, year)")
    if has_year:  score += 15
    else: tips.append("Include your graduation year")
    if has_gpa:   score += 15
    else: tips.append("Include GPA if it is 3.5 or above")
    if has_certs: score += 15
    else: tips.append("Include relevant coursework or certifications")

    msg = "Strong education section"                  if score >= 80 else \
          "Education section present"                 if score >= 55 else \
          "Education section is incomplete or missing"
    return min(score, 100), msg, tips


# ─── Master scorer ────────────────────────────────────────────────────────────
def run_scoring(resume_raw: str, has_tables: bool, jd_raw: str) -> dict:
    rc = clean(resume_raw)
    jc = clean(jd_raw)

    # Keywords (spaCy)
    jd_kw      = get_kw(jc)
    matched_kw = [k for k in jd_kw if k in rc]
    missing_kw = [k for k in jd_kw if k not in rc]

    # Skills
    jd_skills  = get_skills(jc)
    res_skills = get_skills(rc)
    miss_sk    = [s for s in jd_skills if s not in res_skills]

    # Years
    req_yrs = get_years(jc)
    res_yrs = get_years(rc)

    # ── TF-IDF similarity (trained model) ──
    if tfidf:
        try:
            rv = tfidf.transform([rc])
            jv = tfidf.transform([jc])
            tfidf_sim = float(cosine_similarity(rv, jv)[0][0])
        except Exception:
            tfidf_sim = len(matched_kw) / max(len(jd_kw), 1)
    else:
        tfidf_sim = len(matched_kw) / max(len(jd_kw), 1)

    # ── Semantic similarity (SentenceTransformer) ──
    if sbert:
        re_emb = sbert.encode([rc[:3000]], convert_to_numpy=True)
        jd_emb = sbert.encode([jc[:3000]], convert_to_numpy=True)
        sem_sim = float(cosine_similarity(re_emb, jd_emb)[0][0])
    else:
        sem_sim = tfidf_sim * 0.8  # rough fallback

    # ── ATS component scores ──
    kw_score  = round((0.6 * tfidf_sim + 0.4 * (len(matched_kw) / max(len(jd_kw), 1))) * 40, 2)
    sem_score = round(sem_sim * 30, 2)
    sk_score  = round(len([s for s in jd_skills if s in res_skills]) /
                       max(len(jd_skills), 1) * 10, 2)

    if req_yrs > 0:
        exp_score = round(min(res_yrs / req_yrs, 1.0) * 15, 2)
    else:
        exp_score = 15.0 if res_yrs > 0 else 7.5

    wc = len(rc.split())
    spec_ratio = len(re.findall(r"[^a-zA-Z0-9\s.,;:\-/()]", resume_raw)) / max(len(resume_raw), 1)
    fmt = 5.0
    fmt_issues = []
    if has_tables:
        fmt -= 2; fmt_issues.append("Replace tables with bullet lists for better ATS parsing")
    if spec_ratio > 0.05:
        fmt -= 1; fmt_issues.append(f"Reduce special characters (current: {spec_ratio:.1%})")
    if wc < 300:
        fmt -= 2; fmt_issues.append(f"Resume too short ({wc} words) — aim for 400+")
    fmt_score = max(0.0, fmt)

    rule_total = min(kw_score + sem_score + sk_score + exp_score + fmt_score, 100.0)

    # ── Random Forest prediction (trained on corpus) ──
    rf_score = None
    used_rf = False
    if rf:
        try:
            feats = {
                "keyword_score": kw_score,
                "semantic_score": sem_score,
                "skills_score": sk_score,
                "experience_score": exp_score,
                "formatting_score": fmt_score,
                "resume_years": res_yrs,
                "word_count": wc,
                "cosine_sim": sem_sim,
                "matched_keywords": len(matched_kw),
                "matched_skills": len([s for s in jd_skills if s in res_skills]),
            }
            X = np.array([[feats.get(f, 0) for f in rf["features"]]])
            rf_score = float(rf["model"].predict(X)[0])
            rf_score = round(min(max(rf_score, 0), 100), 1)
            used_rf = True
        except Exception as e:
            print(f"RF prediction error: {e}")

    final = round(0.6 * rf_score + 0.4 * rule_total, 1) if used_rf else round(rule_total, 1)
    final = min(final, 100.0)

    # Grade
    if   final >= 85: grade, gc = "Excellent",      "#22c55e"
    elif final >= 70: grade, gc = "Good Progress",  "#eab308"
    elif final >= 50: grade, gc = "Average",        "#f97316"
    else:             grade, gc = "Needs Work",     "#ef4444"

    hero_msgs = {
        "Excellent":     "Outstanding! Your resume is highly optimised and ready to impress recruiters.",
        "Good Progress": "Good foundation! With some improvements, your resume can stand out more to recruiters.",
        "Average":       "Your resume shows potential but needs several improvements to pass ATS filters.",
        "Needs Work":    "Your resume needs substantial improvements to be competitive in ATS screening.",
    }

    # Section scores
    contact_sc,  contact_msg,  contact_tips  = score_contact(resume_raw)
    summary_sc,  summary_msg,  summary_tips  = score_summary(resume_raw)
    exp_sc,      exp_msg,      exp_tips      = score_experience(resume_raw)
    skills_sc,   skills_msg,   skills_tips   = score_skills(rc, res_skills, jd_skills, miss_sk)
    edu_sc,      edu_msg,      edu_tips      = score_education(resume_raw)

    overall_section = round((contact_sc + summary_sc + exp_sc + skills_sc + edu_sc) / 5)

    return dict(
        final=final,
        ruleTotal=round(rule_total, 1),
        rfScore=rf_score,
        usedRf=used_rf,
        grade=grade,
        gradeColor=gc,
        heroMsg=hero_msgs[grade],
        overallSection=overall_section,
        sections=dict(
            contact    = dict(score=contact_sc,  title="Contact Information",   msg=contact_msg,  tips=contact_tips),
            summary    = dict(score=summary_sc,  title="Professional Summary",  msg=summary_msg,  tips=summary_tips),
            experience = dict(score=exp_sc,      title="Work Experience",       msg=exp_msg,      tips=exp_tips),
            skills     = dict(score=skills_sc,   title="Skills & Technologies", msg=skills_msg,   tips=skills_tips),
            education  = dict(score=edu_sc,      title="Education",             msg=edu_msg,      tips=edu_tips),
        ),
        kwScore=kw_score,
        semScore=sem_score,
        skScore=sk_score,
        expScore=exp_score,
        fmtScore=fmt_score,
        matchedKw=matched_kw[:30],
        missingKw=missing_kw[:20],
        jdSkills=jd_skills,
        resSkills=res_skills,
        missSkills=miss_sk,
        reqYrs=req_yrs,
        resYrs=res_yrs,
        wc=wc,
        fmtIssues=fmt_issues,
        tfidfSim=round(tfidf_sim, 4),
        semSim=round(sem_sim, 4),
        specRatio=round(spec_ratio, 3),
        hasTables=has_tables,
    )


# ─── Request / Response models ───────────────────────────────────────────────
class ScoreRequest(BaseModel):
    resume_text: str
    job_description: str
    has_tables: bool = False


# ─── Endpoints ────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "models": {
            "spacy":  nlp is not None,
            "sbert":  sbert is not None,
            "tfidf":  tfidf is not None,
            "rf":     rf is not None,
        }
    }

@app.post("/score")
def score_resume(req: ScoreRequest):
    if len(req.resume_text.strip()) < 100:
        raise HTTPException(400, "Resume text too short (min 100 chars).")
    if len(req.job_description.strip()) < 50:
        raise HTTPException(400, "Job description too short (min 50 chars).")

    # Validate it looks like a resume
    hits = sum(1 for p in RESUME_PAT if re.search(p, req.resume_text, re.IGNORECASE))
    if hits < 3:
        raise HTTPException(400,
            f"Doesn't look like a resume ({hits}/3 sections found). "
            "Add Experience, Education, and Skills sections.")

    result = run_scoring(req.resume_text, req.has_tables, req.job_description)
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("ats_server:app", host="0.0.0.0", port=8000, reload=True)
