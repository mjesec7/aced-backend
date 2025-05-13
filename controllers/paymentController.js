const User = require('../models/user');

const applyPromoCode = async (req, res) => {
  try {
    const { userId, plan, promoCode } = req.body;

    // Check promo code
    if (promoCode !== 'acedpromocode2406') {
      return res.status(400).json({ message: '❌ Неверный промокод' });
    }

    // Validate plan
    if (!['start', 'pro'].includes(plan)) {
      return res.status(400).json({ message: '❌ Неверный тариф. Доступны: start, pro' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: '❌ Пользователь не найден' });
    }

    user.subscriptionPlan = plan;
    user.paymentStatus = 'paid';
    await user.save();

    res.status(200).json({ message: '✅ Промокод успешно применён', unlocked: true, plan });
  } catch (err) {
    console.error('❌ Ошибка применения промокода:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

module.exports = { applyPromoCode };
