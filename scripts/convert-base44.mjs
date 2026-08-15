import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CURRICULUM_TO_COURSE = {
  '698f3a767e4bbfee6bd1e362': 'basikes-arxes',
  '69919e89a0734edeb516f7cb': 'klados-zois',
  // The current Ζωής curriculum record has a different id but its chapters
  // still reference the old one; both map to klados-zois.
  '6991ae79a3f13975b89860c2': 'klados-zois',
};

const topics = JSON.parse(readFileSync('reference/base44-export/topics.json', 'utf8')).entities;
const chapters = JSON.parse(readFileSync('reference/base44-export/chapters.json', 'utf8')).entities;

const chapterById = Object.fromEntries(chapters.map((c) => [c.id, c]));

function mapTopic(t, order) {
  return {
    id: t.id,
    title: (t.title || '').trim(),
    order,
    summary: t.summary || '',
    keyDefinitions: (t.key_definitions || []).map((d) => ({ term: d.term || '', definition: d.definition || '' })),
    killerFacts: t.killer_facts || [],
    mcq: (t.mcq_questions || []).map((q) => ({
      question: q.question || '', options: q.options || [],
      correctIndex: q.correct_index ?? 0, explanation: q.explanation || '',
      difficulty: q.difficulty || 'medium',
    })),
    shortAnswers: (t.short_answer_questions || []).map((q) => ({
      question: q.question || '', modelAnswer: q.model_answer || '', difficulty: q.difficulty || 'medium',
    })),
    flashcards: (t.flashcards || []).map((f) => ({ front: f.front || '', back: f.back || '' })),
    examQuestion: t.exam_question && t.exam_question.question
      ? { question: t.exam_question.question, modelAnswer: t.exam_question.model_answer || '', marks: t.exam_question.marks ?? 10 }
      : null,
    commonTraps: t.common_traps || [],
  };
}

const byCourse = {};
for (const t of topics) {
  const ch = chapterById[t.chapter_id];
  const courseId = ch
    ? CURRICULUM_TO_COURSE[ch.curriculum_id]
    : CURRICULUM_TO_COURSE[t.curriculum_id];
  if (!courseId) { console.warn(`Άγνωστο μάθημα για θέμα: ${t.title}`); continue; }
  byCourse[courseId] ??= {};
  const chKey = t.chapter_id;
  byCourse[courseId][chKey] ??= {
    id: chKey,
    title: ch ? ch.title : 'Λοιπά θέματα',
    order: ch ? (ch.order ?? 99) : 0,
    topics: [],
  };
  byCourse[courseId][chKey].topics.push(t);
}

for (const [courseId, chMap] of Object.entries(byCourse)) {
  const chaptersOut = Object.values(chMap)
    .sort((a, b) => a.order - b.order)
    .map((ch) => ({
      ...ch,
      topics: ch.topics
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.created_date.localeCompare(b.created_date))
        .map((t, i) => mapTopic(t, i + 1)),
    }));
  const out = { courseId, chapters: chaptersOut };
  mkdirSync(`data/${courseId}`, { recursive: true });
  writeFileSync(`data/${courseId}/content.json`, JSON.stringify(out, null, 2), 'utf8');
  const nTopics = chaptersOut.reduce((n, c) => n + c.topics.length, 0);
  console.log(`${courseId}: ${chaptersOut.length} κεφάλαια, ${nTopics} θέματα`);
}
