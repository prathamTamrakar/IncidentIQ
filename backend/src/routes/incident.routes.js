import express from 'express';
import { 
  getIncidents, 
  getIncidentById, 
  streamIncident, 
  triggerAlert, 
  updateIncidentFromAgent, 
  approveRemediation, 
  rejectRemediation,
  savePostmortem 
} from '../controllers/incident.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', protect, getIncidents);
router.post('/alert', triggerAlert); // Ingestion webhook (unprotected for alert triggers)
router.get('/:id', protect, getIncidentById);
router.get('/:id/stream', streamIncident); // SSE endpoint (uses cookies for auth, handled natively)
router.put('/:id/agent-update', updateIncidentFromAgent); // Called by Python agent service
router.post('/:id/approve', protect, approveRemediation);
router.post('/:id/reject', protect, rejectRemediation);
router.put('/:id/postmortem', protect, savePostmortem);

export default router;
