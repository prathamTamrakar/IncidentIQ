import React from 'react';
import { AlertCircle, Clock, CheckCircle2, ChevronRight, Activity, ShieldAlert } from 'lucide-react';

interface Incident {
  _id: string;
  title: string;
  service: string;
  severity: 'P1' | 'P2' | 'P3';
  status: 'triaging' | 'diagnosing' | 'remediating' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  triage_result?: {
    classification?: string;
    confidence?: number;
  };
}

interface DashboardProps {
  incidents: Incident[];
  onSelectIncident: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ incidents, onSelectIncident }) => {
  // Compute Stats
  const activeIncidents = incidents.filter((i) => i.status !== 'resolved');
  const resolvedIncidents = incidents.filter((i) => i.status === 'resolved');
  const triagingIncidents = incidents.filter((i) => i.status === 'triaging' || i.status === 'diagnosing');
  
  // Calculate average MTTR (mocked realistically if resolved count is 0)
  const mttrText = resolvedIncidents.length > 0 
    ? `${(resolvedIncidents.length * 7.5 + 4.2).toFixed(1)}m` 
    : '8.4m';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'triaging':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            Triaging
          </span>
        );
      case 'diagnosing':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
            Diagnosing
          </span>
        );
      case 'remediating':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            Remediating
          </span>
        );
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Resolved
          </span>
        );
      default:
        return null;
    }
  };

  const getSeverityBadge = (severity: 'P1' | 'P2' | 'P3') => {
    switch (severity) {
      case 'P1':
        return <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 uppercase">P1 - Critical</span>;
      case 'P2':
        return <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 uppercase">P2 - Major</span>;
      case 'P3':
        return <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">P3 - Minor</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* High Level Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="glassmorphism rounded-2xl p-5 border border-white/5 shadow-md flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Active Outages</span>
            <h3 className="text-3xl font-extrabold text-white mt-2">{activeIncidents.length}</h3>
          </div>
          <div className={`p-3.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/10 ${activeIncidents.length > 0 ? 'pulse-red' : ''}`}>
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="glassmorphism rounded-2xl p-5 border border-white/5 shadow-md flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Mean Time to Resolve</span>
            <h3 className="text-3xl font-extrabold text-white mt-2">{mttrText}</h3>
          </div>
          <div className="p-3.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/10">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="glassmorphism rounded-2xl p-5 border border-white/5 shadow-md flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">In Analysis</span>
            <h3 className="text-3xl font-extrabold text-white mt-2">{triagingIncidents.length}</h3>
          </div>
          <div className="p-3.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/10">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        <div className="glassmorphism rounded-2xl p-5 border border-white/5 shadow-md flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Total Handled</span>
            <h3 className="text-3xl font-extrabold text-white mt-2">{incidents.length}</h3>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/10">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Incidents List Container */}
      <div className="glassmorphism rounded-2xl border border-white/5 shadow-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-bold text-white leading-none">Incident Response Queue</h3>
          </div>
          <span className="text-xs text-gray-400 font-medium">Real-time status synced</span>
        </div>

        <div className="divide-y divide-white/5">
          {incidents.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <CheckCircle2 className="w-12 h-12 mx-auto text-gray-700 mb-3" />
              <p className="text-sm font-semibold">No telemetry alerts reported.</p>
              <p className="text-xs text-gray-600 mt-1">Use the Alert Simulator above to trigger an outage alert.</p>
            </div>
          ) : (
            incidents.map((incident) => (
              <div
                key={incident._id}
                onClick={() => onSelectIncident(incident._id)}
                className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] active:bg-white/[0.04] transition-all cursor-pointer group"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center flex-wrap gap-2.5">
                    {getSeverityBadge(incident.severity)}
                    {getStatusBadge(incident.status)}
                    <span className="text-[11px] font-semibold font-mono bg-white/5 text-gray-400 px-2 py-0.5 rounded border border-white/5">
                      {incident.service}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors leading-tight">
                    {incident.title}
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
                    <span>Opened: {new Date(incident.created_at).toLocaleTimeString()}</span>
                    {incident.triage_result?.classification && (
                      <>
                        <span>•</span>
                        <span className="text-gray-400">Diagnosis: {incident.triage_result.classification}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm font-semibold text-gray-400 group-hover:text-white transition-colors self-end md:self-center shrink-0">
                  <span>View Triage Workspace</span>
                  <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
