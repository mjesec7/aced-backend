// Fallback service to prevent crashes
exports.handleLessonCompletion = async (userId, lessonId, progress) => {
    return {
        vocabularyAdded: 0,
        homeworkCreated: false,
        message: "Service placeholder active"
    };
};

exports.extractContentFromCompletedLessons = async (req, res) => {
    return { success: true, message: "Extraction placeholder" };
};
