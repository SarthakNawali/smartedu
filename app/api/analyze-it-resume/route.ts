import { NextRequest, NextResponse } from "next/server";
import { runFallbackScoring } from "../analyze-resume/route";

const PYTHON_SERVER = process.env.ATS_PYTHON_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("resume") as File | null;
        const rejectionCount = formData.get("rejectionCount") as string | null;
        let groqApiKey = formData.get("groqApiKey") as string | null;
        if (!groqApiKey) {
            groqApiKey = process.env.GROQ_API_KEY || null;
            if (!groqApiKey) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const envPath = path.join(process.cwd(), 'app', '.env');
                    const envFile = fs.readFileSync(envPath, 'utf8');
                    const match = envFile.match(/GROQ_API_KEY=(.*)/);
                    if (match) groqApiKey = match[1].trim();
                } catch (e) {}
            }
        }

        if (!file) {
            return NextResponse.json({ error: "No resume file provided." }, { status: 400 });
        }

        // Extract text from PDF
        const buffer = Buffer.from(await file.arrayBuffer());
        if (!buffer.subarray(0, 5).toString().startsWith("%PDF")) {
            return NextResponse.json({ error: "Invalid PDF file (bad header)." }, { status: 400 });
        }

        let resumeText = "";
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const pdfParse = require("pdf-parse/lib/pdf-parse.js");
            const data = await pdfParse(buffer);
            resumeText = data.text || "";
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            return NextResponse.json({ error: `Cannot parse PDF: ${msg}` }, { status: 400 });
        }

        if (resumeText.trim().length < 100) {
            return NextResponse.json({
                error: "No readable text found. Scanned PDFs are not supported — use a text-based PDF.",
            }, { status: 400 });
        }

        let pythonResult: any;
        let pythonGeneralResult: any;
        try {
            const pyRes = await fetch(`${PYTHON_SERVER}/score-it-engineer`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resume_text: resumeText }),
            });

            if (!pyRes.ok) {
                const pyErr = await pyRes.json().catch(() => ({ detail: "Unknown error" }));
                return NextResponse.json({ error: pyErr.detail || "Python scoring server error." }, { status: pyRes.status });
            }
            pythonResult = await pyRes.json();
            // Evaluate the general scoring metric (0-100) and sections for dashboard natively
            pythonGeneralResult = runFallbackScoring(
                resumeText, 
                false, 
                "Software Engineer IT Developer Programmer Frameworks Backend Frontend Cloud AI SQL Database React Node Python DevOps"
            );
        } catch (fetchErr: unknown) {
            console.error(fetchErr);
            return NextResponse.json({ error: "Python server unreachable or failed." }, { status: 500 });
        }

        let recommendations = null;
        if (groqApiKey && groqApiKey.startsWith("gsk_")) {
            try {
                const skillsStr = pythonResult.skills_found && pythonResult.skills_found.length > 0 
                    ? pythonResult.skills_found.join(', ') : 'None';
                
                let missingStr = "";
                const cats = ['Languages', 'Cloud & DevOps', 'Databases', 'Frameworks'];
                for (const cat of cats) {
                    if (pythonResult.missing_skills[cat] && pythonResult.missing_skills[cat].length > 0) {
                        missingStr += `\n${cat}: ${pythonResult.missing_skills[cat].slice(0, 3).join(', ')}`;
                    }
                }

                const prompt = `You are an expert IT recruiter providing brief, actionable resume feedback.

CANDIDATE PROFILE:
- Skills Found: ${skillsStr}
- Years Experience: ${pythonResult.years_experience.toFixed(0)}
- Resume Length: ${pythonResult.word_count} words
- Total IT Skills: ${pythonResult.total_skills_found}

REJECTION HISTORY:
- Candidate reported: ${rejectionCount || 1} rejection(s)
- ML Model predicts: ${pythonResult.rejection_risk} rejections

MISSING SKILLS:${missingStr}

Please provide a VERY SHORT and easy-to-read summary:
1. Overall Verdict (1 short sentence)
2. Top 3 MUST-ADD skills (bullet points)
3. Top 3 Quick Fixes for the resume (bullet points)

Be encouraging but extremely concise. Do not write long paragraphs.`;

                const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${groqApiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "llama-3.1-8b-instant",
                        max_tokens: 800,
                        messages: [{ role: "user", content: prompt }]
                    })
                });

                if (groqRes.ok) {
                    const groqData = await groqRes.json();
                    recommendations = groqData.choices[0]?.message?.content || null;
                } else {
                    const errorResponse = await groqRes.json().catch(() => ({}));
                    console.error("Groq API error:", errorResponse);
                    recommendations = `⚠️ Groq API Error: ${errorResponse?.error?.message || "Verify your API key."}`;
                }
            } catch (e: unknown) {
                console.error("Groq AI failure:", e);
                recommendations = "⚠️ Error fetching recommendations from Groq AI.";
            }
        }

        return NextResponse.json({
            ...pythonGeneralResult,
            ...pythonResult,
            recommendations
        });

    } catch (e: unknown) {
        console.error("Resume analysis error:", e);
        const msg = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ error: `Analysis failed: ${msg}` }, { status: 500 });
    }
}
