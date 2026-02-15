from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from config import PORT, FRONTEND_BASE_URL
from database import init_db
from routes import router
from middleware import RateLimitMiddleware, WalletAuthMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    # initialize database on startup
    init_db()
    yield

app = FastAPI(title="payme", version="1.0.0", lifespan=lifespan)

# Restrict CORS for security
origins = [
    FRONTEND_BASE_URL,
    "http://localhost:5173", # Vite default
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if FRONTEND_BASE_URL == "*" else origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting: 60 requests per minute per IP
app.add_middleware(RateLimitMiddleware, max_requests=60, window_seconds=60)

# Wallet auth: require X-Wallet-Address on mutating requests
app.add_middleware(WalletAuthMiddleware)

app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    print(f"server listening on :{PORT}")
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
