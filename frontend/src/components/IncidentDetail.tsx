import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  ChevronLeft, Bot, User, Check, X, ShieldAlert, 
  Terminal, AlertTriangle, FileText, Loader2, Sparkles, Edit2, CheckSquare 
} from 'lucide-react';

interface TimelineEvent {
  _id?: string;
  timestamp: string;
  event: string;
  actor: 'agent' | 'human';
}

interface RootCauseCandidate {
  cause: string;
  similar_incident_id: string | null;
  confidence: number;
}

interface Runbook {
  _id: string;
  title: string;
  service: string;
  trigger_conditions: string;
  steps: string[];
  destructive: boolean;
}

interface Incident {
  _id: string;
  title: string;
  service: string;
  severity: 'P1' | 'P2' | 'P3';
  status: 'triaging' | 'diagnosing' | 'remediating' | 'resolved';
  raw_logs: string;
  triage_result?: {
    classification?: string;
    confidence?: number;
  };
  root_cause_candidates: RootCauseCandidate[];
  suggested_runbook: Runbook | null;
  remediation_approved: boolean;
  timeline: TimelineEvent[];
  postmortem_draft: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface IncidentDetailProps {
  incidentId: string;
  onBack: () => void;
  apiBase: string;
}

export const IncidentDetail: React.FC<IncidentDetailProps> = ({ incidentId, onBack, apiBase }) => {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isEditingPostmortem, setIsEditingPostmortem] = useState(false);
  const [pmDraft, setPmDraft] = useState('');
  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');

  // Fetch incident details
  const fetchIncident = async () => {
    try {
      const response = await fetch(`${apiBase}/api/incidents/${incidentId}`, {
        // Assume auth cookies are handled
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        setIncident(data);
        if (data.postmortem_draft) {
          setPmDraft(data.postmortem_draft);
        }
      }
    } catch (error) {
      console.error('Fetch incident details failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncident();

    // Establish SSE stream connection for real-time updates
    const eventSource = new EventSource(`${apiBase}/api/incidents/${incidentId}/stream`, {
      withCredentials: true
    });

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'INCIDENT_UPDATE') {
          console.log('Real-time SSE Incident Update Received:', payload.data);
          setIncident(payload.data);
          if (payload.data.postmortem_draft) {
            setPmDraft(payload.data.postmortem_draft);
          }
        }
      } catch (err) {
        console.error('Failed to parse SSE event data:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Connection error:', err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [incidentId]);

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/incidents/${incidentId}/approve`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to approve');
      const data = await response.json();
      setIncident(data);
    } catch (err) {
      alert('Error approving remediation');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/incidents/${incidentId}/reject`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to reject');
      const data = await response.json();
      setIncident(data);
    } catch (err) {
      alert('Error rejecting remediation');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSavePostmortem = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/incidents/${incidentId}/postmortem`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postmortem_draft: pmDraft }),
      });
      if (!response.ok) throw new Error('Failed to save postmortem');
      const data = await response.json();
      setIncident(data);
      setIsEditingPostmortem(false);
      alert('Postmortem updated successfully.');
    } catch (err) {
      alert('Error saving postmortem');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="text-sm font-semibold">Loading Triage Workspace...</span>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="p-8 text-center text-red-400 border border-red-500/10 bg-red-950/10 rounded-xl">
        <p className="font-bold">Incident Not Found</p>
        <button onClick={onBack} className="mt-4 text-xs font-semibold text-blue-400 hover:underline">Return to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Triage Queue</span>
        </button>

        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
            incident.severity === 'P1' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
          }`}>
            {incident.severity}
          </span>
          <span className="text-xs font-semibold font-mono bg-white/5 border border-white/5 px-2.5 py-0.5 rounded text-gray-400">
            {incident.service}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-extrabold text-white tracking-tight leading-tight">{incident.title}</h2>
        <p className="text-gray-400 text-xs font-medium">Incident ID: {incident._id}</p>
      </div>

      {/* Main Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - Diagnostics (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Triage result */}
          <div className="glassmorphism rounded-2xl p-5 border border-white/5 shadow-md">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Triage Analysis</h4>
            <div className="space-y-3">
              <div>
                <span className="text-gray-500 text-xs font-medium">Auto-Classification</span>
                <p className="text-sm font-bold text-white mt-0.5">
                  {incident.triage_result?.classification || 'Evaluating logs...'}
                </p>
              </div>
              <div>
                <span className="text-gray-500 text-xs font-medium">Agent Confidence</span>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex-1 bg-slate-950/80 rounded-full h-2 overflow-hidden border border-white/5">
                    <div 
                      className="bg-blue-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${(incident.triage_result?.confidence || 0) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-blue-400 font-mono">
                    {((incident.triage_result?.confidence || 0) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Root Cause candidates (citations) */}
          <div className="glassmorphism rounded-2xl p-5 border border-white/5 shadow-md">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Diagnostic Root Causes</h4>
            <div className="space-y-4">
              {incident.root_cause_candidates.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing root cause analysis candidates...</span>
                </div>
              ) : (
                incident.root_cause_candidates.map((cand, idx) => (
                  <div key={idx} className="bg-slate-950/40 border border-white/5 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-white/5 border border-white/5 px-2 py-0.5 rounded text-gray-400">
                          #{idx + 1}
                        </span>
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Candidate</span>
                      </div>
                      <span className="text-xs font-bold text-amber-400 font-mono">
                        {(cand.confidence * 100).toFixed(0)}% Conf
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-white leading-relaxed">{cand.cause}</p>
                    {cand.similar_incident_id && (
                      <div className="pt-2 border-t border-white/5 flex items-center gap-1.5 text-[10px] font-semibold text-blue-400">
                        <FileText className="w-3 h-3" />
                        <span>Cites Past Postmortem: <span className="font-mono">{String(cand.similar_incident_id).slice(-6)}</span></span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Raw Telemetry Logs */}
          <div className="glassmorphism rounded-2xl border border-white/5 overflow-hidden shadow-md">
            <div className="px-5 py-4 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Raw Alert Telemetry</span>
              </div>
            </div>
            <div className="p-4 bg-slate-950/90 font-mono text-[11px] text-emerald-400/90 leading-relaxed overflow-x-auto max-h-[300px] whitespace-pre">
              {incident.raw_logs}
            </div>
          </div>
        </div>

        {/* Right Column - Timeline, Gates, and Postmortems (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Active Approval Gate */}
          {incident.status === 'remediating' && !incident.remediation_approved && incident.suggested_runbook && (
            <div className="p-6 bg-amber-950/20 border border-amber-500/20 rounded-2xl relative overflow-hidden shadow-lg animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1.5 flex-1">
                  <h3 className="text-base font-bold text-white">Manual Intervention Action Required</h3>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    A destructive remediation runbook has been matched for this service. Agent execution is currently halted pending manual engineer approval.
                  </p>
                </div>
              </div>

              {/* Runbook Details Panel */}
              <div className="mt-5 bg-slate-950/60 border border-white/5 rounded-xl p-4 space-y-3 text-xs">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-gray-500 font-medium">Matched Runbook:</span>
                  <span className="text-white font-bold">{incident.suggested_runbook.title}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-medium block mb-1">Execution Steps:</span>
                  <ul className="space-y-1 text-gray-300 font-medium list-disc list-inside pl-1">
                    {incident.suggested_runbook.steps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center gap-1.5 text-red-400 font-semibold mt-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Destructive Step Warning: Forces process termination / network state reset</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex items-center gap-3">
                <button
                  onClick={handleApprove}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:bg-amber-500/50 text-slate-950 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Approve & Execute</span>
                </button>
                <button
                  onClick={handleReject}
                  disabled={actionLoading}
                  className="py-2.5 px-5 bg-white/5 hover:bg-white/10 active:bg-white/20 disabled:bg-white/5 text-gray-300 border border-white/5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Decline & Resolve Manually</span>
                </button>
              </div>
            </div>
          )}

          {/* Real-time Timeline */}
          <div className="glassmorphism rounded-2xl p-5 border border-white/5 shadow-md">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Incident Response Timeline</h4>
              {incident.status !== 'resolved' && (
                <div className="flex items-center gap-2 text-[10px] font-bold text-blue-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Agent pipeline executing...</span>
                </div>
              )}
            </div>

            <div className="relative border-l border-white/5 ml-3.5 pl-6 space-y-6">
              {incident.timeline.map((event, idx) => {
                const isAgent = event.actor === 'agent';
                return (
                  <div key={idx} className="relative group">
                    {/* Node Dot Icon */}
                    <div className={`absolute -left-[35px] top-0 w-7 h-7 rounded-lg border flex items-center justify-center shadow-md transition-all ${
                      isAgent 
                        ? 'bg-blue-950 border-blue-500/30 text-blue-400 group-hover:border-blue-500/50' 
                        : 'bg-indigo-950 border-indigo-500/30 text-indigo-400 group-hover:border-indigo-500/50'
                    }`}>
                      {isAgent ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isAgent ? 'text-blue-400' : 'text-indigo-400'}`}>
                          {isAgent ? 'Agent Node' : 'Operator Action'}
                        </span>
                        <span className="text-[10px] text-gray-500 font-semibold font-mono">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-white leading-relaxed">{event.event}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Markdown Postmortem Draft Editor */}
          {incident.status === 'resolved' && incident.postmortem_draft && (
            <div className="glassmorphism rounded-2xl border border-white/5 overflow-hidden shadow-md">
              <div className="px-5 py-4 border-b border-white/5 bg-white/[0.01] flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Postmortem Incident Draft</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsEditingPostmortem(!isEditingPostmortem)}
                    className="flex items-center gap-1 px-3 py-1 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                  >
                    {isEditingPostmortem ? (
                      <>
                        <CheckSquare className="w-3.5 h-3.5" />
                        <span>Preview Draft</span>
                      </>
                    ) : (
                      <>
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit Raw Markdown</span>
                      </>
                    )}
                  </button>
                  {isEditingPostmortem && (
                    <button
                      onClick={handleSavePostmortem}
                      disabled={actionLoading}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      <span>Save Postmortem</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="p-6 bg-slate-950/20">
                {isEditingPostmortem ? (
                  <textarea
                    value={pmDraft}
                    onChange={(e) => setPmDraft(e.target.value)}
                    className="w-full h-[400px] bg-slate-950/50 border border-white/5 rounded-xl p-4 text-xs font-mono text-gray-300 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all resize-y"
                  />
                ) : (
                  <article className="prose prose-invert prose-xs max-w-none text-gray-300 text-xs font-medium leading-relaxed space-y-4">
                    <ReactMarkdown>{pmDraft}</ReactMarkdown>
                  </article>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
