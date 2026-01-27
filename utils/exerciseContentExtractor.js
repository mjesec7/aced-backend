/**
 * Exercise Content Extractor for Voice Assistant
 *
 * Converts complex exercise data structures into natural language descriptions
 * that the AI voice assistant can understand and use to help students.
 *
 * @module utils/exerciseContentExtractor
 */

/**
 * Helper function to get localized content
 * @param {*} field - Field that may be a string or multilingual object
 * @param {string} language - Target language code (en, ru, uz)
 * @returns {string} Localized string value
 */
const getLocalizedContent = (field, language = 'en') => {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field[language] || field['en'] || field['ru'] || Object.values(field)[0] || '';
};

/**
 * Format exercise type into readable form
 * @param {string} type - Raw exercise type string
 * @returns {string} Formatted type name
 */
const formatType = (type) => {
  if (!type) return 'Unknown';
  return type
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/Step/g, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/\s+/g, ' ');
};

/**
 * Extracts readable content from exercise steps for the AI voice assistant.
 * This translates complex data structures into natural language descriptions.
 *
 * @param {Object} step - The current lesson step object
 * @param {string} language - Language code for localization (default: 'en')
 * @returns {string} A natural language description of the exercise
 */
const extractExerciseContent = (step, language = 'en') => {
  if (!step) return 'No active exercise.';

  // Handle content steps (explanations, videos, text)
  if (step.type === 'content' || step.type === 'video' || step.type === 'text') {
    const content = step.content;
    const text = content?.markdown || content?.text || content;
    return `Lesson Content: ${typeof text === 'string' ? text : 'Watch the video or read the content.'}`;
  }

  const type = step.type || step.component;
  const content = step.content || step;
  let description = `Exercise Type: ${formatType(type)}.\n`;

  const getLocal = (field) => getLocalizedContent(field, language);

  try {
    switch (type) {
      // ============================================
      // DATA ANALYSIS (Math)
      // ============================================
      case 'data_analysis':
        description += `Task: ${getLocal(content.prompt) || getLocal(step.prompt) || 'Analyze the data.'}\n`;
        if (content.data || step.data) {
          const data = content.data || step.data;
          const numericKey = content.numericKey || step.numericKey || 'value';
          const numericLabel = content.numericLabel || step.numericLabel || 'Value';
          description += `Data provided:\n`;
          data.forEach(item => {
            description += `- ${item.label}: ${numericLabel} = ${item[numericKey]}\n`;
          });
        }
        if (content.correctAnswer || step.correctAnswer) {
          description += `(AI Knowledge - Correct Answer: ${content.correctAnswer || step.correctAnswer})\n`;
        }
        break;

      // ============================================
      // FRACTION VISUAL (Math)
      // ============================================
      case 'fraction_visual':
        description += `Task: ${getLocal(content.prompt) || getLocal(step.prompt) || 'Create a visual fraction.'}\n`;
        description += `Target Fraction: ${content.targetNumerator || step.targetNumerator}/${content.targetDenominator || step.targetDenominator}\n`;
        description += `Total Blocks Available: ${content.userTotalBlocks || step.userTotalBlocks}\n`;
        description += `(AI Knowledge - User needs to shade ${content.requiredShaded || step.requiredShaded} blocks to be correct)\n`;
        break;

      // ============================================
      // GEOMETRY POLYGON (Math)
      // ============================================
      case 'geometry_poly':
      case 'GeometryPolyStep':
        description += `Task: ${getLocal(content.prompt) || getLocal(step.prompt) || 'Identify or construct the polygon.'}\n`;
        if (content.shapes || step.shapes) {
          description += `Shape Options: ${(content.shapes || step.shapes).join(', ')}\n`;
        }
        if (content.instruction || step.instruction) {
          description += `Instructions: ${getLocal(content.instruction) || getLocal(step.instruction)}\n`;
        }
        if (content.constraints || step.constraints) {
          description += `Constraints: ${JSON.stringify(content.constraints || step.constraints)}\n`;
        }
        if (content.correctShape || step.correctShape) {
          description += `(AI Knowledge - Correct Shape: ${content.correctShape || step.correctShape})\n`;
        }
        break;

      // ============================================
      // HISTOGRAM (Math)
      // ============================================
      case 'histogram':
        const histData = content.data || content;
        description += `Task: ${getLocal(histData.description) || 'Analyze the histogram.'}\n`;
        description += `Title: ${histData.title || 'Histogram Analysis'}\n`;
        if (histData.data?.labels && histData.data?.values) {
          description += `Data ranges and frequencies:\n`;
          histData.data.labels.forEach((label, i) => {
            description += `- ${label}: ${histData.data.values[i]}\n`;
          });
        }
        if (histData.correctValue) {
          description += `(AI Knowledge - Correct Answer: ${histData.correctValue})\n`;
        }
        break;

      // ============================================
      // CHEMISTRY MIXING (Science)
      // ============================================
      case 'chem_mixing':
      case 'ChemMixingStep':
        description += `Task: ${getLocal(content.prompt) || getLocal(step.prompt) || 'Mix substances to create a reaction.'}\n`;
        if (content.substances || step.substances) {
          description += `Available Substances:\n`;
          (content.substances || step.substances).forEach(s => {
            description += `- ${s.name}: Target Volume = ${s.targetVolume}ml (Max: ${s.maxVolume}ml)\n`;
          });
        }
        if (content.inventory || step.inventory) {
          description += `Inventory: ${(content.inventory || step.inventory).join(', ')}\n`;
        }
        if (content.targetProduct || step.targetProduct) {
          description += `Goal: Create ${content.targetProduct || step.targetProduct}\n`;
        }
        if (content.tolerance || step.tolerance) {
          description += `Tolerance: ±${content.tolerance || step.tolerance}ml\n`;
        }
        break;

      // ============================================
      // CHEMISTRY MATCHING (Science)
      // ============================================
      case 'chem_matching':
      case 'ChemMatchingStep':
        description += `Task: ${getLocal(content.prompt) || getLocal(step.prompt) || 'Match chemical compounds with their formulas.'}\n`;
        if (content.pairs || step.pairs) {
          description += `Items to match:\n`;
          (content.pairs || step.pairs).forEach(p => {
            description += `- "${p.name}" should be matched with "${p.formula}"\n`;
          });
          description += `(AI Knowledge - The user needs to correctly pair each compound name with its chemical formula)\n`;
        }
        break;

      // ============================================
      // ENGLISH SENTENCE FIX (Language)
      // ============================================
      case 'english_sentence_fix':
      case 'EnglishSentenceFixStep':
        description += `Task: ${getLocal(content.prompt) || getLocal(step.prompt) || 'Fix the errors in this sentence.'}\n`;
        description += `Incorrect Sentence: "${content.originalSentence || step.originalSentence || content.sentence || step.sentence}"\n`;
        if (content.tokens || step.tokens) {
          description += `Words: ${(content.tokens || step.tokens).join(' ')}\n`;
        }
        if (content.errors || step.errors) {
          description += `(AI Knowledge - Errors to fix:\n`;
          (content.errors || step.errors).forEach(err => {
            description += `  - Word "${(content.tokens || step.tokens)?.[err.index]}" should be "${err.correct}"\n`;
            if (err.explanation) description += `    Explanation: ${err.explanation}\n`;
          });
          description += `)\n`;
        }
        if (content.hint || step.hint) {
          description += `Hint: ${getLocal(content.hint) || getLocal(step.hint)}\n`;
        }
        if (content.correctSentence || step.correctAnswer) {
          description += `(AI Knowledge - Correct Sentence: "${content.correctSentence || step.correctAnswer}")\n`;
        }
        break;

      // ============================================
      // ENGLISH SENTENCE ORDER (Language)
      // ============================================
      case 'english_sentence_order':
      case 'EnglishSentenceOrderStep':
        description += `Task: ${getLocal(content.prompt) || getLocal(step.prompt) || 'Arrange the words to form a correct sentence.'}\n`;
        if (content.scrambledOptions || step.scrambledOptions || content.words || step.words) {
          description += `Scrambled Words: ${(content.scrambledOptions || step.scrambledOptions || content.words || step.words).join(', ')}\n`;
        }
        if (content.correctOrder || step.correctOrder || content.correctSentence || step.correctAnswer) {
          const correctArr = content.correctOrder || step.correctOrder;
          const correctStr = correctArr ? correctArr.join(' ') : (content.correctSentence || step.correctAnswer);
          description += `(AI Knowledge - Correct Order: "${correctStr}")\n`;
        }
        break;

      // ============================================
      // LANGUAGE NOUN BAG (Language - Categorization)
      // ============================================
      case 'language_noun_bag':
        description += `Task: ${getLocal(content.prompt) || getLocal(step.prompt) || 'Sort words by their type.'}\n`;
        const targetPos = content.targetPos || step.targetPos || 'noun';
        description += `Goal: Find all the ${targetPos}s from the list.\n`;
        if (content.words || step.words) {
          description += `Words:\n`;
          (content.words || step.words).forEach(w => {
            description += `- "${w.text}" (${w.pos})\n`;
          });
          const correctWords = (content.words || step.words).filter(w => w.pos === targetPos);
          description += `(AI Knowledge - Correct ${targetPos}s: ${correctWords.map(w => w.text).join(', ')})\n`;
        }
        break;

      // ============================================
      // LANGUAGE FALSE FRIENDS (Language)
      // ============================================
      case 'language_false_friends':
      case 'LanguageFalseFriends':
        description += `Task: ${getLocal(content.prompt) || 'Identify false friends (words that look similar but have different meanings).'}\n`;
        if (content.word || step.word) {
          description += `Target Word: "${content.word || step.word}"\n`;
        }
        if (content.options || step.options) {
          description += `Options: ${(content.options || step.options).map(o => o.text || o).join(', ')}\n`;
        }
        break;

      // ============================================
      // LANGUAGE TONE TRANSFORMER (Language)
      // ============================================
      case 'language_tone_transformer':
        description += `Task: Transform the sentence to a different tone or register.\n`;
        if (content.originalSentence || step.originalSentence) {
          description += `Original Sentence: "${content.originalSentence || step.originalSentence}"\n`;
        }
        if (content.targetTone || step.targetTone) {
          description += `Target Tone: ${content.targetTone || step.targetTone}\n`;
        }
        break;

      // ============================================
      // LANGUAGE IDIOM BRIDGE (Language)
      // ============================================
      case 'language_idiom_bridge':
        description += `Task: Match idioms across languages.\n`;
        if (content.sourceIdiom || step.sourceIdiom) {
          description += `Source Idiom: "${content.sourceIdiom || step.sourceIdiom}"\n`;
        }
        if (content.options || step.options) {
          description += `Options: ${(content.options || step.options).join(', ')}\n`;
        }
        break;

      // ============================================
      // LANGUAGE WORD CONSTELLATION (Language)
      // ============================================
      case 'language_word_constellation':
        description += `Task: Map semantic relationships between words.\n`;
        if (content.centerWord || step.centerWord) {
          description += `Center Word: "${content.centerWord || step.centerWord}"\n`;
        }
        if (content.relatedWords || step.relatedWords) {
          description += `Related Words: ${(content.relatedWords || step.relatedWords).join(', ')}\n`;
        }
        break;

      // ============================================
      // LANGUAGE RHYTHM MATCH (Language)
      // ============================================
      case 'language_rhythm_match':
        description += `Task: Match words with similar stress patterns or prosody.\n`;
        if (content.targetWord || step.targetWord) {
          description += `Target Word: "${content.targetWord || step.targetWord}"\n`;
        }
        if (content.options || step.options) {
          description += `Options: ${(content.options || step.options).join(', ')}\n`;
        }
        break;

      // ============================================
      // MAP CLICK (Geography)
      // ============================================
      case 'map_click':
        const mapData = content.data || content;
        description += `Task: ${getLocal(mapData.description) || 'Find and click on a location on the map.'}\n`;
        if (mapData.targetLocation) {
          description += `Target: Find ${mapData.targetLocation}\n`;
        }
        if (mapData.hints) {
          description += `Hints: ${mapData.hints.join('; ')}\n`;
        }
        break;

      // ============================================
      // MATCHING / MEMORY / PAIRS
      // ============================================
      case 'matching':
      case 'memory':
      case 'pairs':
        description += `Task: ${getLocal(content.question) || 'Match the items correctly.'}\n`;
        if (content.pairs || step.pairs) {
          description += `Pairs to match:\n`;
          (content.pairs || step.pairs).forEach(p => {
            const left = getLocal(p.left || p.term || p.name || p.key);
            const right = getLocal(p.right || p.definition || p.match || p.value);
            description += `- "${left}" matches with "${right}"\n`;
          });
        }
        break;

      // ============================================
      // QUIZ / MULTIPLE CHOICE
      // ============================================
      case 'quiz':
      case 'multiple_choice':
      case 'single_choice':
      case 'tryout':
        description += `Question: "${getLocal(content.question) || getLocal(step.question)}"\n`;
        if (content.options || step.options) {
          description += `Options:\n`;
          (content.options || step.options).forEach((opt, idx) => {
            const optText = typeof opt === 'string' ? opt : getLocal(opt.text || opt.label);
            description += `${idx + 1}. ${optText}\n`;
          });
        }
        if (content.correctIndex !== undefined || content.correctAnswer !== undefined) {
          description += `(AI Knowledge - Correct Answer: ${content.correctIndex !== undefined ? `Option ${content.correctIndex + 1}` : content.correctAnswer})\n`;
        }
        break;

      // ============================================
      // BASKET / SORTING / CATEGORIZATION
      // ============================================
      case 'basket':
      case 'sorting':
      case 'categorization':
        description += `Task: ${getLocal(content.question) || getLocal(content.instructions) || 'Sort the items into correct categories.'}\n`;
        if (content.items || step.items) {
          description += `Items: ${(content.items || step.items).map(i => typeof i === 'string' ? i : getLocal(i.text || i.content)).join(', ')}\n`;
        }
        if (content.bins || content.categories || step.bins || step.categories) {
          const categories = content.bins || content.categories || step.bins || step.categories;
          description += `Categories: ${categories.map(b => typeof b === 'string' ? b : getLocal(b.label || b.name)).join(', ')}\n`;
        }
        break;

      // ============================================
      // FILL IN THE BLANK
      // ============================================
      case 'fill_blank':
      case 'fill_in_blank':
      case 'text_input':
      case 'cloze':
        description += `Task: Fill in the blank(s).\n`;
        description += `Sentence: "${getLocal(content.sentence || content.text || step.sentence)}"\n`;
        if (content.hint || step.hint) {
          description += `Hint: ${getLocal(content.hint) || getLocal(step.hint)}\n`;
        }
        if (content.correctAnswer || step.correctAnswer) {
          description += `(AI Knowledge - Correct Answer: "${content.correctAnswer || step.correctAnswer}")\n`;
        }
        break;

      // ============================================
      // ORDER / SEQUENCE
      // ============================================
      case 'order':
      case 'ordering':
      case 'sequence':
      case 'sentence_order':
        description += `Task: ${getLocal(content.question) || 'Put the items in correct order.'}\n`;
        if (content.items || content.elements || step.items) {
          const items = content.items || content.elements || step.items;
          description += `Items to order: ${items.map(i => typeof i === 'string' ? i : getLocal(i.text || i.content)).join(', ')}\n`;
        }
        if (content.correctOrder || step.correctOrder) {
          description += `(AI Knowledge - Correct Order: ${(content.correctOrder || step.correctOrder).join(', ')})\n`;
        }
        break;

      // ============================================
      // TRUE/FALSE
      // ============================================
      case 'true_false':
      case 'boolean':
        description += `Statement: "${getLocal(content.statement || content.question || step.statement)}"\n`;
        description += `Is this statement True or False?\n`;
        if (content.correctAnswer !== undefined || step.correctAnswer !== undefined) {
          description += `(AI Knowledge - Answer: ${content.correctAnswer || step.correctAnswer})\n`;
        }
        break;

      // ============================================
      // DRAG AND DROP
      // ============================================
      case 'drag_drop':
      case 'drag_and_drop':
        description += `Task: ${getLocal(content.question) || 'Drag items to correct positions.'}\n`;
        if (content.items || content.draggables || step.items) {
          const items = content.items || content.draggables || step.items;
          description += `Items: ${items.map(i => typeof i === 'string' ? i : getLocal(i.text || i.content)).join(', ')}\n`;
        }
        if (content.dropZones || content.targets || step.dropZones) {
          const zones = content.dropZones || content.targets || step.dropZones;
          description += `Drop Zones: ${zones.map(z => typeof z === 'string' ? z : getLocal(z.label || z.name)).join(', ')}\n`;
        }
        break;

      // ============================================
      // VOCABULARY
      // ============================================
      case 'vocabulary':
        description += `Vocabulary Terms:\n`;
        const terms = content.terms || step.terms || [];
        terms.slice(0, 10).forEach(t => {
          description += `- ${getLocal(t.term)}: ${getLocal(t.definition)}\n`;
          if (t.example) description += `  Example: ${getLocal(t.example)}\n`;
        });
        if (terms.length > 10) {
          description += `... and ${terms.length - 10} more terms.\n`;
        }
        break;

      // ============================================
      // EXPLANATION / LESSON CONTENT
      // ============================================
      case 'explanation':
      case 'lesson':
      case 'theory':
      case 'introduction':
        description += `Lesson Content:\n`;
        const text = getLocal(content.text || step.text);
        if (text) {
          description += `${text.substring(0, 500)}${text.length > 500 ? '...' : ''}\n`;
        }
        if (content.keyPoints || step.keyPoints) {
          description += `Key Points:\n`;
          (content.keyPoints || step.keyPoints).forEach(kp => {
            description += `- ${getLocal(kp)}\n`;
          });
        }
        break;

      // ============================================
      // GAME STEPS
      // ============================================
      case 'game':
        description += `Game Exercise.\n`;
        description += `Game Type: ${step.gameType || content.gameType || 'Interactive Game'}\n`;
        if (step.gameConfig?.targetScore || content.targetScore) {
          description += `Target Score: ${step.gameConfig?.targetScore || content.targetScore}\n`;
        }
        if (step.instructions || content.instructions) {
          description += `Instructions: ${getLocal(step.instructions) || getLocal(content.instructions)}\n`;
        }
        break;

      // ============================================
      // CODING EXERCISES
      // ============================================
      case 'coding':
      case 'code_fix':
      case 'code':
      case 'programming':
        description += `Task: ${getLocal(content.question) || getLocal(content.instructions) || 'Complete or fix the code.'}\n`;
        if (content.initialCode || content.starterCode) {
          description += `Initial Code:\n\`\`\`\n${content.initialCode || content.starterCode}\n\`\`\`\n`;
        }
        if (content.language || content.programmingLanguage) {
          description += `Programming Language: ${content.language || content.programmingLanguage}\n`;
        }
        break;

      // ============================================
      // NESTED EXERCISE (exercises array)
      // ============================================
      case 'exercise':
        if (content.exercises && content.exercises.length > 0) {
          const nestedType = content.exercises[0].type || content.type;
          description += `This is an exercise step with ${content.exercises.length} sub-exercise(s).\n`;
          // Extract the first exercise
          const nestedResult = extractExerciseContent({ ...step, type: nestedType, content: content.exercises[0] }, language);
          description += nestedResult;
        } else {
          description += `Task: ${getLocal(content.question) || getLocal(content.prompt) || getLocal(step.instructions) || 'Complete the exercise.'}\n`;
          if (content.options) {
            description += `Options: ${content.options.map(opt => typeof opt === 'string' ? opt : getLocal(opt.text || opt.label)).join(', ')}\n`;
          }
        }
        break;

      // ============================================
      // FALLBACK - GENERIC EXTRACTION
      // ============================================
      default:
        description += `Instruction: ${getLocal(step.instruction) || getLocal(step.instructions) || getLocal(step.description) || getLocal(content.prompt) || 'Complete the interactive task.'}\n`;

        // Try to extract common fields
        if (content.question || step.question) {
          description += `Question: ${getLocal(content.question) || getLocal(step.question)}\n`;
        }
        if (content.options) {
          description += `Options: ${content.options.map(opt => typeof opt === 'string' ? opt : getLocal(opt.text || opt.label)).join(', ')}\n`;
        }
        if (content.items || step.items) {
          const items = content.items || step.items;
          description += `Items: ${items.slice(0, 5).map(i => typeof i === 'string' ? i : getLocal(i.text || i.content || i.label)).join(', ')}${items.length > 5 ? '...' : ''}\n`;
        }
        if (content.pairs || step.pairs) {
          description += `Pairs:\n`;
          (content.pairs || step.pairs).slice(0, 5).forEach(p => {
            description += `- ${getLocal(p.left || p.name || p.term)} ↔ ${getLocal(p.right || p.formula || p.definition)}\n`;
          });
        }

        // Include truncated raw data for completely unknown types
        if (Object.keys(content).length > 0) {
          const rawStr = JSON.stringify(content);
          if (rawStr.length > 10) {
            description += `Additional Data: ${rawStr.slice(0, 300)}${rawStr.length > 300 ? '...' : ''}\n`;
          }
        }
    }
  } catch (e) {
    console.error('Error extracting exercise content:', e);
    description += 'Error reading exercise details.\n';
    // Fallback to raw data
    try {
      description += `Raw Data: ${JSON.stringify(step).slice(0, 300)}...\n`;
    } catch (jsonErr) {
      description += 'Could not serialize step data.\n';
    }
  }

  return description;
};

/**
 * Builds a complete context string for the voice assistant
 * including lesson title and exercise content.
 *
 * @param {Object} options - Context options
 * @param {Object} options.step - The current lesson step
 * @param {string} options.lessonTitle - The lesson title
 * @param {string} options.language - Language code (default: 'en')
 * @param {Object} options.userProgress - Optional user progress data
 * @returns {string} Complete context string for AI
 */
const buildVoiceAssistantContext = ({ step, lessonTitle, language = 'en', userProgress = null }) => {
  let context = '';

  if (lessonTitle) {
    context += `Current Lesson: "${lessonTitle}"\n\n`;
  }

  const exerciseContent = extractExerciseContent(step, language);
  context += `CURRENT EXERCISE THE USER IS VIEWING:\n`;
  context += `---------------------------------------------------\n`;
  context += exerciseContent;
  context += `---------------------------------------------------\n`;

  if (userProgress) {
    if (userProgress.currentStepIndex !== undefined && userProgress.totalSteps !== undefined) {
      context += `\nProgress: Step ${userProgress.currentStepIndex + 1} of ${userProgress.totalSteps}\n`;
    }
    if (userProgress.score !== undefined) {
      context += `Current Score: ${userProgress.score}\n`;
    }
    if (userProgress.attempts !== undefined) {
      context += `Attempts: ${userProgress.attempts}\n`;
    }
  }

  return context;
};

module.exports = {
  extractExerciseContent,
  buildVoiceAssistantContext,
  formatType,
  getLocalizedContent
};
