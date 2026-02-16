import sys
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Add the current directory to sys.path to allow importing siblings
sys.path.insert(0, os.path.dirname(__file__))

from config import PORT, FRONTEND_BASE_URL
from database import init_db
from routes import router
from middleware import RateLimitMiddleware, WalletAuthMiddleware

# Initialize database globally to ensure it runs immediately on cold starts
try:
    init_db()
except Exception as e:
    print(f"CRITICAL: Failed to initialize database: {e}")

app = FastAPI(title="mikuu", version="1.0.0")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log the full error to Vercel logs
    print(f"ERROR: Global Exception Handler caught: {str(exc)}")
    import traceback
    traceback.print_exc()
    return Response(
        content=f"Internal Server Error: {str(exc)}",
        status_code=500,
        headers={"Access-Control-Allow-Origin": "*"}
    )

# Handle CORS via standard middleware below

# Restrict CORS for security
origins = [
    FRONTEND_BASE_URL,
    "http://localhost:5173", # Vite default
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins to unblock deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting: 60 requests per minute per IP
app.add_middleware(RateLimitMiddleware, max_requests=60, window_seconds=60)

# Wallet auth: require X-Wallet-Address on mutating requests
app.add_middleware(WalletAuthMiddleware)

# We include the router WITHOUT the /api prefix because Vercel 
# handles the /api mapping at the gateway level.
app.include_router(router, prefix="")


@app.get("/")
def root():
    return {
        "status": "running",
        "service": "mikuu-backend",
        "version": "v3.0-PROD",
        "message": "mikuu is confidential and ready"
    }


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    print(f"server listening on :{PORT}")
    uvicorn.run("index:app", host="0.0.0.0", port=PORT, reload=True)
