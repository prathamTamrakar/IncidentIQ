import mongoose from 'mongoose';

const rootCauseCandidateSchema = new mongoose.Schema({
  cause: {
    type: String,
    required: true,
  },
  similar_incident_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Incident',
    default: null,
  },
  confidence: {
    type: Number,
    required: true,
  },
});

const timelineEventSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
  },
  event: {
    type: String,
    required: true,
  },
  actor: {
    type: String,
    enum: ['agent', 'human'],
    required: true,
  },
});

const incidentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  service: {
    type: String,
    required: true,
    index: true,
  },
  severity: {
    type: String,
    enum: ['P1', 'P2', 'P3'],
    required: true,
  },
  status: {
    type: String,
    enum: ['triaging', 'diagnosing', 'remediating', 'resolved'],
    default: 'triaging',
  },
  raw_logs: {
    type: String,
    required: true,
  },
  triage_result: {
    classification: { type: String, default: null },
    confidence: { type: Number, default: 0 },
  },
  root_cause_candidates: [rootCauseCandidateSchema],
  suggested_runbook: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Runbook',
    default: null,
  },
  remediation_approved: {
    type: Boolean,
    default: false,
  },
  timeline: [timelineEventSchema],
  postmortem_draft: {
    type: String,
    default: null,
  },
  resolved_at: {
    type: Date,
    default: null,
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

export const Incident = mongoose.model('Incident', incidentSchema);
export { timelineEventSchema };
