"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const colors = {
    primary: "#004ac6",
    onPrimary: "#ffffff",
    onPrimaryFixedVariant: "#003ea8",
    primaryFixed: "#dbe1ff",
    primaryFixedDim: "#b4c5ff",
    surface: "#f8f9ff",
    surfaceContainerLow: "#eff4ff",
    surfaceContainerLowest: "#ffffff",
    surfaceContainerHigh: "#dce9ff",
    surfaceContainerHighest: "#d3e4fe",
    onSurface: "#0b1c30",
    onSurfaceVariant: "#434655",
    outline: "#737686",
    outlineVariant: "#c3c6d7",
    error: "#ba1a1a",
    secondary: "#565e74",
    secondaryContainer: "#dae2fd",
    background: "#f8f9ff",
};

interface Checkin {
    id: string;
    idea_id: string;
    day_number: number;
    task_description: string;
    estimated_minutes: number;
    evidence_reward: number;
    completed: boolean;
    evidence_note: string | null;
    evidence_link: string | null;
}

interface Idea {
    id: string;
    problem: string;
    customer: string;
    current_solution: string;
    frequency: string;
    consequence: string;
    why_you: string;
    evidence_level: string;
    goal: string;
}

interface ReportJson {
    verdict?: string;
    confidence?: string;
    biggestRisk?: { assumption: string; failureScenario: string };
}

type ActiveView = "dashboard" | "sprint" | "evidence" | "ideas" | "profile";

export default function DashboardPage() {
    const [user, setUser] = useState<any>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [dataLoading, setDataLoading] = useState(true);
    const [idea, setIdea] = useState<Idea | null>(null);
    const [report, setReport] = useState<ReportJson | null>(null);
    const [checkins, setCheckins] = useState<Checkin[]>([]);
    const [activeView, setActiveView] = useState<ActiveView>("dashboard");

    const [evidenceNote, setEvidenceNote] = useState("");
    const [evidenceLink, setEvidenceLink] = useState("");
    const [submitError, setSubmitError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [scoreBeforeSubmit, setScoreBeforeSubmit] = useState(0);
    const [approvalReason, setApprovalReason] = useState("");

    useEffect(() => {
        if (supabase) {
            supabase.auth.getSession().then(({ data: { session } }) => {
                setUser(session?.user ?? null);
                setAuthLoading(false);
            });
            const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
                setUser(session?.user ?? null);
                setAuthLoading(false);
            });
            return () => subscription.unsubscribe();
        } else {
            setAuthLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!user || !supabase) return;
        fetchDashboardData();
    }, [user]);

    const fetchDashboardData = async () => {
        if (!supabase || !user) return;
        setDataLoading(true);
        try {
            const { data: ideaRows, error: ideaErr } = await supabase
                .from("ideas")
                .select("id, problem, customer, current_solution, frequency, consequence, why_you, evidence_level, goal")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(1);

            if (ideaErr) throw ideaErr;
            if (!ideaRows || ideaRows.length === 0) {
                setIdea(null);
                setDataLoading(false);
                return;
            }

            const latestIdea = ideaRows[0] as Idea;
            setIdea(latestIdea);

            const { data: reportRows } = await supabase
                .from("reports")
                .select("raw_json")
                .eq("idea_id", latestIdea.id)
                .order("created_at", { ascending: false })
                .limit(1);

            if (reportRows && reportRows.length > 0) {
                setReport(reportRows[0].raw_json as ReportJson);
            }

            const { data: checkinRows } = await supabase
                .from("checkins")
                .select("*")
                .eq("idea_id", latestIdea.id)
                .order("day_number", { ascending: true });

            setCheckins((checkinRows as Checkin[]) || []);
        } catch (err: any) {
            console.error("Dashboard fetch error:", err);
        } finally {
            setDataLoading(false);
        }
    };

    const totalRewards = checkins.reduce((sum, c) => sum + (c.evidence_reward || 0), 0);
    const completedRewards = checkins.filter(c => c.completed).reduce((sum, c) => sum + (c.evidence_reward || 0), 0);
    const evidenceScore = totalRewards > 0 ? Math.round((completedRewards / totalRewards) * 100) : 0;
    const completedCount = checkins.filter(c => c.completed).length;
    const daysRemaining = Math.max(checkins.length - completedCount, 0);
    const todaysTask = checkins.find(c => !c.completed) || null;
    const allComplete = checkins.length > 0 && checkins.every(c => c.completed);
    const ideaLabel = idea?.goal || (idea?.problem ? idea.problem.slice(0, 40) + "…" : "—");

    const handleMarkComplete = async () => {
        if (!todaysTask || !supabase) return;
        if (!evidenceNote.trim() && !evidenceLink.trim()) {
            setSubmitError("Please provide at least one piece of evidence.");
            return;
        }
        setSubmitError("");
        setSubmitting(true);
        setScoreBeforeSubmit(evidenceScore);

        try {
            const verifyResponse = await fetch("/api/verify-evidence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    taskDescription: todaysTask.task_description,
                    evidenceNote: evidenceNote.trim(),
                    evidenceLink: evidenceLink.trim(),
                }),
            });
            const verifyResult = await verifyResponse.json();

            if (!verifyResult.approved) {
                setSubmitError(verifyResult.reason || "This evidence doesn't seem to match today's task. Please add more detail.");
                setSubmitting(false);
                return;
            }

            const { error } = await supabase
                .from("checkins")
                .update({
                    completed: true,
                    evidence_note: evidenceNote.trim() || null,
                    evidence_link: evidenceLink.trim() || null,
                    ai_quality_score: verifyResult.score ?? null,
                })
                .eq("id", todaysTask.id);

            if (error) throw error;

            setCheckins(prev =>
                prev.map(c =>
                    c.id === todaysTask.id
                        ? { ...c, completed: true, evidence_note: evidenceNote.trim() || null, evidence_link: evidenceLink.trim() || null }
                        : c
                )
            );
            setEvidenceNote("");
            setEvidenceLink("");
            setApprovalReason(verifyResult.reason || "");
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 5000);
        } catch (err: any) {
            setSubmitError(err.message || "Failed to save. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const navItem = (view: ActiveView, icon: string, label: string) => (
        <a
            href="#"
            className="dash-link"
            onClick={(e) => { e.preventDefault(); setActiveView(view); }}
            style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                borderRadius: 8,
                background: activeView === view ? colors.primary : "transparent",
                color: activeView === view ? colors.onPrimary : colors.onSurfaceVariant,
                textDecoration: "none",
            }}
        >
            <span className="material-symbols-outlined">{icon}</span>
            <span style={{ fontSize: 14 }}>{label}</span>
        </a>
    );

    if (authLoading || (user && dataLoading)) {
        return (
            <div style={{ background: colors.surface, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 32, height: 32, border: `3px solid ${colors.surfaceContainerHighest}`, borderTop: `3px solid ${colors.primary}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (!user) {
        return (
            <div style={{ background: colors.surface, minHeight: "100vh", fontFamily: "Inter, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
                <div style={{ width: 48, height: 48, background: "#1a1f2e", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                    <div style={{ width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderBottom: "17px solid white" }} />
                </div>
                <h2 style={{ fontSize: 28, fontWeight: 800, color: colors.onSurface, marginBottom: 12 }}>Sign in to view your dashboard</h2>
                <a href="/validate" style={{ background: colors.primary, color: "#fff", padding: "14px 32px", borderRadius: 12, fontSize: 16, fontWeight: 700, textDecoration: "none" }}>
                    Go to Validate →
                </a>
            </div>
        );
    }

    if (!idea) {
        return (
            <div style={{ background: colors.surface, minHeight: "100vh", fontFamily: "Inter, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
                <h2 style={{ fontSize: 28, fontWeight: 800, color: colors.onSurface, marginBottom: 12 }}>No active idea yet</h2>
                <a href="/validate" style={{ background: colors.primary, color: "#fff", padding: "14px 32px", borderRadius: 12, fontSize: 16, fontWeight: 700, textDecoration: "none" }}>
                    Validate an Idea →
                </a>
            </div>
        );
    }

    return (
        <div style={{ fontFamily: "Inter, sans-serif", background: colors.background, color: colors.onSurface, WebkitFontSmoothing: "antialiased" }}>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
            <style>{`
                @keyframes dash-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
                .dash-pulse-dot { animation: dash-pulse 2s infinite; }
                .dash-link { text-decoration: none; }
                @media (max-width: 899px) {
                    .dash-sidebar { display: none !important; }
                    .dash-main { margin-left: 0 !important; }
                    .dash-header { left: 0 !important; }
                    .dash-mobile-nav { display: flex !important; }
                    .dash-summary-grid { grid-template-columns: 1fr !important; }
                    .dash-main-grid { grid-template-columns: 1fr !important; }
                }
                @media (min-width: 600px) and (max-width: 899px) {
                    .dash-summary-grid { grid-template-columns: 1fr 1fr !important; }
                }
            `}</style>

            {/* Sidebar */}
            <aside className="dash-sidebar" style={{
                width: 240, height: "100vh", position: "fixed", left: 0, top: 0,
                display: "flex", flexDirection: "column", padding: "24px 16px", gap: 16,
                background: `linear-gradient(to bottom, ${colors.surface}, ${colors.surfaceContainerLow})`,
                borderRight: `1px solid ${colors.outlineVariant}4D`,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 8px", marginBottom: 24 }}>
                    <div style={{ width: 32, height: 32, background: "#1a1f2e", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 0, height: 0, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderBottom: "12px solid white" }} />
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 700, color: colors.onSurface }}>FounderAI</span>
                </div>

                <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                    {navItem("dashboard", "dashboard", "Dashboard")}
                    {navItem("sprint", "bolt", "Current Sprint")}
                    {navItem("evidence", "folder_shared", "Evidence Vault")}
                    {navItem("ideas", "lightbulb", "Ideas")}
                </nav>

                <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, paddingTop: 24, borderTop: `1px solid ${colors.outlineVariant}33` }}>
                    {navItem("profile", "account_circle", "Profile")}
                </div>
            </aside>

            {/* Top Header */}
            <header className="dash-header" style={{
                height: 64, position: "fixed", top: 0, right: 0, left: 240, zIndex: 10,
                backdropFilter: "blur(12px)", background: "rgba(248,249,255,0.7)",
                display: "flex", alignItems: "center", justifyContent: "flex-end",
                padding: "0 32px", gap: 24,
            }}>
                <span style={{
                    display: "inline-flex", alignItems: "center", padding: "4px 12px",
                    background: colors.primaryFixed, color: colors.onPrimaryFixedVariant,
                    borderRadius: 999, fontSize: 12, fontWeight: 500, border: `1px solid ${colors.primaryFixedDim}`,
                }}>
                    <span className="dash-pulse-dot" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: colors.primaryFixedDim, marginRight: 6 }} />
                    {allComplete ? "Sprint Complete" : `Day ${todaysTask?.day_number ?? checkins.length} of ${checkins.length || 7}`}
                </span>
            </header>

            {/* Main */}
            <main className="dash-main" style={{ paddingTop: 96, paddingBottom: 48, paddingLeft: 32, paddingRight: 32, marginLeft: 240, minHeight: "100vh" }}>
                <div style={{ maxWidth: 1440, margin: "0 auto" }}>

                    {/* ── DASHBOARD VIEW ── */}
                    {activeView === "dashboard" && (
                        <>
                            <div style={{ marginBottom: 32 }}>
                                <h1 style={{ fontSize: 36, letterSpacing: "-0.04em", fontWeight: 700, color: colors.onSurface, margin: 0 }}>Founder Dashboard</h1>
                                <p style={{ fontSize: 16, color: colors.onSurfaceVariant, marginTop: 4 }}>Your only job today is to validate one assumption.</p>
                            </div>

                            {/* Summary Cards */}
                            <div className="dash-summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 40 }}>
                                {[
                                    { label: "CURRENT IDEA", value: ideaLabel },
                                    { label: "VALIDATION VERDICT", value: report?.verdict || "—", isVerdict: true },
                                    { label: "DAYS REMAINING", value: allComplete ? "Sprint Done" : `${daysRemaining} Days Left` },
                                    { label: "EVIDENCE SCORE", value: `${evidenceScore}%`, isScore: true },
                                ].map((card) => (
                                    <div key={card.label} style={{ background: colors.surfaceContainerLowest, padding: 24, borderRadius: 12, border: `1px solid ${colors.outlineVariant}4D`, boxShadow: "0px 4px 20px rgba(0,0,0,0.03)" }}>
                                        <p style={{ fontSize: 12, letterSpacing: "0.05em", fontWeight: 600, textTransform: "uppercase" as const, color: colors.onSurfaceVariant, marginBottom: 8 }}>{card.label}</p>
                                        {card.isVerdict ? (
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <span className="material-symbols-outlined" style={{ color: colors.primary, fontSize: 20 }}>
                                                    {report?.verdict === "Abandon" ? "cancel" : report?.verdict === "Pivot" ? "warning" : "check_circle"}
                                                </span>
                                                <span style={{ fontSize: 18, fontWeight: 600, color: colors.primary }}>{card.value}</span>
                                            </div>
                                        ) : card.isScore ? (
                                            <>
                                                <p style={{ fontSize: 18, fontWeight: 600, color: colors.onSurface, margin: 0 }}>{card.value}</p>
                                                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#fff", background: evidenceScore < 50 ? colors.secondary : colors.primary, padding: "2px 6px", borderRadius: 4 }}>
                                                        {evidenceScore < 50 ? "Needs More Evidence" : "Strong Evidence"}
                                                    </span>
                                                </div>
                                            </>
                                        ) : (
                                            <p style={{ fontSize: 18, fontWeight: 600, color: colors.onSurface, margin: 0 }}>{card.value}</p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="dash-main-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
                                {/* Left — Today's Mission */}
                                <div style={{ background: colors.surfaceContainerLow, borderRadius: 12, border: `1px solid ${colors.outlineVariant}66`, padding: 32 }}>
                                    {allComplete ? (
                                        <div style={{ textAlign: "center", padding: "24px 0" }}>
                                            <p style={{ fontSize: 24, fontWeight: 700, color: colors.onSurface, marginBottom: 8 }}>🎉 Sprint Complete</p>
                                            <p style={{ fontSize: 16, color: colors.onSurfaceVariant }}>You've finished all 7 days. Check your Evidence Vault.</p>
                                        </div>
                                    ) : todaysTask ? (
                                        <>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                                                <span style={{ padding: "4px 12px", background: colors.surfaceContainerHighest, color: colors.primary, fontSize: 12, fontWeight: 500, borderRadius: 8 }}>IN PROGRESS</span>
                                                <span style={{ color: colors.error, fontSize: 14, fontWeight: 500 }}>{daysRemaining} Days Remaining</span>
                                            </div>
                                            <h2 style={{ fontSize: 24, fontWeight: 600, color: colors.onSurface, marginBottom: 8 }}>Today's Mission — Day {todaysTask.day_number}</h2>
                                            <p style={{ fontSize: 16, color: colors.onSurfaceVariant, marginBottom: 24 }}>{todaysTask.task_description}</p>
                                            <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span className="material-symbols-outlined" style={{ color: colors.onSurfaceVariant }}>schedule</span>
                                                    <span style={{ fontSize: 14 }}>{todaysTask.estimated_minutes} minutes</span>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span className="material-symbols-outlined" style={{ color: colors.primary }}>workspace_premium</span>
                                                    <span style={{ fontSize: 14, fontWeight: 600, color: colors.primary }}>+{todaysTask.evidence_reward} Evidence</span>
                                                </div>
                                            </div>
                                            {showSuccess ? (
                                                <div style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 10, padding: 16 }}>
                                                    <p style={{ fontWeight: 700, color: "#2e7d32", marginBottom: 4 }}>✅ Task Completed</p>
                                                    {approvalReason && <p style={{ fontSize: 13, color: "#388e3c", marginBottom: 4 }}>{approvalReason}</p>}
                                                    <p style={{ fontSize: 13, color: "#388e3c" }}>Evidence Score: {scoreBeforeSubmit}% → {evidenceScore}%</p>
                                                    {checkins.find(c => !c.completed) && <p style={{ fontSize: 13, color: "#388e3c", marginTop: 4 }}>Next Mission Unlocked →</p>}
                                                </div>
                                            ) : (
                                                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                                    <textarea
                                                        placeholder="Evidence note — what did you learn? (e.g. a founder quote)"
                                                        value={evidenceNote}
                                                        onChange={(e) => setEvidenceNote(e.target.value)}
                                                        style={{ width: "100%", minHeight: 70, padding: "10px 14px", border: `1px solid ${colors.outlineVariant}`, borderRadius: 10, fontSize: 14, fontFamily: "Inter, sans-serif", outline: "none", resize: "vertical" as const, background: "#fff" }}
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Evidence link — landing page, doc, Loom, etc. (optional)"
                                                        value={evidenceLink}
                                                        onChange={(e) => setEvidenceLink(e.target.value)}
                                                        style={{ width: "100%", padding: "10px 14px", border: `1px solid ${colors.outlineVariant}`, borderRadius: 10, fontSize: 14, fontFamily: "Inter, sans-serif", outline: "none", background: "#fff" }}
                                                    />
                                                    {submitError && <p style={{ color: colors.error, fontSize: 13, margin: 0 }}>{submitError}</p>}
                                                    <button
                                                        onClick={handleMarkComplete}
                                                        disabled={submitting}
                                                        style={{ background: colors.primary, color: "#fff", border: "none", padding: "12px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}
                                                    >
                                                        {submitting ? "Saving..." : "Mark Complete"}
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    ) : null}
                                </div>

                                {/* Right Column */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                                    {/* Core Risk Assumption */}
                                    <div style={{ background: "#fff1f1", borderRadius: 12, border: `2px solid ${colors.error}33`, padding: 24 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: colors.error }}>
                                            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
                                            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Core Risk Assumption</h3>
                                        </div>
                                        <p style={{ fontSize: 15, color: colors.onSurface, fontWeight: 500, lineHeight: 1.6, margin: 0 }}>
                                            {report?.biggestRisk?.assumption ? `"${report.biggestRisk.assumption}"` : "No risk identified yet."}
                                        </p>
                                    </div>

                                    {/* FounderAI Insight — replaces Sprint Progress */}
                                    <div style={{ background: colors.primary, borderRadius: 12, padding: 24 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                            <span className="material-symbols-outlined" style={{ color: "#fff" }}>auto_awesome</span>
                                            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#fff" }}>FounderAI Insight</h3>
                                        </div>
                                        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.65, margin: 0 }}>
                                            {report?.biggestRisk?.failureScenario || "Complete your validation report to unlock AI insights."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── CURRENT SPRINT VIEW ── */}
                    {activeView === "sprint" && (
                        <>
                            <div style={{ marginBottom: 32 }}>
                                <h1 style={{ fontSize: 36, letterSpacing: "-0.04em", fontWeight: 700, color: colors.onSurface, margin: 0 }}>Sprint Progress</h1>
                                <p style={{ fontSize: 16, color: colors.onSurfaceVariant, marginTop: 4 }}>Your 7-day validation timeline.</p>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
                                {checkins.map(c => (
                                    <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: 20, background: colors.surfaceContainerLowest, borderRadius: 12, border: `1px solid ${c.completed ? colors.primary + "33" : colors.outlineVariant + "4D"}` }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 22, color: c.completed ? colors.primary : colors.outlineVariant, flexShrink: 0, marginTop: 2 }}>
                                            {c.completed ? "check_circle" : "radio_button_unchecked"}
                                        </span>
                                        <div>
                                            <p style={{ fontSize: 14, fontWeight: 600, color: colors.onSurface, margin: "0 0 4px" }}>Day {c.day_number}</p>
                                            <p style={{ fontSize: 13, color: colors.onSurfaceVariant, margin: 0 }}>{c.task_description}</p>
                                            {c.evidence_note && <p style={{ fontSize: 12, color: colors.primary, marginTop: 6, fontStyle: "italic" }}>"{c.evidence_note}"</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* ── EVIDENCE VAULT VIEW ── */}
                    {activeView === "evidence" && (
                        <>
                            <div style={{ marginBottom: 32 }}>
                                <h1 style={{ fontSize: 36, letterSpacing: "-0.04em", fontWeight: 700, color: colors.onSurface, margin: 0 }}>Evidence Vault</h1>
                                <p style={{ fontSize: 16, color: colors.onSurfaceVariant, marginTop: 4 }}>Everything you've collected so far.</p>
                            </div>
                            {checkins.filter(c => c.completed).length === 0 ? (
                                <p style={{ fontSize: 15, color: colors.onSurfaceVariant }}>No evidence logged yet. Complete today's mission to start your vault.</p>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
                                    {checkins.filter(c => c.completed).map(c => (
                                        <div key={c.id} style={{ padding: 24, background: colors.surfaceContainerLowest, borderRadius: 12, border: `1px solid ${colors.outlineVariant}4D` }}>
                                            <p style={{ fontSize: 14, fontWeight: 600, color: colors.onSurface, margin: "0 0 8px" }}>Day {c.day_number}: {c.task_description}</p>
                                            {c.evidence_note && <p style={{ fontSize: 13, color: colors.onSurfaceVariant, margin: "0 0 6px", fontStyle: "italic" }}>"{c.evidence_note}"</p>}
                                            {c.evidence_link && <a href={c.evidence_link} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: colors.primary }}>{c.evidence_link}</a>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── IDEAS VIEW ── */}
                    {activeView === "ideas" && (
                        <>
                            <div style={{ marginBottom: 32 }}>
                                <h1 style={{ fontSize: 36, letterSpacing: "-0.04em", fontWeight: 700, color: colors.onSurface, margin: 0 }}>Your Idea</h1>
                                <p style={{ fontSize: 16, color: colors.onSurfaceVariant, marginTop: 4 }}>The problem you are working on — and everything behind it.</p>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
                                {[
                                    { label: "What problem are you solving?", value: idea?.problem },
                                    { label: "Who experiences this problem most?", value: idea?.customer },
                                    { label: "How do they solve it today?", value: idea?.current_solution },
                                    { label: "How often does it happen?", value: idea?.frequency },
                                    { label: "What happens if it stays unsolved?", value: idea?.consequence },
                                    { label: "Why are you the right person?", value: idea?.why_you },
                                    { label: "What evidence do you already have?", value: idea?.evidence_level },
                                    { label: "What is your goal?", value: idea?.goal },
                                ].map((q) => (
                                    <div key={q.label} style={{ padding: 20, background: colors.surfaceContainerLowest, borderRadius: 12, border: `1px solid ${colors.outlineVariant}4D` }}>
                                        <p style={{ fontSize: 12, letterSpacing: "0.05em", fontWeight: 600, textTransform: "uppercase" as const, color: colors.onSurfaceVariant, marginBottom: 6 }}>{q.label}</p>
                                        <p style={{ fontSize: 15, color: colors.onSurface, margin: 0, lineHeight: 1.6 }}>{q.value || "—"}</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* ── PROFILE VIEW ── */}
                    {activeView === "profile" && (
                        <>
                            <div style={{ marginBottom: 32 }}>
                                <h1 style={{ fontSize: 36, letterSpacing: "-0.04em", fontWeight: 700, color: colors.onSurface, margin: 0 }}>Profile</h1>
                                <p style={{ fontSize: 16, color: colors.onSurfaceVariant, marginTop: 4 }}>Your account details.</p>
                            </div>
                            <div style={{ maxWidth: 480 }}>
                                <div style={{ padding: 32, background: colors.surfaceContainerLowest, borderRadius: 16, border: `1px solid ${colors.outlineVariant}4D` }}>
                                    <div style={{ width: 72, height: 72, borderRadius: "50%", background: colors.primary, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                                        <span style={{ fontSize: 28, fontWeight: 700, color: "#fff" }}>
                                            {user?.email?.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                        <div>
                                            <p style={{ fontSize: 12, letterSpacing: "0.05em", fontWeight: 600, textTransform: "uppercase" as const, color: colors.onSurfaceVariant, marginBottom: 4 }}>Email</p>
                                            <p style={{ fontSize: 16, color: colors.onSurface, margin: 0, fontWeight: 500 }}>{user?.email || "—"}</p>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: 12, letterSpacing: "0.05em", fontWeight: 600, textTransform: "uppercase" as const, color: colors.onSurfaceVariant, marginBottom: 4 }}>Member since</p>
                                            <p style={{ fontSize: 16, color: colors.onSurface, margin: 0 }}>
                                                {user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "—"}
                                            </p>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: 12, letterSpacing: "0.05em", fontWeight: 600, textTransform: "uppercase" as const, color: colors.onSurfaceVariant, marginBottom: 4 }}>Active idea</p>
                                            <p style={{ fontSize: 16, color: colors.onSurface, margin: 0 }}>{ideaLabel}</p>
                                        </div>
                                        <button
                                            onClick={async () => { if (supabase) { await supabase.auth.signOut(); window.location.href = "/landing.html"; } }}
                                            style={{ marginTop: 8, background: "transparent", color: colors.error, border: `1px solid ${colors.error}`, padding: "10px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif" }}
                                        >
                                            Sign Out
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </main>

            {/* Mobile Nav */}
            <div className="dash-mobile-nav" style={{ display: "none", position: "fixed", bottom: 0, left: 0, right: 0, height: 64, background: colors.surfaceContainerHigh, borderTop: `1px solid ${colors.outlineVariant}4D`, alignItems: "center", justifyContent: "space-around", zIndex: 50 }}>
                {[
                    { view: "dashboard" as ActiveView, icon: "dashboard", label: "Dash" },
                    { view: "sprint" as ActiveView, icon: "bolt", label: "Sprint" },
                    { view: "evidence" as ActiveView, icon: "folder_shared", label: "Vault" },
                    { view: "profile" as ActiveView, icon: "person", label: "Profile" },
                ].map(item => (
                    <a key={item.view} href="#" className="dash-link"
                        onClick={(e) => { e.preventDefault(); setActiveView(item.view); }}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: activeView === item.view ? colors.primary : colors.onSurfaceVariant }}>
                        <span className="material-symbols-outlined">{item.icon}</span>
                        <span style={{ fontSize: 10, fontWeight: 500 }}>{item.label}</span>
                    </a>
                ))}
            </div>
        </div>
    );
}