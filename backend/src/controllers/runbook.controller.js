import { Runbook } from '../models/runbook.model.js';

export const getRunbooks = async (req, res) => {
  try {
    const runbooks = await Runbook.find().sort({ createdAt: -1 });
    return res.json(runbooks);
  } catch (error) {
    console.error('Get runbooks error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const createRunbook = async (req, res) => {
  try {
    const { title, service, trigger_conditions, steps, destructive } = req.body;

    if (!title || !service || !trigger_conditions || !steps) {
      return res.status(400).json({ message: 'Missing required runbook fields' });
    }

    const runbook = new Runbook({ title, service, trigger_conditions, steps, destructive });
    await runbook.save();
    return res.status(201).json(runbook);
  } catch (error) {
    console.error('Create runbook error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
