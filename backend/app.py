import os
import io
import json
import uuid
import logging
import socket
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from pathlib import Path

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge

import google.generativeai as genai
from PIL import Image
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.enums import TA_LEFT, TA_CENTER

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_CONTENT_LENGTH', 52428800))
app.config['UPLOAD_FOLDER'] = 'temp_uploads'
app.config['PDF_FOLDER'] = os.getenv('PDF_OUTPUT_FOLDER', 'pdf_reports')
ALLOWED_EXTENSIONS = set(os.getenv('ALLOWED_EXTENSIONS', 'jpg,jpeg,png').split(','))
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
SESSION_TIMEOUT = int(os.getenv('SESSION_TIMEOUT', 3600))

# Parse allowed origins and ensure they're properly formatted
allowed_origins_str = os.getenv('ALLOWED_ORIGINS', 'http://localhost:19000')
ALLOWED_ORIGINS = [origin.strip() for origin in allowed_origins_str.split(',')]

# Configure CORS with proper error handling
try:
    CORS(app, resources={
        r"/*": {
            "origins": ALLOWED_ORIGINS,
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type"],
            "supports_credentials": True
        }
    })
    logger.info(f"✅ CORS configured with origins: {ALLOWED_ORIGINS}")
except Exception as e:
    logger.error(f"❌ CORS configuration failed: {str(e)}")
    raise

# Create necessary directories
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['PDF_FOLDER'], exist_ok=True)

# In-memory session storage (use Redis/database for production)
sessions = {}


def get_local_ip() -> str:
    """Get the local IP address of this machine."""
    try:
        # Create a socket connection to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception as e:
        logger.warning(f"⚠️  Could not determine local IP: {e}")
        return "unknown"


def cleanup_old_sessions():
    """Remove expired sessions."""
    current_time = datetime.now()
    expired = [
        sid for sid, data in sessions.items()
        if current_time - data.get('created_at', current_time) > timedelta(seconds=SESSION_TIMEOUT)
    ]
    for sid in expired:
        del sessions[sid]
        logger.info(f"🗑️  Cleaned up expired session: {sid}")


def validate_environment() -> Tuple[bool, Optional[str]]:
    """Validate required environment variables."""
    if not GEMINI_API_KEY:
        return False, "Missing environment variable: GEMINI_API_KEY"
    
    if not ALLOWED_ORIGINS:
        return False, "Missing environment variable: ALLOWED_ORIGINS"
    
    return True, None


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed."""
    if not filename:
        return False
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def initialize_gemini() -> Optional[genai.GenerativeModel]:
    """Initialize Gemini AI model with error handling."""
    try:
        if not GEMINI_API_KEY:
            logger.error("❌ GEMINI_API_KEY not found in environment")
            return None
            
        genai.configure(api_key=GEMINI_API_KEY)
        
        # Try experimental model first, fallback to stable
        try:
            model = genai.GenerativeModel('gemini-flash-latest')
            logger.info("✅ Gemini 2.0 Flash (Experimental) initialized")
        except Exception as e:
            logger.warning(f"⚠️  Gemini 2.0 Flash unavailable: {e}")
            model = genai.GenerativeModel('gemini-1.5-pro')
            logger.info("✅ Gemini 1.5 Pro initialized (fallback)")
        
        return model
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize Gemini: {str(e)}")
        return None


def detect_room_items(images: List[bytes], room_type: str) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Detect items/areas in room photos that need organization.
    
    Args:
        images: List of image binary data
        room_type: Type of room (bedroom, kitchen, living_room)
    
    Returns:
        Dict with detected items or error message
    """
    if not images:
        return None, "No images provided"
    
    if not room_type:
        return None, "Room type not specified"
    
    try:
        model = initialize_gemini()
        if not model:
            return None, "Failed to initialize Gemini AI - check API key"
        
        # Load images with validation
        pil_images = []
        for idx, img_data in enumerate(images):
            try:
                if not img_data or len(img_data) == 0:
                    logger.warning(f"⚠️  Empty image data at index {idx}")
                    continue
                    
                img = Image.open(io.BytesIO(img_data))
                pil_images.append(img)
                logger.info(f"✅ Loaded image {idx + 1}: {img.size} {img.format}")
                
            except Exception as e:
                logger.warning(f"⚠️  Failed to load image {idx}: {e}")
        
        if not pil_images:
            return None, "No valid images could be loaded"
        
        # Room-specific detection prompt
        prompt = f"""
        You are analyzing a {room_type.replace('_', ' ')}. Look at all the images provided.
        
        Identify 2-4 SPECIFIC AREAS or ITEMS that need organization. Focus on:
        - Storage areas (closets, drawers, cabinets)
        - Furniture pieces (dresser, shelves, counters)
        - Functional zones (desk area, seating area, cooking area)
        
        Return ONLY a JSON array of objects with this exact structure:
        [
          {{"name": "Closet", "reason": "Contains clothes and needs organization"}},
          {{"name": "Dresser", "reason": "Drawers appear cluttered"}},
          {{"name": "Nightstand", "reason": "Surface has multiple items"}}
        ]
        
        Rules:
        - Return 2-4 items maximum
        - Use simple, clear names (1-2 words)
        - Be specific to what you see
        - Return ONLY the JSON array, no other text
        """
        
        logger.info(f"🔍 Detecting items in {room_type} with {len(pil_images)} images...")
        response = model.generate_content([prompt] + pil_images)
        
        if not response or not response.text:
            return None, "Gemini returned empty response"
        
        # Parse JSON response
        response_text = response.text.strip()
        
        # Remove markdown code blocks if present
        if response_text.startswith('```'):
            lines = response_text.split('\n')
            response_text = '\n'.join(lines[1:-1])  # Remove first and last line
            if response_text.startswith('json'):
                response_text = response_text[4:].strip()
        
        response_text = response_text.strip()
        
        try:
            items = json.loads(response_text)
        except json.JSONDecodeError as je:
            logger.error(f"❌ JSON parse error: {je}")
            logger.error(f"Response was: {response_text[:200]}")
            return None, f"Failed to parse AI response as JSON: {str(je)}"
        
        # Validate response structure
        if not isinstance(items, list):
            return None, "AI response was not a list"
        
        if len(items) == 0:
            return None, "No items detected in images"
        
        for item in items:
            if not isinstance(item, dict) or 'name' not in item:
                return None, "Invalid item format in AI response"
        
        logger.info(f"✅ Detected {len(items)} items: {[i['name'] for i in items]}")
        
        return {'items': items}, None
        
    except json.JSONDecodeError as e:
        logger.error(f"❌ JSON parse error: {e}")
        return None, f"Failed to parse AI response: {str(e)}"
    except Exception as e:
        logger.error(f"❌ Item detection failed: {str(e)}", exc_info=True)
        return None, f"Item detection error: {str(e)}"


def analyze_specific_area(
    images: List[bytes],
    area_name: str,
    room_type: str,
    photo_labels: List[str]
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Analyze specific area (closet, dresser, etc.) and generate question.
    
    Returns:
        Dict with question for user
    """
    if not images:
        return None, "No images provided"
    
    if not area_name:
        return None, "Area name not specified"
    
    try:
        model = initialize_gemini()
        if not model:
            return None, "Failed to initialize Gemini AI"
        
        pil_images = []
        for idx, img_data in enumerate(images):
            try:
                if not img_data or len(img_data) == 0:
                    continue
                img = Image.open(io.BytesIO(img_data))
                pil_images.append(img)
            except Exception as e:
                logger.warning(f"⚠️  Failed to load image {idx}: {e}")
        
        if not pil_images:
            return None, "No valid images could be loaded"
        
        # Generate contextual question
        prompt = f"""
        You are analyzing the {area_name} in a {room_type.replace('_', ' ')}.
        
        Photo types provided: {', '.join(photo_labels) if photo_labels else 'General photos'}
        
        Based on what you see, generate ONE specific question to ask the user about their intentions.
        
        Examples:
        - "What are your main goals for organizing this closet?"
        - "How do you primarily use this dresser?"
        - "What items do you want to keep easily accessible here?"
        
        Return ONLY a JSON object:
        {{
          "question": "Your question here",
          "context": "Brief description of what you see (2-3 sentences)"
        }}
        """
        
        logger.info(f"🤔 Generating question for {area_name}...")
        response = model.generate_content([prompt] + pil_images)
        
        if not response or not response.text:
            return None, "Gemini returned empty response"
        
        response_text = response.text.strip()
        
        # Remove markdown code blocks
        if response_text.startswith('```'):
            lines = response_text.split('\n')
            response_text = '\n'.join(lines[1:-1])
            if response_text.startswith('json'):
                response_text = response_text[4:].strip()
        
        response_text = response_text.strip()
        
        try:
            result = json.loads(response_text)
        except json.JSONDecodeError as je:
            logger.error(f"❌ JSON parse error: {je}")
            return None, f"Failed to parse AI response: {str(je)}"
        
        # Validate response
        if not isinstance(result, dict) or 'question' not in result:
            return None, "Invalid response format from AI"
        
        logger.info(f"✅ Generated question for {area_name}")
        
        return result, None
        
    except Exception as e:
        logger.error(f"❌ Area analysis failed: {str(e)}", exc_info=True)
        return None, f"Area analysis error: {str(e)}"


def generate_area_recommendations(
    images: List[bytes],
    area_name: str,
    room_type: str,
    user_intention: str,
    photo_labels: List[str]
) -> Tuple[Optional[str], Optional[str]]:
    """
    Generate specific recommendations based on user's stated intention.
    """
    if not user_intention:
        return None, "User intention not provided"
    
    try:
        model = initialize_gemini()
        if not model:
            return None, "Failed to initialize Gemini AI"
        
        # Load images (optional for this step)
        pil_images = []
        for img_data in images:
            try:
                if img_data and len(img_data) > 0:
                    pil_images.append(Image.open(io.BytesIO(img_data)))
            except:
                pass
        
        prompt = f"""
        You are an expert home organizer analyzing a {area_name} in a {room_type.replace('_', ' ')}.
        
        Photo types: {', '.join(photo_labels) if photo_labels else 'General photos'}
        User's intention: "{user_intention}"
        
        Provide SPECIFIC, ACTIONABLE recommendations (3-5 steps) to help them achieve their goal.
        
        Format as a numbered list:
        1. [Specific action with measurements/details]
        2. [Next action]
        ...
        
        Be direct, specific, and practical. Include product suggestions when relevant.
        Keep it concise (200-300 words max).
        """
        
        logger.info(f"💡 Generating recommendations for {area_name}...")
        
        content_list = [prompt]
        if pil_images:
            content_list.extend(pil_images)
        
        response = model.generate_content(content_list)
        
        if not response or not response.text:
            return None, "Gemini returned empty response"
        
        recommendations = response.text.strip()
        
        if not recommendations or len(recommendations) < 20:
            return None, "Generated recommendations were too short"
        
        logger.info(f"✅ Generated recommendations for {area_name} ({len(recommendations)} chars)")
        
        return recommendations, None
        
    except Exception as e:
        logger.error(f"❌ Recommendation generation failed: {str(e)}", exc_info=True)
        return None, f"Recommendation error: {str(e)}"


def format_measurements_summary(session_data: Dict) -> str:
    """Build a markdown summary of all captured measurements."""
    lines = ["## Space Measurements Summary\n"]

    measurements = session_data.get('measurements', {})
    if not measurements:
        lines.append("No measurements were recorded during this session.\n")
        return ''.join(lines)

    for area_key, data in measurements.items():
        area_name = data.get('area_name', area_key)
        unit = data.get('unit', 'in')
        unit_label = 'inches' if unit == 'in' else 'centimeters'
        profiles = data.get('shelf_profiles', [])

        if data.get('skipped'):
            lines.append(f"### {area_name}\n")
            lines.append("*Measurements were skipped for this area.*\n\n")
            continue

        if not profiles:
            continue

        lines.append(f"### {area_name}\n")
        lines.append(f"Unit: {unit_label}\n\n")

        for idx, profile in enumerate(profiles, start=1):
            width = profile.get('width', '?')
            depth = profile.get('depth', '?')
            height = profile.get('height', '?')
            count = profile.get('count', 1)
            lines.append(
                f"- **Size {idx}:** {width} × {depth} × {height} "
                f"({unit_label}, W × D × H clearance) — **{count}** shelf(s)\n"
            )
        lines.append("\n")

    return ''.join(lines)


def generate_final_report(session_data: Dict) -> Tuple[Optional[str], Optional[str]]:
    """
    Generate comprehensive final report with all recommendations.
    
    Returns:
        (report_text, error)
    """
    try:
        model = initialize_gemini()
        if not model:
            return None, "Failed to initialize Gemini AI"
        
        # Validate session data
        if not session_data.get('rooms'):
            return None, "No room data available in session"
        
        # Compile all data from session
        room_summaries = []
        for room in session_data.get('rooms', []):
            room_type = room.get('type', 'Unknown')
            areas = room.get('areas', [])
            
            if not areas:
                logger.warning(f"⚠️  Room {room_type} has no areas")
                continue
            
            room_summary = f"\n## {room_type.replace('_', ' ').title()}\n\n"
            for area in areas:
                room_summary += f"### {area.get('name', 'Area')}\n"
                room_summary += f"**User Goal:** {area.get('user_intention', 'Not specified')}\n\n"
                room_summary += f"{area.get('recommendations', 'No recommendations generated.')}\n\n"
            
            room_summaries.append(room_summary)
        
        if not room_summaries:
            return None, "No room summaries available to generate report"

        measurements_summary = format_measurements_summary(session_data)

        # Create comprehensive prompt
        prompt = f"""
        You are creating a final comprehensive home organization report.
        
        Here are the individual area recommendations:
        {''.join(room_summaries)}

        Here are the space measurements captured by the user:
        {measurements_summary}
        
        Create a professional, well-structured final report with these sections:
        
        # 🏠 Home Organization Master Plan
        
        ## Executive Summary
        [2-3 paragraph overview of the entire project]
        
        ## Space Measurements Summary
        [Include ALL measurement data from above exactly — list each area with shelf sizes and counts.
        If no measurements were taken, note that and suggest measuring before purchasing organizers.]
        
        ## Room-by-Room Plan
        [Expand on each room with detailed steps, maintaining the structure above but adding:
        - Priority level (High/Medium/Low)
        - Estimated time
        - Shopping list items
        - Before/after expectations]
        
        ## Overall Timeline
        - Week 1: [What to tackle]
        - Week 2: [Next steps]
        - Week 3-4: [Final touches]
        
        ## Shopping List Summary
        [Consolidated list of all needed items with estimated costs]
        
        ## Maintenance Tips
        [5-7 tips to keep organized long-term]
        
        ## Final Encouragement
        [Motivational closing paragraph]
        
        Make it professional, actionable, and encouraging. Use markdown formatting.
        """
        
        logger.info("📝 Generating final comprehensive report...")
        response = model.generate_content(prompt)
        
        if not response or not response.text:
            return None, "Failed to generate report - empty response"
        
        report = response.text.strip()
        
        if len(report) < 100:
            return None, "Generated report was too short"

        # Always append structured measurements so they appear in the final summary
        measurements_block = format_measurements_summary(session_data)
        if measurements_block.strip():
            report = f"{report}\n\n---\n\n{measurements_block}"
        
        logger.info(f"✅ Final report generated ({len(report)} chars)")
        
        return report, None
        
    except Exception as e:
        logger.error(f"❌ Report generation failed: {str(e)}", exc_info=True)
        return None, f"Report generation error: {str(e)}"


def create_pdf_report(report_text: str, session_id: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Convert markdown report to PDF.
    
    Returns:
        (pdf_filepath, error)
    """
    if not report_text:
        return None, "No report text provided"
    
    try:
        # Generate unique filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"home_organization_report_{timestamp}.pdf"
        filepath = os.path.join(app.config['PDF_FOLDER'], filename)
        
        # Ensure PDF folder exists
        os.makedirs(app.config['PDF_FOLDER'], exist_ok=True)
        
        # Create PDF
        doc = SimpleDocTemplate(filepath, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor='#556B6E',
            spaceAfter=30,
            alignment=TA_CENTER
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=16,
            textColor='#556B6E',
            spaceAfter=12,
            spaceBefore=12
        )
        
        body_style = ParagraphStyle(
            'CustomBody',
            parent=styles['BodyText'],
            fontSize=11,
            leading=16,
            spaceAfter=10
        )
        
        # Parse markdown-like text and convert to PDF elements
        lines = report_text.split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                story.append(Spacer(1, 0.2*inch))
                continue
            
            # Remove emojis for PDF
            line = line.replace('🏠', '').replace('🎨', '').replace('📦', '').replace('💡', '')
            
            if line.startswith('# '):
                # Main title
                text = line[2:].strip()
                story.append(Paragraph(text, title_style))
            elif line.startswith('## '):
                # Section heading
                text = line[3:].strip()
                story.append(Spacer(1, 0.3*inch))
                story.append(Paragraph(text, heading_style))
            elif line.startswith('### '):
                # Subsection
                text = line[4:].strip()
                story.append(Paragraph(f"<b>{text}</b>", body_style))
            elif line.startswith('**') and line.endswith('**'):
                # Bold text
                text = line[2:-2]
                story.append(Paragraph(f"<b>{text}</b>", body_style))
            elif line.startswith('- ') or line.startswith('* '):
                # Bullet point
                text = line[2:]
                story.append(Paragraph(f"• {text}", body_style))
            elif len(line) > 0 and line[0].isdigit() and len(line) > 1 and line[1:3] in ['. ', ') ']:
                # Numbered list
                story.append(Paragraph(line, body_style))
            else:
                # Regular paragraph
                story.append(Paragraph(line, body_style))
        
        # Build PDF
        doc.build(story)
        logger.info(f"✅ PDF created: {filepath}")
        
        return filepath, None
        
    except Exception as e:
        logger.error(f"❌ PDF creation failed: {str(e)}", exc_info=True)
        return None, f"PDF creation error: {str(e)}"


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle file too large errors."""
    logger.warning(f"⚠️  File upload too large")
    return jsonify({
        'success': False,
        'error': 'File size exceeds maximum allowed size (50MB)'
    }), 413


@app.errorhandler(500)
def internal_server_error(error):
    """Handle internal server errors."""
    logger.error(f"❌ Internal server error: {error}")
    return jsonify({
        'success': False,
        'error': 'Internal server error occurred'
    }), 500


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint with network diagnostics."""
    cleanup_old_sessions()
    is_valid, error = validate_environment()
    
    local_ip = get_local_ip()
    
    return jsonify({
        'status': 'healthy' if is_valid else 'degraded',
        'timestamp': datetime.now().isoformat(),
        'environment_valid': is_valid,
        'active_sessions': len(sessions),
        'server_ip': local_ip,
        'allowed_origins': ALLOWED_ORIGINS,
        'error': error
    }), 200 if is_valid else 500


@app.route('/session/create', methods=['POST'])
def create_session():
    """Create new user session."""
    try:
        session_id = str(uuid.uuid4())
        sessions[session_id] = {
            'id': session_id,
            'created_at': datetime.now(),
            'rooms': [],
            'measurements': {},
            'current_room_index': 0,
            'current_area_index': 0
        }
        
        logger.info(f"✅ Created session: {session_id}")
        return jsonify({
            'success': True,
            'session_id': session_id
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Session creation failed: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f"Session creation failed: {str(e)}"
        }), 500


@app.route('/room/detect-items', methods=['POST'])
def detect_items():
    """Detect items in room photos."""
    try:
        session_id = request.form.get('session_id')
        room_type = request.form.get('room_type')
        
        logger.info(f"📥 Received detect-items request: session={session_id}, room={room_type}")
        
        if not session_id or session_id not in sessions:
            logger.warning(f"⚠️  Invalid session: {session_id}")
            return jsonify({
                'success': False,
                'error': f'Invalid session ID: {session_id}'
            }), 400
        
        if not room_type:
            return jsonify({
                'success': False,
                'error': 'Room type required'
            }), 400
        
        # Get uploaded images
        images = []
        file_keys = sorted([k for k in request.files.keys() if k.startswith('image')])
        
        if not file_keys:
            return jsonify({
                'success': False,
                'error': 'No images provided in request'
            }), 400
        
        for key in file_keys:
            file = request.files[key]
            
            if not allowed_file(file.filename):
                logger.warning(f"⚠️  Invalid file type: {file.filename}")
                continue
            
            file_data = file.read()
            if len(file_data) == 0:
                logger.warning(f"⚠️  Empty file: {file.filename}")
                continue
                
            images.append(file_data)
            logger.info(f"✅ Loaded file: {file.filename} ({len(file_data)} bytes)")
        
        if not images:
            return jsonify({
                'success': False,
                'error': 'No valid images provided'
            }), 400
        
        logger.info(f"📸 Processing {len(images)} images for {room_type}")
        
        # Detect items
        result, error = detect_room_items(images, room_type)
        if error:
            logger.error(f"❌ Detection failed: {error}")
            return jsonify({
                'success': False,
                'error': error
            }), 500
        
        # Store in session
        room_data = {
            'type': room_type,
            'overview_images': len(images),
            'areas': []
        }
        sessions[session_id]['rooms'].append(room_data)
        
        logger.info(f"✅ Detected {len(result['items'])} items")
        
        return jsonify({
            'success': True,
            'items': result['items']
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Item detection endpoint failed: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f"Detection failed: {str(e)}"
        }), 500


@app.route('/area/analyze', methods=['POST'])
def analyze_area():
    """Analyze specific area and generate question."""
    try:
        session_id = request.form.get('session_id')
        area_name = request.form.get('area_name')
        room_type = request.form.get('room_type')
        photo_labels_json = request.form.get('photo_labels', '[]')
        
        logger.info(f"📥 Received analyze-area request: session={session_id}, area={area_name}")
        
        if not session_id or session_id not in sessions:
            return jsonify({
                'success': False,
                'error': 'Invalid session'
            }), 400
        
        if not area_name:
            return jsonify({
                'success': False,
                'error': 'Area name required'
            }), 400
        
        try:
            photo_labels = json.loads(photo_labels_json)
        except json.JSONDecodeError:
            photo_labels = []
        
        # Get images
        images = []
        for key in sorted(request.files.keys()):
            if key.startswith('image'):
                file = request.files[key]
                if allowed_file(file.filename):
                    file_data = file.read()
                    if len(file_data) > 0:
                        images.append(file_data)
        
        if not images:
            return jsonify({
                'success': False,
                'error': 'No valid images provided'
            }), 400
        
        logger.info(f"📸 Analyzing {area_name} with {len(images)} images")
        
        # Analyze and generate question
        result, error = analyze_specific_area(images, area_name, room_type, photo_labels)
        if error:
            return jsonify({
                'success': False,
                'error': error
            }), 500
        
        # Store area data
        session = sessions[session_id]
        current_room = session['rooms'][-1]  # Most recent room
        area_data = {
            'name': area_name,
            'images_count': len(images),
            'photo_labels': photo_labels,
            'question': result.get('question', ''),
            'context': result.get('context', '')
        }

        # Attach measurements if previously saved for this area
        area_measurements = session.get('measurements', {}).get(area_name)
        if area_measurements:
            area_data['measurements'] = area_measurements

        current_room['areas'].append(area_data)
        
        logger.info(f"✅ Generated question for {area_name}")
        
        return jsonify({
            'success': True,
            'question': result.get('question', ''),
            'context': result.get('context', '')
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Area analysis endpoint failed: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f"Analysis failed: {str(e)}"
        }), 500


@app.route('/area/measurements', methods=['POST'])
def save_area_measurements():
    """Save shelf measurements for an area (stored for final report summary)."""
    try:
        data = request.json

        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided'
            }), 400

        session_id = data.get('session_id')
        area_name = data.get('area_name')
        room_type = data.get('room_type')
        unit = data.get('unit', 'in')
        shelf_profiles = data.get('shelf_profiles', [])
        skipped = data.get('skipped', False)

        logger.info(f"📥 Received measurements: session={session_id}, area={area_name}")

        if not session_id or session_id not in sessions:
            return jsonify({
                'success': False,
                'error': 'Invalid session'
            }), 400

        if not area_name:
            return jsonify({
                'success': False,
                'error': 'Area name required'
            }), 400

        if unit not in ('in', 'cm'):
            return jsonify({
                'success': False,
                'error': 'Unit must be "in" or "cm"'
            }), 400

        if not skipped:
            for idx, profile in enumerate(shelf_profiles):
                for field in ('width', 'depth', 'height', 'count'):
                    if field not in profile or profile[field] is None:
                        return jsonify({
                            'success': False,
                            'error': f'Profile {idx + 1} missing {field}'
                        }), 400
                    if field == 'count':
                        if not isinstance(profile[field], int) or profile[field] < 1:
                            return jsonify({
                                'success': False,
                                'error': f'Profile {idx + 1} count must be at least 1'
                            }), 400
                    elif not isinstance(profile[field], (int, float)) or profile[field] <= 0:
                        return jsonify({
                            'success': False,
                            'error': f'Profile {idx + 1} {field} must be greater than 0'
                        }), 400

        session = sessions[session_id]
        if 'measurements' not in session:
            session['measurements'] = {}

        session['measurements'][area_name] = {
            'area_name': area_name,
            'room_type': room_type,
            'unit': unit,
            'shelf_profiles': shelf_profiles,
            'skipped': skipped,
            'saved_at': datetime.now().isoformat()
        }

        logger.info(f"✅ Saved measurements for {area_name} ({len(shelf_profiles)} profile(s))")

        return jsonify({
            'success': True,
            'area_name': area_name,
            'profile_count': len(shelf_profiles)
        }), 200

    except Exception as e:
        logger.error(f"❌ Measurements save failed: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f"Failed to save measurements: {str(e)}"
        }), 500


@app.route('/area/recommendations', methods=['POST'])
def get_recommendations():
    """Generate recommendations based on user intention."""
    try:
        data = request.json
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided'
            }), 400
        
        session_id = data.get('session_id')
        user_intention = data.get('user_intention')
        
        logger.info(f"📥 Received recommendations request: session={session_id}")
        
        if not session_id or session_id not in sessions:
            return jsonify({
                'success': False,
                'error': 'Invalid session'
            }), 400
        
        if not user_intention:
            return jsonify({
                'success': False,
                'error': 'User intention required'
            }), 400
        
        session = sessions[session_id]
        
        if not session.get('rooms') or not session['rooms'][-1].get('areas'):
            return jsonify({
                'success': False,
                'error': 'No area data found in session'
            }), 400
        
        current_room = session['rooms'][-1]
        current_area = current_room['areas'][-1]
        
        # Generate recommendations
        recommendations, error = generate_area_recommendations(
            [],  # Images already analyzed in previous step
            current_area['name'],
            current_room['type'],
            user_intention,
            current_area.get('photo_labels', [])
        )
        
        if error:
            return jsonify({
                'success': False,
                'error': error
            }), 500
        
        # Store in session
        current_area['user_intention'] = user_intention
        current_area['recommendations'] = recommendations
        
        logger.info(f"✅ Generated recommendations for {current_area['name']}")
        
        return jsonify({
            'success': True,
            'recommendations': recommendations
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Recommendations endpoint failed: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f"Recommendations failed: {str(e)}"
        }), 500


@app.route('/report/generate', methods=['POST'])
def generate_report():
    """Generate final comprehensive report."""
    try:
        data = request.json
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided'
            }), 400
        
        session_id = data.get('session_id')
        
        logger.info(f"📥 Received report generation request: session={session_id}")
        
        if not session_id or session_id not in sessions:
            return jsonify({
                'success': False,
                'error': 'Invalid session'
            }), 400
        
        session = sessions[session_id]
        
        if not session.get('rooms'):
            return jsonify({
                'success': False,
                'error': 'No room data available'
            }), 400
        
        # Generate text report
        report_text, error = generate_final_report(session)
        if error:
            return jsonify({
                'success': False,
                'error': error
            }), 500
        
        # Create PDF
        pdf_path, error = create_pdf_report(report_text, session_id)
        if error:
            return jsonify({
                'success': False,
                'error': error
            }), 500
        
        # Store report in session
        session['report'] = {
            'text': report_text,
            'pdf_path': pdf_path,
            'generated_at': datetime.now().isoformat()
        }
        
        logger.info(f"✅ Report generated successfully")
        
        return jsonify({
            'success': True,
            'report': report_text,
            'pdf_filename': os.path.basename(pdf_path)
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Report generation endpoint failed: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f"Report generation failed: {str(e)}"
        }), 500


@app.route('/report/download/<filename>', methods=['GET'])
def download_report(filename):
    """Download PDF report."""
    try:
        # Sanitize filename
        filename = secure_filename(filename)
        filepath = os.path.join(app.config['PDF_FOLDER'], filename)
        
        logger.info(f"📥 Download request for: {filename}")
        
        if not os.path.exists(filepath):
            logger.warning(f"⚠️  File not found: {filepath}")
            return jsonify({
                'success': False,
                'error': 'File not found'
            }), 404
        
        logger.info(f"✅ Sending file: {filepath}")
        
        return send_file(
            filepath,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        logger.error(f"❌ Download failed: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f"Download failed: {str(e)}"
        }), 500


if __name__ == '__main__':
    # Validate environment before starting
    is_valid, error = validate_environment()
    if not is_valid:
        logger.error(f"❌ STARTUP FAILED: {error}")
        print(f"\n❌ ERROR: {error}\n")
        print("Please check your .env file and ensure all required variables are set.")
        exit(1)
    
    port = int(os.getenv('PORT', 5001))
    local_ip = get_local_ip()
    
    print("\n" + "="*70)
    print("🏠 HOME ORGANIZATION APP - BACKEND SERVER")
    print("="*70)
    print(f"✅ Environment validated")
    print(f"🌐 Local IP: {local_ip}")
    print(f"🚀 Server URLs:")
    print(f"   - Localhost: http://localhost:{port}")
    print(f"   - Network:   http://{local_ip}:{port}")
    print(f"📊 Max upload: {app.config['MAX_CONTENT_LENGTH'] / 1024 / 1024:.0f}MB")
    print(f"📁 PDF output: {app.config['PDF_FOLDER']}")
    print(f"🔐 CORS allowed origins:")
    for origin in ALLOWED_ORIGINS:
        print(f"   - {origin}")
    print("="*70)
    print("\n💡 FOR PHYSICAL DEVICE:")
    print(f"   Set API_BASE_URL=http://{local_ip}:{port} in frontend .env")
    print(f"   Make sure your phone is on the same WiFi network")
    print("="*70 + "\n")
    
    # Run server
    app.run(host='0.0.0.0', port=port, debug=True)