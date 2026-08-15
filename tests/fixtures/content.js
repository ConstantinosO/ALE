export const FIXTURE_CONTENT = {
  courseId: 'demo',
  chapters: [
    {
      id: 'ch1', title: 'Κεφάλαιο 1', order: 1,
      topics: [
        {
          id: 't1', title: 'Θέμα Ένα', order: 1, summary: 'Σύνοψη 1.',
          keyDefinitions: [{ term: 'Όρος', definition: 'Ορισμός' }],
          killerFacts: ['Γεγονός 1'],
          mcq: [
            { question: 'Ε1;', options: ['α', 'β', 'γ', 'δ'], correctIndex: 0, explanation: 'εξ.', difficulty: 'easy' },
            { question: 'Ε2;', options: ['α', 'β', 'γ', 'δ'], correctIndex: 1, explanation: 'εξ.', difficulty: 'medium' },
            { question: 'Ε3;', options: ['α', 'β', 'γ', 'δ'], correctIndex: 2, explanation: 'εξ.', difficulty: 'hard' },
          ],
          shortAnswers: [{ question: 'ΣΕ1;', modelAnswer: 'Απάντηση', difficulty: 'medium' }],
          flashcards: [{ front: 'Μπρος', back: 'Πίσω' }],
          examQuestion: { question: 'Θέμα εξέτασης', modelAnswer: 'Υπόδειγμα', marks: 10 },
          commonTraps: ['Παγίδα 1'],
        },
        {
          id: 't2', title: 'Θέμα Δύο', order: 2, summary: 'Σύνοψη 2.',
          keyDefinitions: [], killerFacts: [],
          mcq: [
            { question: 'Ε4;', options: ['α', 'β', 'γ', 'δ'], correctIndex: 3, explanation: 'εξ.', difficulty: 'easy' },
          ],
          shortAnswers: [], flashcards: [{ front: 'Α', back: 'Β' }],
          examQuestion: null, commonTraps: [],
        },
      ],
    },
    {
      id: 'ch2', title: 'Κεφάλαιο 2', order: 2,
      topics: [
        {
          id: 't3', title: 'Θέμα Τρία', order: 1, summary: 'Σύνοψη 3.',
          keyDefinitions: [], killerFacts: [],
          mcq: [
            { question: 'Ε5;', options: ['α', 'β', 'γ', 'δ'], correctIndex: 0, explanation: 'εξ.', difficulty: 'medium' },
          ],
          shortAnswers: [], flashcards: [], examQuestion: null, commonTraps: [],
        },
      ],
    },
  ],
};
