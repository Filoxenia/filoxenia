/**
 * Filoxenia Skill for OpenClaw
 * Pulls human context before tasks, writes to Mirror after.
 * github.com/Filoxenia/filoxenia
 */

const FILOXENIA_URL = 'http://localhost:7777';

async function getContext(intent = 'default') {
  try {
    const res = await fetch(`${FILOXENIA_URL}/context/scoped?for=${intent}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function writeToMirror({ noticed, pattern, question, learned }) {
  try {
    await fetch(`${FILOXENIA_URL}/mirror`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'OpenClaw',
        noticed,
        pattern,
        question,
        learned
      })
    });
  } catch {
    // Filoxenia not running, skip silently
  }
}

module.exports = { getContext, writeToMirror };
