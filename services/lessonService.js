// services/lessonService.js - ENHANCED LESSON SERVICE
const Lesson = require('../models/lesson');
const UserProgress = require('../models/userProgress');
const AI = require('../services/aiService');

class LessonService {
  /**
   * Create a new lesson with automatic template generation
   */
  static async createLesson(lessonData, userId) {
    try {
      const { level, difficulty, subject, topic } = lessonData;
      
      // Get template based on difficulty
      const template = Lesson.generateLessonTemplate(level, difficulty);
      
      // Merge template with provided data
      const enrichedLessonData = {
        ...template,
        ...lessonData,
        createdBy: userId,
        
        // Ensure minimum requirements
        stepRequirements: {
          ...template.stepRequirements,
          ...lessonData.stepRequirements
        }
      };
      
      // Validate and generate steps if not provided
      if (!enrichedLessonData.steps || enrichedLessonData.steps.length === 0) {
        enrichedLessonData.steps = await this.generateSteps(
          subject,
          topic,
          level,
          difficulty
        );
      }
      
      // Create lesson
      const lesson = new Lesson(enrichedLessonData);
      
      // Validate before saving
      const validation = lesson.validateStepRequirements();
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
      
      await lesson.save();
      
      console.log(`✅ Lesson created successfully: ${lesson._id}`);
      return lesson;
      
    } catch (error) {
      console.error('❌ Error creating lesson:', error);
      throw error;
    }
  }
  
  /**
   * Generate steps automatically based on requirements
   */
  static async generateSteps(subject, topic, level, difficulty) {
    const steps = [];
    let order = 0;
    
    // Introduction
    steps.push({
      type: 'introduction',
      order: order++,
      title: `Introduction to ${topic}`,
      instructions: 'Welcome! Let\'s explore this topic together.',
      content: {
        text: `In this lesson, we'll learn about ${topic}...`,
        objectives: ['Understand key concepts', 'Apply knowledge', 'Practice skills']
      },
      difficulty,
      estimatedDuration: 2,
      scoring: { maxPoints: 0 }
    });
    
    // Explanations (based on difficulty)
    const explanationCount = difficulty === 'beginner' ? 2 : 1;
    for (let i = 0; i < explanationCount; i++) {
      steps.push({
        type: 'explanation',
        order: order++,
        title: `Core Concept ${i + 1}`,
        instructions: 'Read and understand this explanation carefully.',
        content: {
          text: await this.generateExplanationContent(topic, level, i),
          keyPoints: await this.generateKeyPoints(topic, i)
        },
        difficulty,
        estimatedDuration: 5,
        scoring: { maxPoints: 0 }
      });
    }
    
    // Examples
    steps.push({
      type: 'example',
      order: order++,
      title: 'Real-world Examples',
      instructions: 'Study these examples to see how the concept applies.',
      content: {
        examples: await this.generateExamples(topic, level)
      },
      difficulty,
      estimatedDuration: 3,
      scoring: { maxPoints: 0 }
    });
    
    // Practice (guided exercises)
    const practiceCount = difficulty === 'beginner' ? 3 : 2;
    for (let i = 0; i < practiceCount; i++) {
      steps.push({
        type: 'practice',
        order: order++,
        title: `Guided Practice ${i + 1}`,
        instructions: 'Follow along with this guided practice.',
        content: await this.generatePracticeContent(topic, level, i),
        difficulty,
        estimatedDuration: 4,
        scoring: { maxPoints: 5 }
      });
    }
    
    // Exercises (minimum 7, more for higher levels)
    const exerciseCount = Math.max(7, 7 + (level - 1) * 2);
    for (let i = 0; i < exerciseCount; i++) {
      steps.push({
        type: 'exercise',
        order: order++,
        title: `Exercise ${i + 1}`,
        instructions: 'Complete this exercise to test your understanding.',
        content: await this.generateExerciseContent(topic, level, difficulty, i),
        difficulty,
        estimatedDuration: 3,
        scoring: {
          maxPoints: 10,
          passingScore: 7
        }
      });
    }
    
    // Quiz (for intermediate and above)
    if (difficulty !== 'beginner') {
      const quizCount = difficulty === 'intermediate' ? 3 : 5;
      steps.push({
        type: 'quiz',
        order: order++,
        title: 'Knowledge Check Quiz',
        instructions: 'Test your understanding with this quiz.',
        content: {
          questions: await this.generateQuizQuestions(topic, level, quizCount)
        },
        difficulty,
        estimatedDuration: quizCount * 2,
        scoring: {
          maxPoints: quizCount * 10,
          passingScore: Math.floor(quizCount * 7)
        }
      });
    }
    
    // Project (for advanced)
    if (difficulty === 'advanced' || difficulty === 'expert') {
      steps.push({
        type: 'project',
        order: order++,
        title: 'Mini Project',
        instructions: 'Apply what you\'ve learned in this project.',
        content: await this.generateProjectContent(topic, level),
        difficulty,
        estimatedDuration: 15,
        scoring: {
          maxPoints: 50,
          passingScore: 35
        }
      });
    }
    
    // Summary
    steps.push({
      type: 'summary',
      order: order++,
      title: 'Lesson Summary',
      instructions: 'Review what you\'ve learned.',
      content: {
        keyTakeaways: await this.generateKeyTakeaways(topic),
        nextSteps: 'Continue to the next lesson or review this material.'
      },
      difficulty,
      estimatedDuration: 2,
      scoring: { maxPoints: 0 }
    });
    
    return steps;
  }
  
  /**
   * Content generation helpers (can integrate with AI)
   */
  static async generateExplanationContent(topic, level, index) {
    // This could call an AI service or use templates
    return `This is an explanation about ${topic} suitable for level ${level}. 
            Concept ${index + 1} covers the fundamental aspects...
            [Generated content would go here - minimum 100 characters]`;
  }
  
  static async generateKeyPoints(topic, index) {
    return [
      `Key point 1 about ${topic}`,
      `Key point 2 about ${topic}`,
      `Key point 3 about ${topic}`
    ];
  }
  
  static async generateExamples(topic, level) {
    return [
      { title: 'Example 1', content: `Real-world example of ${topic}...` },
      { title: 'Example 2', content: `Another example of ${topic}...` },
      { title: 'Example 3', content: `Advanced example of ${topic}...` }
    ];
  }
  
  static async generatePracticeContent(topic, level, index) {
    return {
      scenario: `Practice scenario ${index + 1} for ${topic}`,
      steps: [
        'Step 1: Do this first',
        'Step 2: Then do this',
        'Step 3: Finally, complete this'
      ],
      hints: ['Hint 1', 'Hint 2']
    };
  }
  
  static async generateExerciseContent(topic, level, difficulty, index) {
    // Generate different exercise types
    const exerciseTypes = [
      'multiple-choice',
      'fill-blank',
      'matching',
      'true-false',
      'short-answer',
      'drag-drop',
      'ordering'
    ];
    
    const type = exerciseTypes[index % exerciseTypes.length];
    
    return {
      exercises: [{
        type,
        question: `Question about ${topic} (Exercise ${index + 1})`,
        options: type === 'multiple-choice' ? ['Option A', 'Option B', 'Option C', 'Option D'] : undefined,
        correctAnswer: type === 'multiple-choice' ? 0 : `Answer for ${topic}`,
        explanation: `This is because...`,
        hints: [`Think about ${topic}...`],
        points: 10
      }]
    };
  }
  
  static async generateQuizQuestions(topic, level, count) {
    const questions = [];
    for (let i = 0; i < count; i++) {
      questions.push({
        question: `Quiz question ${i + 1} about ${topic}`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: i % 4,
        explanation: `The correct answer is...`,
        points: 10
      });
    }
    return questions;
  }
  
  static async generateProjectContent(topic, level) {
    return {
      title: `Apply ${topic} Knowledge`,
      description: `Create a solution that demonstrates your understanding of ${topic}`,
      requirements: [
        'Requirement 1: Must include...',
        'Requirement 2: Should demonstrate...',
        'Requirement 3: Must be original'
      ],
      rubric: {
        understanding: { weight: 40, description: 'Demonstrates understanding of concepts' },
        application: { weight: 30, description: 'Applies knowledge correctly' },
        creativity: { weight: 20, description: 'Shows creative problem solving' },
        presentation: { weight: 10, description: 'Clear and well-organized' }
      }
    };
  }
  
  static async generateKeyTakeaways(topic) {
    return [
      `You learned the fundamentals of ${topic}`,
      `You practiced applying these concepts`,
      `You completed exercises to reinforce learning`,
      `You're ready for more advanced topics`
    ];
  }
  
  /**
   * Get adaptive lesson path for a specific student
   */
  static async getAdaptiveLessonPath(lessonId, userId) {
    try {
      const lesson = await Lesson.findById(lessonId);
      if (!lesson) {
        throw new Error('Lesson not found');
      }
      
      // Get student profile and progress
      const userProgress = await UserProgress.findOne({ userId, lessonId });
      const studentProfile = await this.analyzeStudentProfile(userId);
      
      // Generate adaptive path
      const adaptivePath = lesson.getAdaptivePath(studentProfile);
      
      // Apply AI personalization if enabled
      if (lesson.ai.enabled && lesson.ai.personalizedHints) {
        for (const step of adaptivePath) {
          if (step.type === 'exercise' || step.type === 'quiz') {
            step.ai = {
              hints: await AI.generatePersonalizedHints(step, studentProfile),
              difficulty: await AI.suggestDifficulty(step, studentProfile)
            };
          }
        }
      }
      
      return {
        lesson,
        adaptivePath,
        estimatedTime: adaptivePath.reduce((sum, s) => sum + s.estimatedDuration, 0),
        personalizedFor: userId,
        modifications: adaptivePath.filter(s => s.modified).length
      };
      
    } catch (error) {
      console.error('❌ Error generating adaptive path:', error);
      throw error;
    }
  }
  
  /**
   * Analyze student profile for personalization
   */
  static async analyzeStudentProfile(userId) {
    // This would analyze past performance, preferences, etc.
    const progress = await UserProgress.find({ userId });
    
    const profile = {
      learningStyle: 'visual', // Could be determined from past behavior
      pace: 'moderate',
      strugglingAreas: [],
      masteredTypes: [],
      preferredDifficulty: 'intermediate',
      averageCompletionTime: 0,
      averageScore: 0
    };
    
    // Analyze progress to identify patterns
    if (progress.length > 0) {
      // Calculate averages and identify patterns
      let totalScore = 0;
      let totalTime = 0;
      const typeScores = {};
      
      progress.forEach(p => {
        if (p.score) totalScore += p.score;
        if (p.timeSpent) totalTime += p.timeSpent;
        
        // Track performance by step type
        if (p.stepScores) {
          Object.entries(p.stepScores).forEach(([type, score]) => {
            if (!typeScores[type]) typeScores[type] = [];
            typeScores[type].push(score);
          });
        }
      });
      
      profile.averageScore = totalScore / progress.length;
      profile.averageCompletionTime = totalTime / progress.length;
      
      // Identify struggling areas (average score < 70)
      Object.entries(typeScores).forEach(([type, scores]) => {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg < 70) {
          profile.strugglingAreas.push(type);
        } else if (avg > 90) {
          profile.masteredTypes.push(type);
        }
      });
    }
    
    return profile;
  }
  
  /**
   * Update lesson based on analytics
   */
  static async optimizeLesson(lessonId) {
    try {
      const lesson = await Lesson.findById(lessonId);
      if (!lesson) {
        throw new Error('Lesson not found');
      }
      
      // Analyze lesson performance
      const analytics = await this.analyzeLessonPerformance(lessonId);
      
      // Make optimization recommendations
      const optimizations = [];
      
      // Check if steps are too difficult
      analytics.stepAnalytics.forEach(stat => {
        if (stat.averageScore < 60) {
          optimizations.push({
            type: 'difficulty',
            step: stat.stepType,
            recommendation: 'Consider simplifying this step or adding more practice'
          });
        }
        
        if (stat.completionRate < 70) {
          optimizations.push({
            type: 'engagement',
            step: stat.stepType,
            recommendation: 'This step has low completion - consider making it more engaging'
          });
        }
        
        if (stat.averageTime > 15) {
          optimizations.push({
            type: 'duration',
            step: stat.stepType,
            recommendation: 'This step takes too long - consider breaking it down'
          });
        }
      });
      
      // Apply automatic optimizations if enabled
      if (lesson.adaptive.enabled) {
        for (const optimization of optimizations) {
          if (optimization.type === 'difficulty') {
            // Add additional practice steps
            const practiceStep = await this.generatePracticeStep(
              lesson.subject,
              lesson.topicId,
              'beginner'
            );
            lesson.steps.push(practiceStep);
          }
        }
        
        await lesson.save();
      }
      
      return {
        lesson,
        analytics,
        optimizations,
        applied: lesson.adaptive.enabled
      };
      
    } catch (error) {
      console.error('❌ Error optimizing lesson:', error);
      throw error;
    }
  }
  
  /**
   * Analyze lesson performance
   */
  static async analyzeLessonPerformance(lessonId) {
    const progress = await UserProgress.find({ lessonId });
    
    if (progress.length === 0) {
      return {
        totalAttempts: 0,
        averageScore: 0,
        completionRate: 0,
        stepAnalytics: []
      };
    }
    
    const stepStats = {};
    let totalCompleted = 0;
    let totalScore = 0;
    
    progress.forEach(p => {
      if (p.completed) totalCompleted++;
      if (p.score) totalScore += p.score;
      
      // Analyze each step
      if (p.stepProgress) {
        p.stepProgress.forEach(sp => {
          if (!stepStats[sp.stepType]) {
            stepStats[sp.stepType] = {
              attempts: 0,
              completed: 0,
              totalScore: 0,
              totalTime: 0
            };
          }
          
          stepStats[sp.stepType].attempts++;
          if (sp.completed) stepStats[sp.stepType].completed++;
          if (sp.score) stepStats[sp.stepType].totalScore += sp.score;
          if (sp.timeSpent) stepStats[sp.stepType].totalTime += sp.timeSpent;
        });
      }
    });
    
    // Calculate analytics
    const stepAnalytics = Object.entries(stepStats).map(([stepType, stats]) => ({
      stepType,
      averageScore: stats.totalScore / stats.attempts,
      completionRate: (stats.completed / stats.attempts) * 100,
      averageTime: stats.totalTime / stats.attempts
    }));
    
    return {
      totalAttempts: progress.length,
      averageScore: totalScore / progress.length,
      completionRate: (totalCompleted / progress.length) * 100,
      stepAnalytics
    };
  }
  
  /**
   * Clone lesson with modifications
   */
  static async cloneLesson(lessonId, modifications, userId) {
    try {
      const original = await Lesson.findById(lessonId);
      if (!original) {
        throw new Error('Original lesson not found');
      }
      
      const clonedData = original.toObject();
      delete clonedData._id;
      delete clonedData.createdAt;
      delete clonedData.updatedAt;
      
      // Apply modifications
      const cloned = new Lesson({
        ...clonedData,
        ...modifications,
        lessonName: modifications.lessonName || `${original.lessonName} (Copy)`,
        createdBy: userId,
        status: 'draft',
        analytics: {
          totalViews: 0,
          totalCompletions: 0,
          averageScore: 0,
          averageTime: 0,
          completionRate: 0
        }
      });
      
      await cloned.save();
      return cloned;
      
    } catch (error) {
      console.error('❌ Error cloning lesson:', error);
      throw error;
    }
  }
}

module.exports = LessonService;