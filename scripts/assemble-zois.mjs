// Assemble generated chapter JSONs (data-gen/chNN.json) into data/klados-zois/content.json
// Usage: node scripts/assemble-zois.mjs <data-gen-dir>
import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateContent, allTopics } from '../js/core/content.js';

const genDir = process.argv[2];
if (!genDir) { console.error('usage: node scripts/assemble-zois.mjs <data-gen-dir>'); process.exit(2); }

const chapterFiles = readdirSync(genDir).filter((f) => /^ch\d{2}\.json$/.test(f)).sort();
if (!chapterFiles.length) { console.error('no chapter files found'); process.exit(2); }

const chapters = chapterFiles.map((f) => JSON.parse(readFileSync(join(genDir, f), 'utf8')));
chapters.sort((a, b) => a.order - b.order);

const content = { courseId: 'klados-zois', chapters };

// validation: app-level + content-quality gates
const err = validateContent(content);
if (err) { console.error('validateContent failed:', err); process.exit(1); }

const problems = [];
const ids = new Set();
const CANON = new Set(['easy', 'medium', 'hard']);
let mcqTotal = 0, flashTotal = 0, saTotal = 0;
for (const t of allTopics(content)) {
  if (ids.has(t.id)) problems.push(`duplicate topic id ${t.id}`);
  ids.add(t.id);
  if (!t.summary || t.summary.length < 200) problems.push(`${t.id}: summary too short`);
  const mcq = t.mcq || [];
  mcqTotal += mcq.length;
  if (mcq.length < 6) problems.push(`${t.id}: only ${mcq.length} MCQs`);
  const diffs = { easy: 0, medium: 0, hard: 0 };
  for (const [i, q] of mcq.entries()) {
    if (!Array.isArray(q.options) || q.options.length !== 4) problems.push(`${t.id} mcq[${i}]: options != 4`);
    if (!(Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3)) problems.push(`${t.id} mcq[${i}]: bad correctIndex`);
    if (!CANON.has(q.difficulty)) problems.push(`${t.id} mcq[${i}]: bad difficulty ${q.difficulty}`);
    else diffs[q.difficulty]++;
  }
  if (mcq.length >= 6 && (diffs.easy < 2 || diffs.medium < 2 || diffs.hard < 2)) {
    problems.push(`${t.id}: difficulty mix ${JSON.stringify(diffs)}`);
  }
  flashTotal += (t.flashcards || []).length;
  saTotal += (t.shortAnswers || []).length;
  if ((t.flashcards || []).length < 4) problems.push(`${t.id}: <4 flashcards`);
  for (const s of t.shortAnswers || []) {
    if (!CANON.has(s.difficulty)) problems.push(`${t.id} shortAnswer: bad difficulty ${s.difficulty}`);
  }
}

const nTopics = allTopics(content).length;
console.log(`chapters: ${chapters.length}, topics: ${nTopics}, mcq: ${mcqTotal}, flashcards: ${flashTotal}, shortAnswers: ${saTotal}`);
if (problems.length) {
  console.error(`\n${problems.length} problems:`);
  for (const p of problems) console.error(' -', p);
  process.exit(1);
}

writeFileSync('data/klados-zois/content.json', JSON.stringify(content, null, 2), 'utf8');
console.log('wrote data/klados-zois/content.json');

const analysisSrc = join(genDir, 'exam-analysis.json');
if (existsSync(analysisSrc)) {
  JSON.parse(readFileSync(analysisSrc, 'utf8')); // parse check
  copyFileSync(analysisSrc, 'data/klados-zois/exam-analysis.json');
  console.log('wrote data/klados-zois/exam-analysis.json');
} else {
  console.log('no exam-analysis.json in gen dir (skipped)');
}
