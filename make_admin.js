require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');

const makeAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const users = await User.find({}).sort({ createdAt: -1 }).limit(20);

        console.log('\nRecent Users:');
        users.forEach((u, i) => {
            console.log(`${i + 1}. ${u.email} (UID: ${u.firebaseId}) - Role: ${u.role || 'user'}`);
        });

        if (process.argv[2]) {
            const targetEmail = process.argv[2];
            const user = await User.findOne({ email: targetEmail });

            if (user) {
                user.role = 'admin';
                await user.save();
                console.log(`\n✅ Promoted ${user.email} to ADMIN!`);
            } else {
                console.log(`\n❌ User ${targetEmail} not found.`);
            }
        } else {
            console.log('\nusage: node make_admin.js <email>');
        }

        mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

makeAdmin();
