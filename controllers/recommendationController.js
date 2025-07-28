const User = require('../models/user');
const Topic = require('../models/topic');
const Lesson = require('../models/lesson');
const UserProgress = require('../models/userProgress');

// Get personalized recommendations for a user
const getRecommendations = async (req, res) => {
  try {
    const { firebaseId } = req.params;
    
    // Get user's data
    const user = await User.findOne({ firebaseId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's study list topic IDs
    const studyListTopicIds = user.studyList?.map(item => item.topicId?.toString()) || [];
    
    // Get user's completed lessons
    const userProgress = await UserProgress.find({ 
      userId: firebaseId,
      completed: true 
    });
    
    const completedLessonIds = userProgress.map(p => p.lessonId?.toString());
    
    // Get all topics not in user's study list
    let availableTopics = await Topic.find({
      _id: { $nin: studyListTopicIds }
    }).limit(20); // Limit to prevent overwhelming results
    
    
    // Get lessons for each topic and calculate recommendation score
    const topicsWithData = await Promise.all(
      availableTopics.map(async (topic) => {
        const lessons = await Lesson.find({ topicId: topic._id });
        
        if (lessons.length === 0) {
          return null; // Skip topics without lessons
        }
        
        // Calculate a basic recommendation score
        let score = 0;
        
        // Score based on user's level preference
        if (user.preferredLevel && topic.level === user.preferredLevel) {
          score += 10;
        }
        
        // Score based on subject preferences (if available)
        if (user.preferredSubjects?.includes(topic.subject)) {
          score += 15;
        }
        
        // Score based on topic popularity (if you track this)
        // score += topic.enrollmentCount || 0;
        
        // Score based on difficulty progression
        const completedInSubject = userProgress.filter(p => {
          const lesson = lessons.find(l => l._id.toString() === p.lessonId?.toString());
          return lesson && lesson.subject === topic.subject;
        }).length;
        
        if (completedInSubject > 0 && completedInSubject < 10) {
          score += 5; // User has started this subject, keep momentum
        }
        
        return {
          ...topic.toObject(),
          lessons: lessons,
          recommendationScore: score,
          lessonCount: lessons.length
        };
      })
    );
    
    // Filter out null values and sort by recommendation score
    const recommendations = topicsWithData
      .filter(topic => topic !== null)
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, 10); // Return top 10 recommendations
    
    
    // Log recommendation scores for debugging
    recommendations.forEach((rec, index) => {
    });
    
    res.json(recommendations);
    
  } catch (error) {
    console.error('❌ Error getting recommendations:', error);
    res.status(500).json({ 
      error: 'Failed to get recommendations',
      details: error.message 
    });
  }
};

// Get trending topics (could be based on enrollments, completions, etc.)
const getTrendingTopics = async (req, res) => {
  try {
    
    // For now, just return topics with the most lessons
    // In a real app, you'd track enrollments, completions, ratings, etc.
    const topics = await Topic.aggregate([
      {
        $lookup: {
          from: 'lessons',
          localField: '_id',
          foreignField: 'topicId',
          as: 'lessons'
        }
      },
      {
        $addFields: {
          lessonCount: { $size: '$lessons' }
        }
      },
      {
        $match: {
          lessonCount: { $gt: 0 } // Only topics with lessons
        }
      },
      {
        $sort: { lessonCount: -1 }
      },
      {
        $limit: 10
      }
    ]);
    
    res.json(topics);
    
  } catch (error) {
    console.error('❌ Error getting trending topics:', error);
    res.status(500).json({ 
      error: 'Failed to get trending topics',
      details: error.message 
    });
  }
};

// Get recommendations based on a specific topic (similar topics)
const getSimilarTopics = async (req, res) => {
  try {
    const { topicId } = req.params;
    
    // Get the reference topic
    const referenceTopic = await Topic.findById(topicId);
    if (!referenceTopic) {
      return res.status(404).json({ error: 'Topic not found' });
    }
    
    // Find similar topics based on subject and level
    const similarTopics = await Topic.find({
      _id: { $ne: topicId }, // Exclude the reference topic
      $or: [
        { subject: referenceTopic.subject }, // Same subject
        { level: referenceTopic.level } // Same level
      ]
    }).limit(6);
    
    // Get lessons for each topic
    const topicsWithLessons = await Promise.all(
      similarTopics.map(async (topic) => {
        const lessons = await Lesson.find({ topicId: topic._id });
        return {
          ...topic.toObject(),
          lessons: lessons,
          similarity: topic.subject === referenceTopic.subject ? 'subject' : 'level'
        };
      })
    );
    
    // Filter out topics without lessons
    const recommendations = topicsWithLessons.filter(t => t.lessons.length > 0);
    
    res.json(recommendations);
    
  } catch (error) {
    console.error('❌ Error getting similar topics:', error);
    res.status(500).json({ 
      error: 'Failed to get similar topics',
      details: error.message 
    });
  }
};

module.exports = {
  getRecommendations,
  getTrendingTopics,
  getSimilarTopics
};