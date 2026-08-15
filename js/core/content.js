export async function loadCourses(fetchFn = fetch) {
  const res = await fetchFn('data/courses.json');
  if (!res.ok) throw new Error('Αποτυχία φόρτωσης της λίστας μαθημάτων.');
  return res.json();
}

export async function loadContent(courseId, fetchFn = fetch) {
  const res = await fetchFn(`data/${courseId}/content.json`);
  if (!res.ok) throw new Error('Αποτυχία φόρτωσης της ύλης.');
  const content = await res.json();
  const err = validateContent(content);
  if (err) throw new Error(err);
  return content;
}

export async function loadAnalysis(courseId, fetchFn = fetch) {
  try {
    const res = await fetchFn(`data/${courseId}/exam-analysis.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function validateContent(c) {
  if (!c || !Array.isArray(c.chapters)) return 'Μη έγκυρη δομή ύλης.';
  for (const ch of c.chapters) {
    if (!ch.id || !ch.title || !Array.isArray(ch.topics)) {
      return `Μη έγκυρο κεφάλαιο στην ύλη: ${ch.title || '(χωρίς τίτλο)'}`;
    }
  }
  return null;
}

export function allTopics(content, excludedChapterIds = []) {
  const out = [];
  for (const ch of content.chapters) {
    if (excludedChapterIds.includes(ch.id)) continue;
    for (const t of ch.topics) out.push({ ...t, chapterId: ch.id, chapterTitle: ch.title });
  }
  return out;
}
