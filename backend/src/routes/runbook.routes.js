import express from 'express';
import { getRunbooks, createRunbook } from '../controllers/runbook.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', protect, getRunbooks);
router.post('/', protect, createRunbook);

export default router;
