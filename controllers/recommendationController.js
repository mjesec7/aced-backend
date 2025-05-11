// controllers/recommendationController.js
const User = require('../models/user');
const Topic = require('../models/topic');

// 🔁 Define smart subject-topic relationships
const subjectPaths = {
  Algebra: ['Trigonometry', 'Functions'],
  HTML: ['CSS', 'JavaScript'],
  JavaScript: ['React', 'Node.js'],
  Biology: ['Anatomy', 'Genetics'],
  Geography: ['Climate Change', 'Geology'],
  Physics: ['Electricity', 'Mechanics'],
};

exports.getRecommendations = async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const studyList = user.studyList || [];
    const studiedTopics = studyList.map(item => item.topic);
    const studiedSubjects = studyList.map(item => item.subject);

    const suggestedTopics = [];
    for (const subject of studiedSubjects) {
      const followUps = subjectPaths[subject] || [];

      for (const name of followUps) {
        const topic = await Topic.findOne({ name });
        if (topic && !studiedTopics.includes(name)) {
          suggestedTopics.push(topic);
        }
      }
    }

    // If none found, fallback to random
    if (suggestedTopics.length === 0) {
      const fallback = await Topic.aggregate([{ $sample: { size: 4 } }]);
      return res.json(fallback);
    }

    // Return unique set, max 4
    const unique = Array.from(new Map(suggestedTopics.map(t => [t._id.toString(), t])).values());
    res.json(unique.slice(0, 4));

  } catch (err) {
    console.error('❌ Error in getRecommendations:', err);
    res.status(500).json({ message: 'Server error' });
  }
};