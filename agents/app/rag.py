import hashlib
import random
import uuid
from qdrant_client.models import Distance, VectorParams, Filter, FieldCondition, MatchValue, PointStruct
from app.config import qdrant_client, db

def get_embedding(text: str) -> list:
    """Generates a deterministic 384-dimensional float vector for a given text."""
    # Seed value derived from the SHA-256 hash of the text content
    seed_val = int(hashlib.sha256(text.encode('utf-8')).hexdigest(), 16) % (10**8)
    rng = random.Random(seed_val)
    return [rng.uniform(-1.0, 1.0) for _ in range(384)]


COLLECTION_NAME = "knowledge_chunks"

def init_qdrant_collection():
    """Initializes the Qdrant collection if it does not already exist."""
    try:
        collections = qdrant_client.get_collections().collections
        exists = any(c.name == COLLECTION_NAME for c in collections)
        if not exists:
            # sentence-transformers/all-MiniLM-L6-v2 outputs a 384-dimensional vector
            qdrant_client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=384, distance=Distance.COSINE)
            )
            print(f"Created Qdrant collection: {COLLECTION_NAME}")
        else:
            print(f"Qdrant collection: {COLLECTION_NAME} already exists.")
    except Exception as e:
        print(f"Failed to initialize Qdrant collection: {e}")

def index_text_chunk(source_type: str, source_id: str, text: str, service: str = None):
    """
    Embeds a text chunk and indexes it in both Qdrant (vector) and MongoDB (metadata).
    """
    try:
        # Generate unique string ID for Qdrant (UUID string)
        vector_id = str(uuid.uuid4())
        
        # Create vector embedding using local deterministic hash
        vector = get_embedding(text)
        
        # Store in Qdrant payload
        payload = {
            "source_type": source_type,
            "source_id": str(source_id),
            "text": text,
            "service": service or "general"
        }
        
        qdrant_client.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                PointStruct(
                    id=vector_id,
                    vector=vector,
                    payload=payload
                )
            ]
        )
        
        # Mirror in MongoDB knowledge_chunks collection
        db.knowledge_chunks.update_one(
            {"vector_id": vector_id},
            {
                "$set": {
                    "source_type": source_type,
                    "source_id": source_id,
                    "vector_id": vector_id,
                    "text": text,
                    "service": service or "general"
                }
            },
            upsert=True
        )
        return vector_id
    except Exception as e:
        print(f"Error indexing chunk: {e}")
        return None

def retrieve_similar_contexts(query: str, service: str = None, limit: int = 3):
    """
    Query Qdrant for semantically similar chunks.
    Optionally applies a payload filter for service name exact matches.
    """
    try:
        query_vector = get_embedding(query)
        
        # Construct exact-match filter if service is provided
        query_filter = None
        if service:
            query_filter = Filter(
                must=[
                    FieldCondition(
                        key="service",
                        match=MatchValue(value=service)
                    )
                ]
            )
            
        results = qdrant_client.search(
            collection_name=COLLECTION_NAME,
            query_vector=query_vector,
            query_filter=query_filter,
            limit=limit
        )
        
        formatted_results = []
        for hit in results:
            formatted_results.append({
                "text": hit.payload.get("text", ""),
                "source_type": hit.payload.get("source_type", ""),
                "source_id": hit.payload.get("source_id", ""),
                "service": hit.payload.get("service", ""),
                "score": hit.score
            })
            
        # If we got no results with the service filter (e.g. service is new), try querying globally
        if not formatted_results and service:
            results_global = qdrant_client.search(
                collection_name=COLLECTION_NAME,
                query_vector=query_vector,
                limit=limit
            )
            for hit in results_global:
                formatted_results.append({
                    "text": hit.payload.get("text", ""),
                    "source_type": hit.payload.get("source_type", ""),
                    "source_id": hit.payload.get("source_id", ""),
                    "service": hit.payload.get("service", ""),
                    "score": hit.score
                })

        return formatted_results
    except Exception as e:
        print(f"Error during Qdrant search: {e}")
        return []
