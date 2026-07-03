"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface ValidationReport {
    verdict: "Proceed" | "Pivot" | "Abandon";
    confidence: "High" | "Medium" | "Low";
    whatMustBeTrue: string;
    problemConfidence: number;
    problemConfidenceJustification: string;
    first10Customers: string;
    currentAlternatives: string[];
    evidenceStatus: { exists: string[]; doesNotExist: string[] };
    validationMatrix: Array<{
        dimension: "Problem Severity" | "Customer Urgency" | "Market Accessibility" | "Competition Risk" | "Founder Advantage";
        score: number;
        why: string;
    }>;
    biggestRisk: { assumption: string; failureScenario: string };
}

export default function ValidatePage() {
    const router = useRouter();

    const [problem, setProblem] = useState("");
    const [customer, setCustomer] = useState("");
    const [currentSolution, setCurrentSolution] = useState("");
    const [frequency, setFrequency] = useState("Weekly");
    const [consequence, setConsequence] = useState("");
    const [whyYou, setWhyYou] = useState("");
    const [evidenceLevel, setEvidenceLevel] = useState("None");
    const [goal, setGoal] = useState("Real business");

    const [isLoading, setIsLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState(0);
    const [report, setReport] = useState<ValidationReport | null>(null);
    const [errorMsg, setErrorMsg] = useState("");
    const [user, setUser] = useState<any>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [authEmail, setAuthEmail] = useState("");
    const [authStatus, setAuthStatus] = useState("");
    const [authName, setAuthName] = useState("");
    const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
    const [preAuthStatus, setPreAuthStatus] = useState("");
    const [expandedMatrixRow, setExpandedMatrixRow] = useState<string | null>(null);

    const loadingSteps = [
        "Deconstructing startup assumptions...",
        "Applying The Mom Test rules...",
        "Running competitive risk assessment...",
        "Defining success metrics and verification protocol...",
    ];

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
        let interval: NodeJS.Timeout;
        if (isLoading) {
            interval = setInterval(() => {
                setLoadingStep((prev) => (prev + 1) % loadingSteps.length);
            }, 2500);
        }
        return () => clearInterval(interval);
    }, [isLoading]);

    const handleRunValidation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!problem || !customer || !currentSolution || !consequence || !whyYou) {
            setErrorMsg("Please fill out all questions.");
            return;
        }
        setIsLoading(true);
        setErrorMsg("");
        setReport(null);
        setLoadingStep(0);

        try {
            const response = await fetch("/api/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ problem, customer, currentSolution, frequency, consequence, whyYou, evidence: evidenceLevel, goal }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to generate report.");
            setReport(data);
            if (user && supabase) {
                await saveIdeaAndReport(data, data.sprint);
            }
        } catch (err: any) {
            setErrorMsg(err.message || "An error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const saveIdeaAndReport = async (reportData: ValidationReport, sprintDays: any[]) => {
        try {
            if (!supabase || !user) return;
            const { data: ideaRecord, error: ideaErr } = await supabase
                .from("ideas")
                .insert({ user_id: user.id, problem, customer, current_solution: currentSolution, frequency, consequence, why_you: whyYou, evidence_level: evidenceLevel, goal })
                .select().single();
            if (ideaErr) throw ideaErr;
            await supabase.from("reports").insert({ idea_id: ideaRecord.id, raw_json: reportData });

            if (sprintDays && sprintDays.length > 0) {
                const today = new Date();
                const checkinRows = sprintDays.map((d: any) => {
                    const scheduledDate = new Date(today);
                    scheduledDate.setDate(today.getDate() + (d.day - 1));
                    return {
                        idea_id: ideaRecord.id,
                        scheduled_date: scheduledDate.toISOString(),
                        completed: false,
                        day_number: d.day,
                        task_description: d.task,
                        estimated_minutes: d.estimated_minutes,
                        evidence_reward: d.evidence_reward
                    };
                });
                await supabase.from("checkins").insert(checkinRows);
            } else {
                const checkInDate = new Date();
                checkInDate.setDate(checkInDate.getDate() + 7);
                await supabase.from("checkins").insert({ idea_id: ideaRecord.id, scheduled_date: checkInDate.toISOString(), completed: false });
            }

            setAuthStatus("Report saved to your dashboard!");
        } catch (err: any) {
            console.error("Save error:", err);
        }
    };

    if (authLoading) return (
        <div style={{ background: "#faf8ff", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 32, height: 32, border: "3px solid #e1e2ed", borderTop: "3px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    if (!user) return (
        <div style={{ background: "#faf8ff", minHeight: "100vh", fontFamily: "Inter, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
            <div style={{ width: 48, height: 48, background: "#1a1f2e", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                <div style={{ width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderBottom: "17px solid white" }} />
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "#191b23", marginBottom: 12, letterSpacing: "-0.02em" }}>
                {authMode === "signup" ? "Create your free account first" : "Welcome back"}
            </h2>
            <p style={{ fontSize: 16, color: "#737686", marginBottom: 32, maxWidth: 400, lineHeight: 1.6 }}>
                {authMode === "signup"
                    ? "Sign up to validate your idea, save your report, and track your 7-day sprint."
                    : "Log in to access your dashboard."}
            </p>

            <div style={{ background: "#fff", border: "1px solid #c3c6d7", borderRadius: 16, padding: 28, width: "100%", maxWidth: 360 }}>
                {authMode === "signup" && (
                    <input
                        type="text"
                        placeholder="Your name"
                        value={authName}
                        onChange={(e) => setAuthName(e.target.value)}
                        style={{ width: "100%", padding: "12px 14px", border: "1px solid #c3c6d7", borderRadius: 10, fontSize: 14, color: "#191b23", background: "#faf8ff", fontFamily: "Inter, sans-serif", outline: "none", marginBottom: 12 }}
                    />
                )}
                <input
                    type="email"
                    placeholder="your-email@example.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    style={{ width: "100%", padding: "12px 14px", border: "1px solid #c3c6d7", borderRadius: 10, fontSize: 14, color: "#191b23", background: "#faf8ff", fontFamily: "Inter, sans-serif", outline: "none", marginBottom: 16 }}
                />
                <button
                    onClick={async () => {
                        if (!authEmail || !supabase) return;
                        if (authMode === "signup" && !authName) {
                            setPreAuthStatus("Please enter your name.");
                            return;
                        }
                        setPreAuthStatus("Sending Magic Link...");
                        try {
                            const { error } = await supabase.auth.signInWithOtp({
                                email: authEmail,
                                options: {
                                    emailRedirectTo: window.location.origin + "/validate",
                                    data: authMode === "signup" ? { full_name: authName } : undefined
                                }
                            });
                            if (error) throw error;
                            setPreAuthStatus("Check your inbox! Magic link sent.");
                        } catch (err: any) {
                            setPreAuthStatus(`Failed: ${err.message}`);
                        }
                    }}
                    style={{ width: "100%", background: "#2563eb", color: "#fff", border: "none", padding: "14px", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "Inter, sans-serif" }}
                >
                    {authMode === "signup" ? "Sign Up Free" : "Send Magic Link"}
                </button>

                {preAuthStatus && <p style={{ fontSize: 13, color: "#2563eb", marginTop: 12 }}>{preAuthStatus}</p>}

                <p style={{ fontSize: 13, color: "#737686", marginTop: 16 }}>
                    {authMode === "signup" ? "Already have an account? " : "Don't have an account? "}
                    <span
                        onClick={() => { setAuthMode(authMode === "signup" ? "login" : "signup"); setPreAuthStatus(""); }}
                        style={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }}
                    >
                        {authMode === "signup" ? "Log In" : "Sign Up"}
                    </span>
                </p>
            </div>

            <a href="/landing.html" style={{ marginTop: 24, fontSize: 14, color: "#737686", textDecoration: "none" }}>Back to Home</a>
        </div>
    );

    return (
        <div style={{ background: "#faf8ff", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>
            <nav style={{ background: "rgba(250,248,255,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid #c3c6d7", padding: "0 24px", height: "72px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, background: "#1a1f2e", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: "14px solid white" }} />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 20, color: "#191b23", letterSpacing: "-0.01em" }}>FounderAI</span>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <a href="/landing.html" style={{ color: "#737686", fontSize: 14, textDecoration: "none" }}>Back to Home</a>
                    <span style={{ fontSize: 13, color: "#004ac6", fontWeight: 600 }}>👤 {user.email}</span>
                </div>
            </nav>

            <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 24px", display: "grid", gridTemplateColumns: report || isLoading ? "1fr 1fr" : "600px", gap: 24, justifyContent: "center" }}>

                <div style={{ background: "#fff", border: "1px solid #c3c6d7", borderRadius: 16, padding: 32 }}>
                    <h2 style={{ fontSize: 28, fontWeight: 800, color: "#191b23", marginBottom: 8, letterSpacing: "-0.02em" }}>Validate Your Startup Idea</h2>
                    <p style={{ fontSize: 15, color: "#737686", marginBottom: 28, lineHeight: 1.6 }}>
                        We don&apos;t validate ideas. We force intellectual honesty. Answer these 8 questions to generate your onboarding risk assessment and 7-day validation blueprint.
                    </p>

                    <form onSubmit={handleRunValidation}>
                        {[
                            { label: "What problem are you solving?", tag: "Problem", value: problem, set: setProblem, type: "textarea", placeholder: "e.g. Mechanical engineering students spend hours searching for reference formulas during lab exams..." },
                            { label: "Who experiences this problem most?", tag: "Customer", value: customer, set: setCustomer, type: "input", placeholder: "e.g. Mechanical engineering sophomores at public universities" },
                            { label: "How do they solve it today, without your product?", tag: "Current Solution", value: currentSolution, set: setCurrentSolution, type: "textarea", placeholder: "e.g. Flipping through 500-page textbooks, asking ChatGPT..." },
                            { label: "What happens if this problem stays unsolved?", tag: "Consequence", value: consequence, set: setConsequence, type: "textarea", placeholder: "e.g. They fail lab assignments, lose exam points..." },
                            { label: "Why are you personally interested in this problem?", tag: "Why You", value: whyYou, set: setWhyYou, type: "textarea", placeholder: "e.g. I was a mechanical engineering TA and saw 40% of my class run out of time..." },
                        ].map((field) => (
                            <div key={field.tag} style={{ marginBottom: 20 }}>
                                <label style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, color: "#191b23", marginBottom: 6 }}>
                                    {field.label}
                                    <span style={{ color: "#737686", fontWeight: 400, fontSize: 13 }}>{field.tag}</span>
                                </label>
                                {field.type === "textarea" ? (
                                    <textarea
                                        style={{ width: "100%", padding: "10px 14px", border: "1px solid #c3c6d7", borderRadius: 10, fontSize: 14, color: "#191b23", background: "#faf8ff", resize: "vertical", minHeight: 80, fontFamily: "Inter, sans-serif", outline: "none" }}
                                        placeholder={field.placeholder}
                                        value={field.value}
                                        onChange={(e) => field.set(e.target.value)}
                                        required
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        style={{ width: "100%", padding: "10px 14px", border: "1px solid #c3c6d7", borderRadius: 10, fontSize: 14, color: "#191b23", background: "#faf8ff", fontFamily: "Inter, sans-serif", outline: "none" }}
                                        placeholder={field.placeholder}
                                        value={field.value}
                                        onChange={(e) => field.set(e.target.value)}
                                        required
                                    />
                                )}
                            </div>
                        ))}

                        {[
                            { label: "How often does this problem occur?", tag: "Frequency", value: frequency, set: setFrequency, options: ["Daily", "Weekly", "Monthly", "Rarely"] },
                            { label: "Have you talked to anyone about this?", tag: "Evidence", value: evidenceLevel, set: setEvidenceLevel, options: ["None", "1-5 people", "6-20 people", "20+"] },
                            { label: "What's this for?", tag: "Goal", value: goal, set: setGoal, options: ["Real business", "Side project", "College application portfolio", "Exploring a market"] },
                        ].map((field) => (
                            <div key={field.tag} style={{ marginBottom: 20 }}>
                                <label style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, color: "#191b23", marginBottom: 6 }}>
                                    {field.label}
                                    <span style={{ color: "#737686", fontWeight: 400, fontSize: 13 }}>{field.tag}</span>
                                </label>
                                <select
                                    style={{ width: "100%", padding: "10px 14px", border: "1px solid #c3c6d7", borderRadius: 10, fontSize: 14, color: "#191b23", background: "#faf8ff", fontFamily: "Inter, sans-serif", outline: "none" }}
                                    value={field.value}
                                    onChange={(e) => field.set(e.target.value)}
                                >
                                    {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                        ))}

                        {errorMsg && (
                            <p style={{ color: "#ba1a1a", fontSize: 14, marginBottom: 16, fontWeight: 500 }}>❌ {errorMsg}</p>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            style={{ width: "100%", padding: "14px", background: isLoading ? "#737686" : "#2563eb", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: isLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "Inter, sans-serif" }}
                        >
                            {isLoading ? "Running Validation..." : "Generate Validation Report →"}
                        </button>
                    </form>
                </div>

                {(isLoading || report) && (
                    <div style={{ background: "#fff", border: "1px solid #c3c6d7", borderRadius: 16, padding: 32, display: "flex", flexDirection: "column" }}>
                        {isLoading ? (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", gap: 16 }}>
                                <div style={{ width: 40, height: 40, border: "3px solid #e1e2ed", borderTop: "3px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                                <p style={{ fontWeight: 700, fontSize: 16, color: "#191b23" }}>{loadingSteps[loadingStep]}</p>
                                <p style={{ fontSize: 13, color: "#737686" }}>Calculating risk profile. Standing by...</p>
                                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                            </div>
                        ) : report ? (
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #e1e2ed" }}>
                                    <div>
                                        <p style={{ fontSize: 11, textTransform: "uppercase", color: "#737686", fontWeight: 700, letterSpacing: "0.08em" }}>Validation Verdict</p>
                                        <h2 style={{ fontSize: 28, fontWeight: 800, color: "#191b23", marginTop: 4, letterSpacing: "-0.02em" }}>Founder Report</h2>
                                    </div>
                                    <span style={{
                                        padding: "8px 16px", borderRadius: 999, fontWeight: 700, fontSize: 14,
                                        background: report.verdict === "Proceed" ? "#dcfce7" : report.verdict === "Pivot" ? "#fff7ed" : "#fee2e2",
                                        color: report.verdict === "Proceed" ? "#166534" : report.verdict === "Pivot" ? "#c2410c" : "#991b1b",
                                        border: `1px solid ${report.verdict === "Proceed" ? "#86efac" : report.verdict === "Pivot" ? "#fed7aa" : "#fca5a5"}`
                                    }}>
                                        {report.verdict} ({report.confidence} Confidence)
                                    </span>
                                </div>

                                <div style={{ background: "#f3f3fe", border: "1px solid #c3c6d7", borderRadius: 12, padding: 16, marginBottom: 24, borderLeft: "4px solid #2563eb" }}>
                                    <p style={{ fontSize: 11, fontWeight: 700, color: "#737686", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>What Must Be True to Proceed</p>
                                    <p style={{ fontSize: 15, color: "#191b23", fontWeight: 600, lineHeight: 1.5 }}>&quot;{report.whatMustBeTrue}&quot;</p>
                                </div>

                                <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid #e1e2ed" }}>
                                    <h3 style={{ fontSize: 16, fontWeight: 700, color: "#191b23", marginBottom: 12 }}><span style={{ color: "#737686" }}>02.</span> Reality Check</h3>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                                        <div style={{ background: "#faf8ff", border: "1px solid #e1e2ed", borderRadius: 10, padding: 14 }}>
                                            <p style={{ fontSize: 11, color: "#737686", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Problem Confidence</p>
                                            <p style={{ fontSize: 28, fontWeight: 800, color: "#2563eb" }}>{report.problemConfidence}<span style={{ fontSize: 14, color: "#737686" }}>/10</span></p>
                                            <p style={{ fontSize: 12, color: "#737686", lineHeight: 1.4, marginTop: 4 }}>{report.problemConfidenceJustification}</p>
                                        </div>
                                        <div style={{ background: "#faf8ff", border: "1px solid #e1e2ed", borderRadius: 10, padding: 14 }}>
                                            <p style={{ fontSize: 11, color: "#737686", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Target Beachhead</p>
                                            <p style={{ fontSize: 13, fontWeight: 700, color: "#191b23", lineHeight: 1.4 }}>{report.first10Customers}</p>
                                        </div>
                                    </div>
                                    <div style={{ background: "#faf8ff", border: "1px solid #e1e2ed", borderRadius: 10, padding: 14 }}>
                                        <p style={{ fontSize: 11, color: "#737686", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>Evidence Status</p>
                                        {report.evidenceStatus.exists.map((item, i) => (
                                            <p key={i} style={{ fontSize: 13, color: "#166534", marginBottom: 4 }}>✓ {item}</p>
                                        ))}
                                        {report.evidenceStatus.doesNotExist.map((item, i) => (
                                            <p key={i} style={{ fontSize: 13, color: "#991b1b", marginBottom: 4 }}>❌ {item}</p>
                                        ))}
                                    </div>
                                    <div style={{ background: "#faf8ff", border: "1px solid #e1e2ed", borderRadius: 10, padding: 14, marginTop: 12 }}>
                                        <p style={{ fontSize: 11, color: "#737686", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>Real Alternative Behaviors</p>
                                        <ul style={{ paddingLeft: "1.25rem", fontSize: 13, color: "#737686", display: "flex", flexDirection: "column" as const, gap: 4 }}>
                                            {report.currentAlternatives.map((alt, i) => (
                                                <li key={i}>{alt}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>

                                <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid #e1e2ed" }}>
                                    <h3 style={{ fontSize: 16, fontWeight: 700, color: "#191b23", marginBottom: 12 }}><span style={{ color: "#737686" }}>03.</span> Validation Matrix</h3>
                                    <p style={{ fontSize: 12, color: "#737686", marginBottom: 12 }}>Hover over any row to unlock the AI justification.</p>
                                    {report.validationMatrix.map((row) => (
                                        <div
                                            key={row.dimension}
                                            onMouseEnter={() => setExpandedMatrixRow(row.dimension)}
                                            onMouseLeave={() => setExpandedMatrixRow(null)}
                                            style={{ background: "#faf8ff", border: "1px solid #e1e2ed", borderRadius: 8, padding: "10px 14px", marginBottom: 8, cursor: "pointer" }}
                                        >
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                                <span style={{ fontSize: 13, fontWeight: 600, color: "#191b23" }}>{row.dimension}</span>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: "#2563eb" }}>{row.score}/10</span>
                                            </div>
                                            <div style={{ background: "#e1e2ed", borderRadius: 4, height: 5, overflow: "hidden" }}>
                                                <div style={{ width: `${row.score * 10}%`, height: "100%", background: "#2563eb", borderRadius: 4 }} />
                                            </div>
                                            {expandedMatrixRow === row.dimension && (
                                                <p style={{ fontSize: 12, color: "#737686", marginTop: 8, lineHeight: 1.5 }}>{row.why}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid #e1e2ed" }}>
                                    <h3 style={{ fontSize: 16, fontWeight: 700, color: "#191b23", marginBottom: 12 }}><span style={{ color: "#737686" }}>04.</span> Biggest Assumption</h3>
                                    <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: 16 }}>
                                        <p style={{ fontSize: 11, color: "#c2410c", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Core Risk Assumption</p>
                                        <p style={{ fontSize: 14, fontWeight: 600, color: "#191b23", marginBottom: 10 }}>&quot;{report.biggestRisk.assumption}&quot;</p>
                                        <p style={{ fontSize: 11, color: "#c2410c", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Failure Mode</p>
                                        <p style={{ fontSize: 13, color: "#737686", lineHeight: 1.5 }}>{report.biggestRisk.failureScenario}</p>
                                    </div>
                                </div>

                                <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid #e1e2ed" }}>
                                    <h3 style={{ fontSize: 16, fontWeight: 700, color: "#191b23", marginBottom: 12 }}><span style={{ color: "#737686" }}>05.</span> Validation Sprint</h3>
                                    <div style={{ background: "#eff6ff", border: "1px solid #c3c6d7", borderRadius: 12, padding: 20 }}>
                                        <p style={{ fontSize: 14, fontWeight: 600, color: "#191b23", marginBottom: 8, lineHeight: 1.5 }}>
                                            A personalized 7-day validation sprint has been prepared for you.
                                        </p>
                                        <p style={{ fontSize: 13, color: "#737686", marginBottom: 16, lineHeight: 1.5 }}>
                                            Your first mission, daily tasks, evidence uploads, and AI guidance are available inside your dashboard.
                                        </p>
                                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
                                            <div style={{ background: "#fff", border: "1px solid #c3c6d7", borderRadius: 8, padding: "8px 14px" }}>
                                                <span style={{ fontSize: 11, color: "#737686", fontWeight: 600 }}>Estimated Duration: </span>
                                                <span style={{ fontSize: 12, color: "#191b23" }}>7 Days</span>
                                            </div>
                                            <div style={{ background: "#fff", border: "1px solid #c3c6d7", borderRadius: 8, padding: "8px 14px" }}>
                                                <span style={{ fontSize: 11, color: "#737686", fontWeight: 600 }}>Commitment Check-In: </span>
                                                <span style={{ fontSize: 12, color: "#191b23" }}>
                                                    {new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => router.push("/dashboard")}
                                    style={{ width: "100%", padding: "16px", background: "#191b23", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "Inter, sans-serif", letterSpacing: "-0.01em" }}
                                >
                                    Go to Dashboard →
                                </button>
                            </div>
                        ) : null}
                    </div>
                )}
            </div>

            <footer style={{ borderTop: "1px solid #e1e2ed", padding: "24px", textAlign: "center", marginTop: 40 }}>
                <p style={{ fontSize: 13, color: "#737686" }}>© 2026 FounderAI. Built on principles of The Mom Test & Lean Startup.</p>
            </footer>
        </div>
    );
}