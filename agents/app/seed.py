import hashlib
import os
import sys
from bson import ObjectId

# Adjust import path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import db
from app.rag import init_qdrant_collection, index_text_chunk

def hash_password(password: str, salt: str) -> str:
    """Matches the Node.js pbkdf2 implementation."""
    return hashlib.pbkdf2_hmac(
        'sha512',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        1000,
        64
    ).hex()

def seed_database():
    print("Starting database seeding...")
    
    # 1. Initialize Qdrant Collection
    init_qdrant_collection()

    # 2. Seed Default User if not exists
    if db.users.count_documents({}) == 0:
        salt = os.urandom(16).hex()
        password_hash = hash_password("password", salt)
        user = {
            "username": "responder",
            "email": "responder@incidentiq.com",
            "passwordHash": password_hash,
            "salt": salt,
            "role": "responder"
        }
        db.users.insert_one(user)
        print("Seeded responder user: responder / password")
    else:
        print("Users already seeded.")

    # 3. Seed Runbooks
    runbooks_data = [
        {
            "_id": ObjectId("60d5ec1234567890abcdef01"),
            "title": "Scale Kubernetes Deployment",
            "service": "checkout-service",
            "trigger_conditions": "OutOfMemory errors, pod CrashLoopBackOff, or heavy load traffic spike",
            "steps": [
                "Verify active replica counts and resource usage: kubectl top pods -l app=checkout-service",
                "Increase deployment replica count by 2: kubectl scale deployment checkout-service --replicas=4",
                "Monitor rollouts status: kubectl rollout status deployment checkout-service --timeout=60s",
                "Validate system logs to ensure new pods successfully joined the routing fabric"
            ],
            "destructive": True
        },
        {
            "_id": ObjectId("60d5ec1234567890abcdef02"),
            "title": "Flush Redis Cache",
            "service": "payment-service",
            "trigger_conditions": "Redis connection refused, stale transaction pool, or max client limit reached",
            "steps": [
                "Connect securely to Redis cache cluster master: redis-cli -h redis-master.internal -p 6379",
                "Execute non-blocking volatile key eviction: FLUSHDB ASYNC",
                "Verify cache health metrics and client pool levels: INFO stats",
                "Test transaction flow by initiating a small mock checkout call"
            ],
            "destructive": False
        },
        {
            "_id": ObjectId("60d5ec1234567890abcdef03"),
            "title": "Restart Database Replica",
            "service": "checkout-service",
            "trigger_conditions": "Database deadlocks, transaction lockups, or connection pool exhaustion",
            "steps": [
                "Scan PostgreSQL catalog for locked threads and blocking transactions: SELECT pg_blocking_pids(pid) FROM pg_stat_activity",
                "Forcefully terminate all inactive database connection nodes: SELECT pg_terminate_backend(pid)",
                "Initiate graceful failover restart on Postgres Secondary node: patronictl restart pg-cluster pg-node-2 --force",
                "Validate query times and confirm pool returns below 80% threshold"
            ],
            "destructive": True
        },
        {
            "_id": ObjectId("60d5ec1234567890abcdef04"),
            "title": "Rotate Auth Gateway Signature Keys",
            "service": "auth-gateway",
            "trigger_conditions": "Cryptographic signature validation failure, token signature mismatch, or key expiration",
            "steps": [
                "Create new RSA keypair: openssl genpkey -algorithm RSA -out auth_private_new.pem",
                "Publish updated JSON Web Key Sets (JWKS) to gateway volume store",
                "Trigger configuration hot reload on key vault daemon",
                "Run verification token validation check via curl payload"
            ],
            "destructive": False
        }
    ]

    for rb in runbooks_data:
        db.runbooks.update_one(
            {"_id": rb["_id"]},
            {"$set": rb},
            upsert=True
        )
    print("Runbooks seeded.")

    # 4. Seed Historical Postmortems (and write to vector DB for RAG retrieval)
    historical_postmortems = [
        {
            "id": "60d5ec7777777790abcdef11",
            "service": "checkout-service",
            "title": "Incident PM #102: checkout-service OOM Crash due to Memory Leak",
            "content": """# Incident Postmortem — checkout-service OutOfMemory Error

## Executive Summary
On May 12, 2026, the checkout-service experienced an OutOfMemory (OOM) error that triggered pod restarts and led to a 12-minute outage. Total affected transaction volume was $45k.

## Error Signature
Fatal Error: JavaScript heap out of memory. Kubernetes pod exited with exit code 137 (OOMKilled).

## Root Cause Analysis
A memory leak was identified in the transaction logging middleware, where an internal request-tracking map `requestContextStore` grew unbounded under high load. This map accumulated metadata blocks for every transaction but failed to clean them up due to a circular reference in the cleanup timer. Under concurrent spikes of 500+ requests, this triggered Node.js memory exhaustion and resulted in the pod being killed by the Linux OOM daemon.

## Resolution
The immediate remediation was scaling up deployment replicas from 2 to 4 to distribute memory load, followed by a hotpatch to delete the request logs after transmission.
""",
        },
        {
            "id": "60d5ec7777777790abcdef12",
            "service": "payment-service",
            "title": "Incident PM #88: payment-service Redis socket pool failure",
            "content": """# Incident Postmortem — payment-service Redis Connection Refused

## Executive Summary
On June 3, 2026, the checkout application reported 502 Bad Gateway errors for all payment cards. The incident lasted 8 minutes.

## Error Signature
Connection Refused: Error: connect ECONNREFUSED 10.0.4.15:6379 on payment-service.

## Root Cause Analysis
The connection pool size inside payment-service was configured to 500 max clients per pod. Under flash sale traffic, the application spawned multiple pods, leading to total client connections crossing the 10,000 threshold of the Redis master instance. Redis began rejecting new socket connections, causing client requests to queue and fail.

## Resolution
The cache was flushed using FLUSHDB ASYNC to clear expired tokens and connection allocations were optimized. We updated our configuration to enforce connection limits and added fallback mock payment checks.
""",
        },
        {
            "id": "60d5ec7777777790abcdef13",
            "service": "auth-gateway",
            "title": "Incident PM #94: auth-gateway Key Expiration Signature Mismatch",
            "content": """# Incident Postmortem — auth-gateway Key Expiration

## Executive Summary
On June 28, 2026, user logins failed globally due to signature verification failures. The system was degraded for 15 minutes.

## Error Signature
TokenVerificationError: Signature verification failed. Cryptographic signature does not match.

## Root Cause Analysis
The JWKS caching server held expired signing public keys. The automated script to rotate keys failed to publish the updated JWKS endpoints to the main API Gateway gateway volume storage. Consequently, token payloads signed using the newly rotated keys were rejected as invalid.

## Resolution
The key pairs were manually rotated, and the public keys were successfully distributed. The caching parameters on the gateway server were reduced from 24h to 15m.
"""
        }
    ]

    # Index postmortem documents in Qdrant and save in MongoDB if not already present
    for pm in historical_postmortems:
        pm_id = ObjectId(pm["id"])
        
        # Save incident record representing the historic event
        historical_incident = {
            "_id": pm_id,
            "title": pm["title"],
            "service": pm["service"],
            "severity": "P1" if "OOM" in pm["title"] or "Expiration" in pm["title"] else "P2",
            "status": "resolved",
            "raw_logs": pm["content"],
            "postmortem_draft": pm["content"],
            "resolved_at": None
        }
        db.incidents.update_one(
            {"_id": pm_id},
            {"$set": historical_incident},
            upsert=True
        )

        # Chunk content into logical paragraphs for semantic retrieval
        paragraphs = [p.strip() for p in pm["content"].split("\n\n") if len(p.strip()) > 30]
        for idx, paragraph in enumerate(paragraphs):
            index_text_chunk(
                source_type="postmortem",
                source_id=pm_id,
                text=paragraph,
                service=pm["service"]
            )
            
    print("Historical incidents indexed in Qdrant.")
    print("Database seeding completed successfully.")

if __name__ == "__main__":
    seed_database()
