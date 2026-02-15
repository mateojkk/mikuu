import sys
import os

# Add the backend directory to sys.path so Vercel can resolve imports
# When deployed as a monorepo, 'backend' is a top-level folder
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../backend'))

try:
    from main import app  # noqa: E402
except ImportError as e:
    print(f"FAILED TO IMPORT BACKEND: {e}")
    print(f"Current path: {sys.path}")
    raise e

# This is the entry point for Vercel
# It imports the FastAPI app from the backend directory
