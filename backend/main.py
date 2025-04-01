from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pymongo import MongoClient
import os

from routes import symptoms, medications, reports, users


# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="Symptom Tracker API",
    description="API for tracking symptoms, medications, and generating reports",
    version="1.0.0"
)

# Configure CORS
origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:8000",
    "*",  # For development - remove in production
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection events
@app.on_event("startup")
def startup_db_client():
    app.mongodb_client = MongoClient(os.getenv("MONGODB_URI"))
    app.database = app.mongodb_client[os.getenv("DATABASE_NAME")]
    print("Connected to the MongoDB database!")

@app.on_event("shutdown")
def shutdown_db_client():
    app.mongodb_client.close()

# Include routers
app.include_router(symptoms.router, tags=["symptoms"], prefix="/api/symptoms")
app.include_router(medications.router, tags=["medications"], prefix="/api/medications")
app.include_router(reports.router, tags=["reports"], prefix="/api/reports")
app.include_router(users.router, tags=["users"], prefix="/api/users")

# Root endpoint
@app.get("/", tags=["root"])
async def read_root():
    return {"message": "Welcome to the Symptom Tracker API"}
