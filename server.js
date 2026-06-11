const express = require('express');
const cors    = require('cors');
const { exec, execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'logiclab-'));
}

function cleanTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// Check if a compiler is available on this machine
function compilerExists(cmd) {
  try { execSync(`which ${cmd}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

// Run a shell command as a Promise
function run(cmd, opts = {}) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 15000, ...opts }, (err, stdout, stderr) => {
      resolve({ err, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE EXECUTORS
// ─────────────────────────────────────────────────────────────────────────────

async function executeJava(code) {
  if (!compilerExists('javac')) {
    return { stdout: '', stderr: '❌ Java compiler (javac) not found.\nInstall Java JDK: https://adoptium.net' };
  }

  const tmp = makeTmp();
  try {
    // Extract public class name
    const match = code.match(/public\s+class\s+(\w+)/);
    const className = match ? match[1] : 'Solution';
    const filePath  = path.join(tmp, `${className}.java`);
    fs.writeFileSync(filePath, code, 'utf8');

    // Compile
    const compile = await run(`javac "${filePath}"`, { cwd: tmp });
    if (compile.stderr && !compile.stdout) {
      return { stdout: '', stderr: compile.stderr };
    }

    // Run
    const result = await run(`java -cp "${tmp}" ${className}`, { cwd: tmp, timeout: 10000 });
    return {
      stdout: result.stdout,
      stderr: result.stderr || (result.err && !result.stdout ? result.err.message : '')
    };
  } finally {
    cleanTmp(tmp);
  }
}

async function executePython(code) {
  const py = compilerExists('python3') ? 'python3' : compilerExists('python') ? 'python' : null;
  if (!py) {
    return { stdout: '', stderr: '❌ Python not found.\nInstall Python: https://python.org/downloads' };
  }

  const tmp = makeTmp();
  try {
    const filePath = path.join(tmp, 'solution.py');
    fs.writeFileSync(filePath, code, 'utf8');
    const result = await run(`${py} "${filePath}"`, { cwd: tmp, timeout: 10000 });
    return {
      stdout: result.stdout,
      stderr: result.stderr || (result.err && !result.stdout ? result.err.message : '')
    };
  } finally {
    cleanTmp(tmp);
  }
}

async function executeC(code) {
  const gcc = compilerExists('gcc') ? 'gcc' : compilerExists('cc') ? 'cc' : null;
  if (!gcc) {
    return { stdout: '', stderr: '❌ C compiler (gcc) not found.\nOn Mac run: xcode-select --install' };
  }

  const tmp = makeTmp();
  try {
    const srcPath = path.join(tmp, 'solution.c');
    const outPath = path.join(tmp, 'solution_out');
    fs.writeFileSync(srcPath, code, 'utf8');

    // Compile
    const compile = await run(`${gcc} "${srcPath}" -o "${outPath}" -lm`, { cwd: tmp });
    if (compile.stderr && !fs.existsSync(outPath)) {
      return { stdout: '', stderr: compile.stderr };
    }

    // Run
    const result = await run(`"${outPath}"`, { cwd: tmp, timeout: 10000 });
    return {
      stdout: result.stdout,
      stderr: result.stderr || (result.err && !result.stdout ? result.err.message : '')
    };
  } finally {
    cleanTmp(tmp);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SMART OUTPUT COMPARISON
// ─────────────────────────────────────────────────────────────────────────────

function normalize(s) {
  return (s || '')
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/,\s*/g, ', ')
    .replace(/\[\s*/g, '[')
    .replace(/\s*\]/g, ']')
    .replace(/\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .toLowerCase();
}

function smartMatch(actual, expected) {
  if (!actual || actual === '(no output)') return false;
  if (actual === expected) return true;
  if (normalize(actual) === normalize(expected)) return true;
  // Float comparison
  const a = parseFloat(actual), e = parseFloat(expected);
  if (!isNaN(a) && !isNaN(e) && Math.abs(a - e) < 0.001) return true;
  // Boolean variants
  const bmap = { '1':'true','0':'false','true':'true','false':'false','yes':'true','no':'false' };
  if (bmap[actual?.toLowerCase()] && bmap[actual?.toLowerCase()] === bmap[expected?.toLowerCase()]) return true;
  return false;
}

function parseAndCompare(stdout, stderr, expectedOutputs, testLabels) {
  // If there's a compile/runtime error
  if (stderr && !stdout) {
    return expectedOutputs.map((exp, i) => ({
      label:    testLabels[i],
      expected: exp,
      actual:   '(error)',
      passed:   false,
      error:    stderr.split('\n').slice(0, 6).join('\n')
    }));
  }

  const lines = stdout
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '');

  return expectedOutputs.map((exp, i) => {
    const actual = lines[i] !== undefined ? lines[i] : '(no output)';
    return {
      label:    testLabels[i],
      expected: exp,
      actual,
      passed:   smartMatch(actual, exp),
      error:    null
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE: POST /api/run  — compile, run, compare, return results
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/run', async (req, res) => {
  const { language, files, expectedOutputs, testLabels } = req.body;
  const code = files?.[0]?.content || '';

  if (!code.trim()) {
    return res.status(400).json({ error: 'No code provided.' });
  }

  console.log(`\n▶ Running ${language} | ${files?.[0]?.name}`);

  let execResult;
  try {
    if      (language === 'java')   execResult = await executeJava(code);
    else if (language === 'python') execResult = await executePython(code);
    else if (language === 'c')      execResult = await executeC(code);
    else return res.status(400).json({ error: `Language "${language}" not supported.` });
  } catch (e) {
    console.error('Execution error:', e.message);
    return res.status(500).json({ error: e.message });
  }

  console.log('stdout:', execResult.stdout?.slice(0, 200) || '(empty)');
  if (execResult.stderr) console.log('stderr:', execResult.stderr?.slice(0, 200));

  // If expectedOutputs provided → compare and return results
  if (expectedOutputs && testLabels) {
    const results = parseAndCompare(
      execResult.stdout,
      execResult.stderr,
      expectedOutputs,
      testLabels
    );
    const allPassed = results.every(r => r.passed);
    console.log(`Results: ${results.filter(r=>r.passed).length}/${results.length} passed`);
    return res.json({
      stdout:  execResult.stdout,
      stderr:  execResult.stderr,
      results,
      allPassed,
      language
    });
  }

  // Raw execution (no comparison)
  res.json({
    stdout: execResult.stdout,
    stderr: execResult.stderr,
    language
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE: POST /api/ai  — AI Mentor via Groq
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/ai', async (req, res) => {
  try {
    const { messages, system } = req.body;
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer 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'
      },
      body: JSON.stringify({
        model:      'llama-3.3-70b-versatile',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: system || 'You are an expert coding mentor.' },
          { role: 'user',   content: messages?.[0]?.content || '' }
        ]
      })
    });

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      console.error('Groq error:', JSON.stringify(data).slice(0, 300));
      return res.json({ content: [{ text: 'AI mentor unavailable right now.' }] });
    }
    console.log('Groq OK — tokens:', (data?.usage?.total_tokens || 0));
    res.json({ content: [{ text }] });
  } catch (e) {
    console.error('AI route error:', e.message);
    res.status(500).json({ error: { message: e.message } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE: POST /api/submit  &  GET /api/progress
// ─────────────────────────────────────────────────────────────────────────────

const progressStore = {};

app.post('/api/submit', (req, res) => {
  try {
    if (req.body?.stats) Object.assign(progressStore, req.body.stats);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/progress', (_req, res) => {
  res.json({ stats: progressStore });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    java:   compilerExists('javac'),
    python: compilerExists('python3') || compilerExists('python'),
    c:      compilerExists('gcc') || compilerExists('cc')
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE: GET /api/problems  — serve problems.json to frontend
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/problems', (_req, res) => {
  const problemsPath = path.join(__dirname, 'problems.json');
  if (!fs.existsSync(problemsPath)) {
    return res.status(404).json({ error: 'problems.json not found. Make sure it is in the same folder as server.js.' });
  }
  res.sendFile(problemsPath);
});

// ─────────────────────────────────────────────────────────────────────────────
app.listen(3001, () => {
  console.log('\n✅  LogicLab backend  →  http://localhost:3001');
  console.log('─────────────────────────────────────────────');
  console.log('  Java   compiler:', compilerExists('javac')   ? '✅ javac found'  : '❌ not found');
  console.log('  Python runtime: ', compilerExists('python3') ? '✅ python3 found' : compilerExists('python') ? '✅ python found' : '❌ not found');
  console.log('  C      compiler:', compilerExists('gcc')     ? '✅ gcc found'    : compilerExists('cc') ? '✅ cc found' : '❌ not found');
  console.log('─────────────────────────────────────────────');
  console.log('  POST /api/run      → compile + run + compare');
  console.log('  POST /api/ai       → AI mentor (Groq)');
  console.log('  POST /api/submit   → save progress');
  console.log('  GET  /api/progress → load progress');
  console.log('  GET  /api/problems → serve problems.json');
  console.log('  GET  /health       → compiler status');
  console.log('─────────────────────────────────────────────\n');
});