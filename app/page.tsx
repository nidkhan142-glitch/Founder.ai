"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// Types matching our database/validation engine schema
interface ValidationReport {
  verdict: "Proceed" | "Pivot" | "Abandon";
  confidence: "High" | "Medium" | "Low";
  whatMustBeTrue: string;
  problemConfidence: number;
  problemConfidenceJustification: string;
  first10Customers: string;
  currentAlternatives: string[];
  evidenceStatus: {
    exists: string[];
    doesNotExist: string[];
  };
  validationMatrix: Array<{
    dimension: "Problem Severity" | "Customer Urgency" | "Market Accessibility" | "Competition Risk" | "Founder Advantage";
    score: number;
    why: string;
  }>;
  biggestRisk: {
    assumption: string;
    failureScenario: string;
  };
  validationSprint: {
    experiment: string;
    successCriteria: string;
    next3Actions: string[];
    requiredEvidence: string;
  };
}

interface IdeaRecord {
  id?: string;
  problem: string;
  customer: string;
  current_solution: string;
  frequency: string;
  consequence: string;
  why_you: string;
  evidence_level: string;
  goal: string;
  created_at?: string;
}

export default function Home() {
  // Form fields state
  const [problem, setProblem] = useState("");
  const [customer, setCustomer] = useState("");
  const [currentSolution, setCurrentSolution] = useState("");
  const [frequency, setFrequency] = useState("Weekly");
  const [consequence, setConsequence] = useState("");
  const [whyYou, setWhyYou] = useState("");
  const [evidenceLevel, setEvidenceLevel] = useState("None");
  const [goal, setGoal] = useState("Real business");

  // App settings state
  const [customApiKey, setCustomApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // App UI state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [user, setUser] = useState<any>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);
  
  // Hover state for matrix items
  const [expandedMatrixRow, setExpandedMatrixRow] = useState<string | null>(null);

  // Validation sprint checklist items
  const [checkedSprintItems, setCheckedSprintItems] = useState<boolean[]>([false, false, false]);

  // Loading quotes for the CEO validation engine
  const loadingSteps = [
    "Deconstructing startup assumptions...",
    "Applying The Mom Test rules (eliminating hypotheticals)...",
    "Running competitive risk assessment...",
    "Defining success metrics and verification protocol...",
  ];

  // Check for session & local settings on mount
  useEffect(() => {
    // Load custom API key from localStorage if present
    const savedKey = localStorage.getItem("founder_gemini_api_key");
    if (savedKey) {
      setCustomApiKey(savedKey);
    }

    // Check for offline mode flag
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setOfflineMode(true);
    }

    // Check auth state
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null);
      }).catch(() => {
        setOfflineMode(true);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  // Loading animation loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % loadingSteps.length);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("founder_gemini_api_key", customApiKey);
    setShowSettings(false);
  };

  const handleRunValidation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!problem || !customer || !currentSolution || !consequence || !whyYou) {
      setErrorMsg("Please fill out all onboarding questions.");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");
    setReport(null);
    setLoadingStep(0);
    setCheckedSprintItems([false, false, false]);

    try {
      const response = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem,
          customer,
          currentSolution,
          frequency,
          consequence,
          whyYou,
          evidence: evidenceLevel,
          goal,
          customApiKey: customApiKey || undefined
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate report.");
      }

      setReport(data);

      // If user is authenticated, save right away
      if (user && !offlineMode) {
        await saveIdeaAndReport(data);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An error occurred while connecting to the validation engine.");
    } finally {
      setIsLoading(false);
    }
  };

  const saveIdeaAndReport = async (reportData: ValidationReport) => {
    try {
      if (!supabase) return;
      
      // 1. Insert into ideas table
      const { data: ideaRecord, error: ideaErr } = await supabase
        .from("ideas")
        .insert({
          user_id: user.id,
          problem,
          customer,
          current_solution: currentSolution,
          frequency,
          consequence,
          why_you: whyYou,
          evidence_level: evidenceLevel,
          goal
        })
        .select()
        .single();

      if (ideaErr) throw ideaErr;

      // 2. Insert report data into reports table
      const { error: reportErr } = await supabase
        .from("reports")
        .insert({
          idea_id: ideaRecord.id,
          raw_json: reportData
        });

      if (reportErr) throw reportErr;

      // 3. Stub check-in entry for next week
      const checkInDate = new Date();
      checkInDate.setDate(checkInDate.getDate() + 7);
      
      const { error: checkinErr } = await supabase
        .from("checkins")
        .insert({
          idea_id: ideaRecord.id,
          scheduled_date: checkInDate.toISOString(),
          completed: false
        });

      if (checkinErr) throw checkinErr;
      
      setAuthStatus("Report saved to your dashboard!");
    } catch (err: any) {
      console.error("Error saving database records:", err);
      setErrorMsg("Failed to save report to database, but you can still view it below.");
    }
  };

  const handleClaimReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail) return;

    setAuthStatus("Sending Magic Link...");
    try {
      if (offlineMode || !supabase) {
        // Mock success in offline mode
        setAuthStatus("Offline mode: Simulated claim successful! (Stored locally)");
        localStorage.setItem("claimed_report", JSON.stringify({ problem, customer, report }));
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail,
        options: {
          emailRedirectTo: window.location.origin
        }
      });

      if (error) throw error;
      setAuthStatus("Check your inbox! We sent you a Magic Link to log in and claim your timeline.");
    } catch (err: any) {
      setAuthStatus(`Authentication failed: ${err.message}`);
    }
  };

  const toggleSprintItem = (index: number) => {
    const newItems = [...checkedSprintItems];
    newItems[index] = !newItems[index];
    setCheckedSprintItems(newItems);
  };

  return (
    <>
<header className="header">
  <div className="container header-inner">
    <div className="logo">
      FounderAI<span className="logo-dot"></span>
    </div>
    <div className="nav-links">
      {offlineMode && (
        <span style={{ fontSize: "0.8rem", color: "var(--accent-amber)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
          ⚠️ Running offline
        </span>
      )}
      <button className="nav-btn" onClick={() => setShowSettings(!showSettings)}>
        ⚙️ {customApiKey ? "API Key Configured" : "Configure API Key"}
      </button>
      {user ? (
        <span className="nav-btn nav-btn-primary" style={{ cursor: "default" }}>
          👤 {user.email}
        </span>
      ) : (
        <button className="nav-btn nav-btn-primary" onClick={() => {
          setAuthEmail("");
          setAuthStatus("");
          const email = prompt("Enter email to sign in via Magic Link:");
          if (email) {
            setAuthEmail(email);
            supabase?.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
              .then(() => alert("Magic link sent!"))
              .catch((err) => alert(err.message));
          }
        }}>
          Sign In
        </button>
      )}
    </div>
  </div>
</header>

      <main className="container">
        {showSettings && (
          <div style={{ marginTop: "1.5rem" }} className="card">
            <h3 className="sidebar-title">Developer Settings</h3>
            <p className="form-subtitle">
              FounderAI requires a Gemini API Key. Populate your `GEMINI_API_KEY` in `.env.local` or enter one locally in the browser storage here.
            </p>
            <form onSubmit={handleSaveApiKey}>
              <div className="form-group">
                <label className="form-label">Gemini API Key</label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  className="form-input"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: "1rem" }}>
                <button type="submit" className="nav-btn nav-btn-primary">Save Key</button>
                <button type="button" className="nav-btn" onClick={() => setShowSettings(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div className="onboarding-grid">
          {/* Question Onboarding Input */}
             <div className="card">
               <h2 className="hero-title">Validate Your Startup Idea</h2>
               <p className="form-subtitle">
                 We don't validate ideas. We force intellectual honesty. Enter your answers to generate your onboarding risk assessment and the 7-day validation blueprint.
               </p>

            <form onSubmit={handleRunValidation}>
              <div className="form-group">
                <label className="form-label">
                  What problem are you solving?
                  <span className="form-label-desc">Problem</span>
                </label>
                <textarea
                  className="form-input"
                  placeholder="e.g. Mechanical engineering students spend hours searching for reference formulas during lab exams, lowering their test scores."
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Who experiences this problem most?
                  <span className="form-label-desc">Customer</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Mechanical engineering sophomores at public universities"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  How do they solve it today, without your product?
                  <span className="form-label-desc">Current Solution</span>
                </label>
                <textarea
                  className="form-input"
                  placeholder="e.g. Flipping through 500-page paper textbooks, using unorganized Chrome bookmark lists, or asking ChatGPT (which hallucinating equations)."
                  value={currentSolution}
                  onChange={(e) => setCurrentSolution(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  How often does this problem occur?
                  <span className="form-label-desc">Frequency</span>
                </label>
                <select
                  className="form-select"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                >
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Rarely">Rarely</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">
                  What happens if this problem stays unsolved?
                  <span className="form-label-desc">Consequence</span>
                </label>
                <textarea
                  className="form-input"
                  placeholder="e.g. They fail their lab assignments, lose exam grade points, and experience high levels of stress during tests."
                  value={consequence}
                  onChange={(e) => setConsequence(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Why are you personally interested in this problem?
                  <span className="form-label-desc">Why You</span>
                </label>
                <textarea
                  className="form-input"
                  placeholder="e.g. I was a mechanical engineering TA last semester and saw 40% of my class run out of time during exams simply looking up equations."
                  value={whyYou}
                  onChange={(e) => setWhyYou(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Have you talked to anyone about this?
                  <span className="form-label-desc">Evidence</span>
                </label>
                <select
                  className="form-select"
                  value={evidenceLevel}
                  onChange={(e) => setEvidenceLevel(e.target.value)}
                >
                  <option value="None">None (Just an idea)</option>
                  <option value="1-5 people">1-5 people (Spoke to a few friends)</option>
                  <option value="6-20 people">6-20 people (Conducted user interviews)</option>
                  <option value="20+">20+ people (Conducted comprehensive interviews & surveys)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">
                  What's this for?
                  <span className="form-label-desc">Goal</span>
                </label>
                <select
                  className="form-select"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                >
                  <option value="Real business">Real business (Scaling commercial potential)</option>
                  <option value="Side project">Side project (Personal utility or fun)</option>
                  <option value="College application portfolio">College application portfolio (Demonstrate learnable metric & initiative)</option>
                  <option value="Exploring a market">Exploring a market (Understand space first)</option>
                </select>
              </div>

              {errorMsg && (
                <div style={{ color: "var(--accent-rose)", fontSize: "0.9rem", marginBottom: "1rem", fontWeight: 500 }}>
                  ❌ {errorMsg}
                </div>
              )}

              <button type="submit" disabled={isLoading} className="btn-submit">
                {isLoading ? (
                  <>
                    <span className="spinner"></span>
                    Running Validation...
                  </>
                ) : (
                  "Initiate Validation Engine"
                )}
              </button>
            </form>
          </div>

          {/* Validation Engine Results Section */}
          <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: "600px" }}>
            {isLoading ? (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", flex: 1, textAlign: "center" }}>
                <span className="spinner" style={{ width: "40px", height: "40px", marginBottom: "1.5rem", borderLeftColor: "var(--brand-violet)" }}></span>
                <h3 className="pulse" style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  {loadingSteps[loadingStep]}
                </h3>
                <p className="pulse" style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                  Calculating risk profile. Standing by...
                </p>
              </div>
            ) : report ? (
              <div>
                {/* 1. Founder Verdict */}
                <div className="report-header">
                  <div>
                    <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700 }}>
                      Validation Verdict
                    </span>
                    <h2 style={{ fontSize: "1.8rem", fontWeight: 800, marginTop: "0.25rem" }}>
                      Founder Report
                    </h2>
                  </div>
                  <span className={`verdict-badge ${
                    report.verdict === "Proceed" ? "verdict-proceed" :
                    report.verdict === "Pivot" ? "verdict-pivot" : "verdict-abandon"
                  }`}>
                    {report.verdict} ({report.confidence} Confidence)
                  </span>
                </div>

                <div className="must-be-true-box">
                  <div className="must-be-true-title">What Must Be True to Proceed</div>
                  <div className="must-be-true-text">"{report.whatMustBeTrue}"</div>
                </div>

                {/* 2. Reality Check */}
                <div className="report-section">
                  <h3 className="section-title">
                    <span>02.</span> Reality Check
                  </h3>
                  <div className="reality-grid">
                    <div className="reality-card">
                      <div className="reality-card-title">Problem Confidence</div>
                      <div className="reality-score">
                        {report.problemConfidence}<span>/10</span>
                      </div>
                      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                        {report.problemConfidenceJustification}
                      </p>
                    </div>

                    <div className="reality-card">
                      <div className="reality-card-title">Target Beachhead</div>
                      <p style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                        {report.first10Customers}
                      </p>
                      <div className="reality-card-title" style={{ marginTop: "1rem" }}>Evidence Status</div>
                      <ul className="evidence-list">
                        {report.evidenceStatus.exists.map((item, idx) => (
                          <li key={idx} className="evidence-item" style={{ color: "var(--accent-emerald)" }}>
                            ✓ {item}
                          </li>
                        ))}
                        {report.evidenceStatus.doesNotExist.map((item, idx) => (
                          <li key={idx} className="evidence-item" style={{ color: "var(--accent-rose)" }}>
                            ❌ {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="reality-card" style={{ marginTop: "1.5rem" }}>
                    <div className="reality-card-title">Real Alternative Behaviors</div>
                    <ul style={{ paddingLeft: "1.25rem", fontSize: "0.9rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.5rem" }}>
                      {report.currentAlternatives.map((alt, idx) => (
                        <li key={idx}>{alt}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 3. Validation Matrix */}
                <div className="report-section">
                  <h3 className="section-title">
                    <span>03.</span> Validation Matrix
                  </h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                    Click the info icon or hover over any row to unlock the underlying AI justification.
                  </p>
                  <table className="matrix-table">
                    <thead>
                      <tr>
                        <th className="matrix-th">Dimension</th>
                        <th className="matrix-th" style={{ width: "80px", textAlign: "center" }}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.validationMatrix.map((row, idx) => {
                        const isExpanded = expandedMatrixRow === row.dimension;
                        return (
                          <React.Fragment key={idx}>
                            <tr 
                              className="matrix-row"
                              onMouseEnter={() => setExpandedMatrixRow(row.dimension)}
                              onMouseLeave={() => setExpandedMatrixRow(null)}
                              onClick={() => setExpandedMatrixRow(isExpanded ? null : row.dimension)}
                              style={{ cursor: "pointer" }}
                            >
                              <td className="matrix-td" style={{ fontWeight: 600 }}>
                                {row.dimension}
                                <button className="info-trigger" title="View details">
                                  <svg className="info-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </button>
                              </td>
                              <td className="matrix-td" style={{ textAlign: "center" }}>
                                <span className="matrix-score-badge">{row.score}/10</span>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="justification-row">
                                <td colSpan={2} className="matrix-td" style={{ padding: 0 }}>
                                  <div className="justification-content">
                                    {row.why}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 4. Biggest Risk */}
                <div className="report-section">
                  <h3 className="section-title">
                    <span>04.</span> Biggest Assumption
                  </h3>
                  <div className="risk-box">
                    <div className="risk-title">Core Risk Assumption</div>
                    <p className="risk-desc" style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
                      "{report.biggestRisk.assumption}"
                    </p>
                    <div className="risk-title" style={{ fontSize: "0.85rem", opacity: 0.85 }}>Failure Mode</div>
                    <p className="risk-desc" style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                      {report.biggestRisk.failureScenario}
                    </p>
                  </div>
                </div>

                {/* 5. Validation Sprint (UNFINISHED UX) */}
                <div className="report-section" style={{ borderBottom: "none", paddingBottom: 0 }}>
                  <h3 className="section-title">
                    <span>05.</span> Validation Sprint (7 Days)
                  </h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--accent-rose)", fontWeight: 500, marginBottom: "1rem" }}>
                    ⚠️ STATUS: PENDING EXECUTION — COMPLETE THE TASKS BELOW
                  </p>
                  
                  <div className="reality-card" style={{ marginBottom: "1.5rem" }}>
                    <div className="reality-card-title">Assigned Experiment</div>
                    <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {report.validationSprint.experiment}
                    </p>
                  </div>

                  <div className="sprint-checklist">
                    {report.validationSprint.next3Actions.map((action, idx) => (
                      <div key={idx} className="sprint-item">
                        <div 
                          className={`sprint-checkbox ${checkedSprintItems[idx] ? "checked" : ""}`}
                          onClick={() => toggleSprintItem(idx)}
                        ></div>
                        <div className="sprint-checkbox-desc">
                          {action}
                          <span>Action Step {idx + 1}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="sprint-badge-container">
                    <div className="sprint-badge">
                      <span className="sprint-badge-label">Target Metrics:</span>
                      <span className="sprint-badge-value">{report.validationSprint.successCriteria}</span>
                    </div>
                    <div className="sprint-badge">
                      <span className="sprint-badge-label">Commitment Check-In:</span>
                      <span className="sprint-badge-value">
                        {new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric"
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="reality-card" style={{ marginTop: "1.5rem" }}>
                    <div className="reality-card-title">Required Evidence to Log</div>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      {report.validationSprint.requiredEvidence}
                    </p>
                  </div>
                </div>

                {/* Claiming/Save report flow */}
                {!user && (
                  <div className="card" style={{ marginTop: "2.5rem", border: "1px solid var(--brand-violet)" }}>
                    <h4 className="sidebar-title" style={{ color: "var(--brand-violet)" }}>
                      🔒 Claim Your Verification Dashboard
                    </h4>
                    <p className="form-subtitle">
                      Save this report, secure your timeline, and lock in your 7-day accountability check-in date. Enter your email to receive a Magic Link.
                    </p>
                    <form onSubmit={handleClaimReport}>
                      <div className="form-group" style={{ marginBottom: "1rem" }}>
                        <input
                          type="email"
                          placeholder="your-email@example.com"
                          className="form-input"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          required
                        />
                      </div>
                      <button type="submit" className="btn-submit">
                        Claim Report & Lock Check-in
                      </button>
                    </form>
                    {authStatus && (
                      <p style={{ fontSize: "0.85rem", marginTop: "0.75rem", color: "var(--brand-violet)" }}>
                        {authStatus}
                      </p>
                    )}
                  </div>
                )}

                {user && authStatus && (
                  <div className="must-be-true-box" style={{ marginTop: "2rem", borderLeftColor: "var(--accent-emerald)" }}>
                    <p className="must-be-true-text" style={{ fontSize: "0.9rem", color: "var(--accent-emerald)" }}>
                      ✓ {authStatus}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", flex: 1, color: "var(--text-muted)" }}>
                <svg style={{ width: "48px", height: "48px", marginBottom: "1rem", color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p style={{ fontWeight: 600 }}>Validation report not initiated.</p>
                <p style={{ fontSize: "0.85rem", marginTop: "0.25rem", textAlign: "center", padding: "0 1.5rem" }}>
                  Fill out the onboarding questions on the left to analyze your startup assumptions.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Longitudinal Timeline Mock Section for V1 Demo */}
        {report && (
          <div className="dashboard-grid" style={{ marginTop: "1rem" }}>
            <div className="card timeline-card">
              <h2 className="form-title">Longitudinal Validation History</h2>
              <p className="form-subtitle">
                This per-user, per-idea timeline tracks pivots, experiment completion logs, and weekly accountability checks. (Setup for v2/v3 check-in engine)
              </p>

              <div className="timeline-list">
                <div className="timeline-node active">
                  <div className="timeline-date">TODAY</div>
                  <div className="timeline-title">Validation Sprint Initiated</div>
                  <div className="timeline-desc">
                    Generated initial onboarding report. Assigned 48h experiment: <strong>{report.validationSprint.experiment}</strong>. Target success metrics set.
                  </div>
                </div>

                <div className="timeline-node">
                  <div className="timeline-date">7 DAYS FROM TODAY</div>
                  <div className="timeline-title">Weekly Check-in #1 (Scheduled)</div>
                  <div className="timeline-desc">
                    Founder must submit verification evidence: {report.validationSprint.requiredEvidence}.
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="sidebar-title">Startup Moat Engine</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "1rem" }}>
                FounderAI builds longitudinal memory. Because reports are saved as structured data:
              </p>
              <ul style={{ fontSize: "0.85rem", color: "var(--text-secondary)", paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <li><strong>Week 2</strong> check-in queries previous assumptions automatically.</li>
                <li><strong>Pivots</strong> spawn child nodes off the parent idea node.</li>
                <li><strong>Timeline events</strong> preserve the history, proving to future investors you validate before writing code.</li>
              </ul>
            </div>
          </div>
        )}
      </main>

      <footer style={{ borderTop: "1px solid var(--border-color)", padding: "2rem 0", color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center", marginTop: "auto" }}>
        <div className="container">
          <p>© {new Date().getFullYear()} FounderAI. Built on principles of The Mom Test & Lean Startup.</p>
        </div>
      </footer>
    </>
  );
}
