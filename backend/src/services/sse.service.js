// Map of incidentId -> Set of client response objects
const clients = new Map();

export const registerClient = (incidentId, res) => {
  if (!clients.has(incidentId)) {
    clients.set(incidentId, new Set());
  }
  clients.get(incidentId).add(res);

  // Send initial ping to establish connection
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'SSE connection established' })}\n\n`);

  return () => {
    const incidentClients = clients.get(incidentId);
    if (incidentClients) {
      incidentClients.delete(res);
      if (incidentClients.size === 0) {
        clients.delete(incidentId);
      }
    }
  };
};

export const broadcastIncidentUpdate = (incidentId, incidentData) => {
  const incidentClients = clients.get(incidentId.toString());
  if (incidentClients && incidentClients.size > 0) {
    const payload = JSON.stringify({ type: 'INCIDENT_UPDATE', data: incidentData });
    for (const client of incidentClients) {
      client.write(`data: ${payload}\n\n`);
    }
    return true;
  }
  return false;
};

export const sendHeartbeat = () => {
  for (const [incidentId, incidentClients] of clients.entries()) {
    for (const client of incidentClients) {
      client.write(': keepalive\n\n');
    }
  }
};

// Send heartbeat every 30 seconds
setInterval(sendHeartbeat, 30000);
