export function parseRoute(hash) {
  const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const [head, a, b] = parts;
  switch (head) {
    case undefined: return { view: 'dashboard', params: {} };
    case 'course': return a ? { view: 'course', params: { courseId: a } } : { view: 'dashboard', params: {} };
    case 'topic': return (a && b) ? { view: 'topic', params: { courseId: a, topicId: b } } : { view: 'dashboard', params: {} };
    case 'quiz': return (a && b) ? { view: 'quiz', params: { courseId: a, mode: b } } : { view: 'dashboard', params: {} };
    case 'flashcards': return a ? { view: 'flashcards', params: { courseId: a } } : { view: 'dashboard', params: {} };
    case 'exam': return a ? { view: 'exam', params: { courseId: a } } : { view: 'dashboard', params: {} };
    case 'essay': return a ? { view: 'essayexam', params: { courseId: a } } : { view: 'dashboard', params: {} };
    case 'essaybank': return a ? { view: 'essaybank', params: { courseId: a } } : { view: 'dashboard', params: {} };
    case 'chaptertest': return (a && b) ? { view: 'chaptertest', params: { courseId: a, chapterId: b } } : { view: 'dashboard', params: {} };
    case 'analysis': return a ? { view: 'analysis', params: { courseId: a } } : { view: 'dashboard', params: {} };
    case 'settings': return { view: 'settings', params: {} };
    default: return { view: 'dashboard', params: {} };
  }
}
