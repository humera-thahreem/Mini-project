import React, { useState, useEffect, useRef } from "react";

// ── API ───────────────────────────────────────────────────────────────────
const BACKEND = "http://localhost:3001";

const MENTOR_SYSTEM = `You are a practical, beginner-friendly AI coding mentor. Your job is to evaluate the student's code clearly and helpfully.

EVALUATION RULES:
1. CORRECTNESS: If all test cases pass → mark as Correct. Accept brute force, optimized, recursion, iteration — any correct logic.
2. FORMATTING: If output mismatches look like spacing/bracket style differences, treat as logically correct.
3. MULTIPLE APPROACHES: Never reject an alternative approach if the output is correct.
4. INCORRECT CODE: Explain the mistake simply. Give a pseudocode hint — never full working code.
5. COMPLEXITY: Always mention time and space complexity.
6. SUBOPTIMAL: If correct but inefficient, say so clearly and suggest the better approach in pseudocode.
7. MULTI-LANGUAGE: Student may write Java, Python, or C. Judge logic, not language style.

RESPONSE FORMAT (always use exactly this):
Verdict: Correct ✅ / Incorrect ❌ / Correct but Suboptimal ⚡

Reason: [1-2 simple sentences explaining why]

Time Complexity: [O(...) — explain in plain words]
Space Complexity: [O(...) — explain in plain words]

[If Incorrect]
What went wrong: [simple plain-English explanation of the bug or logical mistake]
Pseudocode hint:
  [3-6 lines of pseudocode showing the correct direction — NOT working code]

[If Suboptimal]
Better approach: [describe the idea in plain English]
Pseudocode:
  [3-6 lines of pseudocode for the optimized version]

[If Correct]
Great job! [1 encouraging sentence. Optionally mention a small improvement.]

RULES:
- Be direct and friendly. Say clearly: correct or incorrect.
- Use simple words. Avoid jargon.
- Pseudocode only — never write actual runnable code.
- Keep the whole response under 200 words.`;

async function callAI(prompt) {
  try {
    const res = await fetch(`${BACKEND}/api/ai`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: prompt }], system: MENTOR_SYSTEM })
    });
    if (!res.ok) return "⚠️ AI server not running. Start with: node server.js";
    const data = await res.json();
    return data.content?.[0]?.text || "No response.";
  } catch { return "⚠️ AI server not reachable. Run: node server.js"; }
}

// ── Run code via backend ──────────────────────────────────────────────────
async function runCode(code, lang, problem) {
  const cfg = LANGUAGES[lang];
  const fileName = cfg.fileName(code);
  try {
    const res = await fetch(`${BACKEND}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: cfg.pistonLang,
        version:  cfg.version,
        files:    [{ name: fileName, content: code }],
        expectedOutputs: problem.expectedOutputs,
        testLabels:      problem.testLabels,
      })
    });
    if (!res.ok) {
      const txt = await res.text();
      return { results: null, stdout: "", stderr: `Server error ${res.status}: ${txt}` };
    }
    return await res.json(); // { stdout, stderr, results, allPassed }
  } catch (e) {
    return { results: null, stdout: "", stderr: `Cannot reach backend.\nMake sure server.js is running.\nError: ${e.message}` };
  }
}

async function saveProgress(data) {
  try {
    await fetch(`${BACKEND}/api/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  } catch { console.log("Backend not available - progress not saved"); }
}

async function loadProgress() {
  try {
    const res = await fetch(`${BACKEND}/api/progress`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}


function parseResults(stdout, stderr, problem) {
  if (stderr) return problem.expectedOutputs.map((_,i) => ({ label: problem.testLabels[i], passed: false, error: stderr.split("\n").slice(0,5).join("\n"), actual: "", expected: problem.expectedOutputs[i] }));
  const lines = stdout.split("\n").map(l => l.trim()).filter(Boolean);
  return problem.expectedOutputs.map((exp,i) => ({ label: problem.testLabels[i], expected: exp, actual: lines[i] || "(no output)", passed: lines[i] === exp, error: null }));
}

// ── TOPICS loaded from problems.json via fetch ───────────────────────────
// (data is stored in state inside the App component — see useEffect below)
let TOPICS = []; // runtime placeholder; populated after fetch


// ── Language configs ──────────────────────────────────────────────────────
const LANGUAGES = {
  java: {
    label: "Java", icon: "☕", version: "*",
    pistonLang: "java",
    fileName: (code) => {
      const m = code.match(/public\s+class\s+(\w+)/);
      return m ? `${m[1]}.java` : "Solution.java";
    },
    fixCode: (code) => code, // don't rename — keep user's class name
    color: "#f59e0b"
  },
  python: {
    label: "Python", icon: "🐍", version: "3",
    pistonLang: "python",
    fileName: () => "solution.py",
    fixCode: (code) => code,
    color: "#3b82f6"
  },
  c: {
    label: "C", icon: "⚙️", version: "*",
    pistonLang: "c",
    fileName: () => "solution.c",
    fixCode: (code) => code,
    color: "#8b5cf6"
  }
};

// ── Starters per language ─────────────────────────────────────────────────
function getStarter(problem, lang) {
  if (lang === "java") return problem.starter;
  if (lang === "python") {
    return `# ${problem.title}
# ${problem.description}

def solution():
    # Write your solution here
    pass

# Test your solution
if __name__ == "__main__":
    # Add your test cases here
    print("Test your solution")
`;
  }
  if (lang === "c") {
    return `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// ${problem.title}
// ${problem.description}

// Write your solution here

int main() {
    // Test your solution
    printf("Test your solution\\n");
    return 0;
}
`;
  }
  return problem.starter;
}

// ── Styles ────────────────────────────────────────────────────────────────
// ALL_PROBLEMS is now derived from loaded topics state in App component
const S = {
  bg: "#f8fafc", card: "#ffffff", border: "#e2e8f0", text: "#1e293b",
  sub: "#64748b", light: "#f1f5f9", accent: "#6366f1", success: "#22c55e",
  warning: "#f59e0b", danger: "#ef4444", shadow: "0 1px 3px rgba(0,0,0,0.1)",
  shadowMd: "0 4px 12px rgba(0,0,0,0.08)", radius: "10px",
};
const dc = { Easy: S.success, Medium: S.warning, Hard: S.danger };

// ── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("dashboard");
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [userStats, setUserStats] = useState({});
  const [topics, setTopics] = useState([]);
  const [problemsLoaded, setProblemsLoaded] = useState(false);

  useEffect(() => {
    // Load problems from external JSON (keeps JSX file small, supports 1000+ problems)
    fetch(`${BACKEND}/api/problems`)
      .then(r => r.json())
      .then(data => {
        // Guard: server returns {error:...} if problems.json is missing — that's not an array
        if (!Array.isArray(data)) {
          console.error("problems.json not found or wrong format. Place problems.json next to server.js and restart.");
          setProblemsLoaded(true);
          return;
        }
        TOPICS = data; // update module-level reference used by Analytics/Dashboard
        setTopics(data);
        setProblemsLoaded(true);
      })
      .catch(() => {
        console.error("Could not load problems.json from backend. Make sure server.js is running.");
        setProblemsLoaded(true);
      });
    loadProgress().then(data => { if (data?.stats) setUserStats(data.stats); });
  }, []);

  // Derive flat problems list from loaded topics
  const ALL_PROBLEMS = topics.flatMap(t => t.problems.map(p => ({ ...p, topicId: t.id, topicName: t.name })));

  if (!problemsLoaded) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Inter','Segoe UI',sans-serif", background:"#f8fafc", color:"#64748b", fontSize:15 }}>
      ⏳ Loading problems...
    </div>
  );

  if (topics.length === 0) return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Inter','Segoe UI',sans-serif", background:"#f8fafc", gap:12 }}>
      <div style={{ fontSize:40 }}>⚠️</div>
      <div style={{ fontSize:18, fontWeight:700, color:"#1e293b" }}>problems.json not found</div>
      <div style={{ fontSize:14, color:"#64748b", textAlign:"center", maxWidth:420, lineHeight:1.6 }}>
        Make sure <code style={{ background:"#f1f5f9", padding:"2px 6px", borderRadius:4, fontFamily:"monospace" }}>problems.json</code> is in the same folder as <code style={{ background:"#f1f5f9", padding:"2px 6px", borderRadius:4, fontFamily:"monospace" }}>server.js</code>, then restart the backend.
      </div>
      <button onClick={() => window.location.reload()} style={{ marginTop:8, padding:"8px 20px", background:"#6366f1", color:"#fff", border:"none", borderRadius:8, fontSize:14, cursor:"pointer", fontWeight:600 }}>
        🔄 Retry
      </button>
    </div>
  );

  const updateStats = async (pid, result) => {
    setUserStats(prev => {
      const ex = prev[pid] || { attempts: 0, passed: false, errors: [], time: 0 };
      const updated = { ...prev, [pid]: { ...ex, attempts: ex.attempts+1, passed: result.passed||ex.passed, errors: result.errorType?[...ex.errors.slice(-9),result.errorType]:ex.errors, time: result.time||ex.time } };
      saveProgress({ problemId: pid, ...result, stats: updated });
      return updated;
    });
  };

  if (view === "problem" && selectedProblem) return <Solver problem={selectedProblem} onBack={() => setView(selectedTopic?"topic":"dashboard")} stats={userStats} updateStats={updateStats} />;
  if (view === "topic" && selectedTopic) return <TopicView topic={selectedTopic} onBack={() => setView("dashboard")} onSelectProblem={p => { setSelectedProblem(p); setView("problem"); }} stats={userStats} />;
  if (view === "analytics") return <Analytics stats={userStats} onBack={() => setView("dashboard")} allProblems={ALL_PROBLEMS} topics={topics} />;
  return <Dashboard onSelectTopic={t => { setSelectedTopic(t); setView("topic"); }} stats={userStats} onAnalytics={() => setView("analytics")} allProblems={ALL_PROBLEMS} topics={topics} />;
}

// ── Dashboard ─────────────────────────────────────────────────────────────
function Dashboard({ onSelectTopic, stats, onAnalytics, allProblems, topics: TOPICS }) {
  const totalProblems = allProblems.length;
  const solved = Object.values(stats).filter(s => s.passed).length;
  const attempts = Object.values(stats).reduce((a, b) => a + b.attempts, 0);

  return (
    <div style={{ minHeight:"100vh", background:S.bg, fontFamily:"'Inter','Segoe UI',sans-serif", color:S.text }}>
      {/* Header */}
      <header style={{ background:"#fff", borderBottom:`1px solid ${S.border}`, padding:"0 40px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:S.shadow }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34,height:34,borderRadius:8,background:S.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>☕</div>
          <span style={{ fontWeight:700, fontSize:18, color:S.text }}>LogicLab</span>
          <span style={{ fontSize:11, color:S.sub, background:S.light, padding:"2px 8px", borderRadius:4 }}>Java · Python · C</span>
        </div>
        <button onClick={onAnalytics} style={{ background:S.accent, border:"none", borderRadius:8, padding:"8px 16px", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}>📊 Analytics</button>
      </header>

      <div style={{ maxWidth:1200, margin:"0 auto", padding:"40px 24px" }}>
        {/* Hero */}
        <div style={{ background:`linear-gradient(135deg,${S.accent},#8b5cf6)`, borderRadius:16, padding:"40px 48px", color:"#fff", marginBottom:32 }}>
          <h1 style={{ margin:0, fontSize:28, fontWeight:800 }}>Master Coding Interviews</h1>
          <p style={{ margin:"8px 0 24px", opacity:0.85, fontSize:15 }}>Topic-based learning · Real Java execution · AI mentor guidance</p>
          <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
            {[{l:"Problems",v:totalProblems,i:"📚"},{l:"Topics",v:TOPICS.length,i:"🗂️"},{l:"Solved",v:solved,i:"✅"},{l:"Attempts",v:attempts,i:"🔄"}].map(s=>(
              <div key={s.l} style={{ background:"rgba(255,255,255,0.15)", borderRadius:10, padding:"12px 20px", backdropFilter:"blur(8px)" }}>
                <div style={{ fontSize:20 }}>{s.i}</div>
                <div style={{ fontSize:22, fontWeight:700, marginTop:2 }}>{s.v}</div>
                <div style={{ fontSize:11, opacity:0.8, marginTop:1 }}>{s.l}</div>
              </div>
            ))}
            <div style={{ flex:1, minWidth:200, background:"rgba(255,255,255,0.15)", borderRadius:10, padding:"12px 20px", backdropFilter:"blur(8px)" }}>
              <div style={{ fontSize:12, opacity:0.8, marginBottom:8 }}>Overall Progress</div>
              <div style={{ height:6, background:"rgba(255,255,255,0.3)", borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${totalProblems > 0 ? Math.round((solved/totalProblems)*100) : 0}%`, background:"#fff", borderRadius:3, transition:"width 0.5s" }} />
              </div>
              <div style={{ fontSize:11, opacity:0.8, marginTop:5 }}>{totalProblems > 0 ? Math.round((solved/totalProblems)*100) : 0}% complete</div>
            </div>
          </div>
        </div>

        {/* Topic grid */}
        <h2 style={{ margin:"0 0 20px", fontSize:18, fontWeight:700, color:S.text }}>Topics</h2>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:16 }}>
          {TOPICS.map(topic => {
            const topicProblems = topic.problems;
            const topicSolved = topicProblems.filter(p => stats[p.id]?.passed).length;
            const pct = Math.round((topicSolved/topicProblems.length)*100);
            const easy = topicProblems.filter(p=>p.difficulty==="Easy").length;
            const med = topicProblems.filter(p=>p.difficulty==="Medium").length;
            const hard = topicProblems.filter(p=>p.difficulty==="Hard").length;
            return (
              <button key={topic.id} onClick={() => onSelectTopic(topic)}
                style={{ background:"#fff", border:`1px solid ${S.border}`, borderRadius:12, padding:20, cursor:"pointer", textAlign:"left", fontFamily:"inherit", transition:"all 0.18s", boxShadow:S.shadow }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow=S.shadowMd; e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.borderColor=topic.color+"66"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow=S.shadow; e.currentTarget.style.transform="none"; e.currentTarget.style.borderColor=S.border; }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                  <div style={{ width:42, height:42, borderRadius:10, background:topic.color+"15", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{topic.icon}</div>
                  <div style={{ fontSize:12, color:S.sub, background:S.light, padding:"3px 8px", borderRadius:6 }}>{topicSolved}/{topicProblems.length} solved</div>
                </div>
                <div style={{ fontSize:15, fontWeight:700, color:S.text, marginBottom:4 }}>{topic.name}</div>
                <div style={{ fontSize:12, color:S.sub, marginBottom:12, lineHeight:1.5 }}>{topic.desc}</div>
                <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                  {[{l:"Easy",v:easy,c:S.success},{l:"Med",v:med,c:S.warning},{l:"Hard",v:hard,c:S.danger}].map(d=>(
                    <span key={d.l} style={{ fontSize:10, color:d.c, background:d.c+"15", padding:"2px 7px", borderRadius:4 }}>{d.v} {d.l}</span>
                  ))}
                </div>
                <div style={{ height:4, background:S.light, borderRadius:2, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${pct}%`, background:topic.color, borderRadius:2, transition:"width 0.5s" }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;}`}</style>
    </div>
  );
}

// ── Topic View ────────────────────────────────────────────────────────────
function TopicView({ topic, onBack, onSelectProblem, stats }) {
  const [filter, setFilter] = useState("All");
  const filtered = filter === "All" ? topic.problems : topic.problems.filter(p => p.difficulty===filter);

  return (
    <div style={{ minHeight:"100vh", background:S.bg, fontFamily:"'Inter','Segoe UI',sans-serif", color:S.text }}>
      <header style={{ background:"#fff", borderBottom:`1px solid ${S.border}`, padding:"0 40px", height:60, display:"flex", alignItems:"center", gap:12, boxShadow:S.shadow }}>
        <button onClick={onBack} style={{ background:"transparent", border:`1px solid ${S.border}`, borderRadius:7, padding:"5px 12px", color:S.sub, cursor:"pointer", fontSize:13 }}>← Back</button>
        <div style={{ width:32,height:32,borderRadius:8,background:topic.color+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>{topic.icon}</div>
        <span style={{ fontWeight:700, fontSize:16, color:S.text }}>{topic.name}</span>
        <span style={{ fontSize:12, color:S.sub }}>{topic.problems.filter(p=>stats[p.id]?.passed).length}/{topic.problems.length} solved</span>
      </header>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"32px 24px" }}>
        <p style={{ color:S.sub, fontSize:14, marginBottom:24 }}>{topic.desc}</p>
        <div style={{ display:"flex", gap:8, marginBottom:24 }}>
          {["All","Easy","Medium","Hard"].map(f => {
            const colors = { All:S.accent, Easy:S.success, Medium:S.warning, Hard:S.danger };
            const active = filter === f;
            const count = f==="All"?topic.problems.length:topic.problems.filter(p=>p.difficulty===f).length;
            return (
              <button key={f} onClick={() => setFilter(f)}
                style={{ background:active?colors[f]+"18":"#fff", border:`1px solid ${active?colors[f]:S.border}`, borderRadius:8, padding:"6px 16px", color:active?colors[f]:S.sub, cursor:"pointer", fontSize:12, fontWeight:active?600:400, display:"flex", alignItems:"center", gap:6 }}>
                {f} <span style={{ background:active?colors[f]+"22":S.light, borderRadius:10, padding:"0 6px", fontSize:11 }}>{count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
          {filtered.map(p => {
            const ps = stats[p.id];
            return (
              <button key={p.id} onClick={() => onSelectProblem(p)}
                style={{ background:"#fff", border:`1px solid ${ps?.passed?"#22c55e44":S.border}`, borderRadius:10, padding:16, cursor:"pointer", textAlign:"left", fontFamily:"inherit", transition:"all 0.15s", boxShadow:S.shadow, position:"relative" }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow=S.shadowMd; e.currentTarget.style.borderColor=topic.color+"66"; e.currentTarget.style.transform="translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow=S.shadow; e.currentTarget.style.borderColor=ps?.passed?"#22c55e44":S.border; e.currentTarget.style.transform="none"; }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:11, color:S.sub }}>{ps?.passed?"✅":ps?"🔄":"○"} {p.id}</span>
                  <span style={{ fontSize:10, color:dc[p.difficulty], background:dc[p.difficulty]+"18", padding:"2px 8px", borderRadius:4, fontWeight:600 }}>{p.difficulty}</span>
                </div>
                <div style={{ fontSize:13, fontWeight:600, color:S.text, marginBottom:6 }}>{p.title}</div>
                <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:8 }}>
                  {p.tags.map(t => <span key={t} style={{ fontSize:10, color:topic.color, background:topic.color+"12", padding:"1px 6px", borderRadius:3 }}>{t}</span>)}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:S.sub, borderTop:`1px solid ${S.border}`, paddingTop:8 }}>
                  <span>{p.pattern}</span>
                  {ps ? <span>{ps.attempts} attempt{ps.attempts!==1?"s":""}</span> : <span style={{ color:topic.color }}>→ Solve</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Solver ────────────────────────────────────────────────────────────────
function Solver({ problem, onBack, stats, updateStats }) {
  const [lang, setLang] = useState("java");
  const [code, setCode] = useState(problem.starter);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState("problem");
  const [compileErr, setCompileErr] = useState(null);
  const [aiMsg, setAiMsg] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  const [shownHints, setShownHints] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [interviewMode, setInterviewMode] = useState(false);
  const [interviewAnalysis, setInterviewAnalysis] = useState(null);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const chatEndRef = useRef(null);
  const ps = stats[problem.id];
  const passed = results?.every(r => r.passed);

  // ── Language-specific terminology (drives UI + every AI prompt) ────────────
  const langLabel = LANGUAGES[lang].label; // "Java", "Python", "C"

  const langPattern = lang === "python"
    ? "Dictionary / Hashing"
    : lang === "c"
    ? "Array / Hash Table"
    : "HashMap"; // Java

  const dsTerminology = lang === "python"
    ? "STRICT TERMINOLOGY: Say 'dictionary' only (NEVER 'hashmap' or 'HashMap'). Say 'list' for arrays."
    : lang === "c"
    ? "STRICT TERMINOLOGY: Say 'array' or 'manual hash table' only (NEVER 'HashMap' or 'dictionary')."
    : "STRICT TERMINOLOGY: Say 'HashMap', 'ArrayList' etc. (Java-specific terms only).";

  const adaptApproach = (text) => {
    if (!text) return text;
    if (lang === "python")
      return text.replace(/HashMap/gi,"dictionary").replace(/Hash Map/gi,"dictionary")
                 .replace(/HashSet/gi,"set").replace(/Hash Set/gi,"set")
                 .replace(/ArrayList/gi,"list");
    if (lang === "c")
      return text.replace(/HashMap/gi,"array / hash table").replace(/Hash Map/gi,"array / hash table")
                 .replace(/HashSet/gi,"boolean array").replace(/Hash Set/gi,"boolean array")
                 .replace(/ArrayList/gi,"array");
    return text;
  };

  const langApproaches = {
    brute:     adaptApproach(problem.approaches.brute),
    optimized: adaptApproach(problem.approaches.optimized),
    edge:      problem.approaches.edge,
  };


  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [chatMessages, chatLoading]);

  const hints = [
    `💡 Brute Force: ${langApproaches.brute}`,
    `⚡ Optimized: ${langApproaches.optimized}`,
    `⚠️ Edge Cases: ${langApproaches.edge}`
  ];

  const getAIHelp = async (type) => {
    setAiLoading(true); setAiMsg(null); setTab("ai");

    const testSummary = results
      ? results.map((r,i) => `Test ${i+1} (${r.label}): Expected="${r.expected}" Got="${r.actual}" → ${r.passed?"PASS":"FAIL"}`).join("\n")
      : "No test results yet.";

    const prompts = {
      // ── Explain Error ──────────────────────────────────────────────────────
      error: `Evaluate this ${langLabel} solution for "${problem.title}".

Problem description: ${problem.description}
Pattern: ${langPattern} | Optimal complexity: ${problem.optimal}
Brute force approach: ${langApproaches.brute}
Optimized approach: ${langApproaches.optimized}
Language: ${langLabel}
${dsTerminology}

Student's ${langLabel} code:
${code}

Test results:
${testSummary}
${compileErr ? "Compile/Runtime Error:\n" + compileErr : ""}

Evaluate using the structured format. Check if output mismatches are just formatting. Accept any correct approach. If incorrect, explain the mistake and give a hint — no code.`,

      // ── Code Review ────────────────────────────────────────────────────────
      review: `Evaluate and review this ${langLabel} solution for "${problem.title}".

Problem description: ${problem.description}
Pattern: ${langPattern} | Optimal: ${problem.optimal}
Language: ${langLabel}
${dsTerminology}

Student's ${langLabel} code:
${code}

Test results:
${testSummary}

Give a full structured evaluation. If all tests pass, analyze complexity and suggest optimization. Be encouraging. No code.`,

      // ── Clarify Concept ────────────────────────────────────────────────────
      concept: `The student is working on "${problem.title}" in ${langLabel} and needs conceptual help.
Pattern: ${langPattern} | Tags: ${problem.tags.join(", ")}
Optimal approach: ${langApproaches.optimized}
Language: ${langLabel}
${dsTerminology}

Their current ${langLabel} code:
${code}

Do NOT evaluate correctness. Instead:
1. Explain the core concept using a simple real-world analogy
2. Ask 2-3 guiding questions to help them discover the right approach
3. Point out what to think about step by step
No code, no pseudocode.`,

      // ── Explain Approach (NEW) ─────────────────────────────────────────────
      explainApproach: `You are explaining approaches for "${problem.title}" to a student coding in ${langLabel}.

Problem: ${problem.description}
Language: ${langLabel}

${dsTerminology}

STRICT RULES — follow every one:
1. Always show BOTH: Pattern AND Approach Guide (Brute Force + Optimal).
2. Pattern name MUST be language-specific:
   - Python  → "Dictionary / Hashing"
   - Java    → "HashMap"
   - C       → "Array / Hash Table"  (NEVER write "HashMap" for C)
3. Brute Force: nested loop approach, time complexity O(n²).
4. Optimal: use ONLY the correct language-specific term:
   - Python → "dictionary"
   - Java   → "HashMap"
   - C      → "array" or "manual hash table"
5. Keep it very simple — no jargon. Step-by-step. No full code.

Respond using EXACTLY this format:

Pattern:
[language-specific pattern name]

Approach Guide:

Brute Force:
- [simple explanation of nested loop idea]
- Steps:
  1. [step]
  2. [step]
  3. [step]
- Time complexity: O(n²)

Optimal:
- [explanation using correct language-specific term]
- Steps:
  1. [step]
  2. [step]
  3. [step]
- Time complexity: O(n)`
    };

    const resp = await callAI(prompts[type]);
    setAiMsg(resp); setAiLoading(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim(); setChatInput("");
    setChatMessages(prev => [...prev, { role:"user", text:msg }]);
    setChatLoading(true);
    const prompt = `You are a strict coding mentor for "${problem.title}" in ${langLabel} (Pattern: ${langPattern}, Tags: ${problem.tags.join(", ")}).

STRICT RULES:
- NEVER write code, pseudocode, or code snippets of any kind
- Guide only with questions, analogies, and conceptual explanations
- If asked "what is the answer" or "give me code" → politely refuse and redirect
- Be Socratic: ask "Have you thought about...?", "What happens when...?"
- Accept any correct approach — brute force is valid too
- Be encouraging and beginner-friendly
- ${dsTerminology}

Student's current ${langLabel} code:
${code}

Previous test results: ${results ? results.map(r=>`${r.label}:${r.passed?"PASS":"FAIL"}`).join(", ") : "not submitted yet"}

Student asks: ${msg}

Respond as a thoughtful mentor. Keep it conversational and simple.`;
    const resp = await callAI(prompt);
    setChatMessages(prev => [...prev, { role:"ai", text:resp }]);
    setChatLoading(false);
  };

  const runInterviewAnalysis = async (testResults, codeSnapshot) => {
    setInterviewLoading(true); setInterviewAnalysis(null);
    const passCount = testResults.filter(r => r.passed).length;
    const testSummary = testResults.map((r,i) => `Test ${i+1} (${r.label}): Expected="${r.expected}" Got="${r.actual}" → ${r.passed?"PASS":"FAIL"}`).join("\n");

    const prompt = `You are a FAANG technical interviewer evaluating a ${langLabel} solution for "${problem.title}".

Problem: ${problem.description}
Pattern: ${langPattern} | Optimal: ${problem.optimal}
Tags: ${problem.tags.join(", ")}
Language: ${langLabel}
${dsTerminology}

Candidate's ${langLabel} code:
${codeSnapshot}

Test results (${passCount}/${testResults.length} passed):
${testSummary}

IMPORTANT: Accept any correct approach. Check if mismatches are just formatting issues.

Provide structured interview feedback using EXACTLY these headers. NO CODE anywhere:

ANALYSIS:
[2-3 sentences: correctness verdict, approach used, overall quality]

TIME_COMPLEXITY:
[O(...) with clear reasoning]

SPACE_COMPLEXITY:
[O(...) with clear reasoning]

APPROACH_QUESTIONS:
Q1: [Why did you choose this approach over others?]
Q2: [Can this be optimized further? If yes, what direction would you explore?]
Q3: [What is the tradeoff of your current solution?]

EDGE_CASE_QUESTIONS:
Q1: [What happens with empty input?]
Q2: [How does your solution handle duplicates or negative numbers?]

CONCEPT_QUESTIONS:
C1: [Conceptual question about ${problem.tags[0]}]
C2: [Deeper theory question about the pattern used]

RECOMMENDATION:
[1 encouraging sentence on what to study or improve next]`;

    const resp = await callAI(prompt);
    setInterviewAnalysis(resp); setInterviewLoading(false);
  };

  const submit = async () => {
    setRunning(true); setCompileErr(null); setAiMsg(null);
    const startT = Date.now();

    const response = await runCode(code, lang, problem);
    const elapsed  = Math.round((Date.now() - startT) / 1000);

    // Handle compile/runtime errors
    if (response.stderr && !response.stdout && !response.results) {
      setCompileErr(response.stderr);
      setResults(null);
      setTab("results");
      setRunning(false);
      updateStats(problem.id, { passed: false, errorType: "compile", time: elapsed });
      setTimeout(() => getAIHelp("error"), 400);
      return;
    }

    // Use results from backend (already compared) or parse manually
    const res = response.results || parseResults(response.stdout, response.stderr, problem);
    setResults(res);

    const ok = res.every(r => r.passed);
    updateStats(problem.id, { passed: ok, errorType: ok ? null : "logical", time: elapsed });
    setTab("results");
    if (interviewMode) await runInterviewAnalysis(res, code);
    if (!ok && (ps?.attempts || 0) >= 2) setTimeout(() => getAIHelp("error"), 400);
    if (ok) setTimeout(() => getAIHelp("review"), 300);
    setRunning(false);
  };

  const parseSection = (text, section) => {
    const m = text?.match(new RegExp(`${section}:\\s*([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`));
    return m ? m[1].trim() : "";
  };

  const TABS = [
    {k:"problem",l:"Problem"},
    {k:"results",l:results?`Results (${results.filter(r=>r.passed).length}/${results.length})`:"Results"},
    {k:"hints",l:"Hints"},
    {k:"ai",l:"🤖 AI Mentor"},
    {k:"help",l:"💬 Help"},
    {k:"interview",l:"🎯 Interview"},
  ];

  return (
    <div style={{ height:"100vh", background:S.bg, fontFamily:"'Inter','Segoe UI',sans-serif", color:S.text, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <header style={{ background:"#fff", borderBottom:`1px solid ${S.border}`, padding:"0 16px", height:52, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:S.shadow }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button onClick={onBack} style={{ background:"transparent", border:`1px solid ${S.border}`, borderRadius:6, padding:"4px 10px", color:S.sub, cursor:"pointer", fontSize:12 }}>← Back</button>
          <span style={{ color:S.sub, fontSize:12 }}>{problem.topicName}</span>
          <span style={{ color:S.text, fontWeight:600, fontSize:13 }}>{problem.title}</span>
          <span style={{ fontSize:10, color:dc[problem.difficulty], background:dc[problem.difficulty]+"18", padding:"2px 8px", borderRadius:4, fontWeight:600 }}>{problem.difficulty}</span>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={() => { setInterviewMode(m=>!m); setInterviewAnalysis(null); setTab(interviewMode?"problem":"interview"); }}
            style={{ background:interviewMode?"#6366f118":"transparent", border:`1px solid ${interviewMode?S.accent:S.border}`, borderRadius:6, padding:"4px 10px", color:interviewMode?S.accent:S.sub, cursor:"pointer", fontSize:12 }}>
            {interviewMode?"🎯 Interview ON":"🎯 Interview Mode"}
          </button>
          {ps?.passed && <span style={{ fontSize:12, color:S.success }}>✅ Solved</span>}
        </div>
      </header>

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        <div style={{ width:"44%", display:"flex", flexDirection:"column", borderRight:`1px solid ${S.border}`, overflow:"hidden", background:"#fff" }}>
          <div style={{ display:"flex", borderBottom:`1px solid ${S.border}`, background:"#fff", flexShrink:0, overflow:"auto" }}>
            {TABS.map(t => (
              <button key={t.k} onClick={() => setTab(t.k)}
                style={{ padding:"10px 12px", background:"transparent", border:"none", borderBottom:tab===t.k?`2px solid ${S.accent}`:"2px solid transparent", color:tab===t.k?S.accent:S.sub, cursor:"pointer", fontSize:11, fontFamily:"inherit", whiteSpace:"nowrap", fontWeight:tab===t.k?600:400 }}>
                {t.l}
              </button>
            ))}
          </div>

          <div style={{ flex:1, overflow:"auto", padding:20 }}>

            {/* PROBLEM */}
            {tab==="problem" && (
              <div>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:12, alignItems:"center" }}>
                  {problem.tags.map(t => <span key={t} style={{ fontSize:11, color:S.accent, background:"#6366f112", padding:"2px 8px", borderRadius:4 }}>{t}</span>)}

                </div>

                <p style={{ fontSize:13, lineHeight:1.8, color:S.sub, marginBottom:14, whiteSpace:"pre-line" }}>{problem.description}</p>
                {problem.examples.map((ex,i) => (
                  <div key={i} style={{ background:S.light, border:`1px solid ${S.border}`, borderRadius:8, padding:12, marginBottom:8, fontSize:12 }}>
                    <div style={{ color:S.sub }}>Input: <span style={{ color:S.text, fontFamily:"monospace" }}>{ex.input}</span></div>
                    <div style={{ color:S.sub, marginTop:3 }}>Output: <span style={{ color:S.success, fontFamily:"monospace", fontWeight:600 }}>{ex.output}</span></div>
                  </div>
                ))}
                <div style={{ background:S.light, border:`1px solid ${S.border}`, borderRadius:8, padding:12, fontSize:12, marginTop:8 }}>
                  {[["Pattern",langPattern,S.accent],["Optimal",problem.optimal,S.success]].map(([k,v,c]) => (
                    <div key={k} style={{ color:S.sub, marginTop:4 }}>{k}: <span style={{ color:c, fontWeight:600 }}>{v}</span></div>
                  ))}
                </div>
                <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:12, fontSize:12, marginTop:10 }}>
                  <div style={{ fontSize:11, color:"#92400e", textTransform:"uppercase", fontWeight:600, marginBottom:8 }}>Approach Guide</div>
                  {[["🔨 Brute",langApproaches.brute,"#92400e"],["⚡ Optimal",langApproaches.optimized,"#166534"],["⚠️ Edge",langApproaches.edge,"#c2410c"]].map(([k,v,c]) => (
                    <div key={k} style={{ marginTop:6, color:"#78350f" }}><span style={{ color:c, fontWeight:600 }}>{k}:</span> {v}</div>
                  ))}
                </div>
              </div>
            )}

            {/* RESULTS */}
            {tab==="results" && (
              <div>
                {!results&&!compileErr&&<div style={{ textAlign:"center", color:S.sub, fontSize:13, marginTop:50 }}>Submit your code to see results.</div>}
                {compileErr&&(
                  <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:14, marginBottom:14 }}>
                    <div style={{ color:S.danger, fontWeight:600, marginBottom:8 }}>⛔ Compilation Error</div>
                    <pre style={{ fontSize:11, color:"#991b1b", margin:0, whiteSpace:"pre-wrap", lineHeight:1.6, maxHeight:180, overflow:"auto", fontFamily:"monospace" }}>{compileErr}</pre>
                    <button onClick={() => getAIHelp("error")} style={{ marginTop:10, background:S.accent, border:"none", borderRadius:6, padding:"6px 14px", color:"#fff", cursor:"pointer", fontSize:12 }}>🤖 Explain this error</button>
                  </div>
                )}
                {results&&(
                  <>
                    <div style={{ background:passed?"#f0fdf4":"#fef2f2", border:`1px solid ${passed?"#bbf7d0":"#fecaca"}`, borderRadius:8, padding:14, marginBottom:14 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:22 }}>{passed?"🎉":"❌"}</span>
                        <div>
                          <div style={{ fontWeight:700, color:passed?S.success:S.danger, fontSize:14 }}>{passed?"All Tests Passed!":`${results.filter(r=>r.passed).length}/${results.length} Tests Passed`}</div>
                          <div style={{ fontSize:11, color:S.sub, marginTop:2 }}>✅ Local {LANGUAGES[lang]?.label || "Java"} compiler on your machine</div>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8, marginTop:10 }}>
                        {!passed&&<button onClick={() => getAIHelp("error")} style={{ background:S.accent, border:"none", borderRadius:6, padding:"6px 14px", color:"#fff", cursor:"pointer", fontSize:12 }}>🤖 Explain failures</button>}
                        {passed&&<button onClick={() => getAIHelp("review")} style={{ background:S.success, border:"none", borderRadius:6, padding:"6px 14px", color:"#fff", cursor:"pointer", fontSize:12 }}>🤖 AI Code Review</button>}
                      </div>
                    </div>
                    {results.map((r,i) => (
                      <div key={i} style={{ background:r.passed?"#f0fdf4":"#fef2f2", border:`1px solid ${r.passed?"#bbf7d0":"#fecaca"}`, borderRadius:8, padding:12, marginBottom:8, fontSize:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ color:S.sub }}>Test {i+1} — <span style={{ color:S.text }}>{r.label}</span></span>
                          <span style={{ color:r.passed?S.success:S.danger, fontWeight:600 }}>{r.passed?"✓ PASS":"✗ FAIL"}</span>
                        </div>
                        <div style={{ color:S.sub, fontFamily:"monospace" }}>Expected: <span style={{ color:S.success }}>{r.expected}</span></div>
                        {!r.passed&&<div style={{ color:S.sub, marginTop:3, fontFamily:"monospace" }}>Got: <span style={{ color:S.danger }}>{r.error?r.error.split("\n")[0]:r.actual}</span></div>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* HINTS */}
            {tab==="hints" && (
              <div>
                <div style={{ fontSize:12, color:S.sub, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:14, fontWeight:600 }}>Progressive Hints</div>
                {!results&&!compileErr&&<div style={{ background:S.light, border:`1px solid ${S.border}`, borderRadius:8, padding:16, textAlign:"center", color:S.sub, fontSize:13 }}>Submit code first to unlock hints.</div>}
                {passed&&<div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:14, color:S.success, fontSize:13 }}>🎉 Problem solved! No hints needed.</div>}
                {(results||compileErr)&&!passed&&(
                  <>
                    {shownHints.map((h,i) => (
                      <div key={i} style={{ background:S.light, border:`1px solid ${["#a5b4fc","#fde68a","#fed7aa"][i]}`, borderRadius:8, padding:12, marginBottom:10, fontSize:13, lineHeight:1.7, borderLeft:`3px solid ${[S.accent,S.warning,"#f97316"][i]}` }}>{h}</div>
                    ))}
                    {hintIdx<hints.length
                      ?<button onClick={() => { setShownHints(p=>[...p,hints[hintIdx]]); setHintIdx(p=>p+1); }} style={{ background:S.accent, border:"none", borderRadius:8, padding:"9px 18px", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}>{hintIdx===0?"💡 Get First Hint":`➡ Next Hint (${hintIdx+1}/${hints.length})`}</button>
                      :<div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:12, fontSize:12, color:"#92400e" }}>All hints shown — try the AI Mentor for deeper guidance.</div>}
                  </>
                )}
              </div>
            )}

            {/* AI MENTOR */}
            {tab==="ai" && (
              <div style={{ display:"flex", flexDirection:"column" }}>
                <div style={{ fontSize:12, color:S.sub, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:12, fontWeight:600 }}>🤖 AI Mentor</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                  {[{k:"explainApproach",l:"Explain Approach",i:"📖",c:"#0ea5e9"},{k:"error",l:"Explain Error",i:"🐛",c:S.danger},{k:"review",l:"Code Review",i:"🔍",c:S.success},{k:"concept",l:"Clarify Concept",i:"💡",c:S.warning}].map(b=>(
                    <button key={b.k} onClick={()=>getAIHelp(b.k)} disabled={aiLoading}
                      style={{ background:"#fff", border:`1px solid ${b.c}44`, borderRadius:8, padding:"10px 12px", color:b.c, cursor:"pointer", fontSize:12, fontFamily:"inherit", display:"flex", alignItems:"center", gap:6, fontWeight:500, boxShadow:S.shadow }}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=b.c}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=b.c+"44"}>
                      <span>{b.i}</span>{b.l}
                    </button>
                  ))}
                  <button onClick={()=>setTab("help")} style={{ background:"#fff", border:`1px solid ${S.accent}44`, borderRadius:8, padding:"10px 12px", color:S.accent, cursor:"pointer", fontSize:12, fontFamily:"inherit", display:"flex", alignItems:"center", gap:6, fontWeight:500, boxShadow:S.shadow }}>
                    <span>💬</span>Help Chat
                  </button>
                </div>
                {aiLoading&&<div style={{ background:S.light, borderRadius:8, padding:20, textAlign:"center", color:S.sub, fontSize:13 }}>🤖 Analyzing your code and thinking...</div>}
                {aiMsg&&!aiLoading&&(
                  <div style={{ background:S.light, border:`1px solid ${S.border}`, borderRadius:8, padding:16 }}>
                    <div style={{ fontSize:11, color:S.accent, textTransform:"uppercase", fontWeight:600, marginBottom:10 }}>🤖 AI Mentor</div>
                    <div style={{ fontSize:13, color:S.text, lineHeight:1.8, whiteSpace:"pre-wrap" }}>{aiMsg}</div>
                  </div>
                )}
                {!aiMsg&&!aiLoading&&(
                  <div style={{ background:S.light, border:`1px dashed ${S.border}`, borderRadius:8, padding:20, textAlign:"center", color:S.sub, fontSize:13 }}>
                    Choose an action above, or use 💬 Help Chat to ask questions directly.
                  </div>
                )}
              </div>
            )}

            {/* HELP CHAT */}
            {tab==="help" && (
              <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 170px)" }}>
                <div style={{ fontSize:12, color:S.sub, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8, fontWeight:600 }}>💬 Help Chat</div>
                <div style={{ fontSize:12, color:"#92400e", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:6, padding:"8px 12px", marginBottom:10 }}>
                  🚫 AI will <strong>never give code</strong> — only concepts, hints, and guiding questions.
                </div>
                <div style={{ flex:1, overflow:"auto", marginBottom:10, display:"flex", flexDirection:"column", gap:10 }}>
                  {chatMessages.length===0&&(
                    <div style={{ textAlign:"center", color:S.sub, fontSize:13, marginTop:20 }}>
                      <div style={{ fontSize:28, marginBottom:8 }}>💬</div>Ask anything you're stuck on!
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6, justifyContent:"center", marginTop:12 }}>
                        {["What approach should I use?","What data structure fits?","Why is my logic wrong?","Am I thinking right?","What should I do next?"].map(q=>(
                          <button key={q} onClick={()=>setChatInput(q)} style={{ background:"#fff", border:`1px solid ${S.border}`, borderRadius:6, padding:"5px 10px", color:S.sub, cursor:"pointer", fontSize:11, fontFamily:"inherit", boxShadow:S.shadow }}>{q}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatMessages.map((m,i)=>(
                    <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", flexDirection:m.role==="user"?"row-reverse":"row" }}>
                      <div style={{ width:28,height:28,borderRadius:"50%",background:m.role==="user"?S.accent:"#22c55e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0,color:"#fff" }}>
                        {m.role==="user"?"U":"AI"}
                      </div>
                      <div style={{ background:m.role==="user"?"#eef2ff":"#f8fafc", border:`1px solid ${m.role==="user"?"#a5b4fc":S.border}`, borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px", padding:"10px 14px", maxWidth:"82%", fontSize:13, color:S.text, lineHeight:1.7, whiteSpace:"pre-wrap" }}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                  {chatLoading&&<div style={{ display:"flex", gap:8 }}><div style={{ width:28,height:28,borderRadius:"50%",background:"#22c55e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#fff" }}>AI</div><div style={{ background:S.light,border:`1px solid ${S.border}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:S.sub }}>Thinking...</div></div>}
                  <div ref={chatEndRef}/>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"flex-end", flexShrink:0 }}>
                  <textarea value={chatInput} onChange={e=>setChatInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}}}
                    placeholder="Ask anything... (Enter to send)"
                    style={{ flex:1,background:"#fff",border:`1px solid ${S.border}`,borderRadius:8,padding:"10px 12px",color:S.text,fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",lineHeight:1.5,minHeight:44 }}
                    onFocus={e=>e.target.style.borderColor=S.accent}
                    onBlur={e=>e.target.style.borderColor=S.border}
                    rows={2}/>
                  <button onClick={sendChat} disabled={chatLoading||!chatInput.trim()} style={{ background:chatLoading||!chatInput.trim()?S.light:S.accent,border:"none",borderRadius:8,padding:"10px 16px",color:chatLoading||!chatInput.trim()?S.sub:"#fff",cursor:chatLoading||!chatInput.trim()?"not-allowed":"pointer",fontSize:16,height:44 }}>➤</button>
                </div>
                {chatMessages.length>0&&<button onClick={()=>setChatMessages([])} style={{ marginTop:6,background:"transparent",border:`1px solid ${S.border}`,borderRadius:6,padding:"3px 10px",color:S.sub,cursor:"pointer",fontSize:11,alignSelf:"flex-start" }}>🗑 Clear chat</button>}
              </div>
            )}

            {/* INTERVIEW */}
            {tab==="interview" && (
              <div>
                <div style={{ fontSize:12,color:S.sub,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:14,fontWeight:600 }}>🎯 Interview Simulation</div>
                {!interviewMode?(
                  <div style={{ background:"#fff",border:`1px solid ${S.border}`,borderRadius:10,padding:20 }}>
                    <div style={{ fontSize:15,fontWeight:700,color:S.text,marginBottom:8 }}>Activate Interview Mode</div>
                    <div style={{ fontSize:13,color:S.sub,lineHeight:1.8,marginBottom:16 }}>
                      ✅ No time pressure<br/>🧠 AI analyzes your approach after submit<br/>❓ Real interviewer-style questions<br/>📚 Concept questions based on your tags<br/>🎯 Personalized feedback
                    </div>
                    <button onClick={()=>setInterviewMode(true)} style={{ background:S.accent,border:"none",borderRadius:8,padding:"10px 20px",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600 }}>🚀 Start Interview Mode</button>
                  </div>
                ):(
                  <>
                    <div style={{ background:"#eef2ff",border:"1px solid #a5b4fc",borderRadius:8,padding:12,marginBottom:14,fontSize:12,color:S.accent }}>
                      🎯 <strong>Interview Mode Active</strong> — Submit code for AI analysis and questions
                    </div>
                    {!results&&!interviewAnalysis&&<div style={{ textAlign:"center",color:S.sub,fontSize:13,marginTop:30 }}>Write your solution and click <strong>Run & Submit</strong></div>}
                    {interviewLoading&&<div style={{ background:S.light,borderRadius:8,padding:20,textAlign:"center",color:S.sub,fontSize:13 }}>🤖 Interviewer is analyzing your solution...</div>}
                    {interviewAnalysis&&!interviewLoading&&(()=>{
                      const an=parseSection(interviewAnalysis,"ANALYSIS");
                      const tc=parseSection(interviewAnalysis,"TIME_COMPLEXITY");
                      const sc=parseSection(interviewAnalysis,"SPACE_COMPLEXITY");
                      const aqRaw=parseSection(interviewAnalysis,"APPROACH_QUESTIONS");
                      const eqRaw=parseSection(interviewAnalysis,"EDGE_CASE_QUESTIONS");
                      const cqRaw=parseSection(interviewAnalysis,"CONCEPT_QUESTIONS");
                      const rec=parseSection(interviewAnalysis,"RECOMMENDATION");
                      const aqs=aqRaw.split("\n").filter(l=>l.trim().match(/^Q\d+:/));
                      const eqs=eqRaw.split("\n").filter(l=>l.trim().match(/^Q\d+:/));
                      const cqs=cqRaw.split("\n").filter(l=>l.trim().match(/^C\d+:/));
                      return(
                        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                          <div style={{ background:"#fff",border:`1px solid ${S.border}`,borderRadius:10,padding:14 }}>
                            <div style={{ fontSize:11,color:S.accent,textTransform:"uppercase",fontWeight:600,marginBottom:8 }}>📋 Analysis</div>
                            <p style={{ fontSize:13,color:S.text,lineHeight:1.7,margin:0 }}>{an}</p>
                            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:10 }}>
                              {[["⏱ Time",tc,"#0ea5e9"],["💾 Space",sc,"#8b5cf6"]].map(([l,v,c])=>(
                                <div key={l} style={{ background:S.light,borderRadius:6,padding:"8px 10px" }}>
                                  <div style={{ fontSize:11,color:c,fontWeight:600,marginBottom:3 }}>{l}</div>
                                  <div style={{ fontSize:12,color:S.sub }}>{v}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                          {aqs.length>0&&<div style={{ background:"#fff",border:"1px solid #fde68a",borderRadius:10,padding:14 }}>
                            <div style={{ fontSize:11,color:S.warning,textTransform:"uppercase",fontWeight:600,marginBottom:8 }}>❓ Approach Questions</div>
                            {aqs.map((q,i)=><div key={i} style={{ background:"#fffbeb",borderRadius:6,padding:"9px 12px",marginBottom:6,fontSize:13,color:"#78350f",lineHeight:1.6 }}>{q.replace(/^Q\d+:\s*/,"")}</div>)}
                          </div>}
                          {eqs.length>0&&<div style={{ background:"#fff",border:"1px solid #fecaca",borderRadius:10,padding:14 }}>
                            <div style={{ fontSize:11,color:S.danger,textTransform:"uppercase",fontWeight:600,marginBottom:8 }}>⚠️ Edge Case Questions</div>
                            {eqs.map((q,i)=><div key={i} style={{ background:"#fef2f2",borderRadius:6,padding:"9px 12px",marginBottom:6,fontSize:13,color:"#991b1b",lineHeight:1.6 }}>{q.replace(/^Q\d+:\s*/,"")}</div>)}
                          </div>}
                          {cqs.length>0&&<div style={{ background:"#fff",border:"1px solid #a5b4fc",borderRadius:10,padding:14 }}>
                            <div style={{ fontSize:11,color:S.accent,textTransform:"uppercase",fontWeight:600,marginBottom:8 }}>📚 Concept Questions</div>
                            {cqs.map((q,i)=><div key={i} style={{ background:"#eef2ff",borderRadius:6,padding:"9px 12px",marginBottom:6,fontSize:13,color:"#3730a3",lineHeight:1.6 }}>{q.replace(/^C\d+:\s*/,"")}</div>)}
                          </div>}
                          {rec&&<div style={{ background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:12,fontSize:13,color:"#166534" }}>✅ <strong>Next Focus:</strong> {rec}</div>}
                          <button onClick={()=>setInterviewAnalysis(null)} style={{ background:"transparent",border:`1px solid ${S.border}`,borderRadius:6,padding:"6px 14px",color:S.sub,cursor:"pointer",fontSize:12,alignSelf:"flex-start" }}>🔄 Clear</button>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Editor */}
        <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
          <div style={{ padding:"8px 14px", background:"#1e293b", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
            <div style={{ display:"flex", gap:5, alignItems:"center" }}>
              {["#ef4444","#f59e0b","#22c55e"].map(c=><span key={c} style={{ width:10,height:10,borderRadius:"50%",background:c,display:"inline-block" }}/>)}
              <span style={{ marginLeft:8, fontSize:11, color:"#94a3b8", fontFamily:"monospace" }}>
                {LANGUAGES[lang].fileName(code)}
              </span>
              {/* Language selector */}
              <div style={{ display:"flex", gap:4, marginLeft:12 }}>
                {Object.entries(LANGUAGES).map(([key, cfg]) => (
                  <button key={key} onClick={() => { setLang(key); setCode(getStarter(problem, key)); setResults(null); setCompileErr(null); }}
                    style={{ background:lang===key?cfg.color+"33":"transparent", border:`1px solid ${lang===key?cfg.color:"#475569"}`, borderRadius:5, padding:"2px 9px", color:lang===key?cfg.color:"#94a3b8", cursor:"pointer", fontSize:11, fontFamily:"inherit", fontWeight:lang===key?700:400, transition:"all 0.15s" }}>
                    {cfg.icon} {cfg.label}
                  </button>
                ))}
              </div>
              {interviewMode && <span style={{ fontSize:10,color:"#818cf8",background:"#312e81",padding:"1px 7px",borderRadius:3,marginLeft:4 }}>🎯 Interview</span>}
            </div>
            <div style={{ display:"flex", gap:7 }}>
              <button onClick={() => { setCode(getStarter(problem, lang)); setResults(null); setCompileErr(null); setAiMsg(null); setHintIdx(0); setShownHints([]); setInterviewAnalysis(null); setChatMessages([]); setTab("problem"); }}
                style={{ background:"transparent",border:"1px solid #475569",borderRadius:6,padding:"4px 10px",color:"#94a3b8",cursor:"pointer",fontSize:12 }}>Reset</button>
              <button onClick={submit} disabled={running}
                style={{ background:running?"#475569":S.accent,border:"none",borderRadius:6,padding:"6px 16px",color:"#fff",cursor:running?"not-allowed":"pointer",fontSize:12,fontWeight:600,minWidth:130 }}>
                {running?"⏳ Running...":"▶ Run & Submit"}
              </button>
            </div>
          </div>
          <textarea value={code} onChange={e=>setCode(e.target.value)} spellCheck={false}
            onKeyDown={e=>{if(e.key==="Tab"){e.preventDefault();const s=e.target.selectionStart;setCode(code.substring(0,s)+"    "+code.substring(e.target.selectionEnd));setTimeout(()=>{e.target.selectionStart=e.target.selectionEnd=s+4;},0);}}}
            style={{ flex:1,background:"#0f172a",color:"#e2e8f0",border:"none",outline:"none",resize:"none",padding:20,fontSize:13,lineHeight:1.7,fontFamily:"'JetBrains Mono','Fira Code',monospace",boxSizing:"border-box" }}
          />
          <div style={{ background:"#1e293b",padding:"5px 14px",fontSize:11,color:"#64748b",display:"flex",justifyContent:"space-between",flexShrink:0 }}>
            <span>{results?`${results.filter(r=>r.passed).length}/${results.length} passing`:compileErr?"Compilation error — check AI Mentor for help":"Write your solution → Run & Submit"}</span>
            <span>Tab=4sp · {LANGUAGES[lang].icon} {LANGUAGES[lang].label} · Piston · Groq AI</span>
          </div>
        </div>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');*{box-sizing:border-box;}::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:#f1f5f9;}::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px;}button:hover{opacity:0.9;}textarea{caret-color:${S.accent};}`}</style>
    </div>
  );
}
// ── Analytics ─────────────────────────────────────────────────────────────
function Analytics({ stats, onBack, allProblems, topics: TOPICS }) {
  const solved = Object.values(stats).filter(s => s.passed).length;
  const total = allProblems.length;
  const attempts = Object.values(stats).reduce((a,b) => a+b.attempts, 0);
  const accuracy = attempts > 0 ? Math.round((solved/attempts)*100) : 0;

  const topicPerf = TOPICS.map(t => {
    const s = t.problems.filter(p => stats[p.id]?.passed).length;
    return { name:t.name, icon:t.icon, color:t.color, solved:s, total:t.problems.length, pct:Math.round((s/t.problems.length)*100) };
  });

  const weakTopics = topicPerf.filter(t => t.pct < 50 && t.pct > 0);
  const nextRec = allProblems.find(p => !stats[p.id]?.passed);

  return (
    <div style={{ minHeight:"100vh", background:S.bg, fontFamily:"'Inter','Segoe UI',sans-serif", color:S.text }}>
      <header style={{ background:"#fff", borderBottom:`1px solid ${S.border}`, padding:"0 40px", height:60, display:"flex", alignItems:"center", gap:12, boxShadow:S.shadow }}>
        <button onClick={onBack} style={{ background:"transparent", border:`1px solid ${S.border}`, borderRadius:7, padding:"5px 12px", color:S.sub, cursor:"pointer", fontSize:13 }}>← Dashboard</button>
        <span style={{ fontWeight:700, fontSize:16 }}>📊 Performance Analytics</span>
      </header>
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"32px 24px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12, marginBottom:24 }}>
          {[{l:"Solved",v:`${solved}/${total}`,c:S.accent,i:"🎯"},{l:"Attempts",v:attempts,c:"#0ea5e9",i:"📝"},{l:"Accuracy",v:`${accuracy}%`,c:accuracy>=70?S.success:accuracy>=40?S.warning:S.danger,i:"📈"}].map(k=>(
            <div key={k.l} style={{ background:"#fff", border:`1px solid ${S.border}`, borderRadius:10, padding:"16px 20px", boxShadow:S.shadow }}>
              <div style={{ fontSize:22, marginBottom:6 }}>{k.i}</div>
              <div style={{ fontSize:24, fontWeight:700, color:k.c }}>{k.v}</div>
              <div style={{ fontSize:12, color:S.sub, marginTop:3 }}>{k.l}</div>
            </div>
          ))}
        </div>

        <div style={{ background:"#fff", border:`1px solid ${S.border}`, borderRadius:10, padding:20, marginBottom:16, boxShadow:S.shadow }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>Topic-wise Progress</div>
          {topicPerf.map(t => (
            <div key={t.name} style={{ marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:5 }}>
                <span style={{ display:"flex", alignItems:"center", gap:6 }}><span>{t.icon}</span>{t.name}</span>
                <span style={{ color:t.pct>=80?S.success:t.pct>=50?S.warning:S.danger, fontWeight:600 }}>{t.pct}% · {t.solved}/{t.total}</span>
              </div>
              <div style={{ height:6, background:S.light, borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${t.pct}%`, background:t.color, borderRadius:3, transition:"width 0.5s" }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ background:"#fff", border:`1px solid ${S.border}`, borderRadius:10, padding:20, boxShadow:S.shadow }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>🤖 AI Recommendations</div>
          {weakTopics.length>0&&<div style={{ marginBottom:10,fontSize:13,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"10px 14px" }}>⚠ Weak topics: <strong>{weakTopics.map(t=>t.name).join(", ")}</strong> — focus practice here</div>}
          {nextRec&&<div style={{ fontSize:13,color:"#166534",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:6,padding:"10px 14px" }}>✅ Next problem: <strong>{nextRec.title}</strong> ({nextRec.topicName})</div>}
          {attempts===0&&<div style={{ fontSize:13,color:S.sub }}>Start solving problems to get personalized recommendations.</div>}
        </div>
      </div>
      <style>{`*{box-sizing:border-box;}`}</style>
    </div>
  );
}