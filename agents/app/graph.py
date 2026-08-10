from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
from app.nodes import triage_node, root_cause_node, runbook_node, postmortem_node

# Define State Schema
class IncidentState(TypedDict):
    incident_id: str
    raw_logs: str
    service: Optional[str]
    severity: Optional[str]
    triage_result: Optional[Dict[str, Any]]
    root_cause_candidates: List[Dict[str, Any]]
    suggested_runbook: Optional[Dict[str, Any]]
    remediation_approved: bool
    status: str
    needs_approval: bool
    postmortem_draft: Optional[str]

# Create the graph
workflow = StateGraph(IncidentState)

# Add Nodes
workflow.add_node("triage", triage_node)
workflow.add_node("root_cause", root_cause_node)
workflow.add_node("runbook", runbook_node)
workflow.add_node("postmortem", postmortem_node)

# Set Entrypoint
workflow.set_entry_point("triage")

# Linear flow from Triage to RCA to Runbook
workflow.add_edge("triage", "root_cause")
workflow.add_edge("root_cause", "runbook")

# Conditional Edge from Runbook: Halt if needs approval, else go to Postmortem
def route_after_runbook(state: IncidentState):
    if state.get("needs_approval", False):
        return "approval_required"
    return "auto_resolve"

workflow.add_conditional_edges(
    "runbook",
    route_after_runbook,
    {
        "approval_required": END,
        "auto_resolve": "postmortem"
    }
)

# Linear flow from Postmortem to End
workflow.add_edge("postmortem", END)

# Compile
compiled_graph = workflow.compile()

def run_alert_flow(incident_id: str, raw_logs: str) -> Dict[str, Any]:
    """Runs the initial triaging, diagnosis, and runbook matching phase."""
    initial_state = IncidentState(
        incident_id=incident_id,
        raw_logs=raw_logs,
        service=None,
        severity=None,
        triage_result=None,
        root_cause_candidates=[],
        suggested_runbook=None,
        remediation_approved=False,
        status="triaging",
        needs_approval=False,
        postmortem_draft=None
    )
    
    final_state = compiled_graph.invoke(initial_state)
    return final_state

def run_resume_flow(incident_id: str, approved: bool) -> Dict[str, Any]:
    """Resumes the flow after human approval/rejection to write the postmortem."""
    # Build a manual state to trigger the postmortem node directly
    state = IncidentState(
        incident_id=incident_id,
        raw_logs="", # Will be loaded in postmortem node from MongoDB
        service=None,
        severity=None,
        triage_result=None,
        root_cause_candidates=[],
        suggested_runbook=None,
        remediation_approved=approved,
        status="resolved",
        needs_approval=False,
        postmortem_draft=None
    )
    
    # Execute the postmortem node directly
    final_state = postmortem_node(state)
    return final_state
