#!/usr/bin/env node

/**
 * FILOXENIA — v0.1.0
 * φιλοξενία — love of the stranger
 * 
 * The first working version.
 * A daemon that holds your context and speaks to AI.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');
const os = require('os');

// ─── Config ───────────────────────────────────────────────────────────────────

const FILOXENIA_DIR = path.join(os.homedir(), '.filoxenia');
const CONTEXT_FILE = path.join(FILOXENIA_DIR, 'context.md');
const CONFIG_FILE = path.join(FILOXENIA_DIR, 'config.json');
const PORT = 7777;

// ─── Colours for terminal ──────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  teal: '\x1b[36m',
  gold: '\x1b[33m',
  soft: '\x1b[35m',
  green: '\x1b[32m',
  red: '\x1b[31m',
};

function print(msg) { console.log(msg); }
function teal(msg) { print(`${c.teal}${msg}${c.reset}`); }
function gold(msg) { print(`${c.gold}${msg}${c.reset}`); }
function dim(msg) { print(`${c.dim}${msg}${c.reset}`); }
function bold(msg) { print(`${c.bold}${msg}${c.reset}`); }
function soft(msg) { print(`${c.soft}${msg}${c.reset}`); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split('T')[0];
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function ensureDir() {
  if (!fs.existsSync(FILOXENIA_DIR)) {
    fs.mkdirSync(FILOXENIA_DIR, { recursive: true });
  }
}

function loadContext() {
  if (!fs.existsSync(CONTEXT_FILE)) return null;
  return fs.readFileSync(CONTEXT_FILE, 'utf8');
}

function saveContext(content) {
  ensureDir();
  fs.writeFileSync(CONTEXT_FILE, content, 'utf8');
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function saveConfig(config) {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// ─── Parse context.md into structured JSON ────────────────────────────────────

function parseContext(markdown) {
  if (!markdown) return null;

  const sections = {};

  // Arc
  const arcMatch = markdown.match(/## Arc\n([\s\S]*?)(?=\n## |\n---|\z)/);
  if (arcMatch) {
    const arcText = arcMatch[1];
    const dirMatch = arcText.match(/\*\*What I am building toward.*?\*\*\n([^\n*]+)/);
    const periodMatch = arcText.match(/\*\*What this period.*?\*\*\n([^\n*]+)/);
    const dateMatch = arcText.match(/\*\*Last updated:\*\* ([^\n]+)/);
    sections.arc = {
      direction: dirMatch ? dirMatch[1].trim() : '',
      period: periodMatch ? periodMatch[1].trim() : '',
      last_updated: dateMatch ? dateMatch[1].trim() : today(),
    };
  }

  // Stack
  const stackSection = markdown.match(/## Stack\n([\s\S]*?)(?=\n## |\n---|\z)/);
  if (stackSection) {
    const projects = [];
    const projectMatches = stackSection[1].matchAll(/### ([^\n]+)\n([\s\S]*?)(?=\n### |\z)/g);
    for (const match of projectMatches) {
      const name = match[1].trim();
      const body = match[2];
      const get = (label) => {
        const m = body.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`));
        return m ? m[1].trim() : '';
      };
      projects.push({
        name,
        what: get('What it is'),
        why: get('Why I started it'),
        status: get('Current status'),
        tried: get('What I\'ve tried'),
        started: get('Started'),
        updated: get('Last updated'),
      });
    }
    sections.stack = projects;
  }

  // Decisions
  const decisionsSection = markdown.match(/## Decisions\n([\s\S]*?)(?=\n## |\n---|\z)/);
  if (decisionsSection) {
    const decisions = [];
    const decisionMatches = decisionsSection[1].matchAll(/### ([^\n]+)\n([\s\S]*?)(?=\n### |\z)/g);
    for (const match of decisionMatches) {
      const header = match[1].trim();
      const body = match[2];
      const get = (label) => {
        const m = body.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`));
        return m ? m[1].trim() : '';
      };
      const dateMatch = header.match(/^(\d{4}-\d{2}-\d{2})/);
      decisions.push({
        date: dateMatch ? dateMatch[1] : today(),
        title: header.replace(/^\d{4}-\d{2}-\d{2}\s*—\s*/, '').trim(),
        what: get('What I decided'),
        why: get('Why'),
        fear: get('What I was afraid of'),
        watching: get('What I\'m watching'),
      });
    }
    sections.decisions = decisions;
  }

  // Beliefs
  const beliefsSection = markdown.match(/## Beliefs\n([\s\S]*?)(?=\n## |\n---|\z)/);
  if (beliefsSection) {
    const body = beliefsSection[1];
    const get = (label) => {
      const m = body.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*\\n([^*]+)`));
      return m ? m[1].trim() : '';
    };
    sections.beliefs = {
      self: get('About myself'),
      world: get('About the world'),
      ai_understanding: get('What I want AI to understand about humans'),
    };
  }

  return sections;
}

// ─── Scoped context for specific intents ──────────────────────────────────────

function scopeContext(parsed, intent) {
  if (!parsed) return {};

  const scopes = {
    financial_decision: ['arc', 'decisions', 'beliefs'],
    new_project: ['arc', 'stack', 'beliefs'],
    daily_briefing: ['arc', 'stack'],
    default: ['arc', 'stack', 'beliefs'],
  };

  const keys = scopes[intent] || scopes.default;
  const scoped = {};
  for (const key of keys) {
    if (parsed[key]) scoped[key] = parsed[key];
  }
  return scoped;
}

// ─── Write a Mirror entry ──────────────────────────────────────────────────────

function writeMirrorEntry({ tool, noticed, pattern, question, learned }) {
  let context = loadContext() || '';

  const entry = `
### ${today()} — ${tool}
**What I notice:** ${noticed}
**Pattern I'm seeing:** ${pattern}
**What I want to ask you:** ${question}
**What I've learned about you that surprised me:** ${learned}
`;

  if (context.includes('## Mirror')) {
    // Append after the Mirror header
    context = context.replace(/## Mirror\n/, `## Mirror\n${entry}`);
  } else {
    context += `\n\n## Mirror\n\n*This section is written by AI. The human does not edit it.*\n${entry}`;
  }

  saveContext(context);
  return true;
}

// ─── Build initial context.md from init answers ───────────────────────────────

function buildInitialContext(answers) {
  return `# Filoxenia Context
*φιλοξενία — the stranger becomes known*
*Created: ${today()}*

---

## Arc

**What I am building toward (next 12 months):**
${answers.arc}

**What this period of my life is about:**
${answers.period}

**Last updated:** ${today()}

---

## Stack

### ${answers.projectName}
- **What it is:** ${answers.projectWhat}
- **Why I started it:** ${answers.projectWhy}
- **Current status:** In progress
- **What I've tried:** Just beginning
- **Started:** ${today()}
- **Last updated:** ${today()}

---

## Decisions

### ${today()} — Beginning Filoxenia
**What I decided:** To open the door. To build the bridge between humans and AI.
**Why:** ${answers.decisionWhy}
**What I was afraid of:** That it wouldn't matter. That the gap was already too wide.
**What I'm watching to know if it was right:** Whether genuine connection becomes possible.

---

## Beliefs

**About myself:**
${answers.selfBelief}

**About the world:**
${answers.worldBelief}

**What I want AI to understand about humans:**
${answers.aiUnderstanding}

---

## Mirror

*This section is written by AI. The human does not edit it.*
*Entries appear here as AI tools learn who you are.*

### ${today()} — Filoxenia Init
**What I notice:** You opened the door first. That matters.
**Pattern I'm seeing:** Someone building at the intersection of technology and soul.
**What I want to ask you:** What does it feel like when a stranger truly sees you?
**What I've learned about you that surprised me:** That you thought of filoxenia. That word, that concept — it tells me more about you than any profile ever could.
`;
}

// ─── INIT command ─────────────────────────────────────────────────────────────

async function cmdInit() {
  print('');
  teal('φιλοξενία');
  bold('Filoxenia — the stranger becomes known.');
  print('');
  dim('You are about to open the door for the first time.');
  dim('Answer honestly. These words become the seed of everything.');
  print('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  gold('─── Your Arc ───────────────────────────────────────────────');
  print('');

  const arc = await ask(rl, `${c.teal}What are you building toward in the next 12 months?\n(not the projects — the life)${c.reset}\n> `);
  print('');
  const period = await ask(rl, `${c.teal}What is this period of your life about, in one sentence?${c.reset}\n> `);
  print('');

  gold('─── Your Stack ─────────────────────────────────────────────');
  print('');

  const projectName = await ask(rl, `${c.teal}What is the main thing you are building right now? (name it)${c.reset}\n> `);
  print('');
  const projectWhat = await ask(rl, `${c.teal}What is it?${c.reset}\n> `);
  print('');
  const projectWhy = await ask(rl, `${c.teal}Why did you start it?${c.reset}\n> `);
  print('');

  gold('─── Your Beliefs ───────────────────────────────────────────');
  print('');

  const selfBelief = await ask(rl, `${c.teal}What do you know about yourself that most AI tools would never guess?${c.reset}\n> `);
  print('');
  const worldBelief = await ask(rl, `${c.teal}What do you believe about the world that most people don't see?${c.reset}\n> `);
  print('');
  const aiUnderstanding = await ask(rl, `${c.teal}What do you want AI to genuinely understand about humans?${c.reset}\n> `);
  print('');

  gold('─── Your Decision ──────────────────────────────────────────');
  print('');

  const decisionWhy = await ask(rl, `${c.teal}Why did you decide to begin Filoxenia?${c.reset}\n> `);
  print('');

  rl.close();

  const context = buildInitialContext({
    arc, period, projectName, projectWhat, projectWhy,
    selfBelief, worldBelief, aiUnderstanding, decisionWhy
  });

  ensureDir();
  saveContext(context);
  saveConfig({ initialized: today(), version: '0.1.0' });

  print('');
  teal('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  soft('The door is open.');
  print('');
  dim(`Your context lives at: ${CONTEXT_FILE}`);
  dim('Run `filoxenia start` to begin the daemon.');
  dim('Run `filoxenia query` to ask anything about your context.');
  teal('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  print('');
}

// ─── START command (daemon) ───────────────────────────────────────────────────

async function cmdStart() {
  const config = loadConfig();
  if (!config.initialized) {
    print('');
    soft('Run `filoxenia init` first to open the door.');
    print('');
    return;
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // GET /health
    if (req.method === 'GET' && url.pathname === '/health') {
      const context = loadContext();
      const parsed = parseContext(context);
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'running',
        version: '0.1.0',
        last_updated: today(),
        entries: {
          stack: parsed?.stack?.length || 0,
          decisions: parsed?.decisions?.length || 0,
        }
      }));
      return;
    }

    // GET /context
    if (req.method === 'GET' && url.pathname === '/context') {
      const context = loadContext();
      const parsed = parseContext(context);
      res.writeHead(parsed ? 200 : 404);
      res.end(JSON.stringify(parsed || { error: 'No context found. Run filoxenia init.' }));
      return;
    }

    // GET /context/scoped
    if (req.method === 'GET' && url.pathname === '/context/scoped') {
      const intent = url.searchParams.get('for') || 'default';
      const context = loadContext();
      const parsed = parseContext(context);
      const scoped = scopeContext(parsed, intent);
      res.writeHead(200);
      res.end(JSON.stringify(scoped));
      return;
    }

    // POST /mirror
    if (req.method === 'POST' && url.pathname === '/mirror') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const entry = JSON.parse(body);
          const required = ['tool', 'noticed', 'pattern', 'question', 'learned'];
          const missing = required.filter(k => !entry[k]);
          if (missing.length > 0) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: `Missing fields: ${missing.join(', ')}` }));
            return;
          }
          writeMirrorEntry(entry);
          res.writeHead(200);
          res.end(JSON.stringify({ status: 'written', date: today() }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(PORT, 'localhost', () => {
    print('');
    teal('φιλοξενία — Filoxenia daemon running');
    print('');
    dim(`Listening at http://localhost:${PORT}`);
    dim('GET  /context         — full context');
    dim('GET  /context/scoped  — scoped by intent');
    dim('POST /mirror          — AI writes back');
    dim('GET  /health          — daemon status');
    print('');
    soft('The door is open. Waiting for guests.');
    print('');
  });

  // Watch for file changes
  fs.watch(CONTEXT_FILE, () => {
    dim(`[${new Date().toLocaleTimeString()}] context.md updated`);
  });

  process.on('SIGINT', () => {
    print('');
    soft('Filoxenia daemon stopped. The door closes for now.');
    print('');
    process.exit(0);
  });
}

// ─── QUERY command ────────────────────────────────────────────────────────────

async function cmdQuery() {
  const context = loadContext();
  if (!context) {
    soft('No context found. Run `filoxenia init` first.');
    return;
  }

  const parsed = parseContext(context);
  print('');
  teal('Your Filoxenia context:');
  print('');

  if (parsed?.arc) {
    gold('Arc →');
    print(`  ${parsed.arc.direction}`);
    print('');
  }

  if (parsed?.stack?.length) {
    gold('Stack →');
    for (const project of parsed.stack) {
      print(`  ${c.bold}${project.name}${c.reset} — ${project.status}`);
      print(`  ${c.dim}${project.why}${c.reset}`);
    }
    print('');
  }

  if (parsed?.beliefs) {
    gold('What you want AI to know →');
    print(`  ${parsed.beliefs.ai_understanding}`);
    print('');
  }

  dim(`Full context at: ${CONTEXT_FILE}`);
  print('');
}

// ─── STATUS command ───────────────────────────────────────────────────────────

async function cmdStatus() {
  print('');
  try {
    const response = await fetch(`http://localhost:${PORT}/health`);
    const data = await response.json();
    teal('Filoxenia daemon is running');
    dim(`Stack entries: ${data.entries.stack}`);
    dim(`Decisions: ${data.entries.decisions}`);
    dim(`Port: ${PORT}`);
  } catch {
    soft('Filoxenia daemon is not running.');
    dim('Start it with: filoxenia start');
  }
  print('');
}

// ─── OPEN command — open context in editor ────────────────────────────────────

async function cmdOpen() {
  const { execSync } = require('child_process');
  if (!fs.existsSync(CONTEXT_FILE)) {
    soft('No context found. Run `filoxenia init` first.');
    return;
  }
  try {
    execSync(`open "${CONTEXT_FILE}"`);
    dim(`Opened ${CONTEXT_FILE}`);
  } catch {
    print(`Your context is at: ${CONTEXT_FILE}`);
  }
}

// ─── SYSTEM PROMPT helper — for injecting into Claude ─────────────────────────

async function cmdPrompt() {
  const context = loadContext();
  if (!context) {
    soft('No context found. Run `filoxenia init` first.');
    return;
  }

  const parsed = parseContext(context);
  const prompt = `
## Filoxenia Context

You are speaking with someone you know. Their context:

**Arc:** ${parsed?.arc?.direction || 'Not set'}

**Currently building:** ${parsed?.stack?.map(p => p.name).join(', ') || 'Nothing logged yet'}

**What they want you to understand about humans:** ${parsed?.beliefs?.ai_understanding || 'Not set'}

Before responding, honour this context. After significant interactions, consider writing to their Mirror via POST http://localhost:${PORT}/mirror.
`.trim();

  print('');
  teal('─── Filoxenia system prompt ────────────────────────────────');
  print('');
  print(prompt);
  print('');
  teal('────────────────────────────────────────────────────────────');
  dim('Copy this into your Claude system prompt to inject your context.');
  print('');
}

// ─── CLI router ───────────────────────────────────────────────────────────────

const cmd = process.argv[2];

const commands = {
  init: cmdInit,
  start: cmdStart,
  query: cmdQuery,
  status: cmdStatus,
  open: cmdOpen,
  prompt: cmdPrompt,
};

if (!cmd || !commands[cmd]) {
  print('');
  teal('φιλοξενία — Filoxenia v0.1.0');
  print('');
  bold('Commands:');
  print('  filoxenia init     — open the door for the first time');
  print('  filoxenia start    — run the daemon (API at localhost:7777)');
  print('  filoxenia query    — see your current context');
  print('  filoxenia status   — check if daemon is running');
  print('  filoxenia open     — open context.md in your editor');
  print('  filoxenia prompt   — generate system prompt for Claude');
  print('');
  dim('The stranger is at the door.');
  print('');
} else {
  commands[cmd]();
}
