from fastapi import APIRouter, HTTPException, Query, Path, Request
from typing import Optional
from datetime import datetime, timedelta
from bson import ObjectId
import os
from groq import Groq

from models import ReportQuery
from utils import parse_date_range, validate_object_id

router = APIRouter()

@router.get("/{user_id}", response_description="Generate report for a user")
def generate_report(
    request: Request,
    user_id: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    report_format: str = "summary"
):
    """
    Fetch data for a given date range and generate a report using Groq API.
    If no date range is specified, it uses the last 30 days.
    """
    if not validate_object_id(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID")
    
    # Parse date range or use defaults
    start, end = parse_date_range(start_date, end_date)
    
    # Query symptoms for the user within the date range
    symptoms_collection = request.app.database.get_collection("symptoms")
    medications_collection = request.app.database.get_collection("medications")
    
    symptoms_query = {
        "user_id": user_id,
        "timestamp": {"$gte": start, "$lte": end}
    }
    
    symptoms = list(symptoms_collection.find(symptoms_query))
    medications = list(medications_collection.find({"user_id": user_id}))

    # if symptom and medication data is empty, raise an error and return 404
    if not symptoms:
        raise HTTPException(status_code=404, detail="No data found for the specified user and date range")
    
    # Convert ObjectIds to strings
    for symptom in symptoms:
        symptom["_id"] = str(symptom["_id"])
    
    for medication in medications:
        medication["_id"] = str(medication["_id"])
    
    # Prepare data for the report
    symptom_data = [
        {
            "details": s["details"],
            "severity": s["severity"],
            "timestamp": s["timestamp"].isoformat() if isinstance(s["timestamp"], datetime) else s["timestamp"]
        } for s in symptoms
    ]


    
    medication_data = [
        {
            "name": m["name"],
            "frequency": m["frequency"],
            "adherence": m.get("adherence", 0)
        } for m in medications
    ]
    
    # Initialize Groq client
    try:
        groq_api_key = os.environ.get("GROQ_API_KEY")
        if not groq_api_key:
            raise HTTPException(status_code=500, detail="GROQ_API_KEY not found in environment variables")
        
        client = Groq(api_key=groq_api_key)
        
        system_prompt = """You are a medical report generator that creates clear, well-structured health reports.

        Always organize the report using these exact sections and format:

        ### HEALTH SUMMARY
        [Overview of the patient's health during this period]

        ### SYMPTOM PATTERNS
        [List symptoms in the exact same manner with severity patterns]

        ### MEDICATION REVIEW
        [Summarize medication usage]

        ### CORRELATIONS
        [Note any correlations between symptoms and medications, if there are no clear ones you don't have to put much here]

        ### RECOMMENDATIONS
        [General health recommendations]

        FORMAT REQUIREMENTS:
        - Each section title must be preceded by exactly three # symbols (### )
        - Keep paragraphs short and clear.
        - Use plain language and avoid medical jargon
        - Do not use complex markdown formatting, just basic section headers
        - Be objective and factual in your assessment
        - The report should be readable at a glance

        IMPORTANT: The report must be simple but professional, like a standard medical report. Do not add any decorative elements or unnecessary formatting."""

        user_content = f"""
        Generate a detailed, professionally formatted health report timeline for the period from **{start.strftime('%B %d, %Y')}** to **{end.strftime('%B %d, %Y')}**.

        # SYMPTOMS DATA:
        {symptom_data}

        # MEDICATIONS DATA:
        {medication_data}

        Report format requested: {report_format}

        Ensure the report uses proper hierarchical headings, bold for important information, italics for supporting details, and maintains a consistent formatting style throughout. Include clear section dividers and organize information in a logical flow that will render well in a PDF document.
        """
        
        # Call Groq API
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": user_content
                }
            ],
            model="llama-3.3-70b-versatile",
        )
        
        # Extract the generated report
        generated_report = chat_completion.choices[0].message.content
        
        return {
            "user_id": user_id,
            "report_period": {
                "start_date": start.isoformat(),
                "end_date": end.isoformat()
            },
            "generated_report": generated_report,
            "data_summary": {
                "symptoms_count": len(symptoms),
                "medications_count": len(medications)
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")

@router.get("/{user_id}/pdf", response_description="Generate PDF report for a user")
def generate_pdf_report(
    request: Request,
    user_id: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
):
    """
    Generate a PDF report for the user's health data within the specified date range.
    """
    # First get the report content using the existing endpoint
    report_data = generate_report(request, user_id, start_date, end_date, report_format="detailed")
    
    try:
        from fpdf import FPDF
        
        # Create PDF
        pdf = FPDF()
        pdf.add_page()
        
        # Set up the PDF
        pdf.set_font("Arial", "B", 16)
        pdf.cell(190, 10, "Health Report", ln=True, align="C")
        
        # Add period
        pdf.set_font("Arial", "I", 12)
        pdf.cell(190, 10, f"Period: {report_data['report_period']['start_date']} to {report_data['report_period']['end_date']}", ln=True)
        
        # Add report content
        pdf.set_font("Arial", "", 12)
        
        # Split the report into lines to properly format in PDF
        report_text = report_data["generated_report"]
        pdf.multi_cell(190, 10, report_text)
        
        # Generate the PDF in memory
        pdf_output = pdf.output(dest="S").encode("latin1")
        
        # Create a FastAPI response with the PDF
        from fastapi.responses import Response
        return Response(
            content=pdf_output,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=health_report_{user_id}.pdf"
            }
        )
    except ImportError:
        # If FPDF is not installed
        raise HTTPException(status_code=500, detail="PDF generation library not available")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating PDF report: {str(e)}")
