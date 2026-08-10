import os
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.graph import run_alert_flow, run_resume_flow
from app.seed import seed_database

app = FastAPI(title="IncidentIQ Agent Runtime", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class IncidentTriggerPayload(BaseModel):
    incident_id: str
    title: str
    service: str
    severity: str
    raw_logs: str

class IncidentResumePayload(BaseModel):
    incident_id: str
    approved: bool

@app.on_event("startup")
def startup_event():
    print("Agent Runtime Service starting up...")
    try:
        seed_database()
    except Exception as e:
        print(f"Error seeding database on startup: {e}")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "IncidentIQ Python Agent Service"}

@app.post("/run-incident")
def trigger_incident_agent(payload: IncidentTriggerPayload, background_tasks: BackgroundTasks):
    """Triggers the LangGraph agent workflow asynchronously as a background task."""
    print(f"Triggering agent graph for incident: {payload.incident_id}")
    background_tasks.add_task(
        run_alert_flow,
        incident_id=payload.incident_id,
        raw_logs=payload.raw_logs
    )
    return {"message": "Incident agent pipeline triggered in background", "incident_id": payload.incident_id}

@app.post("/resume-incident")
def resume_incident_agent(payload: IncidentResumePayload, background_tasks: BackgroundTasks):
    """Resumes the LangGraph agent workflow after human approval gate."""
    print(f"Resuming agent graph for incident: {payload.incident_id} (Approved: {payload.approved})")
    background_tasks.add_task(
        run_resume_flow,
        incident_id=payload.incident_id,
        approved=payload.approved
    )
    return {"message": "Incident agent pipeline resumed in background", "incident_id": payload.incident_id}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, reload=False)
