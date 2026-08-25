export const FIXTURE_ESSAY_BANK = {
  courseId: 'demo',
  entries: [
    {
      id: 'e-anagkes', title: 'Ανάγκες',
      prompts: [{ text: 'Περιγράψτε τις ανάγκες.', papers: ['2025-12'] }],
      chapterId: 'z-ch01', topicIds: ['t1'], frequency: 9, lastSeen: '2026-06',
      slot: 1, trend: 'core',
      keyPoints: ['Σημείο Α', 'Σημείο Β'], modelAnswer: 'Υπόδειγμα ανάγκες.',
    },
    {
      id: 'e-mid-high', title: 'Μέσο Υψηλής Συχνότητας',
      prompts: [
        { text: 'Ερώτηση Χ;', papers: ['2025-12'] },
        { text: 'Ερώτηση Χ παραλλαγή;', papers: ['2024-06'] },
      ],
      chapterId: 'z-ch02', topicIds: ['t2'], frequency: 7, lastSeen: '2026-06',
      slot: 0, trend: 'heating',
      keyPoints: ['ΣΑ', 'ΣΒ', 'ΣΓ'], modelAnswer: 'Υπόδειγμα Χ.',
    },
    {
      id: 'e-mid-low', title: 'Μέσο Χαμηλής Συχνότητας',
      prompts: [{ text: 'Ερώτηση Ψ;', papers: ['2023-06'] }],
      chapterId: 'z-ch03', topicIds: ['t3'], frequency: 1, lastSeen: '2023-06',
      slot: 0, trend: 'rare',
      keyPoints: ['ΣΔ'], modelAnswer: 'Υπόδειγμα Ψ.',
    },
    {
      id: 'e-mid-mid', title: 'Μέσο Μέτριας Συχνότητας',
      prompts: [{ text: 'Ερώτηση Ω;', papers: ['2024-12'] }],
      chapterId: 'z-ch04', topicIds: ['t4'], frequency: 4, lastSeen: '2025-06',
      slot: 0, trend: 'cooling',
      keyPoints: ['ΣΕ', 'ΣΖ'], modelAnswer: 'Υπόδειγμα Ω.',
    },
    {
      id: 'e-last', title: 'Περιγράψτε τα ακόλουθα',
      prompts: [{ text: 'Περιγράψτε τα ακόλουθα:', papers: ['2025-12'] }],
      chapterId: 'z-ch05', topicIds: ['t5'], frequency: 9, lastSeen: '2026-06',
      slot: 8, trend: 'core',
      keyPoints: [], modelAnswer: '',
    },
  ],
  miniDefinitions: [
    { id: 'mini-a', term: 'Όρος Α', times: 4, papers: ['2024-06'], topicIds: ['t6'], keyPoints: ['Α1', 'Α2'], modelAnswer: 'Υπόδειγμα Α.' },
    { id: 'mini-b', term: 'Όρος Β', times: 1, papers: ['2023-06'], topicIds: ['t7'], keyPoints: ['Β1'], modelAnswer: 'Υπόδειγμα Β.' },
    { id: 'mini-c', term: 'Όρος Γ', times: 2, papers: ['2024-12'], topicIds: ['t8'], keyPoints: ['Γ1'], modelAnswer: 'Υπόδειγμα Γ.' },
    { id: 'mini-d', term: 'Όρος Δ', times: 3, papers: ['2025-06'], topicIds: ['t9'], keyPoints: ['Δ1', 'Δ2'], modelAnswer: 'Υπόδειγμα Δ.' },
  ],
};
