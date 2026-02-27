import { NextRequest, NextResponse } from "next/server";

const GITHUB_API = "https://api.github.com";

interface RepoData {
    name: string;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
    size: number;
    fork: boolean;
    updated_at: string;
    pushed_at: string;
    topics: string[];
    description: string | null;
}

export async function POST(req: NextRequest) {
    try {
        const { username } = await req.json();

        if (!username || typeof username !== "string" || username.trim().length === 0) {
            return NextResponse.json({ error: "Please provide a GitHub username." }, { status: 400 });
        }

        const clean = username.trim();

        // Fetch user profile
        const userRes = await fetch(`${GITHUB_API}/users/${clean}`, {
            headers: {
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "FocusEdu-App",
            },
        });

        if (!userRes.ok) {
            if (userRes.status === 404) {
                return NextResponse.json({ error: `GitHub user "${clean}" not found.` }, { status: 404 });
            }
            if (userRes.status === 403 || userRes.status === 429) {
                return NextResponse.json(
                    { error: "GitHub API rate limit exceeded. Please wait a minute and try again, or set a GITHUB_TOKEN environment variable." },
                    { status: 429 }
                );
            }
            return NextResponse.json({ error: "Failed to fetch GitHub profile." }, { status: userRes.status });
        }

        const userData = await userRes.json();

        // Fetch repos (up to 100)
        const reposRes = await fetch(`${GITHUB_API}/users/${clean}/repos?per_page=100&sort=updated`, {
            headers: {
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "FocusEdu-App",
            },
        });

        if (!reposRes.ok) {
            return NextResponse.json({ error: "Failed to fetch repositories." }, { status: reposRes.status });
        }

        const repos: RepoData[] = await reposRes.json();
        const ownRepos = repos.filter((r) => !r.fork);

        // ─── Languages ───────────────────────────────────────────────────
        const langCount: Record<string, number> = {};
        for (const repo of ownRepos) {
            if (repo.language) {
                langCount[repo.language] = (langCount[repo.language] || 0) + 1;
            }
        }
        const totalWithLang = Object.values(langCount).reduce((a, b) => a + b, 0);
        const languages = Object.entries(langCount)
            .sort((a, b) => b[1] - a[1])
            .map(([language, repoCount]) => ({
                language,
                repoCount,
                percentage: Math.round((repoCount / Math.max(totalWithLang, 1)) * 100),
            }));

        // ─── Activity ────────────────────────────────────────────────────
        const now = Date.now();
        const sixMonths = 180 * 24 * 60 * 60 * 1000;
        const twelveMonths = 365 * 24 * 60 * 60 * 1000;

        const recentPushDates = ownRepos.map((r) => new Date(r.pushed_at).getTime());
        const lastActivity = recentPushDates.length > 0 ? Math.max(...recentPushDates) : null;
        const daysSinceLastActivity = lastActivity ? Math.round((now - lastActivity) / (24 * 60 * 60 * 1000)) : null;
        const recentCommits = daysSinceLastActivity !== null && daysSinceLastActivity <= 30;
        const activeRepos = ownRepos.filter((r) => now - new Date(r.pushed_at).getTime() < sixMonths);

        let activityScore = 0;
        if (ownRepos.length >= 10) activityScore += 25;
        else if (ownRepos.length >= 5) activityScore += 15;
        else activityScore += 5;
        if (recentCommits) activityScore += 25;
        if (activeRepos.length >= 3) activityScore += 25;
        else if (activeRepos.length >= 1) activityScore += 10;
        if (languages.length >= 3) activityScore += 25;
        else if (languages.length >= 1) activityScore += 10;

        // ─── Complexity ──────────────────────────────────────────────────
        const totalStars = ownRepos.reduce((s, r) => s + r.stargazers_count, 0);
        const totalForks = ownRepos.reduce((s, r) => s + r.forks_count, 0);
        const avgSize = ownRepos.length > 0 ? Math.round(ownRepos.reduce((s, r) => s + r.size, 0) / ownRepos.length) : 0;
        const hasAdvanced = ownRepos.some((r) => r.size > 5000 || r.stargazers_count > 5);

        let complexityScore = 0;
        if (avgSize > 5000) complexityScore += 30;
        else if (avgSize > 1000) complexityScore += 20;
        else complexityScore += 5;
        if (hasAdvanced) complexityScore += 30;
        if (totalStars > 50) complexityScore += 20;
        else if (totalStars > 10) complexityScore += 10;
        if (totalForks > 10) complexityScore += 20;
        else if (totalForks > 3) complexityScore += 10;

        // ─── Recent Activity ─────────────────────────────────────────────
        const reposLast6 = ownRepos.filter((r) => now - new Date(r.pushed_at).getTime() < sixMonths).length;
        const reposLast12 = ownRepos.filter((r) => now - new Date(r.pushed_at).getTime() < twelveMonths).length;

        const monthCounts: Record<string, number> = {};
        for (const r of ownRepos) {
            const d = new Date(r.pushed_at);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            monthCounts[key] = (monthCounts[key] || 0) + 1;
        }
        const mostActiveMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

        let recentScore = 0;
        if (reposLast6 >= 5) recentScore += 50;
        else if (reposLast6 >= 2) recentScore += 30;
        else if (reposLast6 >= 1) recentScore += 15;
        if (reposLast12 >= 10) recentScore += 50;
        else if (reposLast12 >= 5) recentScore += 30;
        else recentScore += 10;

        // ─── Open Source ─────────────────────────────────────────────────
        const avgStars = ownRepos.length > 0 ? Math.round((totalStars / ownRepos.length) * 10) / 10 : 0;
        const topRepo = ownRepos.sort((a, b) => b.stargazers_count - a.stargazers_count)[0]?.name || "N/A";

        let osScore = 0;
        if (totalStars > 100) osScore += 40;
        else if (totalStars > 20) osScore += 25;
        else if (totalStars > 0) osScore += 10;
        if (totalForks > 20) osScore += 30;
        else if (totalForks > 5) osScore += 15;
        else if (totalForks > 0) osScore += 5;
        if (avgStars > 5) osScore += 30;
        else if (avgStars > 1) osScore += 15;
        else osScore += 5;

        // ─── Overall Score ───────────────────────────────────────────────
        const overallScore = Math.min(
            Math.round(activityScore * 0.3 + complexityScore * 0.25 + recentScore * 0.25 + osScore * 0.2),
            100
        );

        // ─── Summary & Recommendations ──────────────────────────────────
        let summary = "";
        if (overallScore >= 80) summary = `Impressive GitHub profile! ${clean} has a strong and active presence with diverse projects.`;
        else if (overallScore >= 60) summary = `Good GitHub profile. ${clean} shows consistent activity with room for growth in contributions.`;
        else if (overallScore >= 40) summary = `Moderate GitHub activity. ${clean} could benefit from more regular contributions and open-source work.`;
        else summary = `${clean}'s GitHub profile needs more activity. Start contributing to open-source and building personal projects.`;

        const recommendations: string[] = [];
        if (!recentCommits) recommendations.push("Push code more regularly — aim for weekly commits.");
        if (languages.length < 3) recommendations.push("Explore more languages to show versatility.");
        if (totalStars < 5) recommendations.push("Build projects that solve real problems to earn more stars.");
        if (activeRepos.length < 3) recommendations.push("Keep at least 3 projects actively maintained.");
        if (!hasAdvanced) recommendations.push("Work on larger, more complex projects to stand out.");
        if (ownRepos.length < 5) recommendations.push("Create more personal projects to showcase your skills.");
        if (recommendations.length === 0) recommendations.push("Keep up the great work and contribute to open source!");

        return NextResponse.json({
            overallScore,
            username: clean,
            profileUrl: userData.html_url,
            metrics: {
                languages,
                activity: {
                    totalRepos: ownRepos.length,
                    recentCommits,
                    daysSinceLastActivity,
                    activeReposCount: activeRepos.length,
                    score: Math.min(activityScore, 100),
                },
                complexity: {
                    averageRepoSize: avgSize,
                    hasAdvancedProjects: hasAdvanced,
                    totalStars,
                    totalForks,
                    score: Math.min(complexityScore, 100),
                },
                recentActivity: {
                    reposUpdatedLast6Months: reposLast6,
                    reposUpdatedLast12Months: reposLast12,
                    mostActiveMonth,
                    score: Math.min(recentScore, 100),
                },
                openSource: {
                    totalStars,
                    totalForks,
                    averageStarsPerRepo: avgStars,
                    topStarredRepo: topRepo,
                    score: Math.min(osScore, 100),
                },
            },
            summary,
            recommendations,
        });
    } catch (e: unknown) {
        console.error("GitHub analysis error:", e);
        const msg = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ error: `Analysis failed: ${msg}` }, { status: 500 });
    }
}
