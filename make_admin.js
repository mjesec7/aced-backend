require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');

const makeAdmin = async () => {
    try {
        // Connect to MongoDB
        // If process.env.MONGO_URI is not set, try to read from .env file manually if needed, 
        // but usually dotenv.config() handles it if the file exists.
        if (!process.env.MONGO_URI) {
            console.error("❌ MONGO_URI is missing. Please create a .env file or set the variable.");
            // Attempt fallback for development if known, otherwise exit.
            // process.env.MONGO_URI = 'mongodb://localhost:27017/aced'; 
        }

        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const targetEmail = process.argv[2];
        const targetUid = process.argv[3]; // NEW: Optional 3rd argument for UID

        if (!targetEmail) {
            console.log('\nUsage: node make_admin.js <email> [new_firebase_uid]');
            console.log('Example: node make_admin.js user@example.com');
            console.log('Example: node make_admin.js user@example.com NEW_UID_123');
            process.exit(1);
        }

        const user = await User.findOne({ email: new RegExp(`^${targetEmail}$`, 'i') });

        if (user) {
            console.log(`\n🔍 Found user: ${user.email}`);
            console.log(`   Current Role: ${user.role}`);
            console.log(`   Current UID:  ${user.firebaseId}`);

            let updates = [];

            // 1. Update/Fix Role
            if (user.role !== 'admin') {
                user.role = 'admin';
                updates.push('Promoted to ADMIN');
            }

            // 2. Update/Fix UID (Identity Mismatch)
            if (targetUid && user.firebaseId !== targetUid) {
                console.warn(`\n⚠️  MISMATCH DETECTED! Updating UID from ${user.firebaseId} -> ${targetUid}`);
                user.firebaseId = targetUid;
                updates.push(`Updated UID to ${targetUid}`);
            }

            if (updates.length > 0) {
                await user.save();
                console.log(`\n✅ SUCCESS: ${updates.join(' & ')}`);
            } else {
                console.log('\n✅ User is already an Admin and UID matches. No changes needed.');
            }

        } else {
            console.log(`\n❌ User with email "${targetEmail}" not found in database.`);

            // If user doesn't exist but we have a UID, we could technically create one, 
            // but it's safer to ask the user to double check.
            if (targetUid) {
                console.log(`   You provided UID: ${targetUid}. Ensure you have signed up first.`);
            }
        }

        mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

makeAdmin();
