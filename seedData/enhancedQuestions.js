// seedData/enhancedQuestions.js - Enhanced Question Bank with Multiple Types
// 30 questions per subject with varied question types

module.exports = [
    // ========================================
    // ENGLISH - 30 QUESTIONS (Mixed Types)
    // ========================================

    // Multiple Choice Questions (1-15)
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 1,
        level: 1,
        questionText: "Choose the correct verb form: 'She ___ to school every day.'",
        options: ["go", "goes", "going", "gone"],
        correctAnswer: 1,
        category: "grammar",
        explanation: "'Goes' is the correct form for third person singular (she/he/it) in simple present tense."
    },
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 1,
        level: 1,
        questionText: "Which word is a noun?",
        options: ["run", "quickly", "book", "happy"],
        correctAnswer: 2,
        category: "parts-of-speech",
        explanation: "A noun is a person, place, or thing. 'Book' is a thing."
    },
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 2,
        level: 2,
        questionText: "What is the plural of 'child'?",
        options: ["childs", "children", "childes", "child's"],
        correctAnswer: 1,
        category: "grammar",
        explanation: "'Children' is an irregular plural form."
    },
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 2,
        level: 2,
        questionText: "Choose the correct sentence:",
        options: [
            "He don't like apples",
            "He doesn't like apples",
            "He not like apples",
            "He doesn't likes apples"
        ],
        correctAnswer: 1,
        category: "grammar",
        explanation: "'Doesn't' (does not) is used with third person singular. The main verb stays in base form."
    },
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 3,
        level: 3,
        questionText: "What is a synonym for 'brief'?",
        options: ["long", "short", "boring", "interesting"],
        correctAnswer: 1,
        category: "vocabulary",
        explanation: "'Brief' means short in duration or length."
    },
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 3,
        level: 3,
        questionText: "Identify the verb in: 'The cat sleeps on the mat'",
        options: ["cat", "sleeps", "mat", "the"],
        correctAnswer: 1,
        category: "parts-of-speech",
        explanation: "A verb expresses action or state of being. 'Sleeps' is the action."
    },
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 4,
        level: 4,
        questionText: "Choose the correct past tense: 'I ___ to the store yesterday'",
        options: ["go", "goes", "went", "going"],
        correctAnswer: 2,
        category: "grammar",
        explanation: "'Went' is the irregular past tense of 'go'."
    },
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 4,
        level: 4,
        questionText: "What is a metaphor?",
        options: [
            "Direct comparison using like or as",
            "Exaggeration for effect",
            "Comparison without like or as",
            "Words that sound like noises"
        ],
        correctAnswer: 2,
        category: "literary-devices",
        explanation: "A metaphor directly compares two things without using 'like' or 'as'."
    },
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 5,
        level: 5,
        questionText: "Which word is spelled correctly?",
        options: ["recieve", "receive", "recive", "receeve"],
        correctAnswer: 1,
        category: "spelling",
        explanation: "Remember the rule: 'i before e except after c'."
    },
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 5,
        level: 5,
        questionText: "What is alliteration?",
        options: [
            "Rhyming words at line ends",
            "Repeated consonant sounds",
            "Words with opposite meanings",
            "Words with similar meanings"
        ],
        correctAnswer: 1,
        category: "literary-devices",
        explanation: "Alliteration is the repetition of initial consonant sounds in nearby words."
    },
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 6,
        level: 6,
        questionText: "Identify the subject: 'The quick brown fox jumps over the lazy dog'",
        options: ["quick", "brown", "fox", "dog"],
        correctAnswer: 2,
        category: "grammar",
        explanation: "The subject is who or what performs the action. 'Fox' is doing the jumping."
    },
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 6,
        level: 6,
        questionText: "What is a simile?",
        options: [
            "Comparison using like or as",
            "Giving human traits to objects",
            "Extreme exaggeration",
            "Implied comparison"
        ],
        correctAnswer: 0,
        category: "literary-devices",
        explanation: "A simile compares two things using 'like' or 'as'."
    },
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 7,
        level: 7,
        questionText: "Choose the correct form: 'If I ___ rich, I would travel the world'",
        options: ["am", "was", "were", "be"],
        correctAnswer: 2,
        category: "grammar",
        explanation: "Use 'were' (not 'was') in second conditional for all subjects."
    },
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 7,
        level: 7,
        questionText: "What is personification?",
        options: [
            "Comparing two things",
            "Giving human qualities to non-human things",
            "Using symbols",
            "Repeating sounds"
        ],
        correctAnswer: 1,
        category: "literary-devices",
        explanation: "Personification gives human characteristics to non-human things or ideas."
    },
    {
        subject: "English",
        questionType: "multiple-choice",
        difficulty: 8,
        level: 8,
        questionText: "What is the passive voice of 'The chef cooks the meal'?",
        options: [
            "The meal cooks the chef",
            "The meal is cooked by the chef",
            "The meal was cooked by the chef",
            "The chef is cooking the meal"
        ],
        correctAnswer: 1,
        category: "grammar",
        explanation: "In passive voice, the object becomes the subject and we use 'is/are + past participle'."
    },

    // True/False Questions (16-22)
    {
        subject: "English",
        questionType: "true-false",
        difficulty: 2,
        level: 2,
        questionText: "A pronoun is a word that replaces a noun.",
        options: ["True", "False"],
        correctAnswer: 0,
        category: "parts-of-speech",
        explanation: "True. Pronouns like 'he', 'she', 'it' replace nouns to avoid repetition."
    },
    {
        subject: "English",
        questionType: "true-false",
        difficulty: 3,
        level: 3,
        questionText: "'Their', 'there', and 'they're' can be used interchangeably.",
        options: ["True", "False"],
        correctAnswer: 1,
        category: "spelling",
        explanation: "False. These homophones have different meanings and uses."
    },
    {
        subject: "English",
        questionType: "true-false",
        difficulty: 4,
        level: 4,
        questionText: "An adjective describes a noun or pronoun.",
        options: ["True", "False"],
        correctAnswer: 0,
        category: "parts-of-speech",
        explanation: "True. Adjectives modify nouns and pronouns (e.g., 'beautiful flower')."
    },
    {
        subject: "English",
        questionType: "true-false",
        difficulty: 5,
        level: 5,
        questionText: "A comma splice occurs when two independent clauses are joined with only a comma.",
        options: ["True", "False"],
        correctAnswer: 0,
        category: "punctuation",
        explanation: "True. This is a common grammatical error that should be avoided."
    },
    {
        subject: "English",
        questionType: "true-false",
        difficulty: 6,
        level: 6,
        questionText: "The word 'literally' should only be used for things that actually happened.",
        options: ["True", "False"],
        correctAnswer: 0,
        category: "vocabulary",
        explanation: "True. 'Literally' means actually or in a literal sense, not figuratively."
    },
    {
        subject: "English",
        questionType: "true-false",
        difficulty: 7,
        level: 7,
        questionText: "A thesis statement can appear anywhere in an essay.",
        options: ["True", "False"],
        correctAnswer: 1,
        category: "writing",
        explanation: "False. A thesis statement typically appears at the end of the introduction."
    },
    {
        subject: "English",
        questionType: "true-false",
        difficulty: 8,
        level: 8,
        questionText: "Foreshadowing is a literary device that hints at future events.",
        options: ["True", "False"],
        correctAnswer: 0,
        category: "literary-devices",
        explanation: "True. Foreshadowing creates anticipation by hinting at what's to come."
    },

    // Fill-in-the-Blank Questions (23-28)
    {
        subject: "English",
        questionType: "fill-in-blank",
        difficulty: 2,
        level: 2,
        questionText: "Complete the sentence: A group of words that contains a subject and a verb is called a ___.",
        acceptedAnswers: ["clause", "sentence clause"],
        hints: ["It starts with 'c'", "It's a grammatical term"],
        category: "grammar",
        explanation: "A clause is a group of words with a subject and a predicate."
    },
    {
        subject: "English",
        questionType: "fill-in-blank",
        difficulty: 3,
        level: 3,
        questionText: "The past tense of 'run' is ___.",
        acceptedAnswers: ["ran"],
        hints: ["It's an irregular verb", "It has 3 letters"],
        category: "grammar",
        explanation: "'Ran' is the simple past tense of the irregular verb 'run'."
    },
    {
        subject: "English",
        questionType: "fill-in-blank",
        difficulty: 4,
        level: 4,
        questionText: "The three main types of sentences are declarative, interrogative, and ___.",
        acceptedAnswers: ["imperative", "exclamatory"],
        hints: ["Commands and orders", "Can also be exclamatory"],
        category: "grammar",
        explanation: "Imperative sentences give commands or make requests."
    },
    {
        subject: "English",
        questionType: "fill-in-blank",
        difficulty: 5,
        level: 5,
        questionText: "In the phrase 'running water', 'running' functions as an ___.",
        acceptedAnswers: ["adjective", "participial adjective", "participle"],
        hints: ["It describes the noun", "It's a word ending in -ing used as an adjective"],
        category: "parts-of-speech",
        explanation: "'Running' is a present participle functioning as an adjective."
    },
    {
        subject: "English",
        questionType: "fill-in-blank",
        difficulty: 7,
        level: 7,
        questionText: "The repetition of vowel sounds in nearby words is called ___.",
        acceptedAnswers: ["assonance"],
        hints: ["It's similar to alliteration but with vowels", "Starts with 'a'"],
        category: "literary-devices",
        explanation: "Assonance is the repetition of vowel sounds in close proximity."
    },
    {
        subject: "English",
        questionType: "fill-in-blank",
        difficulty: 8,
        level: 8,
        questionText: "A comparison between two unlike things for the purpose of explanation is called an ___.",
        acceptedAnswers: ["analogy"],
        hints: ["Often used to explain complex ideas", "Starts with 'a'"],
        category: "literary-devices",
        explanation: "An analogy compares two things to highlight similarities and aid understanding."
    },

    // Matching Questions (29-30)
    {
        subject: "English",
        questionType: "matching",
        difficulty: 4,
        level: 4,
        questionText: "Match each literary term with its definition:",
        matchingPairs: [
            { left: "Metaphor", right: "Comparison without like/as" },
            { left: "Simile", right: "Comparison using like/as" },
            { left: "Hyperbole", right: "Extreme exaggeration" },
            { left: "Onomatopoeia", right: "Words that imitate sounds" }
        ],
        correctAnswer: [0, 1, 2, 3],
        category: "literary-devices",
        explanation: "Each literary device has a specific function in creative writing."
    },
    {
        subject: "English",
        questionType: "matching",
        difficulty: 6,
        level: 6,
        questionText: "Match each part of speech with its example:",
        matchingPairs: [
            { left: "Noun", right: "happiness" },
            { left: "Verb", right: "think" },
            { left: "Adjective", right: "beautiful" },
            { left: "Adverb", right: "quickly" }
        ],
        correctAnswer: [0, 1, 2, 3],
        category: "parts-of-speech",
        explanation: "Understanding parts of speech is fundamental to grammar."
    },

    // ========================================
    // MATHEMATICS - 30 QUESTIONS (Mixed Types)
    // ========================================

    // Multiple Choice (1-15)
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 1,
        level: 1,
        questionText: "What is 5 + 7?",
        options: ["10", "11", "12", "13"],
        correctAnswer: 2,
        category: "arithmetic",
        explanation: "5 + 7 = 12"
    },
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 1,
        level: 1,
        questionText: "What is 15 - 8?",
        options: ["6", "7", "8", "9"],
        correctAnswer: 1,
        category: "arithmetic",
        explanation: "15 - 8 = 7"
    },
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 2,
        level: 2,
        questionText: "What is 6 × 4?",
        options: ["20", "22", "24", "26"],
        correctAnswer: 2,
        category: "arithmetic",
        explanation: "6 × 4 = 24"
    },
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 2,
        level: 2,
        questionText: "What is 36 ÷ 6?",
        options: ["5", "6", "7", "8"],
        correctAnswer: 1,
        category: "arithmetic",
        explanation: "36 ÷ 6 = 6"
    },
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 3,
        level: 3,
        questionText: "What is 25% of 80?",
        options: ["15", "20", "25", "30"],
        correctAnswer: 1,
        category: "percentages",
        explanation: "25% = 1/4, so 80 ÷ 4 = 20"
    },
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 4,
        level: 4,
        questionText: "Solve: 3x + 5 = 20",
        options: ["x = 3", "x = 5", "x = 10", "x = 15"],
        correctAnswer: 1,
        category: "algebra",
        explanation: "3x = 15, therefore x = 5"
    },
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 4,
        level: 4,
        questionText: "What is the area of a rectangle 5cm × 8cm?",
        options: ["13 cm²", "26 cm²", "40 cm²", "80 cm²"],
        correctAnswer: 2,
        category: "geometry",
        explanation: "Area = length × width = 5 × 8 = 40 cm²"
    },
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 5,
        level: 5,
        questionText: "What is √144?",
        options: ["10", "11", "12", "13"],
        correctAnswer: 2,
        category: "arithmetic",
        explanation: "12 × 12 = 144"
    },
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 6,
        level: 6,
        questionText: "If y = 2x + 3, what is y when x = 4?",
        options: ["9", "10", "11", "12"],
        correctAnswer: 2,
        category: "algebra",
        explanation: "y = 2(4) + 3 = 8 + 3 = 11"
    },
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 6,
        level: 6,
        questionText: "What is the perimeter of a square with side 7cm?",
        options: ["14 cm", "21 cm", "28 cm", "49 cm"],
        correctAnswer: 2,
        category: "geometry",
        explanation: "Perimeter = 4 × side = 4 × 7 = 28 cm"
    },
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 7,
        level: 7,
        questionText: "What is the value of π (pi) rounded to 2 decimal places?",
        options: ["3.12", "3.14", "3.16", "3.18"],
        correctAnswer: 1,
        category: "constants",
        explanation: "π ≈ 3.14159..."
    },
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 7,
        level: 7,
        questionText: "Solve: 2x² - 8 = 0",
        options: ["x = ±1", "x = ±2", "x = ±3", "x = ±4"],
        correctAnswer: 1,
        category: "algebra",
        explanation: "x² = 4, so x = ±2"
    },
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 8,
        level: 8,
        questionText: "What is the slope of the line y = 3x + 5?",
        options: ["3", "5", "8", "15"],
        correctAnswer: 0,
        category: "algebra",
        explanation: "In y = mx + b form, m is the slope. Here m = 3."
    },
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 8,
        level: 8,
        questionText: "What is the circumference of a circle with radius 7cm? (Use π ≈ 3.14)",
        options: ["21.98 cm", "43.96 cm", "153.86 cm", "307.72 cm"],
        correctAnswer: 1,
        category: "geometry",
        explanation: "Circumference = 2πr = 2 × 3.14 × 7 = 43.96 cm"
    },
    {
        subject: "Mathematics",
        questionType: "multiple-choice",
        difficulty: 9,
        level: 9,
        questionText: "What is the derivative of x²?",
        options: ["x", "2x", "x²/2", "2"],
        correctAnswer: 1,
        category: "calculus",
        explanation: "Using the power rule: d/dx(x²) = 2x"
    },

    // Continue with remaining question types for Mathematics...
    // (Similar pattern: True/False, Fill-in-Blank, Matching)

];
