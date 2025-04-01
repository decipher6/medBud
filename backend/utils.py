from datetime import datetime, timedelta
from bson import ObjectId

def parse_date_range(start_date=None, end_date=None):
    """Parse date range or provide defaults"""
    end = datetime.now() if end_date is None else end_date
    
    # Default to last 30 days if no start date provided
    if start_date is None:
        start = end - timedelta(days=30)
    else:
        start = start_date
        
    return start, end

def validate_object_id(id_str: str):
    """Validate if a string is a valid ObjectId"""
    if not ObjectId.is_valid(id_str):
        return False
    return True
