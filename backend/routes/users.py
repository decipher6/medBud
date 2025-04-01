from fastapi import APIRouter, HTTPException, Body, Request
from bson import ObjectId
from datetime import datetime

from models import UserModel, UserCreate
from utils import validate_object_id

router = APIRouter()

@router.post("/", response_description="Create new user")
def create_user(request: Request, user: UserCreate = Body(...)):
    """Create a new user"""
    user_data = user.dict()
    user_data["created_at"] = datetime.now()
    
    # Check if user with this email already exists
    if request.app.database.get_collection("users").find_one({"email": user_data["email"]}):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Insert user into database
    users_collection = request.app.database.get_collection("users")
    new_user = users_collection.insert_one(user_data)
    created_user = users_collection.find_one({"_id": new_user.inserted_id})
    
    # Convert ObjectId to string for the response
    created_user["_id"] = str(created_user["_id"])
    
    return created_user

@router.get("/{user_id}", response_description="Get a user by ID")
def get_user(request: Request, user_id: str):
    """Get a user by their ID"""
    if not validate_object_id(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID")
    
    users_collection = request.app.database.get_collection("users")
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    
    if not user:
        raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
    
    # Convert ObjectId to string
    user["_id"] = str(user["_id"])
    
    return user

@router.get("/", response_description="List all users")
def list_users(request: Request, skip: int = 0, limit: int = 100):
    """Get a list of all users"""
    users_collection = request.app.database.get_collection("users")
    users = list(users_collection.find().skip(skip).limit(limit))
    
    # Convert ObjectId to string for each user
    for user in users:
        user["_id"] = str(user["_id"])
    
    return users
