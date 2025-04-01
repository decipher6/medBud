from fastapi import APIRouter, HTTPException, Body, Path, Query, Request
from typing import List
from datetime import datetime
from bson import ObjectId

from models import MedicationModel, MedicationCreate, MedicationUpdate
from utils import validate_object_id

router = APIRouter()

@router.post("/", response_description="Add new medication")
def create_medication(request: Request, user_id: str, medication: MedicationCreate = Body(...)):
    """Add a new medication for a specific user"""
    if not validate_object_id(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID")
    
    medication_data = medication.dict()
    medication_data["user_id"] = user_id
    medication_data["created_at"] = datetime.now()
    medication_data["updated_at"] = datetime.now()
    
    medications_collection = request.app.database.get_collection("medications")
    new_medication = medications_collection.insert_one(medication_data)
    created_medication = medications_collection.find_one({"_id": new_medication.inserted_id})
    
    # Convert ObjectId to string
    created_medication["_id"] = str(created_medication["_id"])
    
    return created_medication

@router.get("/{user_id}", response_description="List all medications for a user")
def list_medications(request: Request, user_id: str, skip: int = 0, limit: int = 100):
    """Get all medications for a specific user"""
    if not validate_object_id(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID")
    
    medications_collection = request.app.database.get_collection("medications")
    medications = list(medications_collection.find({"user_id": user_id}).skip(skip).limit(limit))
    
    # Convert ObjectId to string for each medication
    for medication in medications:
        medication["_id"] = str(medication["_id"])
    
    return medications

@router.put("/{medication_id}", response_description="Update a medication")
def update_medication(
    request: Request,
    medication_id: str, 
    user_id: str,
    medication: MedicationUpdate = Body(...)
):
    """Update a medication for a specific user"""
    if not validate_object_id(medication_id) or not validate_object_id(user_id):
        raise HTTPException(status_code=400, detail="Invalid ID format")
    
    # Filter out None values
    update_data = {k: v for k, v in medication.dict().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Add updated timestamp
    update_data["updated_at"] = datetime.now()
    
    medications_collection = request.app.database.get_collection("medications")
    
    # Ensure the medication belongs to the user
    medication_exists = medications_collection.find_one({
        "_id": ObjectId(medication_id),
        "user_id": user_id
    })
    
    if not medication_exists:
        raise HTTPException(status_code=404, detail="Medication not found or does not belong to user")
    
    medications_collection.update_one(
        {"_id": ObjectId(medication_id)}, 
        {"$set": update_data}
    )
    
    updated_medication = medications_collection.find_one({"_id": ObjectId(medication_id)})
    
    # Convert ObjectId to string
    updated_medication["_id"] = str(updated_medication["_id"])
    
    return updated_medication

@router.delete("/{medication_id}", response_description="Delete a medication")
def delete_medication(request: Request, medication_id: str, user_id: str):
    """Delete a medication for a specific user"""
    if not validate_object_id(medication_id) or not validate_object_id(user_id):
        raise HTTPException(status_code=400, detail="Invalid ID format")
    
    medications_collection = request.app.database.get_collection("medications")
    
    # Ensure the medication belongs to the user
    medication = medications_collection.find_one({
        "_id": ObjectId(medication_id),
        "user_id": user_id
    })
    
    if not medication:
        raise HTTPException(status_code=404, detail="Medication not found or does not belong to user")
    
    delete_result = medications_collection.delete_one({"_id": ObjectId(medication_id)})
    
    if delete_result.deleted_count == 1:
        return {"message": "Medication deleted successfully"}
    
    raise HTTPException(status_code=500, detail="Failed to delete medication")
