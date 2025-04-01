from pymongo import MongoClient
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
DATABASE_NAME = os.getenv("DATABASE_NAME")

# MongoDB client
client = MongoClient(MONGODB_URI)
database = client[DATABASE_NAME]

# Collections
symptoms_collection = database.get_collection("symptoms")
medications_collection = database.get_collection("medications")
users_collection = database.get_collection("users")
