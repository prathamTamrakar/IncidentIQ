import mongoose from 'mongoose';

const runbookSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  service: {
    type: String,
    required: true,
    index: true,
  },
  trigger_conditions: {
    type: String,
    required: true,
  },
  steps: {
    type: [String],
    required: true,
  },
  destructive: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

export const Runbook = mongoose.model('Runbook', runbookSchema);
