import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import { User } from '../models/user.model.js';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Seed default demo user if not present
    const existingDemoUser = await User.findOne({ username: 'responder' });
    if (!existingDemoUser) {
      const demoUser = new User({
        username: 'responder',
        email: 'responder@incidentiq.internal',
        role: 'responder',
      });
      demoUser.setPassword('password');
      await demoUser.save();
      console.log('Demo user seeded: responder / password');
    }
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};
