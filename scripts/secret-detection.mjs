import { spawnSync } from 'node:child_process';

// Reports labels and paths only. Never return credential values or matched text.
export function credentialLabels(content, known = [], { includePublicOAuth = true } = {}) {
  const labels = new Set();
  for (const credential of known) if (content.includes(credential.value)) labels.add(credential.name);
  if (/\b(?:gsk_[A-Za-z0-9]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AIza[\w-]{30,}|gh[pousr]_[\w]{30,}|github_pat_[\w]{30,}|AKIA[0-9A-Z]{16})\b/.test(content)) labels.add('credential pattern');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) labels.add('private key');
  if (includePublicOAuth && /\b\d+-[a-z0-9]+\.apps\.googleusercontent\.com\b/.test(content)) labels.add('public OAuth client ID');
  return [...labels];
}

export function auditGit(root, known) {
  const git = args => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error('Repository secret scan could not read Git metadata.');
    return result.stdout;
  };
  const tracked = new Set(git(['ls-files', '-z']).split('\0').filter(Boolean));
  const objects = new Map();
  // Read the index itself, so staging a secret and then editing the working
  // copy cannot evade the check. Also scan all reachable branch/tag history.
  for (const entry of git(['ls-files', '--stage', '-z']).split('\0').filter(Boolean)) {
    const match = entry.match(/^\d+ ([a-f0-9]+) \d+\t([\s\S]+)$/);
    if (match) objects.set(match[1], match[2]);
  }
  for (const entry of git(['rev-list', '--objects', '--all']).split('\n').filter(Boolean)) {
    const match = entry.match(/^([a-f0-9]+)(?: (.*))?$/);
    if (match && !objects.has(match[1])) objects.set(match[1], match[2] || '[repository object]');
  }
  const findings = [];
  if (!objects.size) return { tracked, findings, scannedBlobs: 0 };
  const batch = spawnSync('git', ['-C', root, 'cat-file', '--batch'], {
    input: [...objects.keys()].join('\n') + '\n', maxBuffer: 64 * 1024 * 1024,
  });
  if (batch.error || batch.status !== 0) throw new Error('Repository secret scan could not read Git objects.');
  let offset = 0, scannedBlobs = 0;
  for (const [hash, path] of objects) {
    const end = batch.stdout.indexOf(10, offset);
    if (end < 0) throw new Error('Repository secret scan received incomplete Git data.');
    const header = batch.stdout.subarray(offset, end).toString().match(/^([a-f0-9]+) (\w+) (\d+)$/);
    if (!header || header[1] !== hash) throw new Error('Repository secret scan received invalid Git data.');
    const size = Number(header[3]);
    offset = end + 1;
    if (offset + size >= batch.stdout.length) throw new Error('Repository secret scan received truncated Git data.');
    if (header[2] === 'blob') {
      scannedBlobs++;
      const labels = credentialLabels(batch.stdout.subarray(offset, offset + size).toString('utf8'), known);
      if (labels.length) findings.push({ path, labels, source: 'Git index/history' });
    }
    offset += size + 1;
  }
  return { tracked, findings, scannedBlobs };
}
