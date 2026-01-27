// services/gameGenerator.js - Universal Game Generator for All Subjects

/**
 * GameGenerator - Converts exercises into engaging games
 * Works with any subject (Math, English, Science, etc.)
 * Supports 10 game types with adaptive difficulty
 */
class GameGenerator {
  /**
   * Generate game data from exercise content
   * @param {Object} exercise - The exercise/step content
   * @param {String} gameType - Type of game to generate
   * @param {Object} options - Configuration options
   * @returns {Object} Game configuration
   */
  static generateGameFromExercise(exercise, gameType, options = {}) {
    const generators = {
      'basket-catch': this.generateBasketCatch,
      'memory-cards': this.generateMemoryCards,
      'whack-a-mole': this.generateWhackAMole,
      'tower-builder': this.generateTowerBuilder,
      'target-practice': this.generateTargetPractice,
      'maze-runner': this.generateMazeRunner,
      'bubble-pop': this.generateBubblePop,
      'lightning-round': this.generateLightningRound,
      'scale-balance': this.generateScaleBalance,
      'pattern-builder': this.generatePatternBuilder
    };

    const generator = generators[gameType];
    if (!generator) {
      throw new Error(`Unknown game type: ${gameType}`);
    }

    return generator.call(this, exercise, options);
  }

  // ========================================
  // GAME TYPE 1: BASKET CATCH 🧺
  // ========================================
  /**
   * Basket Catch - Catch falling correct answers
   * Works for: vocab, grammar, math problems, any categorization
   */
  static generateBasketCatch(exercise, options = {}) {
    const {
      difficulty = 'medium',
      itemCount = 20,
      correctRatio = 0.4
    } = options;

    const correctItems = this.extractCorrectAnswers(exercise);
    const wrongItems = this.generateDistractors(exercise, correctItems);

    if (correctItems.length === 0) {
      throw new Error('No correct answers found in exercise');
    }

    const items = [];
    const correctCount = Math.floor(itemCount * correctRatio);
    const wrongCount = itemCount - correctCount;

    // Add correct items
    for (let i = 0; i < correctCount; i++) {
      const content = correctItems[i % correctItems.length];
      items.push({
        id: `correct-${i}`,
        content: this.formatContent(content),
        isCorrect: true,
        points: 10,
        position: {
          x: Math.random() * 80 + 10,
          startY: -10,
          fallSpeed: this.getFallSpeed(difficulty)
        },
        delay: Math.random() * 5000
      });
    }

    // Add wrong items
    for (let i = 0; i < wrongCount; i++) {
      const content = wrongItems[i % wrongItems.length];
      items.push({
        id: `wrong-${i}`,
        content: this.formatContent(content),
        isCorrect: false,
        points: -5,
        position: {
          x: Math.random() * 80 + 10,
          startY: -10,
          fallSpeed: this.getFallSpeed(difficulty)
        },
        delay: Math.random() * 5000
      });
    }

    return {
      gameType: 'basket-catch',
      difficulty,
      timeLimit: difficulty === 'easy' ? 90 : difficulty === 'medium' ? 60 : 45,
      targetScore: 100,
      lives: difficulty === 'easy' ? 5 : difficulty === 'medium' ? 3 : 2,
      items: this.shuffleArray(items),
      instructions: this.getGameInstructions('basket-catch', exercise),
      gameplayData: {
        basketWidth: 100,
        basketSpeed: difficulty === 'easy' ? 10 : difficulty === 'medium' ? 15 : 20,
        gravity: 1.5
      }
    };
  }

  // ========================================
  // GAME TYPE 2: MEMORY CARDS 🃏
  // ========================================
  /**
   * Memory Cards - Match pairs
   * Works for: translations, definitions, equations & answers
   */
  static generateMemoryCards(exercise, options = {}) {
    const { difficulty = 'medium' } = options;

    const pairs = this.extractPairs(exercise);
    if (pairs.length < 3) {
      throw new Error('Need at least 3 pairs for memory game');
    }

    // Limit pairs based on difficulty
    const pairCount = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 8 : 10;
    const selectedPairs = pairs.slice(0, pairCount);

    // Create card items
    const items = [];
    selectedPairs.forEach((pair, index) => {
      items.push({
        id: `card-${index}-a`,
        content: this.formatContent(pair.question || pair.left),
        pairId: index,
        type: 'question',
        isMatched: false
      });
      items.push({
        id: `card-${index}-b`,
        content: this.formatContent(pair.answer || pair.right),
        pairId: index,
        type: 'answer',
        isMatched: false
      });
    });

    return {
      gameType: 'memory-cards',
      difficulty,
      timeLimit: difficulty === 'easy' ? 180 : difficulty === 'medium' ? 120 : 90,
      targetScore: selectedPairs.length * 20,
      items: this.shuffleArray(items),
      instructions: 'Flip cards to match pairs!',
      gameplayData: {
        gridSize: selectedPairs.length <= 6 ? '3x4' : selectedPairs.length <= 8 ? '4x4' : '4x5',
        flipDelay: 1000,
        maxFlippedCards: 2
      }
    };
  }

  // ========================================
  // GAME TYPE 3: WHACK-A-MOLE 🔨
  // ========================================
  /**
   * Whack-a-Mole - Hit correct answers quickly
   * Works for: quick recognition, grammar errors, true/false
   */
  static generateWhackAMole(exercise, options = {}) {
    const { difficulty = 'medium' } = options;

    const correctItems = this.extractCorrectAnswers(exercise);
    const wrongItems = this.generateDistractors(exercise, correctItems);

    const roundCount = difficulty === 'easy' ? 15 : difficulty === 'medium' ? 20 : 25;
    const items = [];

    for (let i = 0; i < roundCount; i++) {
      const isCorrect = Math.random() > 0.4; // 60% correct
      const content = isCorrect
        ? correctItems[Math.floor(Math.random() * correctItems.length)]
        : wrongItems[Math.floor(Math.random() * wrongItems.length)];

      items.push({
        id: `mole-${i}`,
        content: this.formatContent(content),
        isCorrect,
        points: isCorrect ? 10 : -5,
        position: {
          hole: Math.floor(Math.random() * 9), // 9 holes (3x3 grid)
          appearTime: i * (difficulty === 'easy' ? 2000 : difficulty === 'medium' ? 1500 : 1000),
          visibleDuration: difficulty === 'easy' ? 2000 : difficulty === 'medium' ? 1500 : 1000
        }
      });
    }

    return {
      gameType: 'whack-a-mole',
      difficulty,
      timeLimit: roundCount * (difficulty === 'easy' ? 2.5 : difficulty === 'medium' ? 2 : 1.5),
      targetScore: 150,
      lives: difficulty === 'easy' ? 5 : difficulty === 'medium' ? 3 : 2,
      items,
      instructions: 'Whack only the correct answers!',
      gameplayData: {
        gridSize: '3x3',
        holeCount: 9
      }
    };
  }

  // ========================================
  // GAME TYPE 4: TOWER BUILDER 🏗️
  // ========================================
  /**
   * Tower Builder - Stack correct answers
   * Works for: sequences, sentence building, step-by-step problems
   */
  static generateTowerBuilder(exercise, options = {}) {
    const { difficulty = 'medium' } = options;

    const sequence = this.extractSequence(exercise);
    if (sequence.length < 3) {
      throw new Error('Need at least 3 items for tower building');
    }

    // Generate distractors for each position
    const items = sequence.map((correct, index) => ({
      level: index,
      correctBlock: {
        id: `block-${index}-correct`,
        content: this.formatContent(correct),
        isCorrect: true,
        points: 20
      },
      distractors: this.generateDistractors(exercise, [correct], 2).map((wrong, i) => ({
        id: `block-${index}-wrong-${i}`,
        content: this.formatContent(wrong),
        isCorrect: false,
        points: -10
      }))
    }));

    return {
      gameType: 'tower-builder',
      difficulty,
      timeLimit: difficulty === 'easy' ? 120 : difficulty === 'medium' ? 90 : 60,
      targetScore: sequence.length * 20,
      lives: difficulty === 'easy' ? 5 : difficulty === 'medium' ? 3 : 2,
      items,
      instructions: 'Build your tower by selecting the correct blocks in order!',
      gameplayData: {
        totalLevels: sequence.length,
        blocksPerLevel: 3,
        fallOnWrong: difficulty !== 'easy'
      }
    };
  }

  // ========================================
  // GAME TYPE 5: TARGET PRACTICE 🎯
  // ========================================
  /**
   * Target Practice - Shoot correct answers
   * Works for: math operations, translations, quick decisions
   */
  static generateTargetPractice(exercise, options = {}) {
    const { difficulty = 'medium' } = options;

    const correctItems = this.extractCorrectAnswers(exercise);
    const wrongItems = this.generateDistractors(exercise, correctItems);

    const targetCount = difficulty === 'easy' ? 10 : difficulty === 'medium' ? 15 : 20;
    const items = [];

    for (let i = 0; i < targetCount; i++) {
      const isCorrect = Math.random() > 0.3; // 70% correct
      const content = isCorrect
        ? correctItems[Math.floor(Math.random() * correctItems.length)]
        : wrongItems[Math.floor(Math.random() * wrongItems.length)];

      items.push({
        id: `target-${i}`,
        content: this.formatContent(content),
        isCorrect,
        points: isCorrect ? 15 : -10,
        position: {
          x: Math.random() * 600 + 100,
          y: Math.random() * 400 + 100,
          speed: (Math.random() * 2 + 1) * (difficulty === 'easy' ? 0.5 : difficulty === 'medium' ? 1 : 1.5),
          direction: Math.random() * 360
        }
      });
    }

    return {
      gameType: 'target-practice',
      difficulty,
      timeLimit: 60,
      targetScore: 150,
      items,
      instructions: 'Shoot the correct answers! Avoid wrong ones.',
      gameplayData: {
        canvasWidth: 800,
        canvasHeight: 600,
        bulletSpeed: 10,
        maxBullets: difficulty === 'easy' ? Infinity : difficulty === 'medium' ? 30 : 20
      }
    };
  }

  // ========================================
  // GAME TYPE 6: MAZE RUNNER 🏃
  // ========================================
  /**
   * Maze Runner - Navigate by answering questions
   * Works for: sequential learning, multiple choice
   */
  static generateMazeRunner(exercise, options = {}) {
    const { difficulty = 'medium' } = options;

    const questions = this.extractQuestions(exercise);
    if (questions.length < 5) {
      throw new Error('Need at least 5 questions for maze');
    }

    const pathLength = difficulty === 'easy' ? 10 : difficulty === 'medium' ? 15 : 20;
    const selectedQuestions = questions.slice(0, pathLength);

    const items = selectedQuestions.map((q, index) => ({
      id: `checkpoint-${index}`,
      position: index,
      question: this.formatContent(q.question),
      options: q.options || this.generateOptions(q),
      correctAnswer: q.correctAnswer,
      points: 10
    }));

    return {
      gameType: 'maze-runner',
      difficulty,
      timeLimit: pathLength * (difficulty === 'easy' ? 20 : difficulty === 'medium' ? 15 : 10),
      targetScore: pathLength * 10,
      lives: difficulty === 'easy' ? 5 : difficulty === 'medium' ? 3 : 2,
      items,
      instructions: 'Answer questions to navigate through the maze!',
      gameplayData: {
        mazeSize: difficulty === 'easy' ? '10x10' : difficulty === 'medium' ? '15x15' : '20x20',
        checkpoints: pathLength,
        wallPenalty: -5
      }
    };
  }

  // ========================================
  // GAME TYPE 7: BUBBLE POP 💭
  // ========================================
  /**
   * Bubble Pop - Pop matching bubbles
   * Works for: matching, same values, synonyms
   */
  static generateBubblePop(exercise, options = {}) {
    const { difficulty = 'medium' } = options;

    const pairs = this.extractPairs(exercise);
    const bubbleCount = difficulty === 'easy' ? 20 : difficulty === 'medium' ? 30 : 40;
    const items = [];

    // Create bubbles from pairs
    for (let i = 0; i < bubbleCount; i++) {
      const pair = pairs[Math.floor(Math.random() * pairs.length)];
      const usePrimary = Math.random() > 0.5;
      const content = usePrimary ? pair.question || pair.left : pair.answer || pair.right;
      const groupId = pairs.indexOf(pair);

      items.push({
        id: `bubble-${i}`,
        content: this.formatContent(content),
        groupId,
        type: usePrimary ? 'primary' : 'secondary',
        points: 10,
        position: {
          x: Math.random() * 700 + 50,
          y: Math.random() * 500 + 50,
          radius: difficulty === 'easy' ? 40 : difficulty === 'medium' ? 35 : 30,
          floatSpeed: Math.random() * 1 + 0.5
        }
      });
    }

    return {
      gameType: 'bubble-pop',
      difficulty,
      timeLimit: difficulty === 'easy' ? 120 : difficulty === 'medium' ? 90 : 60,
      targetScore: Math.floor(bubbleCount / 2) * 10,
      items,
      instructions: 'Pop matching bubbles together!',
      gameplayData: {
        minMatchSize: 2,
        comboBonus: true,
        canvasSize: '800x600'
      }
    };
  }

  // ========================================
  // GAME TYPE 8: LIGHTNING ROUND ⚡
  // ========================================
  /**
   * Lightning Round - Rapid-fire questions
   * Works for: speed drills, quick facts
   */
  static generateLightningRound(exercise, options = {}) {
    const { difficulty = 'medium' } = options;

    const questions = this.extractQuestions(exercise);
    const questionCount = difficulty === 'easy' ? 15 : difficulty === 'medium' ? 20 : 30;
    const selectedQuestions = questions.slice(0, questionCount);

    const items = selectedQuestions.map((q, index) => ({
      id: `question-${index}`,
      question: this.formatContent(q.question),
      answer: q.answer || q.correctAnswer,
      options: q.options,
      points: 10,
      timeLimit: difficulty === 'easy' ? 10 : difficulty === 'medium' ? 7 : 5,
      bonusPoints: difficulty === 'hard' ? 5 : 0
    }));

    return {
      gameType: 'lightning-round',
      difficulty,
      timeLimit: questionCount * (difficulty === 'easy' ? 12 : difficulty === 'medium' ? 9 : 6),
      targetScore: questionCount * 10,
      items,
      instructions: 'Answer as fast as you can! Speed = Bonus!',
      gameplayData: {
        perQuestionTime: difficulty === 'easy' ? 10 : difficulty === 'medium' ? 7 : 5,
        speedBonus: true,
        showTimer: true
      }
    };
  }

  // ========================================
  // GAME TYPE 9: SCALE BALANCE ⚖️
  // ========================================
  /**
   * Scale Balance - Balance equations/values
   * Works for: math equations, equivalent values, comparisons
   */
  static generateScaleBalance(exercise, options = {}) {
    const { difficulty = 'medium' } = options;

    const problems = this.extractEquations(exercise);
    const problemCount = difficulty === 'easy' ? 8 : difficulty === 'medium' ? 12 : 15;

    const items = problems.slice(0, problemCount).map((problem, index) => ({
      id: `scale-${index}`,
      leftSide: this.formatContent(problem.left),
      rightSide: this.formatContent(problem.right),
      correctAnswer: problem.solution,
      options: problem.options || this.generateNumericOptions(problem.solution),
      points: 15,
      isBalanced: problem.isBalanced || false
    }));

    return {
      gameType: 'scale-balance',
      difficulty,
      timeLimit: problemCount * (difficulty === 'easy' ? 20 : difficulty === 'medium' ? 15 : 10),
      targetScore: problemCount * 15,
      items,
      instructions: 'Balance the scales by finding the correct values!',
      gameplayData: {
        tolerance: difficulty === 'easy' ? 0.5 : difficulty === 'medium' ? 0.1 : 0.01,
        showWork: difficulty === 'easy'
      }
    };
  }

  // ========================================
  // GAME TYPE 10: PATTERN BUILDER 🔵🔴
  // ========================================
  /**
   * Pattern Builder - Complete patterns
   * Works for: sequences, logic, predictions
   */
  static generatePatternBuilder(exercise, options = {}) {
    const { difficulty = 'medium' } = options;

    const patterns = this.extractPatterns(exercise);
    const patternCount = difficulty === 'easy' ? 8 : difficulty === 'medium' ? 12 : 15;

    const items = patterns.slice(0, patternCount).map((pattern, index) => ({
      id: `pattern-${index}`,
      sequence: pattern.sequence,
      missingIndex: pattern.missingIndex || pattern.sequence.length - 1,
      correctAnswer: pattern.next || pattern.missing,
      options: pattern.options || this.generatePatternOptions(pattern),
      points: 20,
      rule: pattern.rule
    }));

    return {
      gameType: 'pattern-builder',
      difficulty,
      timeLimit: patternCount * (difficulty === 'easy' ? 25 : difficulty === 'medium' ? 20 : 15),
      targetScore: patternCount * 20,
      items,
      instructions: 'Find the pattern and complete the sequence!',
      gameplayData: {
        showHint: difficulty === 'easy',
        hintCost: 5,
        allowMultiple: false
      }
    };
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  /**
   * Extract correct answers from exercise
   */
  static extractCorrectAnswers(exercise) {
    const answers = [];

    // Handle different exercise formats
    if (exercise.content) {
      // From step content
      if (exercise.content.exercises) {
        exercise.content.exercises.forEach(ex => {
          if (ex.correctAnswer) answers.push(ex.correctAnswer);
          if (ex.answer) answers.push(ex.answer);
        });
      }
      if (exercise.content.questions) {
        exercise.content.questions.forEach(q => {
          if (q.correctAnswer !== undefined) {
            if (q.options) {
              answers.push(q.options[q.correctAnswer]);
            } else {
              answers.push(q.correctAnswer);
            }
          }
        });
      }
      if (exercise.content.terms) {
        exercise.content.terms.forEach(term => {
          if (term.definition) answers.push(term.definition);
          if (term.translation) answers.push(term.translation);
        });
      }
    }

    // Direct properties
    if (exercise.correctAnswer) answers.push(exercise.correctAnswer);
    if (exercise.answer) answers.push(exercise.answer);
    if (Array.isArray(exercise.options) && exercise.correctAnswerIndex !== undefined) {
      answers.push(exercise.options[exercise.correctAnswerIndex]);
    }

    return [...new Set(answers)].filter(a => a !== null && a !== undefined);
  }

  /**
   * Generate distractors (wrong answers)
   */
  static generateDistractors(exercise, correctAnswers, count = 10) {
    const distractors = new Set();

    // From exercise options
    if (exercise.content && exercise.content.exercises) {
      exercise.content.exercises.forEach(ex => {
        if (ex.options) {
          ex.options.forEach(opt => {
            if (!correctAnswers.includes(opt)) {
              distractors.add(opt);
            }
          });
        }
      });
    }

    if (exercise.options) {
      exercise.options.forEach(opt => {
        if (!correctAnswers.includes(opt)) {
          distractors.add(opt);
        }
      });
    }

    // Generate similar but wrong answers
    correctAnswers.forEach(correct => {
      if (typeof correct === 'number') {
        distractors.add(correct + 1);
        distractors.add(correct - 1);
        distractors.add(correct * 2);
        distractors.add(Math.floor(correct / 2));
      } else if (typeof correct === 'string') {
        // String variations
        if (correct.length > 2) {
          distractors.add(correct.slice(0, -1));
          distractors.add(correct + 's');
          distractors.add(correct.slice(1));
        }
      }
    });

    const result = Array.from(distractors).filter(d => d !== null && d !== undefined);
    return result.slice(0, Math.max(count, result.length));
  }

  /**
   * Extract question-answer pairs
   */
  static extractPairs(exercise) {
    const pairs = [];

    if (exercise.content) {
      if (exercise.content.exercises) {
        exercise.content.exercises.forEach(ex => {
          if (ex.question && ex.correctAnswer) {
            pairs.push({ question: ex.question, answer: ex.correctAnswer });
          }
        });
      }
      if (exercise.content.questions) {
        exercise.content.questions.forEach(q => {
          if (q.question && q.correctAnswer !== undefined) {
            const answer = q.options ? q.options[q.correctAnswer] : q.correctAnswer;
            pairs.push({ question: q.question, answer });
          }
        });
      }
      if (exercise.content.terms) {
        exercise.content.terms.forEach(term => {
          if (term.term && term.definition) {
            pairs.push({ left: term.term, right: term.definition });
          }
        });
      }
    }

    // Fallback: create pairs from correct answers
    if (pairs.length === 0) {
      const correctAnswers = this.extractCorrectAnswers(exercise);
      correctAnswers.forEach((answer, index) => {
        pairs.push({
          question: `Item ${index + 1}`,
          answer: answer
        });
      });
    }

    return pairs;
  }

  /**
   * Extract sequence/ordered items
   */
  static extractSequence(exercise) {
    if (exercise.content && exercise.content.sequence) {
      return exercise.content.sequence;
    }

    const correctAnswers = this.extractCorrectAnswers(exercise);
    return correctAnswers;
  }

  /**
   * Extract questions
   */
  static extractQuestions(exercise) {
    const questions = [];

    if (exercise.content) {
      if (exercise.content.questions) {
        return exercise.content.questions;
      }
      if (exercise.content.exercises) {
        exercise.content.exercises.forEach(ex => {
          if (ex.question) {
            questions.push({
              question: ex.question,
              answer: ex.correctAnswer || ex.answer,
              options: ex.options
            });
          }
        });
      }
    }

    return questions;
  }

  /**
   * Extract equations/problems
   */
  static extractEquations(exercise) {
    const equations = [];

    if (exercise.content && exercise.content.exercises) {
      exercise.content.exercises.forEach(ex => {
        if (ex.equation || ex.expression) {
          equations.push({
            left: ex.left || ex.equation,
            right: ex.right,
            solution: ex.correctAnswer || ex.answer,
            options: ex.options
          });
        }
      });
    }

    // Fallback: create simple equations from answers
    const answers = this.extractCorrectAnswers(exercise);
    if (equations.length === 0 && answers.length > 0) {
      answers.forEach(answer => {
        if (typeof answer === 'number') {
          const operation = Math.random() > 0.5 ? '+' : '-';
          const num1 = Math.floor(Math.random() * answer);
          const num2 = operation === '+' ? answer - num1 : num1 - answer;
          equations.push({
            left: `${num1} ${operation} ${num2}`,
            right: '?',
            solution: answer
          });
        }
      });
    }

    return equations;
  }

  /**
   * Extract patterns
   */
  static extractPatterns(exercise) {
    const patterns = [];

    if (exercise.content && exercise.content.patterns) {
      return exercise.content.patterns;
    }

    // Generate basic patterns from numbers
    const answers = this.extractCorrectAnswers(exercise);
    answers.forEach((answer, index) => {
      if (typeof answer === 'number') {
        const sequence = [answer - 2, answer - 1, answer];
        patterns.push({
          sequence,
          next: answer + 1,
          rule: 'Add 1'
        });
      }
    });

    return patterns;
  }

  /**
   * Format content for display
   */
  static formatContent(content) {
    if (content === null || content === undefined) return '';
    if (typeof content === 'object') return JSON.stringify(content);
    return String(content);
  }

  /**
   * Generate numeric options around a value
   */
  static generateNumericOptions(correct, count = 4) {
    if (typeof correct !== 'number') return [correct];

    const options = new Set([correct]);
    while (options.size < count) {
      const offset = Math.floor(Math.random() * 10) - 5;
      if (offset !== 0) {
        options.add(correct + offset);
      }
    }
    return this.shuffleArray(Array.from(options));
  }

  /**
   * Generate pattern options
   */
  static generatePatternOptions(pattern) {
    const correct = pattern.next || pattern.missing;
    return this.generateNumericOptions(correct);
  }

  /**
   * Generate options for a question
   */
  static generateOptions(question) {
    const correct = question.correctAnswer || question.answer;
    if (question.options) return question.options;

    if (typeof correct === 'number') {
      return this.generateNumericOptions(correct);
    }

    return [correct, `Not ${correct}`, `Maybe ${correct}`, `Never ${correct}`];
  }

  /**
   * Get fall speed based on difficulty
   */
  static getFallSpeed(difficulty) {
    const speeds = { easy: 2, medium: 4, hard: 6 };
    return speeds[difficulty] || speeds.medium;
  }

  /**
   * Shuffle array
   */
  static shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Get game instructions based on type and exercise
   */
  static getGameInstructions(gameType, exercise) {
    const subject = exercise.subject || 'items';
    const instructions = {
      'basket-catch': `Catch the correct ${subject} in your basket!`,
      'memory-cards': 'Flip cards to match pairs!',
      'whack-a-mole': `Whack only the correct ${subject}!`,
      'tower-builder': 'Build your tower with correct answers in order!',
      'target-practice': `Shoot the correct ${subject}!`,
      'maze-runner': 'Answer questions to navigate the maze!',
      'bubble-pop': 'Pop matching bubbles together!',
      'lightning-round': 'Answer as many as you can before time runs out!',
      'scale-balance': 'Balance the scales with correct values!',
      'pattern-builder': 'Find the pattern and complete the sequence!'
    };
    return instructions[gameType] || 'Complete the game to proceed!';
  }
}

module.exports = GameGenerator;
