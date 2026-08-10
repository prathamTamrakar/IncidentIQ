import os
from dotenv import load_dotenv
from pymongo import MongoClient
from qdrant_client import QdrantClient
import google.generativeai as genai
from openai import OpenAI

load_dotenv()

# MongoDB
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017/incidentiq")
mongo_client = MongoClient(MONGODB_URI)
db = mongo_client["incidentiq"]

QDRANT_PATH = "C:\\Users\\prath\\.gemini\\antigravity-ide\\qdrant_storage"
os.makedirs(QDRANT_PATH, exist_ok=True)
qdrant_client = QdrantClient(path=QDRANT_PATH)

# Local Embedding Model
EMBEDDING_MODEL_NAME = "mock-384"
print("Using zero-dependency mock embedding model.")

# Node API Server config
EXPRESS_API_URL = os.getenv("EXPRESS_API_URL", "http://127.0.0.1:5000")

# LLM Providers Setup
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()

class MockLLM:
    """Fallback mock LLM that generates deterministic realistic outputs if keys are not provided."""
    def generate(self, prompt: str, system_instruction: str = "") -> str:
        prompt_lower = prompt.lower()
        print(f"=== MOCK LLM CALLED ===")
        print(f"System: {system_instruction[:100]}...")
        print(f"Prompt keywords: {[w for w in ['triage', 'root', 'cause', 'runbook', 'postmortem'] if w in prompt_lower]}")
        
        # 1. Triage Agent
        if "triage" in prompt_lower or "classify" in prompt_lower:
            if "oom" in prompt_lower or "out of memory" in prompt_lower:
                return '{"classification": "Kubernetes Pod OutOfMemory Failure", "confidence": 0.95, "severity": "P1"}'
            if "redis" in prompt_lower or "connection refused" in prompt_lower:
                return '{"classification": "Redis Connection Cache Failure", "confidence": 0.88, "severity": "P2"}'
            if "deadlock" in prompt_lower or "cpu" in prompt_lower:
                return '{"classification": "Database Connection Pool Exhaustion", "confidence": 0.91, "severity": "P1"}'
            return '{"classification": "General Service Degradation", "confidence": 0.75, "severity": "P3"}'

        # 2. Root Cause Agent
        if "root cause" in prompt_lower or "hypothesis" in prompt_lower:
            if "oom" in prompt_lower:
                return """[
                  {"cause": "Memory leak in payment-service worker process under heavy request spikes", "confidence": 0.92, "citation": "Issue #842: Memory leak during checkout"},
                  {"cause": "Misconfigured JVM/heap size limits in Docker container", "confidence": 0.78, "citation": "Runbook: Scale Kubernetes Deployment"}
                ]"""
            if "redis" in prompt_lower:
                return """[
                  {"cause": "Redis master socket max clients reached under connection spikes", "confidence": 0.85, "citation": "Issue #311: Redis connection drops"},
                  {"cause": "Stale caches holding invalid network addresses during route-refresh", "confidence": 0.65, "citation": "Runbook: Flush Redis Cache"}
                ]"""
            return """[
              {"cause": "Unknown system connection time-out", "confidence": 0.60, "citation": "General logs"}
            ]"""

        # 3. Runbook suggestion
        if "runbook" in prompt_lower:
            if "oom" in prompt_lower:
                return "Scale Kubernetes Deployment"
            if "redis" in prompt_lower:
                return "Flush Redis Cache"
            if "db" in prompt_lower or "cpu" in prompt_lower:
                return "Restart Database Replica"
            return "Restart Service"

        # 4. Postmortem Agent
        if "postmortem" in prompt_lower or "incident timeline" in prompt_lower:
            return """# Incident Postmortem — Database CPU & Cache Pool Deadlock

## Executive Summary
On August 2, 2026, our main transaction database experienced connection pool exhaustion leading to widespread checkout failures. The automated multi-agent response was triggered, which diagnosed the issue and suggested a database replica scale-up. The scale-up was approved by the on-call engineer and successfully resolved the incident.

## Timeline
- **01:54 AM**: Alert triggered for checkout-service error rates.
- **01:55 AM**: Incident triaged by Triage Agent as P1.
- **01:55 AM**: Root Cause Agent identified Database Connection Pool Exhaustion as high-confidence cause.
- **01:55 AM**: Runbook Agent identified "Restart Database Replica" runbook. Awaiting approval (destructive).
- **01:56 AM**: Human responder approved the remediation.
- **01:56 AM**: Runbook executed, connection count reset.
- **01:57 AM**: Postmortem drafted automatically.

## Root Cause Analysis
The deadlock occurred due to an unindexed query in the user-sessions service executing concurrently with transaction processing, leading to locking of tables and pool saturation.

## Action Items
- [ ] Add indexes on session token column.
- [ ] Implement database connection pooling circuit breaker.
"""
        return "Mock response generated successfully."

def get_llm_client():
    if GEMINI_API_KEY:
        print("Initializing Gemini LLM Model...")
        genai.configure(api_key=GEMINI_API_KEY)
        # Using Gemini 2.5 Flash as standard or Gemini 1.5 Flash
        class GeminiWrapper:
            def generate(self, prompt: str, system_instruction: str = "") -> str:
                model = genai.GenerativeModel(
                    model_name="gemini-1.5-flash",
                    system_instruction=system_instruction
                )
                response = model.generate_content(prompt)
                return response.text
        return GeminiWrapper()
    elif OPENAI_API_KEY:
        print("Initializing OpenAI LLM Model...")
        client = OpenAI(api_key=OPENAI_API_KEY)
        class OpenAIWrapper:
            def generate(self, prompt: str, system_instruction: str = "") -> str:
                messages = []
                if system_instruction:
                    messages.append({"role": "system", "content": system_instruction})
                messages.append({"role": "user", "content": prompt})
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                    temperature=0.2
                )
                return response.choices[0].message.content
        return OpenAIWrapper()
    else:
        print("WARNING: Neither GEMINI_API_KEY nor OPENAI_API_KEY found in env. Falling back to MockLLM simulation.")
        return MockLLM()

llm_client = get_llm_client()
