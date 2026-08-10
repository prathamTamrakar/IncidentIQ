import { useState, useEffect } from 'react';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { IncidentDetail } from './components/IncidentDetail';
import { AlertSimulator } from './components/AlertSimulator';
import { Activity, ShieldCheck, LogOut, User } from 'lucide-react';
import './App.css';

const API_BASE = 'http://localhost:5000';

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

function App() {
  const [user, setUser] = useState<any>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  // Check auth session on startup
  const checkSession = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        // Automatically include credentials for JWT HTTP-only cookies
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (err) {
      console.log('No active session.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch incidents list
  const fetchIncidents = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${API_BASE}/api/incidents`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        setIncidents(data);
      }
    } catch (err) {
      console.error('Failed to load incidents list:', err);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (user) {
      fetchIncidents();
      // Poll incidents list every 8 seconds to reflect new incidents in list view
      const interval = setInterval(fetchIncidents, 8000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleLoginSuccess = (userData: any) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      setUser(null);
      setSelectedIncidentId(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleAlertTriggered = (newIncidentId: string) => {
    // Refresh list first
    fetchIncidents();
    // Open workspace immediately
    setSelectedIncidentId(newIncidentId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center text-gray-400 font-semibold gap-3">
        <Activity className="w-6 h-6 animate-pulse text-blue-500" />
        <span>Syncing system configurations...</span>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return <Auth onLoginSuccess={handleLoginSuccess} apiBase={API_BASE} />;
  }

  return (
    <div className="min-h-screen bg-[#070b13] text-white flex flex-col font-sans relative overflow-hidden pb-16">
      {/* Background radial overlays */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-blue-900/10 to-transparent rounded-full blur-[120px] pointer-events-none" />

      {/* Modern Operations Header */}
      <header className="border-b border-white/5 bg-[#0b0f19]/80 backdrop-blur-md sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm uppercase tracking-tight text-white">IncidentIQ</span>
              <span className="text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded">Copilot</span>
            </div>
            <p className="text-[10px] text-gray-400 font-medium">Operations Center</p>
          </div>
        </div>

        {/* User profile controls */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-white/5 border border-white/5 px-3 py-1.5 rounded-xl">
            <User className="w-4 h-4 text-blue-400" />
            <div className="text-left">
              <p className="text-xs font-bold text-gray-200 leading-none">{user.username}</p>
              <p className="text-[9px] text-gray-500 font-semibold capitalize mt-0.5">{user.role}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="p-2.5 bg-white/5 hover:bg-red-500/15 border border-white/5 hover:border-red-500/20 rounded-xl text-gray-400 hover:text-red-400 transition-all cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <main className="max-w-7xl w-full mx-auto px-6 mt-8 flex-1 space-y-8 relative z-10">
        {selectedIncidentId ? (
          <IncidentDetail
            incidentId={selectedIncidentId}
            onBack={() => {
              setSelectedIncidentId(null);
              fetchIncidents();
            }}
            apiBase={API_BASE}
          />
        ) : (
          <>
            {/* Top level Alert Simulator */}
            <AlertSimulator onAlertTriggered={handleAlertTriggered} apiBase={API_BASE} />

            {/* Dashboard Queue Overview */}
            <Dashboard incidents={incidents} onSelectIncident={setSelectedIncidentId} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
