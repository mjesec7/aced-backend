// scripts/migrateStartToPro.js
// Migration script to change all 'start' subscription plans to 'pro'
// Run this once to update existing users

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function migrateStartToPro() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;

        // 1. Update users with 'start' plan to 'pro'
        console.log('\n📊 Migrating users with "start" plan to "pro"...');
        const userResult = await db.collection('users').updateMany(
            { subscriptionPlan: 'start' },
            { $set: { subscriptionPlan: 'pro' } }
        );
        console.log(`✅ Updated ${userResult.modifiedCount} users from 'start' to 'pro'`);

        // 2. Update users with 'premium' plan to 'pro' (if any exist)
        const premiumResult = await db.collection('users').updateMany(
            { subscriptionPlan: 'premium' },
            { $set: { subscriptionPlan: 'pro' } }
        );
        console.log(`✅ Updated ${premiumResult.modifiedCount} users from 'premium' to 'pro'`);

        // 3. Update promocodes with 'start' grantsPlan to 'pro'
        console.log('\n📊 Migrating promocodes with "start" grantsPlan to "pro"...');
        const promoResult = await db.collection('promocodes').updateMany(
            { grantsPlan: 'start' },
            { $set: { grantsPlan: 'pro' } }
        );
        console.log(`✅ Updated ${promoResult.modifiedCount} promocodes from 'start' to 'pro'`);

        // 4. Update promocodes with 'premium' grantsPlan to 'pro'
        const premiumPromoResult = await db.collection('promocodes').updateMany(
            { grantsPlan: 'premium' },
            { $set: { grantsPlan: 'pro' } }
        );
        console.log(`✅ Updated ${premiumPromoResult.modifiedCount} promocodes from 'premium' to 'pro'`);

        // 5. Summary
        console.log('\n✨ Migration complete!');
        console.log('Total users updated:', userResult.modifiedCount + premiumResult.modifiedCount);
        console.log('Total promocodes updated:', promoResult.modifiedCount + premiumPromoResult.modifiedCount);

        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrateStartToPro();
