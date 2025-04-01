from fastapi import APIRouter, HTTPException, Body, Query, Path, Request
from typing import List
from datetime import datetime
from bson import ObjectId

# Use relative imports for local modules
from models import SymptomModel, SymptomCreate
from utils import validate_object_id

router = APIRouter()

@router.post("/", response_description="Add new symptom")
def create_symptom(request: Request, user_id: str, symptom: SymptomCreate = Body(...)):
    """Add a new symptom for a specific user"""
    if not validate_object_id(user_id):
        print("user id validation failed")
        raise HTTPException(status_code=400, detail="Invalid user ID")
    
    print(symptom)
    symptom_data = symptom.dict()
    symptom_data["user_id"] = user_id
    symptom_data["timestamp"] = datetime.now()

    print(user_id)
    
    symptoms_collection = request.app.database.get_collection("symptoms")
    new_symptom = symptoms_collection.insert_one(symptom_data)
    created_symptom = symptoms_collection.find_one({"_id": new_symptom.inserted_id})
    
    # Convert ObjectId to string for the response
    created_symptom["_id"] = str(created_symptom["_id"])
    
    return created_symptom

@router.get("/{user_id}", response_description="List all symptoms for a user")
def list_symptoms(
    request: Request,
    user_id: str,
    skip: int = 0,
    limit: int = 100,
    start_date: datetime = None,
    end_date: datetime = None
):
    """Get all symptoms for a specific user with optional date filtering"""
    if not validate_object_id(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID")
    
    query = {"user_id": user_id}
    
    # Add date range filtering if provided
    if start_date or end_date:
        date_filter = {}
        if start_date:
            date_filter["$gte"] = start_date
        if end_date:
            date_filter["$lte"] = end_date
        
        if date_filter:
            query["timestamp"] = date_filter
    
    symptoms_collection = request.app.database.get_collection("symptoms")
    symptoms = list(symptoms_collection.find(query).skip(skip).limit(limit))
    
    # Convert ObjectId to string for each symptom
    for symptom in symptoms:
        symptom["_id"] = str(symptom["_id"])
    
    return symptoms
