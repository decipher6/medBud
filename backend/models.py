from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional, List, Any, Dict
from datetime import datetime
from bson import ObjectId

# Custom ObjectId field for Pydantic v2
class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)
    
    # Replace __modify_schema__ with __get_pydantic_json_schema__
    @classmethod
    def __get_pydantic_json_schema__(cls, _schema_generator):
        return {"type": "string"}

# User Model
class UserModel(BaseModel):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    username: str
    email: str
    created_at: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(
        populate_by_name=True,  # Replaces allow_population_by_field_name
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

# Symptom Model
class SymptomModel(BaseModel):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    user_id: str
    details: str
    severity: int = Field(ge=1, le=10)
    timestamp: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

class SymptomCreate(BaseModel):
    name : str
    details: str
    severity: int = Field(ge=1, le=10)

# Medication Model
class MedicationModel(BaseModel):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    user_id: str
    name: str
    dosage: str
    frequency: str
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

class MedicationCreate(BaseModel):
    name: str
    dosage: str
    frequency: str

class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None

# Report Query Model
class ReportQuery(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    unique_id_from_auth: str
    
class UserResponse(BaseModel):
    id: str
    username: str
    email: EmailStr
