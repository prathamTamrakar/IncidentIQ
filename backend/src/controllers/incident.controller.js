import axios from 'axios';
import { Incident } from '../models/incident.model.js';
import { Runbook } from '../models/runbook.model.js';
import { registerClient, broadcastIncidentUpdate } from '../services/sse.service.js';

// Get all incidents
export const getIncidents = async (req, res) => {
  try {
    const incidents = await Incident.find()
      .populate('suggested_runbook')
      .sort({ created_at: -1 });
    return res.json(incidents);
  } catch (error) {
    console.error('Get incidents error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Get single incident
export const getIncidentById = async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id).populate('suggested_runbook');
    if (!incident) {
      return res.status(404).json({ message: 'Incident not found' });
    }
    return res.json(incident);
  } catch (error) {
    console.error('Get incident details error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// SSE stream for real-time updates
export const streamIncident = (req, res) => {
  const { id } = req.params;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const cleanup = registerClient(id, res);

  req.on('close', () => {
    cleanup();
  });
};

// Ingest raw alert / log text and trigger agent workflow
export const triggerAlert = async (req, res) => {
  try {
    const { title, service, severity, raw_logs } = req.body;

    if (!title || !service || !severity || !raw_logs) {
      return res.status(400).json({ message: 'Missing required alert fields' });
    }

    // 1. Create incident record in MongoDB
    const incident = new Incident({
      title,
      service,
      severity,
      status: 'triaging',
      raw_logs,
      timeline: [
        {
          timestamp: new Date(),
          event: `Alert received: '${title}' affecting service '${service}' (Severity: ${severity})`,
          actor: 'human',
        },
        {
          timestamp: new Date(),
          event: 'Triage Agent initialized.',
          actor: 'agent',
        }
      ],
    });

    await incident.save();

    // 2. Call Python Agent Service asynchronously
    const agentServiceUrl = `${process.env.AGENT_SERVICE_URL}/run-incident`;
    
    // We don't await this; we let it run in background to keep ingestion fast
    axios.post(agentServiceUrl, {
      incident_id: incident._id.toString(),
      title: incident.title,
      service: incident.service,
      severity: incident.severity,
      raw_logs: incident.raw_logs,
    }).catch(err => {
      console.error('Failed to trigger python agent service:', err.message);
      // Update incident timeline to show error
      Incident.findByIdAndUpdate(incident._id, {
        $push: {
          timeline: {
            timestamp: new Date(),
            event: `Agent pipeline trigger error: ${err.message}`,
            actor: 'agent',
          }
        }
      }).then(updated => {
        if (updated) broadcastIncidentUpdate(updated._id, updated);
      });
    });

    return res.status(201).json(incident);
  } catch (error) {
    console.error('Trigger alert error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Callback endpoint for Python Agent Service to update incident state
export const updateIncidentFromAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    // Check if timeline events are present and merge them
    let incident = await Incident.findById(id);
    if (!incident) {
      return res.status(404).json({ message: 'Incident not found' });
    }

    // Merge update fields
    if (updateFields.status) incident.status = updateFields.status;
    if (updateFields.triage_result) incident.triage_result = updateFields.triage_result;
    if (updateFields.root_cause_candidates) incident.root_cause_candidates = updateFields.root_cause_candidates;
    if (updateFields.suggested_runbook) incident.suggested_runbook = updateFields.suggested_runbook;
    if (updateFields.remediation_approved !== undefined) incident.remediation_approved = updateFields.remediation_approved;
    if (updateFields.postmortem_draft) incident.postmortem_draft = updateFields.postmortem_draft;
    if (updateFields.resolved_at) incident.resolved_at = updateFields.resolved_at;

    if (updateFields.timeline_event) {
      incident.timeline.push(updateFields.timeline_event);
    }

    await incident.save();

    // Populate suggested runbook for the response/SSE payload
    const populated = await Incident.findById(id).populate('suggested_runbook');

    // Broadcast update via SSE
    broadcastIncidentUpdate(id, populated);

    return res.json(populated);
  } catch (error) {
    console.error('Agent update callback error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Approve runbook execution (Human-in-the-loop gate)
export const approveRemediation = async (req, res) => {
  try {
    const { id } = req.params;

    const incident = await Incident.findById(id).populate('suggested_runbook');
    if (!incident) {
      return res.status(404).json({ message: 'Incident not found' });
    }

    if (incident.status !== 'remediating') {
      return res.status(400).json({ message: 'Incident is not in remediating phase' });
    }

    incident.remediation_approved = true;
    incident.timeline.push({
      timestamp: new Date(),
      event: `Remediation runbook execution APPROVED by human.`,
      actor: 'human',
    });
    incident.timeline.push({
      timestamp: new Date(),
      event: `Runbook Executor Agent: Executing runbook '${incident.suggested_runbook?.title || 'Remediation'}'.`,
      actor: 'agent',
    });

    await incident.save();
    broadcastIncidentUpdate(id, incident);

    // Call Python agent service to resume/continue workflow
    const agentServiceUrl = `${process.env.AGENT_SERVICE_URL}/resume-incident`;
    axios.post(agentServiceUrl, {
      incident_id: id,
      approved: true,
    }).catch(err => {
      console.error('Failed to notify agent service of approval:', err.message);
    });

    return res.json(incident);
  } catch (error) {
    console.error('Approve remediation error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Reject runbook execution
export const rejectRemediation = async (req, res) => {
  try {
    const { id } = req.params;

    const incident = await Incident.findById(id).populate('suggested_runbook');
    if (!incident) {
      return res.status(404).json({ message: 'Incident not found' });
    }

    if (incident.status !== 'remediating') {
      return res.status(400).json({ message: 'Incident is not in remediating phase' });
    }

    incident.status = 'resolved';
    incident.remediation_approved = false;
    incident.resolved_at = new Date();
    incident.timeline.push({
      timestamp: new Date(),
      event: `Remediation runbook execution REJECTED by human. Manually marking incident as resolved.`,
      actor: 'human',
    });

    await incident.save();
    broadcastIncidentUpdate(id, incident);

    // Call Python agent service to resume and proceed to draft postmortem directly
    const agentServiceUrl = `${process.env.AGENT_SERVICE_URL}/resume-incident`;
    axios.post(agentServiceUrl, {
      incident_id: id,
      approved: false,
    }).catch(err => {
      console.error('Failed to notify agent service of rejection:', err.message);
    });

    return res.json(incident);
  } catch (error) {
    console.error('Reject remediation error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Save manually edited postmortem draft
export const savePostmortem = async (req, res) => {
  try {
    const { id } = req.params;
    const { postmortem_draft } = req.body;

    if (postmortem_draft === undefined) {
      return res.status(400).json({ message: 'Missing postmortem draft content' });
    }

    const incident = await Incident.findById(id);
    if (!incident) {
      return res.status(404).json({ message: 'Incident not found' });
    }

    incident.postmortem_draft = postmortem_draft;
    incident.timeline.push({
      timestamp: new Date(),
      event: 'Postmortem draft updated by human operator.',
      actor: 'human',
    });
    
    await incident.save();
    broadcastIncidentUpdate(id, incident);

    return res.json(incident);
  } catch (error) {
    console.error('Save postmortem error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
