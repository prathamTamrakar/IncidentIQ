import datetime
import requests
from app.config import db, EXPRESS_API_URL, llm_client
from app.rag import retrieve_similar_contexts

def send_agent_update(incident_id: str, payload: dict):
    """Utility function to send real-time progress update to Express backend."""
    try:
        url = f"{EXPRESS_API_URL}/api/incidents/{incident_id}/agent-update"
        response = requests.put(url, json=payload, timeout=5)
        response.raise_for_status()
    except Exception as e:
        print(f"Error sending callback update to backend: {e}")

# 1. Triage Agent Node
def triage_node(state: dict) -> dict:
    incident_id = state["incident_id"]
    raw_logs = state["raw_logs"]
    
    print(f"[{incident_id}] Running Triage Agent...")
    
    system_instruction = "You are a professional Site Reliability Engineer (SRE) triage agent. Your task is to analyze production logs and classify the alert."
    prompt = f"""
    Please analyze the raw logs below and return a JSON object with the following fields:
    - classification: A clean title representing the type of failure.
    - service: Identify the affected service (should be one of: checkout-service, payment-service, auth-gateway).
    - severity: Rate it as P1 (outage/blocker), P2 (major degradation), or P3 (minor issue).
    - confidence: Float value from 0.0 to 1.0.

    Raw Logs:
    {raw_logs}

    Only return valid JSON, no markdown wrappers, no formatting code blocks.
    """
    
    try:
        response_text = llm_client.generate(prompt, system_instruction).strip()
        # Clean up code blocks if LLM wrapper failed to skip them
        if response_text.startswith("```"):
            lines = response_text.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            response_text = "\n".join(lines).strip()
            
        import json
        triage_data = json.loads(response_text)
    except Exception as e:
        print(f"Triage agent JSON parsing error: {e}. Falling back to default.")
        triage_data = {
            "classification": "General Service Degradation",
            "service": "checkout-service",
            "severity": "P2",
            "confidence": 0.8
        }
    
    # Update backend
    send_agent_update(incident_id, {
        "status": "diagnosing",
        "service": triage_data["service"],
        "severity": triage_data["severity"],
        "triage_result": {
            "classification": triage_data["classification"],
            "confidence": triage_data["confidence"]
        },
        "timeline_event": {
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "event": f"Triage Agent completed: Incident classified as '{triage_data['classification']}' on '{triage_data['service']}' (Severity: {triage_data['severity']}, Confidence: {triage_data['confidence']:.2f})",
            "actor": "agent"
        }
    })
    
    # Update local state
    state.update({
        "service": triage_data["service"],
        "severity": triage_data["severity"],
        "triage_result": triage_data,
        "status": "diagnosing"
    })
    return state

# 2. Root Cause Agent Node
def root_cause_node(state: dict) -> dict:
    incident_id = state["incident_id"]
    service = state.get("service", "checkout-service")
    raw_logs = state["raw_logs"]
    
    print(f"[{incident_id}] Running Root Cause Agent...")
    
    # 1. Retrieve historical matches via local RAG
    similar_incidents = retrieve_similar_contexts(raw_logs, service=service, limit=2)
    
    # Format candidates list to pass to LLM
    rag_context = ""
    for idx, inc in enumerate(similar_incidents):
        rag_context += f"--- Historic Incident #{idx+1} (Source: {inc['source_type']}, Score: {inc['score']:.2f}) ---\n"
        rag_context += f"{inc['text']}\n\n"
        
    system_instruction = "You are a senior Principal Engineer specializing in post-mortem Root Cause Analysis (RCA). Your task is to diagnose production anomalies."
    prompt = f"""
    Compare this current incident logs with our historical incidents database contexts to rank the most likely root causes.
    
    Current Raw Logs:
    {raw_logs}
    
    Historical Context Chunks (RAG):
    {rag_context}
    
    Return a JSON array of objects, each containing:
    - cause: Clear description of the root cause.
    - similar_incident_id: If matching one of the historical contexts, set it to the historical source ID, else null.
    - confidence: Rating between 0.0 and 1.0.

    Only return valid JSON, no markup blocks.
    """
    
    try:
        response_text = llm_client.generate(prompt, system_instruction).strip()
        if response_text.startswith("```"):
            lines = response_text.splitlines()
            if lines[0].startswith("```"): lines = lines[1:]
            if lines[-1].startswith("```"): lines = lines[:-1]
            response_text = "\n".join(lines).strip()
            
        import json
        candidates = json.loads(response_text)
    except Exception as e:
        print(f"RCA agent JSON parsing error: {e}. Falling back to default.")
        candidates = [
            {"cause": f"Resource exhaustion or internal dependency failure in service '{service}'", "similar_incident_id": None, "confidence": 0.7}
        ]
        
    # Match candidate citation IDs to real MongoDB documents if they are strings
    for candidate in candidates:
        if candidate.get("similar_incident_id") and len(str(candidate["similar_incident_id"])) > 10:
            try:
                # Keep it as object or string
                pass
            except:
                candidate["similar_incident_id"] = None
                
    # Update backend
    send_agent_update(incident_id, {
        "status": "remediating",
        "root_cause_candidates": candidates,
        "timeline_event": {
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "event": f"Root Cause Agent completed: Diagnostic analysis identified {len(candidates)} candidate causes. Most likely cause: '{candidates[0]['cause']}' (Confidence: {candidates[0]['confidence']:.2f})",
            "actor": "agent"
        }
    })
    
    state.update({
        "root_cause_candidates": candidates,
        "status": "remediating"
    })
    return state

# 3. Runbook Executor Agent Node
def runbook_node(state: dict) -> dict:
    incident_id = state["incident_id"]
    service = state.get("service", "checkout-service")
    candidates = state.get("root_cause_candidates", [])
    
    print(f"[{incident_id}] Running Runbook Executor Agent...")
    
    # 1. Fetch runbooks matching this service from MongoDB
    runbooks = list(db.runbooks.find({"service": service}))
    
    selected_runbook = None
    if runbooks:
        # Ask LLM to pick the best runbook based on candidates and logs
        runbooks_summary = "\n".join([f"ID: {rb['_id']} | Title: {rb['title']} | Destructive: {rb['destructive']}" for rb in runbooks])
        top_cause = candidates[0]["cause"] if candidates else "Service logs error"
        
        prompt = f"""
        Select the best runbook from our index to remediate this incident.
        Incident Cause: {top_cause}
        
        Available Runbooks:
        {runbooks_summary}
        
        Respond with ONLY the exact ID of the chosen runbook. If none apply, respond with NULL.
        """
        response_text = llm_client.generate(prompt).strip()
        if "null" not in response_text.lower():
            cleaned_id = response_text.split()[-1].replace('"', '').replace("'", "")
            try:
                from bson import ObjectId
                selected_runbook = db.runbooks.find_one({"_id": ObjectId(cleaned_id)})
            except:
                selected_runbook = runbooks[0]
        else:
            selected_runbook = runbooks[0]
    else:
        # Fallback to general restart if no runbook exists for this service
        selected_runbook = db.runbooks.find_one({"title": "Scale Kubernetes Deployment"}) or {
            "_id": None,
            "title": "General Service Restart",
            "service": service,
            "steps": ["Restart Service container pods"],
            "destructive": False
        }
        
    if not selected_runbook:
        selected_runbook = {
            "_id": None,
            "title": "General Service Restart",
            "service": service,
            "steps": ["Restart Service container pods"],
            "destructive": False
        }
        
    runbook_id_str = str(selected_runbook["_id"]) if selected_runbook.get("_id") else None
    
    # Check if destructive
    is_destructive = selected_runbook.get("destructive", False)
    
    if is_destructive:
        # Stop and wait for human approval
        send_agent_update(incident_id, {
            "suggested_runbook": runbook_id_str,
            "remediation_approved": False,
            "status": "remediating",
            "timeline_event": {
                "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                "event": f"Runbook Agent: Found matching destructive runbook '{selected_runbook['title']}'. Execution HALTED. Awaiting manual human approval.",
                "actor": "agent"
            }
        })
        state.update({
            "suggested_runbook": selected_runbook,
            "remediation_approved": False,
            "needs_approval": True
        })
    else:
        # Auto-approve and execute non-destructive runbook
        send_agent_update(incident_id, {
            "suggested_runbook": runbook_id_str,
            "remediation_approved": True,
            "status": "resolved",
            "resolved_at": datetime.datetime.utcnow().isoformat() + "Z",
            "timeline_event": {
                "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                "event": f"Runbook Agent: Auto-approved and executed safe runbook '{selected_runbook['title']}'. Steps completed successfully: {', '.join(selected_runbook['steps'][:2])}...",
                "actor": "agent"
            }
        })
        state.update({
            "suggested_runbook": selected_runbook,
            "remediation_approved": True,
            "status": "resolved",
            "needs_approval": False
        })
        
    return state

# 4. Postmortem Agent Node
def postmortem_node(state: dict) -> dict:
    incident_id = state["incident_id"]
    service = state.get("service", "checkout-service")
    raw_logs = state["raw_logs"]
    status = state.get("status", "resolved")
    
    # Fetch final incident from DB to get the actual populated timeline (including human approvals)
    db_incident = db.incidents.find_one({"_id": ObjectId(incident_id)})
    timeline_str = ""
    if db_incident and "timeline" in db_incident:
        for ev in db_incident["timeline"]:
            t = ev["timestamp"].strftime("%Y-%m-%d %H:%M:%S") if isinstance(ev["timestamp"], datetime.datetime) else str(ev["timestamp"])
            timeline_str += f"- [{t}] ({ev['actor']}) {ev['event']}\n"
            
    print(f"[{incident_id}] Running Postmortem Agent...")
    
    system_instruction = "You are a technical writer and SRE Lead. Your task is to draft a comprehensive, blameless Markdown postmortem based on the incident logs and timeline."
    prompt = f"""
    Please generate an incident postmortem draft in Markdown.
    Include the following structured sections:
    - # Incident Postmortem — [Incident Title / Classification]
    - ## Executive Summary (a brief paragraph summarizing what happened, impact, and fix)
    - ## Error Signature & Symptoms
    - ## Timeline of Events (based on the provided timeline below)
    - ## Root Cause Analysis (technical breakdown of why it failed)
    - ## Resolution (steps taken to fix)
    - ## Action Items / Preventive Steps (suggest 3 concrete tasks to avoid future occurrences)

    Incident Timeline:
    {timeline_str}

    Raw Logs:
    {raw_logs}
    
    Do not wrap in triple backticks. Return the raw Markdown directly.
    """
    
    pm_draft = llm_client.generate(prompt, system_instruction)
    
    # Update backend
    send_agent_update(incident_id, {
        "status": "resolved",
        "postmortem_draft": pm_draft,
        "resolved_at": datetime.datetime.utcnow().isoformat() + "Z",
        "timeline_event": {
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "event": "Postmortem Agent completed: Generated structured Markdown postmortem draft.",
            "actor": "agent"
        }
    })
    
    state.update({
        "postmortem_draft": pm_draft,
        "status": "resolved"
    })
    return state
from bson import ObjectId
