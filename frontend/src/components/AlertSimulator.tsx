import React, { useState } from 'react';
import { Play, Activity, Server, Database, Key, ShieldAlert } from 'lucide-react';

interface AlertSimulatorProps {
  onAlertTriggered: (incidentId: string) => void;
  apiBase: string;
}

interface AlertTemplate {
  id: string;
  title: string;
  service: string;
  severity: 'P1' | 'P2' | 'P3';
  description: string;
  icon: React.ComponentType<any>;
  color: string;
  logs: string;
}

export const AlertSimulator: React.FC<AlertSimulatorProps> = ({ onAlertTriggered, apiBase }) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const alertTemplates: AlertTemplate[] = [
    {
      id: 'oom_kill',
      title: 'Kubernetes Pod OOMKilled checkout-service',
      service: 'checkout-service',
      severity: 'P1',
      description: 'Checkout API pods crashing due to heap memory allocation limits.',
      icon: Server,
      color: 'text-red-500 bg-red-950/20 border-red-500/20',
      logs: `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
2026-08-02T01:54:11.451Z - checkout-service - pid 14 - [worker] Heap size: 1.42 GB (limit 1.5 GB)
2026-08-02T01:54:12.110Z - checkout-service - Kubelet Liveness probe failed for pod checkout-service-79fd54c-v8x2b
2026-08-02T01:54:13.001Z - kubernetes-events - Pod checkout-service-79fd54c-v8x2b terminated with status OOMKilled (Exit Code 137)
2026-08-02T01:54:13.242Z - nginx-ingress - checkout-service upstream returned 502 Bad Gateway under load spike.`,
    },
    {
      id: 'redis_exhaustion',
      title: 'payment-service Cache Socket Pool Exhaustion',
      service: 'payment-service',
      severity: 'P2',
      description: 'Redis client connection pool is refusing new checkout sockets.',
      icon: Activity,
      color: 'text-orange-500 bg-orange-950/20 border-orange-500/20',
      logs: `2026-08-02T01:54:18.892Z - payment-service - ERROR: RedisClientError: Redis connection refused to redis-master.internal:6379
2026-08-02T01:54:19.102Z - payment-service - Connection Pool Error: Connection Refused (ECONNREFUSED)
2026-08-02T01:54:19.452Z - payment-service - Retrying connection to Redis (attempt 1/5)...
2026-08-02T01:54:20.100Z - payment-service - Socket timeout occurred while waiting for Redis client check-in.
2026-08-02T01:54:20.301Z - payment-service - Fallback mode initiated: failing transaction payload validations.`,
    },
    {
      id: 'db_deadlock',
      title: 'Primary DB Replica Lock Deadlock',
      service: 'checkout-service',
      severity: 'P1',
      description: 'Transaction pool database deadlock leading to application connection starvation.',
      icon: Database,
      color: 'text-amber-500 bg-amber-950/20 border-amber-500/20',
      logs: `2026-08-02T01:54:24.110Z - postgresql-logs - ERROR: deadlock detected
2026-08-02T01:54:24.111Z - postgresql-logs - DETAIL: Process 8412 waits for ShareLock on transaction 100932; blocked by process 8443.
2026-08-02T01:54:25.501Z - checkout-service - DB Error: knex: Acquire connection timeout after 30000ms.
2026-08-02T01:54:26.012Z - checkout-service - Active connections: 98/100 (98 waiting in connection queue)
2026-08-02T01:54:27.420Z - patroni-node - Node check failed. Master database status: unresponsive.`,
    },
    {
      id: 'auth_key_rotation',
      title: 'Auth Signature Cryptographic Signature Mismatch',
      service: 'auth-gateway',
      severity: 'P2',
      description: 'Gateway JWKS cache validation mismatches due to signature key expiration.',
      icon: Key,
      color: 'text-purple-500 bg-purple-950/20 border-purple-500/20',
      logs: `2026-08-02T01:54:30.201Z - auth-gateway - WARNING: Cryptographic verification mismatch: signature key expired
2026-08-02T01:54:30.410Z - auth-gateway - TokenVerificationError: Signature verification failed. Cryptographic signature does not match.
2026-08-02T01:54:31.002Z - auth-gateway - Failed to validate incoming Bearer JWT for user session ID 92482
2026-08-02T01:54:31.500Z - nginx-ingress - auth-gateway returning 401 Unauthorized for client requests on api/checkout/confirm.`,
    }
  ];

  const triggerAlert = async (template: AlertTemplate) => {
    setLoadingId(template.id);
    try {
      const response = await fetch(`${apiBase}/api/incidents/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: template.title,
          service: template.service,
          severity: template.severity,
          raw_logs: template.logs,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to inject alert webhook');
      }

      const data = await response.json();
      onAlertTriggered(data._id);
    } catch (error) {
      console.error('Trigger alert error:', error);
      alert('Error triggering alert: check server connections');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="glassmorphism rounded-2xl p-6 border border-white/5 shadow-xl relative overflow-hidden">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white leading-tight">Alert Simulator</h3>
          <p className="text-gray-400 text-xs mt-0.5">Inject simulated alert telemetry webhooks</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {alertTemplates.map((tmpl) => {
          const Icon = tmpl.icon;
          const isLoading = loadingId === tmpl.id;
          return (
            <div
              key={tmpl.id}
              className="bg-slate-950/40 hover:bg-slate-950/70 border border-white/5 rounded-xl p-5 flex flex-col justify-between transition-all group hover:border-white/10"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${tmpl.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    tmpl.severity === 'P1' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                  }`}>
                    {tmpl.severity}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors line-clamp-1">{tmpl.title}</h4>
                <p className="text-gray-400 text-xs mt-1.5 leading-relaxed line-clamp-2">{tmpl.description}</p>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="text-[10px] bg-white/5 text-gray-400 border border-white/5 px-2.5 py-0.5 rounded-md font-mono">{tmpl.service}</span>
                </div>
              </div>

              <button
                onClick={() => triggerAlert(tmpl)}
                disabled={loadingId !== null}
                className="mt-5 w-full py-2 bg-white/5 hover:bg-blue-600 active:bg-blue-700 disabled:bg-white/5 text-gray-300 hover:text-white border border-white/5 hover:border-blue-500 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span>Injecting...</span>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Trigger Webhook</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
