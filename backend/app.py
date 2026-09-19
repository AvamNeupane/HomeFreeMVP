import os
import io
import json
import re
import uuid
import logging
import socket
import functools
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

import bcrypt
import jwt
import requests
from flask import Flask, request, jsonify, send_file, g
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge

import google.generativeai as genai
from PIL import Image
from session_store import SQLiteSessionStore
from db import PostgresSessionStore, validate_email, validate_password
from natasha_voice import voice_for_tier, CHAT_SYSTEM_PROMPT_TEMPLATE
from products import build_candidate_context, build_product_entry
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
JWT_SECRET = os.getenv('JWT_SECRET', 'dev-only-insecure-secret-change-me')
DATABASE_URL = os.getenv('DATABASE_URL')
TURNSTILE_SECRET_KEY = os.getenv('TURNSTILE_SECRET_KEY')
TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
SMTP_EMAIL = os.getenv('SMTP_EMAIL')
SMTP_APP_PASSWORD = os.getenv('SMTP_APP_PASSWORD')
SMTP_HOST = 'smtp.gmail.com'
SMTP_PORT = 587

# Parse allowed origins and ensure they're properly formatted
allowed_origins_str = os.getenv('ALLOWED_ORIGINS', 'http://localhost:19000')
ALLOWED_ORIGINS = [origin.strip() for origin in allowed_origins_str.split(',')]

# FIX (CORS + credentials bug): `Access-Control-Allow-Origin: *` combined
# with `supports_credentials: True` is invalid per the CORS spec — every
# browser/client silently rejects it, and the request just hangs until it
# times out. That is very likely the "timeout exceeded" you were seeing.
# For local development with ALLOWED_ORIGINS=*, we don't need cookies/auth
# credentials anyway, so credentials support is only enabled when the
# origin list is an explicit set of origins (not a wildcard).
USES_WILDCARD_ORIGIN = '*' in ALLOWED_ORIGINS
CORS_SUPPORTS_CREDENTIALS = not USES_WILDCARD_ORIGIN

if USES_WILDCARD_ORIGIN:
    logger.warning(
        "⚠️  ALLOWED_ORIGINS=* — running wide open for local development. "
        "supports_credentials has been disabled automatically because "
        "wildcard origins + credentials is rejected by every client."
    )

# Configure CORS with proper error handling
try:
    CORS(app, resources={
        r"/*": {
            "origins": ALLOWED_ORIGINS,
            "methods": ["GET", "POST", "PATCH", "OPTIONS"],
            "allow_headers": ["Content-Type"],
            "supports_credentials": CORS_SUPPORTS_CREDENTIALS
        }
    })
    logger.info(f"✅ CORS configured with origins: {ALLOWED_ORIGINS} (credentials={CORS_SUPPORTS_CREDENTIALS})")
except Exception as e:
    logger.error(f"❌ CORS configuration failed: {str(e)}")
    raise

# Create necessary directories
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['PDF_FOLDER'], exist_ok=True)

# Persistent project/session storage. Uses Postgres (Railway) when
# DATABASE_URL is set — this is what enables real user accounts and
# cross-device resume. Falls back to the local SQLite file otherwise, in
# which case /auth/* and /projects (list) are disabled (no user concept)
# but everything else still works exactly as before.
#
# NOTE: Railway's *internal* connection string (host ending in
# .railway.internal) only resolves from inside Railway's own network, not
# from your laptop — if you see a DNS/connection failure here, swap in the
# PUBLIC connection string from the Railway dashboard's Postgres "Connect"
# tab instead. See db.py's module docstring for details.
USING_POSTGRES = bool(DATABASE_URL)
if USING_POSTGRES:
    try:
        sessions = PostgresSessionStore(DATABASE_URL)
        logger.info("✅ Connected to Postgres (Railway) — accounts + resumable projects enabled")
    except Exception as e:
        logger.error(
            f"❌ Could not connect to Postgres at DATABASE_URL ({e}). "
            "Falling back to local SQLite — accounts/login will be unavailable "
            "until DATABASE_URL is reachable. If you're using Railway's "
            "internal hostname (*.railway.internal), swap in the PUBLIC "
            "connection string for local development."
        )
        sessions = SQLiteSessionStore()
        USING_POSTGRES = False
else:
    logger.warning(
        "⚠️  DATABASE_URL not set — using local SQLite with no user accounts. "
        "Set DATABASE_URL in backend/.env to enable login/signup + resumable projects."
    )
    sessions = SQLiteSessionStore()


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
    """Remove expired sessions. Never lets a cleanup failure break /health."""
    try:
        current_time = datetime.now()
        expired = [
            sid for sid, data in sessions.items()
            if current_time - data.get('created_at', current_time) > timedelta(seconds=SESSION_TIMEOUT)
        ]
        for sid in expired:
            del sessions[sid]
            logger.info(f"🗑️  Cleaned up expired session: {sid}")
    except Exception as e:
        logger.warning(f"⚠️  Session cleanup skipped due to error: {e}")


PDF_RETENTION_DAYS = int(os.getenv('PDF_RETENTION_DAYS', 7))


def cleanup_old_pdfs():
    """Delete generated PDFs older than PDF_RETENTION_DAYS — there was no retention policy before, so they accumulated forever."""
    try:
        folder = app.config['PDF_FOLDER']
        if not os.path.isdir(folder):
            return
        cutoff = datetime.now().timestamp() - (PDF_RETENTION_DAYS * 86400)
        for name in os.listdir(folder):
            path = os.path.join(folder, name)
            try:
                if os.path.isfile(path) and os.path.getmtime(path) < cutoff:
                    os.remove(path)
                    logger.info(f"🗑️  Removed old PDF report: {name}")
            except OSError:
                continue
    except Exception as e:
        logger.warning(f"⚠️  PDF cleanup skipped due to error: {e}")


def validate_environment() -> Tuple[bool, Optional[str]]:
    """Validate required environment variables."""
    if not GEMINI_API_KEY:
        return False, "Missing environment variable: GEMINI_API_KEY"

    # Soft sanity check only — real Gemini API keys normally start with
    # "AIza...". This does NOT block startup (key formats can vary by
    # account/region), it just surfaces a clear warning instead of a
    # confusing downstream Gemini failure later.
    if not GEMINI_API_KEY.startswith('AIza'):
        logger.warning(
            "⚠️  GEMINI_API_KEY doesn't look like a typical Gemini API key "
            "(expected it to start with 'AIza...'). If AI calls fail, "
            "double check the key value in backend/.env."
        )

    if not ALLOWED_ORIGINS:
        return False, "Missing environment variable: ALLOWED_ORIGINS"

    return True, None


# ============================================================================
# AUTH HELPERS
# ============================================================================

TOKEN_TTL_DAYS = 30


def generate_token(user_id: str) -> str:
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(days=TOKEN_TTL_DAYS),
        'iat': datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')


def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        return payload.get('user_id')
    except jwt.PyJWTError:
        return None


def require_auth(fn):
    """Decorator: requires a valid 'Authorization: Bearer <token>' header."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if not USING_POSTGRES:
            return jsonify({
                'success': False,
                'error': 'Accounts are unavailable — DATABASE_URL is not configured on this server.'
            }), 503

        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'success': False, 'error': 'Missing or invalid Authorization header'}), 401

        token = auth_header[len('Bearer '):].strip()
        user_id = decode_token(token)
        if not user_id:
            return jsonify({'success': False, 'error': 'Invalid or expired token'}), 401

        g.user_id = user_id
        return fn(*args, **kwargs)
    return wrapper


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed."""
    if not filename:
        return False
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# Bounding max_output_tokens keeps Gemini from running long past the point
# a response is actually useful - most of our prompts want a small, tightly
# structured JSON reply, and letting the model ramble past that just adds
# latency the user is sitting through. Long-form responses (the final
# report) get a much bigger cap.
GENCONFIG_SHORT = genai.types.GenerationConfig(max_output_tokens=1536)
GENCONFIG_MEDIUM = genai.types.GenerationConfig(max_output_tokens=3072)
GENCONFIG_LONG = genai.types.GenerationConfig(max_output_tokens=8192)


def resize_image_for_ai(img: Image.Image, max_edge: int = 1536, quality: int = 85) -> Image.Image:
    """
    Downscale a photo before sending it to Gemini. Phone camera photos are
    routinely 3000-4000px on the long edge; Gemini's vision doesn't get any
    more useful signal from that than it does from ~1536px, so sending the
    full-resolution original just adds upload time and prompt-processing
    time for no quality benefit. This mutates nothing on disk - the shrunk
    copy only ever lives in memory for the duration of the API call.
    """
    img = img.convert('RGB') if img.mode not in ('RGB', 'L') else img
    img.thumbnail((max_edge, max_edge), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=quality)
    buf.seek(0)
    return Image.open(buf)


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


def detect_room_items(
    images: List[bytes],
    room_type: str,
    extra_context: Optional[str] = None,
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Detect items/areas in room photos that need organization.

    Args:
        images: List of image binary data
        room_type: Type of room (bedroom, kitchen, living_room)
        extra_context: Optional user-written descriptions of specific
            photos (from the optional "add more photos" section), folded
            into the prompt so the AI actually sees what the user typed
            instead of it being silently dropped.

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
                    
                img = resize_image_for_ai(Image.open(io.BytesIO(img_data)))
                pil_images.append(img)
                logger.info(f"✅ Loaded image {idx + 1}: {img.size} {img.format}")
                
            except Exception as e:
                logger.warning(f"⚠️  Failed to load image {idx}: {e}")
        
        if not pil_images:
            return None, "No valid images could be loaded"
        
        context_block = f"\nThe user added notes about some of these photos:\n{extra_context}\n" if extra_context else ""

        # Room-specific detection prompt
        prompt = f"""
        You are analyzing a {room_type.replace('_', ' ')}. Look at all the images provided.
        {context_block}
        Identify 2-4 SPECIFIC AREAS or ITEMS that need organization. Focus on:
        - Storage areas (closets, drawers, cabinets)
        - Furniture pieces (dresser, shelves, counters)
        - Functional zones (desk area, seating area, cooking area)
        
        Return ONLY a JSON array of objects with this exact structure:
        [
          {{"name": "Closet", "confidence": 92, "reason": "Contains clothes and needs organization"}},
          {{"name": "Dresser", "confidence": 85, "reason": "Drawers appear cluttered"}},
          {{"name": "Nightstand", "confidence": 74, "reason": "Surface has multiple items"}}
        ]
        
        Rules:
        - Return 2-4 items maximum
        - Use simple, clear names (1-2 words)
        - Be specific to what you see
        - "confidence" is an integer 0-100 representing how certain you are that
          this area is genuinely present and correctly identified in the photo
        - Return ONLY the JSON array, no other text
        """
        
        logger.info(f"🔍 Detecting items in {room_type} with {len(pil_images)} images...")
        response = model.generate_content([prompt] + pil_images, generation_config=GENCONFIG_MEDIUM)
        
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

            # Confidence is required by the prompt, but be defensive: coerce
            # missing/invalid values to a conservative default rather than
            # failing the whole detection over one malformed field.
            confidence = item.get('confidence')
            if not isinstance(confidence, (int, float)):
                logger.warning(
                    f"⚠️  Missing/invalid confidence for '{item.get('name')}', defaulting to 50"
                )
                confidence = 50
            item['confidence'] = max(0, min(100, int(confidence)))
        
        logger.info(
            f"✅ Detected {len(items)} items: "
            f"{[(i['name'], i['confidence']) for i in items]}"
        )
        
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
    photo_labels: List[str],
    extra_context: Optional[str] = None,
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Analyze specific area (closet, dresser, etc.) and generate question.
    
    Returns:
        Dict with question for user

    NOTE (Task 3): `images` may legitimately be an empty list when the user
    chooses "Skip close-ups" in AreaPhotoScreen. In that case we fall back to
    a text-only prompt built from area_name/room_type alone, instead of
    rejecting the request outright.
    """
    if not area_name:
        return None, "Area name not specified"
    
    try:
        model = initialize_gemini()
        if not model:
            return None, "Failed to initialize Gemini AI"
        
        pil_images = []
        for idx, img_data in enumerate(images or []):
            try:
                if not img_data or len(img_data) == 0:
                    continue
                img = resize_image_for_ai(Image.open(io.BytesIO(img_data)))
                pil_images.append(img)
            except Exception as e:
                logger.warning(f"⚠️  Failed to load image {idx}: {e}")

        has_images = len(pil_images) > 0

        if has_images:
            # Generate contextual question grounded in the close-up photos.
            # Also asks Gemini to flag any SPECIFIC additional angle it
            # would need to give a better recommendation (dynamic photo
            # guidance) — e.g. "the top shelf is cut off" or "can't tell
            # what's behind the hanging clothes" — rather than always
            # relying on the same hardcoded angle list.
            context_block = f"\nThe user added notes about some of these photos:\n{extra_context}\n" if extra_context else ""

            prompt = f"""
            You are analyzing the {area_name} in a {room_type.replace('_', ' ')}.

            Photo types provided: {', '.join(photo_labels) if photo_labels else 'General photos'}
            {context_block}
            Based on what you see, generate ONE specific question to ask the user about their intentions.

            Also decide whether any additional photo angle is genuinely
            REQUIRED to avoid giving bad advice — not just "would be nice
            to have." Default to requesting NOTHING. Only ask (at most 1)
            when a specific part of the space is actually unusable: e.g.
            a shelf/compartment is fully cut off from every photo given,
            or a photo is too dark/blurry to make out what's in it. Do NOT
            ask just because an angle could theoretically be more
            complete, more decorative, or show extra detail — normal,
            reasonably-framed photos that already show the space are
            sufficient on their own. The user has already been asked once
            per area; treat a second request as a real cost to them, not
            a free way to be thorough.

            Examples:
            - "What are your main goals for organizing this closet?"
            - "How do you primarily use this dresser?"
            - "What items do you want to keep easily accessible here?"

            Return ONLY a JSON object:
            {{
              "question": "Your question here",
              "context": "Brief description of what you see (2-3 sentences)",
              "additional_angles": [
                {{"label": "short_snake_case_id", "title": "Short Title", "description": "What to capture and why"}}
              ]
            }}
            "additional_angles" should be an empty array if nothing more is needed.
            """
        else:
            # Text-only fallback: no close-up photos were provided (user chose
            # to skip). Ask a sensible generic question instead of failing.
            prompt = f"""
            The user is organizing the {area_name} in a {room_type.replace('_', ' ')},
            but chose not to take additional close-up photos of it.
            
            Generate ONE general question to ask about their intentions for this
            area that doesn't depend on visual details you can't see.
            
            Examples:
            - "What are your main goals for organizing this closet?"
            - "How do you primarily use this dresser?"
            
            Return ONLY a JSON object:
            {{
              "question": "Your question here",
              "context": "No close-up photos were provided for this area, so recommendations will be general."
            }}
            """
        
        logger.info(f"🤔 Generating question for {area_name} (images={'yes' if has_images else 'no'})...")
        response = (
            model.generate_content([prompt] + pil_images, generation_config=GENCONFIG_MEDIUM)
            if has_images
            else model.generate_content(prompt, generation_config=GENCONFIG_MEDIUM)
        )
        
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


MAX_CHAT_QUESTIONS = 5


def run_natasha_chat_turn(
    area_name: str,
    room_type: str,
    photo_overview: str,
    messages: List[Dict],
    tier: str,
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    One turn of the guided Natasha intake chat. `messages` is the transcript
    so far (list of {role, text}), already including the latest user
    message (if any) as the last entry — the caller decides whether to keep
    it in the stored transcript based on `guardrail_triggered` in the
    result.
    """
    try:
        model = initialize_gemini()
        if not model:
            return None, "Failed to initialize Gemini AI"

        transcript = '\n'.join(f"{m['role'].upper()}: {m['text']}" for m in messages) or "(conversation not started yet)"

        prompt = CHAT_SYSTEM_PROMPT_TEMPLATE.format(
            voice=voice_for_tier(tier),
            area_name=area_name,
            room_label=room_type.replace('_', ' ') if room_type else 'space',
            photo_overview=photo_overview or "No photo overview available yet.",
            transcript=transcript,
        )

        # CHANGED (bug fix): this was GENCONFIG_SHORT (1536 tokens), which
        # truncated the JSON response mid-string on longer replies — the
        # closing summary + up to 3 path_options (each with its own
        # description) can run past that. Truncated JSON surfaced as a raw
        # "Failed to parse AI response: Unterminated string..." error
        # straight to the user. GENCONFIG_MEDIUM gives enough headroom.
        response = model.generate_content(prompt, generation_config=GENCONFIG_MEDIUM)
        if not response or not response.text:
            return None, "Gemini returned empty response"

        def _extract_json(text):
            text = text.strip()
            if text.startswith('```'):
                lines = text.split('\n')
                text = '\n'.join(lines[1:-1])
                if text.startswith('json'):
                    text = text[4:].strip()
            return json.loads(text.strip())

        try:
            result = _extract_json(response.text)
        except json.JSONDecodeError as je:
            # One retry — with GENCONFIG_MEDIUM this should now be rare, but
            # a single malformed/truncated response shouldn't dead-end the
            # conversation. Logs the raw text for debugging either way,
            # never surfaces the raw parser exception to the user (that's
            # what used to show up as "Unterminated string starting at:
            # line 2 column 12" in an alert, which means nothing to them).
            logger.error(f"❌ Chat JSON parse error (attempt 1): {je}\nRaw response: {response.text[:2000]}")
            retry_response = model.generate_content(prompt, generation_config=GENCONFIG_MEDIUM)
            try:
                result = _extract_json(retry_response.text) if retry_response and retry_response.text else None
                if result is None:
                    raise json.JSONDecodeError("empty retry response", "", 0)
            except json.JSONDecodeError as je2:
                logger.error(f"❌ Chat JSON parse error (attempt 2, giving up): {je2}\nRaw response: {getattr(retry_response, 'text', '')[:2000]}")
                return None, "Had trouble putting that response together — please try sending your message again."

        if not isinstance(result, dict) or 'reply' not in result:
            return None, "Invalid chat response format from AI"

        result.setdefault('done', False)
        result.setdefault('path_options', [])
        result.setdefault('guardrail_triggered', False)
        if not isinstance(result['path_options'], list):
            result['path_options'] = []
        result['path_options'] = result['path_options'][:3]

        return result, None

    except Exception as e:
        logger.error(f"❌ Natasha chat turn failed: {str(e)}", exc_info=True)
        return None, f"Chat error: {str(e)}"


def generate_direction_photo_guidance(
    area_name: str,
    room_type: str,
    path_label: str,
    chat_transcript: str,
) -> Tuple[List[Dict], Optional[str]]:
    """
    After the user picks a direction (e.g. "Mess Cleanup" vs. "Style
    Refresh") at the end of the Natasha chat, ask Gemini for 2-3 SPECIFIC
    follow-up photo angles suited to that direction, so the user is guided
    to capture what's actually relevant before the final recommendation is
    generated (e.g. mess cleanup -> the cluttered spot itself; style
    refresh -> a wide shot showing colors/materials).

    Returns (guidance_list, error). Non-fatal — an empty list on error is a
    valid fallback for the caller (the extra photos are optional).
    """
    try:
        model = initialize_gemini()
        if not model:
            return [], "Failed to initialize Gemini AI"

        prompt = f"""
        A user organizing their {area_name} in a {room_type.replace('_', ' ') if room_type else 'space'}
        just chose this direction for the project: "{path_label}".

        Context from their earlier conversation:
        {chat_transcript or '(no additional context)'}

        Suggest 2-3 SPECIFIC photo angles that would help you give a
        precise, useful recommendation for THIS direction. Be concrete
        about what to capture and why (e.g. for a mess-cleanup direction,
        ask for a close-up of the messiest spot; for a style direction,
        ask for a wide shot that shows the whole color/material palette).

        Return ONLY a JSON array:
        [
          {{"label": "short_snake_case_id", "title": "Short Title", "description": "What to capture and why"}}
        ]
        """

        response = model.generate_content(prompt, generation_config=GENCONFIG_SHORT)
        if not response or not response.text:
            return [], "Gemini returned empty response"

        text = response.text.strip()
        if text.startswith('```'):
            lines = text.split('\n')
            text = '\n'.join(lines[1:-1])
            if text.startswith('json'):
                text = text[4:].strip()

        guidance = json.loads(text.strip())
        if not isinstance(guidance, list):
            return [], "AI response was not a list"
        return guidance[:3], None

    except Exception as e:
        logger.warning(f"⚠️  Direction photo guidance generation failed: {str(e)}")
        return [], str(e)


def verify_named_item(
    images: List[bytes],
    item_name: str,
    room_type: str,
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Used when a user manually adds an area/object the AI didn't originally
    detect ("+ Add an area we missed"). Rather than trusting a typed name
    blindly, checks it against the room's actual photos — if Gemini can
    genuinely see it, it's added as a real item (measurable, chattable,
    reportable) exactly like an AI-detected one; if not, the user is asked
    to add more photos or skip it, instead of silently measuring a guess.

    Returns ({found, confidence, reason}, error).
    """
    if not item_name:
        return None, "Item name not specified"

    try:
        model = initialize_gemini()
        if not model:
            return None, "Failed to initialize Gemini AI"

        pil_images = []
        for img_data in images or []:
            try:
                if img_data and len(img_data) > 0:
                    pil_images.append(resize_image_for_ai(Image.open(io.BytesIO(img_data))))
            except Exception:
                continue

        if not pil_images:
            return None, "No valid images provided"

        prompt = f"""
        The user says their {room_type.replace('_', ' ') if room_type else 'room'}
        contains something they'd like to organize called: "{item_name}".

        Look carefully at the provided photos. Can you actually identify
        this in the images?

        Return ONLY a JSON object:
        {{
          "found": true or false,
          "confidence": 0-100,
          "reason": "One sentence — what you see that matches, or why you can't find it"
        }}
        Be honest — if you can't clearly see it, set found to false rather
        than guessing. A vague or very low-confidence match should be
        found: false, not a low confidence number.
        """

        response = model.generate_content([prompt] + pil_images, generation_config=GENCONFIG_SHORT)
        if not response or not response.text:
            return None, "Gemini returned empty response"

        text = response.text.strip()
        if text.startswith('```'):
            lines = text.split('\n')
            text = '\n'.join(lines[1:-1])
            if text.startswith('json'):
                text = text[4:].strip()

        result = json.loads(text.strip())
        if not isinstance(result, dict) or 'found' not in result:
            return None, "Invalid response format from AI"

        result.setdefault('confidence', 0)
        result.setdefault('reason', '')
        return result, None

    except Exception as e:
        logger.error(f"❌ Item verification failed: {str(e)}", exc_info=True)
        return None, f"Verification error: {str(e)}"


# Named anchors for objects that ALWAYS need interior measurement — a real,
# maintained list (not just prose buried in a prompt) so it's easy to
# extend later by adding a word. Seeds the AI's judgment for the common,
# high-frequency cases so it doesn't have to re-derive "does this need
# interior measurement" from first principles every time; the same list
# also primes it to generalize to similar-but-unlisted objects (pantry,
# bookshelf, armoire, dresser/nightstand-with-a-drawer, etc.).
PRIORITY_INTERIOR_OBJECTS = ["closet", "cabinet", "cupboard", "drawer"]


def plan_area_measurement(
    images: List[bytes],
    area_name: str,
    room_type: str,
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Photo-aware measurement planning — replaces the old text-only
    determine_measurement_fields(). In one Gemini call, looking at the
    area's actual close-up photos:
      1. Decides whether this object has a usable interior worth measuring
         (closets/cabinets/cupboards/drawers always do — see
         PRIORITY_INTERIOR_OBJECTS — plus anything visually similar).
      2. If so, visually counts how many distinct shelves/compartments are
         actually visible, with a confidence flag — low confidence tells
         the frontend to offer "add more photos" / "tell us manually"
         rather than trusting a guess.
      3. Decides which dimension keys are relevant to ask for.

    Returns ({has_interior, compartment_count, count_confidence, fields},
    error). `fields` keys are drawn from the same fixed vocabulary
    /area/parse-measurement and /area/measurements already use.
    """
    if not area_name:
        return None, "Area name not specified"

    try:
        model = initialize_gemini()
        if not model:
            return None, "Failed to initialize Gemini AI"

        pil_images = []
        for img_data in images or []:
            try:
                if img_data and len(img_data) > 0:
                    pil_images.append(resize_image_for_ai(Image.open(io.BytesIO(img_data))))
            except Exception:
                continue

        has_images = len(pil_images) > 0
        room_label = room_type.replace('_', ' ') if room_type else 'room'
        priority_list = ', '.join(PRIORITY_INTERIOR_OBJECTS)

        photo_instruction = (
            "Look at the provided close-up photos of this specific area to make your judgment."
            if has_images else
            "No close-up photos were provided — judge from the object's name alone, and set "
            "count_confidence to \"low\" if has_interior is true, since you can't actually see it."
        )

        prompt = f"""
        A user is about to measure "{area_name}" in their {room_label} to shop
        for organizing products that will fit. {photo_instruction}

        These object types ALWAYS need interior measurement — treat a name
        match as an automatic yes, don't re-derive it from first
        principles: {priority_list}. Apply the identical reasoning to
        anything visually similar you detect even if it isn't named here
        (pantry, bookshelf, armoire, dresser or nightstand with a drawer,
        etc.) — the test is "does this have a usable interior/compartment
        worth measuring," not whether it's on this exact list.

        Decide:
        1. "has_interior": does this object have a usable interior
           (shelves, compartments, drawers) that should be measured,
           instead of (or in addition to) its outside?
        2. If has_interior is true, COUNT how many distinct shelves/
           compartments/drawers are actually visible in the photos.
           "count_confidence" must be "low" if the interior is partially
           hidden, a door is closed, lighting is poor, or you're not
           genuinely sure you can see all of them — never guess a precise
           count with "high" confidence you don't actually have.
        3. Which dimensions are relevant to ask for. Only choose from this
           vocabulary (use the "key" values exactly — never use the word
           "depth", use "length" and "width" instead):
           - length (outside/overall longest side)
           - width (outside/overall shorter side, front-to-back)
           - height (outside/overall height)
           - inner_length (usable INSIDE length)
           - inner_width (usable INSIDE width)
           - inner_height (usable INSIDE clearance height, e.g. between shelves)
           A flat item (rug, wall art) needs only length+width, no height.
           Furniture with no interior needs length+width+height only.
           Something with has_interior true needs the inner_* dims (outside
           dims optional alongside them).

        Return ONLY a JSON object:
        {{
          "has_interior": true or false,
          "compartment_count": <integer, or null if not has_interior>,
          "count_confidence": "high" or "low",
          "fields": [{{"key": "length", "label": "Length"}}, ...]
        }}
        """

        response = (
            model.generate_content([prompt] + pil_images, generation_config=GENCONFIG_MEDIUM)
            if has_images
            else model.generate_content(prompt, generation_config=GENCONFIG_MEDIUM)
        )
        if not response or not response.text:
            return None, "Gemini returned empty response"

        text = response.text.strip()
        if text.startswith('```'):
            lines = text.split('\n')
            text = '\n'.join(lines[1:-1])
            if text.startswith('json'):
                text = text[4:].strip()

        result = json.loads(text.strip())
        if not isinstance(result, dict) or 'fields' not in result:
            return None, "Invalid response format from AI"
        result.setdefault('has_interior', False)
        result.setdefault('compartment_count', None)
        result.setdefault('count_confidence', 'low')
        return result, None

    except Exception as e:
        logger.error(f"❌ Determine measurement fields failed: {str(e)}", exc_info=True)
        return None, f"Field determination error: {str(e)}"


MEASUREMENT_FIELD_KEYS = {'length', 'width', 'height', 'inner_length', 'inner_width', 'inner_height'}


def parse_measurement_text(
    text: str,
    item_name: str,
    relevant_fields: List[Dict],
    unit: str,
) -> Tuple[Optional[List[Dict]], Optional[str]]:
    """
    Parses a user's free-text measurement description (e.g. "length 50,
    height 25, width 34, inside length 40, inside width 31, 3 shelves that
    size") into one or more structured shelf_profiles, matching the schema
    /area/measurements already accepts (any subset of
    length/width/height[/inner_*], plus count). Supports multiple distinct
    sizes in one area natively, since the user can just describe more than
    one in the same text.

    Returns (shelf_profiles, error). Every profile always includes "count"
    (default 1) and only the dimension keys the user actually described.
    """
    if not text or not text.strip():
        return None, "No measurement text provided"

    try:
        model = initialize_gemini()
        if not model:
            return None, "Failed to initialize Gemini AI"

        field_list = ', '.join(f"{f['key']} ({f.get('label', f['key'])})" for f in relevant_fields) or 'length, width, height'

        prompt = f"""
        A user is describing measurements for "{item_name}" in {unit} ({'inches' if unit == 'in' else 'centimeters'}).
        The dimensions that matter here are: {field_list}.

        Their description: "{text}"

        Parse this into one or more size "profiles" (a profile = one distinct
        size, e.g. "3 shelves at 24 inches" is one profile with count 3; if
        they describe a second distinct size, that's a second profile).
        Every profile needs a "count" (how many are that size — default 1
        if not mentioned). Only include a dimension key if the user actually
        gave a number for it — never invent or default a dimension they
        didn't mention. Numbers are already in {unit} unless the user
        explicitly says otherwise. Never use the word "depth" — map
        anything the user calls "depth" or "front-to-back" onto "width"
        (or "inner_width" if they say it's an inside measurement).

        Return ONLY a JSON array, using ONLY these keys: length, width,
        height, inner_length, inner_width, inner_height, count.
        [
          {{"length": 36, "width": 18, "height": 30, "inner_length": 30, "inner_width": 16, "count": 1}}
        ]
        If you genuinely cannot parse any numeric measurement from the
        text, return an empty array [].
        """

        response = model.generate_content(prompt, generation_config=GENCONFIG_SHORT)
        if not response or not response.text:
            return None, "Gemini returned empty response"

        text_out = response.text.strip()
        if text_out.startswith('```'):
            lines = text_out.split('\n')
            text_out = '\n'.join(lines[1:-1])
            if text_out.startswith('json'):
                text_out = text_out[4:].strip()

        profiles = json.loads(text_out.strip())
        if not isinstance(profiles, list):
            return None, "AI response was not a list"

        cleaned = []
        for p in profiles:
            if not isinstance(p, dict):
                continue
            clean_p = {}
            for k, v in p.items():
                if k == 'count':
                    try:
                        clean_p['count'] = max(1, int(v))
                    except (TypeError, ValueError):
                        clean_p['count'] = 1
                elif k in MEASUREMENT_FIELD_KEYS and isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0:
                    clean_p[k] = v
            clean_p.setdefault('count', 1)
            if len(clean_p) > 1:  # more than just "count"
                cleaned.append(clean_p)

        return cleaned, None

    except Exception as e:
        logger.error(f"❌ Measurement text parsing failed: {str(e)}", exc_info=True)
        return None, f"Parsing error: {str(e)}"


MEASUREMENT_FIELD_LABELS = {
    'length': 'length',
    'width': 'width',
    'height': 'height',
    'inner_length': 'inside length',
    'inner_width': 'inside width',
    'inner_height': 'inside clearance height',
}


def _format_profile_dims(profile: Dict) -> str:
    """Formats whichever dimension keys a profile actually has (any subset of MEASUREMENT_FIELD_LABELS)."""
    parts = [
        f"{MEASUREMENT_FIELD_LABELS[key]} {profile[key]}"
        for key in MEASUREMENT_FIELD_LABELS
        if key in profile
    ]
    return ', '.join(parts) if parts else 'no dimensions recorded'


def _format_measurement_block(measurement: Optional[Dict]) -> str:
    """
    Turn a saved measurement record (as stored by /area/measurements) into a
    plain-language block for the recommendation prompt. Returns a clear
    "no measurements" line if none were captured or the user skipped, so the
    model doesn't invent dimensions. Profiles can contain any subset of
    length/width/height/inner_length/inner_width/inner_height — parsed from
    the user's own natural-language measurement description (see
    parse_measurement_text) rather than a fixed field set.
    """
    if not measurement or measurement.get('skipped'):
        return "No measurements were provided for this area — give general guidance only, and do not invent specific dimensions."

    unit = measurement.get('unit', 'in')
    unit_label = 'inches' if unit == 'in' else 'centimeters'
    profiles = measurement.get('shelf_profiles', [])
    if not profiles:
        return "No measurements were provided for this area — give general guidance only, and do not invent specific dimensions."

    lines = [f"Measured dimensions for this area (unit: {unit_label}):"]
    for idx, profile in enumerate(profiles, start=1):
        count = profile.get('count', 1)
        lines.append(f"  - Size {idx}: {_format_profile_dims(profile)} {unit_label}, {count} of this size")
    return '\n'.join(lines)


def _format_priorities_block(priorities: Optional[List[str]], visual_style: Optional[str]) -> str:
    """Turn user-selected organization priorities / visual style into a prompt block."""
    parts = []
    if priorities:
        parts.append(f"Organization priorities (in the user's own words/order): {', '.join(priorities)}")
    if visual_style:
        parts.append(f"Preferred visual style: {visual_style}")
    if not parts:
        return "No specific organization priorities or visual style were selected — balance general best practices."
    return '\n'.join(parts)


def generate_area_recommendations(
    images: List[bytes],
    area_name: str,
    room_type: str,
    user_intention: str,
    photo_labels: List[str],
    measurement: Optional[Dict] = None,
    priorities: Optional[List[str]] = None,
    visual_style: Optional[str] = None,
    tier: str = 'paid',
    path: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Generate specific recommendations based on user's stated intention.

    `measurement` is the saved shelf-profile record for this area (or None),
    and `priorities`/`visual_style` are the user's selections from the
    organization-priorities step. Both are folded into the prompt so the
    recommendation is actually personalized by what the user provided,
    instead of only appearing later in the final PDF summary.
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
                    pil_images.append(resize_image_for_ai(Image.open(io.BytesIO(img_data))))
            except:
                pass

        measurement_block = _format_measurement_block(measurement)
        priorities_block = _format_priorities_block(priorities, visual_style)
        voice_block = voice_for_tier(tier)
        path_block = f"\nThe user's need for this area was identified as: {path}.\n" if path else ""

        prompt = f"""
        {voice_block}

        You are analyzing a {area_name} in a {room_type.replace('_', ' ')}.

        Photo types: {', '.join(photo_labels) if photo_labels else 'General photos'}
        User's intention: "{user_intention}"
        {path_block}
        {measurement_block}

        {priorities_block}

        Provide SPECIFIC, ACTIONABLE recommendations (3-5 steps) to help them achieve their goal.
        If measured dimensions were given above, your recommendations MUST reference
        those specific numbers (e.g. bin/shelf sizes that would actually fit) rather
        than giving generic advice. If no measurements were given, say so is fine and
        keep the advice general.
        
        Format as a numbered list, each step written in Natasha's voice as shown above:
        1. [Specific action with measurements/details, written warmly and personally]
        2. [Next action]
        ...
        
        End with one short sentence starting "This system..." or "This approach..."
        explaining WHY it works for the user (reduces clutter, easier for family
        members to maintain, etc).
        
        Be direct, specific, and practical. Keep it concise (200-300 words max).
        """
        
        logger.info(f"💡 Generating recommendations for {area_name}...")
        
        content_list = [prompt]
        if pil_images:
            content_list.extend(pil_images)

        response = model.generate_content(content_list, generation_config=GENCONFIG_MEDIUM)
        
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


def select_matching_products(
    area_name: str,
    room_type: str,
    user_intention: str,
    recommendation_text: str,
    measurement: Optional[Dict],
    limit: int = 4,
) -> Tuple[List[Dict], Optional[str]]:
    """
    Single semantic pass over the FULL product catalog — replaces the old
    two-stage pipeline (dimensional-bucket pre-filter, then a relevance
    filter on the survivors). The old bucket system only had 3 real
    categories (kitchen/bathroom/closet, with everything else defaulting to
    "closet"), which can't represent a real ~50-item catalog spanning
    spice organizers, cable management, craft supplies, etc. Instead, the
    AI sees every catalog product at once (with real dims or an
    adjustable/no-fixed-size note — see products.py), plus this specific
    area's actual plan and the user's own stated goal, and picks what
    genuinely belongs — dimensional fit and topical relevance in one
    judgment instead of two disconnected passes.

    Returning an empty list is a valid, correct outcome — never force a
    pick just to have something to show. Fails to an empty list (not a
    fallback catalog dump) on any error, since there's no longer a
    separate dimensional-only stage to fall back to.
    """
    try:
        model = initialize_gemini()
        if not model:
            return [], None

        candidate_context = build_candidate_context(measurement)
        prompt = f"""
        A user is organizing "{area_name}" in their {room_type.replace('_', ' ')}.

        Their stated goal: "{user_intention}"

        The plan generated for them:
        {recommendation_text}

        Below is the full approved product catalog. Each line shows a
        product's real dimensions, or a note if it has no fixed size
        (adjustable, accessory, or soft-sided item). Lines are marked
        whether they physically fit the user's measured space, if one was
        taken.

        {candidate_context}

        Pick UP TO {limit} products that genuinely belong in THIS specific
        plan for THIS specific user — being marked as fitting is not
        enough on its own, it still has to make sense for the actual plan
        and goal above. Never pick a product explicitly marked as NOT
        fitting. Returning an empty list is correct if nothing here is
        genuinely relevant — don't pick something just to have something
        to recommend.

        For each pick, write a short (one sentence) reason grounded in
        this specific user's plan/goal — not a generic description of the
        product — and a sensible quantity (default 1; only suggest more
        than 1 when buying several of the same item genuinely makes sense,
        e.g. matching jars for multiple shelves).

        Return ONLY a JSON array, e.g.:
        [{{"id": "spice-jars", "reason": "...", "quantity": 6}}]
        Return [] if nothing is relevant.
        """

        response = model.generate_content(prompt, generation_config=GENCONFIG_SHORT)
        if not response or not response.text:
            return [], None

        text = response.text.strip()
        if text.startswith('```'):
            lines = text.split('\n')
            text = '\n'.join(lines[1:-1])
            if text.startswith('json'):
                text = text[4:].strip()

        picks = json.loads(text.strip())
        if not isinstance(picks, list):
            return [], None

        entries = []
        for pick in picks[:limit]:
            entry = build_product_entry(pick.get('id'), pick.get('reason', ''), pick.get('quantity', 1))
            if entry:
                entries.append(entry)
        return entries, None

    except Exception as e:
        logger.warning(f"⚠️  Product matching failed, returning no products: {str(e)}")
        return [], None


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
            count = profile.get('count', 1)
            lines.append(
                f"- **Size {idx}:** {_format_profile_dims(profile)} "
                f"({unit_label}) — **{count}** of this size\n"
            )
        lines.append("\n")

    return ''.join(lines)


def format_products_summary(session_data: Dict) -> str:
    """
    Build a markdown "Step 4: Add the Right Storage" shopping list from
    every area's matched products — dimensions and recommended quantity
    included when the matcher provided them (see products.py), matching
    the level of detail in the reference report layout instead of just a
    name + reason + link.
    """
    lines = ["## Step 4: Add the Right Storage\n"]
    lines.append(
        "Based on the measurements you entered, we've selected storage "
        "solutions designed to work with your available space.\n\n"
    )
    found_any = False

    for room in session_data.get('rooms', []):
        for area in room.get('areas', []):
            products = area.get('products') or []
            if not products:
                continue
            found_any = True
            lines.append(f"### {area.get('name', 'Area')}\n")
            for p in products:
                lines.append(f"**{p['name']}**\n\n")
                dims = p.get('dims_cm')
                if dims and len(dims) == 3:
                    lines.append(f"- Dimensions: {dims[0]:g} × {dims[1]:g} × {dims[2]:g} cm (L × W × H)\n")
                quantity = p.get('quantity')
                if quantity:
                    lines.append(f"- Recommended quantity: {quantity}\n")
                lines.append(f"- Why we recommend it: {p['reason']}\n")
                lines.append(f"- [Shop on Amazon]({p['amazon_link']})\n\n")
            lines.append("\n")

    if not found_any:
        lines.append("No products were matched during this session.\n")

    lines.append(
        "\n*Always confirm the current product dimensions before "
        "purchasing, as product specifications and availability may "
        "change.*\n"
    )

    return ''.join(lines)


# Static, non-personalized sections that round out the report to match the
# reference layout. These don't need a Gemini call — the content is the
# same for every user, so generating it via AI would just add latency and
# a chance of the model drifting off the requested copy for no benefit.
def format_static_report_sections(session_data: Dict) -> str:
    support_email = os.getenv('SUPPORT_EMAIL', 'organizingapp@homefreeorganizing.ca')
    return f"""
## Don't Let Your Donations Become Clutter

If you've decided to donate items, **take them out of your home as soon as possible.**

Put donations directly into your vehicle or schedule a donation pickup. Don't create a new pile of clutter by keeping your donation bags in another area of the house.

**Your organizing project isn't finished until the items you're letting go of have left your home.**

## Keep Going!

You've completed one space — now keep the momentum going! Try choosing **one new area of your home each week.**

**This Week's Challenge** — choose one:
- Kitchen drawer
- Bathroom vanity
- Bedroom closet
- Pantry
- Entryway
- Home office
- Living room
- Storage area

Remember, you don't have to organize your entire home at once. **One space at a time can make a huge difference.**

## Don't Forget Your After Photos!

You took your before photos when you started. Now that you've finished, take a few after photos so you can see the difference you've made! Upload your after photos in the app.

Seeing your progress can be incredibly motivating — and you'll have a record of everything you've accomplished.

## How Did It Go?

We'd love to hear how your organizing experience went — did the recommendations work well for your space, did the measurements help you choose the right storage, and how do you feel about your newly organized space?

Enjoyed the experience? Let us know at {support_email} — your feedback helps us improve the app and helps other people discover an easier way to organize their homes.

## Ready for Your Next Space?

When you're ready, come back and tackle another area of your home. **Your organized home starts with one space at a time.**
"""


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

        priorities_summary = _format_priorities_block(
            session_data.get('organization_priorities'),
            session_data.get('visual_style')
        )
        voice_block = voice_for_tier(session_data.get('user_tier', 'paid'))

        # CHANGED (report was too long/messy/duplicated): the prompt used to
        # ask the AI to also write out a "Space Measurements Summary" and a
        # "Shopping List Summary" section — but format_measurements_summary()
        # and format_products_summary() below ALREADY append that exact data
        # as clean structured blocks after generation, so the AI's own
        # sections were pure duplication (measurements/products appeared
        # TWICE). Removed those two sections from the AI's job entirely, and
        # tightened every remaining section to bullets over paragraphs and
        # explicit word caps — the frontend splits this into one card per
        # "## " section, so short and scannable per-section matters more
        # than a single long readable narrative.
        prompt = f"""
        {voice_block}

        The user's stated organization priorities / visual style for this project:
        {priorities_summary}

        You are creating a final home organization report. Be concise — this
        report can cover several rooms, so every section must stay short and
        scannable on a phone screen. Prefer short bullets over paragraphs.
        Never repeat information across sections.

        Here are the individual area recommendations to synthesize (do not
        just copy them verbatim — tighten each into 3-5 short bullet steps):
        {''.join(room_summaries)}

        Structure the report EXACTLY like this (keep the "## " headings as
        shown, since each section is rendered as its own card). This
        follows a 5-step organizing framework — personalize every step to
        what was ACTUALLY found in this user's rooms/areas above, don't
        write generic filler:

        # 🏠 Your Personalized Organization Report

        ## Step 1: Declutter
        [2-3 short bullets max. Reference specific categories of items
        actually found in their space. Remind them to sort into Keep,
        Donate, Garbage/Recycle, Relocate, and Unsure, and to focus on
        what they actually use, need, and love.]

        ## Step 2: Group Similar Items
        [For each room, a "### Room Name" sub-heading, then 2-4 short
        bullets naming the actual categories of similar items to group
        together in that room (e.g. "Everyday cookware", "Seasonal
        linens") based on what was detected — not the generic example
        list, their actual items.]

        ## Step 3: Give Everything a Home
        [For each room, a "### Room Name" sub-heading, then for each area
        in that room: area name in bold, a Priority (High/Medium/Low),
        and 3-5 short bullet action steps for where things should live —
        frequently used items at easy-reach height, backstock high/low/
        farther back. This is the most detailed step; synthesize the
        individual area recommendations here, tightened into bullets.]

        ## Step 5: Finish & Maintain
        [3-4 short bullets. Include the "spend 5-10 minutes resetting the
        space regularly" habit, plus 2-3 maintenance tips specific to
        what was organized. End with 1-2 warm, non-flowery sentences of
        encouragement.]

        Do not include a measurements section, a shopping list section, or
        a "Step 4" — those are added separately after your text.
        """

        logger.info("📝 Generating final comprehensive report...")
        response = model.generate_content(prompt, generation_config=GENCONFIG_LONG)

        if not response or not response.text:
            return None, "Failed to generate report - empty response"

        report = response.text.strip()

        if len(report) < 100:
            return None, "Generated report was too short"

        # Real date + room list, injected as the lead line of Step 1
        # rather than trusted to the AI (so it's always accurate) and
        # rather than as its own text block before the first "## " heading
        # (the frontend's card parser treats anything before the first
        # heading as a stray, headingless section) — matches the reference
        # report's "Date / Area Organized" header line while staying
        # inside the card structure the frontend expects.
        room_names = ', '.join(
            r.get('type', '?').replace('_', ' ').title() for r in session_data.get('rooms', [])
        )
        report_date = datetime.now().strftime('%B %d, %Y')
        metadata_line = f"**Date:** {report_date}  \n**Area(s) Organized:** {room_names or 'N/A'}\n\n"
        step1_marker = report.find('## Step 1')
        if step1_marker != -1:
            heading_end = report.find('\n', step1_marker)
            if heading_end != -1:
                report = f"{report[:heading_end + 1]}\n{metadata_line}{report[heading_end + 1:]}"

        # Step 4 (products) has to land BETWEEN the AI's Step 3 and Step 5
        # text, not just tacked on the end, to match the 5-step order in
        # the reference report. The AI was told to write Steps 1-3 and 5
        # as one continuous block (it's a single prompt/call — a separate
        # call just for Step 5 would cost another round-trip for no real
        # benefit), so splice Step 4 in by finding where "## Step 5"
        # starts. Falls back to appending at the end if the model didn't
        # follow the exact heading text, which still produces a complete
        # report, just with Step 4 out of strict numeric order.
        products_block = format_products_summary(session_data)
        if products_block.strip():
            step5_marker = report.find('## Step 5')
            if step5_marker != -1:
                report = f"{report[:step5_marker]}{products_block}\n\n---\n\n{report[step5_marker:]}"
            else:
                report = f"{report}\n\n---\n\n{products_block}"

        # Static sections (donation reminder, weekly challenge, after
        # photos, feedback ask, next-space CTA) always come after the
        # 5-step plan, same as the reference report layout.
        report = f"{report}\n\n---\n{format_static_report_sections(session_data)}"

        # Measurements are supplementary reference data, not part of the
        # step-by-step narrative — kept as a trailing appendix, same as
        # before.
        measurements_block = format_measurements_summary(session_data)
        if measurements_block.strip():
            report = f"{report}\n\n---\n\n{measurements_block}"

        logger.info(f"✅ Final report generated ({len(report)} chars)")

        return report, None
        
    except Exception as e:
        logger.error(f"❌ Report generation failed: {str(e)}", exc_info=True)
        return None, f"Report generation error: {str(e)}"


_INLINE_BOLD_RE = re.compile(r'\*\*(.+?)\*\*')


def _render_inline_bold(escaped_text: str) -> str:
    """
    Converts mid-sentence **bold** markers into ReportLab <b> tags. Must
    run AFTER xml_escape (so any literal < > & in the source text is
    already safe) — the ** markers themselves aren't touched by escaping,
    so this order is safe either way, but doing it after keeps the <b>
    tags we add from ever being re-escaped by a later pass.
    """
    return _INLINE_BOLD_RE.sub(r'<b>\1</b>', escaped_text)


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

            # FIX (broken PDF download): ReportLab's Paragraph() parses a
            # mini-XML/HTML subset in its text. Report text comes from
            # Gemini or user input and can easily contain '<', '>', or '&'
            # (e.g. `8" x 10"`, "A & B") — unescaped, that raised a parse
            # exception and silently broke every PDF download. Every literal
            # text chunk is now XML-escaped before being wrapped in markup
            # tags like <b>, so the tags we add are still real tags but any
            # user/AI-provided text can't be misread as markup.
            if line.startswith('# '):
                # Main title
                text = xml_escape(line[2:].strip())
                story.append(Paragraph(text, title_style))
            elif line.startswith('## '):
                # Section heading
                text = xml_escape(line[3:].strip())
                story.append(Spacer(1, 0.3*inch))
                story.append(Paragraph(text, heading_style))
            elif line.startswith('### '):
                # Subsection
                text = xml_escape(line[4:].strip())
                story.append(Paragraph(f"<b>{text}</b>", body_style))
            elif line.startswith('**') and line.endswith('**'):
                # Whole-line bold
                text = xml_escape(line[2:-2])
                story.append(Paragraph(f"<b>{text}</b>", body_style))
            elif line.startswith('- ') or line.startswith('* '):
                # Bullet point (mid-sentence **bold** still needs converting)
                text = _render_inline_bold(xml_escape(line[2:]))
                story.append(Paragraph(f"• {text}", body_style))
            elif len(line) > 0 and line[0].isdigit() and len(line) > 1 and line[1:3] in ['. ', ') ']:
                # Numbered list
                story.append(Paragraph(_render_inline_bold(xml_escape(line)), body_style))
            else:
                # Regular paragraph — may still contain mid-sentence
                # **bold** (e.g. "**Date:** ..."), which the whole-line
                # check above doesn't catch since it only fires when the
                # ENTIRE line is wrapped in **.
                story.append(Paragraph(_render_inline_bold(xml_escape(line)), body_style))
        
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
    """
    Health check endpoint with network diagnostics.

    FIX: this used to return HTTP 500 whenever validate_environment() found
    a config problem (e.g. GEMINI_API_KEY missing) — which made the frontend
    treat a perfectly reachable server as "can't connect at all" and show a
    scary network-error alert. Reachability and configuration are different
    questions: this endpoint now ALWAYS returns 200 if the server is up, and
    reports config problems via `environment_valid` / `error` instead of the
    status code. Frontend health checks should only care about "did I get a
    response", not "is every feature configured".
    """
    cleanup_old_sessions()
    cleanup_old_pdfs()
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
    }), 200


def verify_captcha(token: str, remote_ip: Optional[str] = None) -> Tuple[bool, Optional[str]]:
    """
    Verifies a Cloudflare Turnstile token against Cloudflare's siteverify
    endpoint. If TURNSTILE_SECRET_KEY isn't set (e.g. local dev without a
    Cloudflare account configured yet), this fails open with a warning —
    once the key is set, a missing/invalid token is a hard rejection.
    """
    if not TURNSTILE_SECRET_KEY:
        logger.warning("⚠️  TURNSTILE_SECRET_KEY not set — skipping captcha verification (dev mode).")
        return True, None
    if not token:
        return False, 'Captcha verification is required'
    try:
        payload = {'secret': TURNSTILE_SECRET_KEY, 'response': token}
        if remote_ip:
            payload['remoteip'] = remote_ip
        resp = requests.post(TURNSTILE_VERIFY_URL, data=payload, timeout=10)
        result = resp.json()
        if result.get('success'):
            return True, None
        return False, 'Captcha verification failed — please try again'
    except Exception as e:
        logger.error(f"❌ Captcha verification request failed: {str(e)}")
        return False, 'Captcha verification is temporarily unavailable — please try again'


@app.route('/auth/signup', methods=['POST'])
def signup():
    """Create a new account. Returns a login token on success."""
    if not USING_POSTGRES:
        return jsonify({'success': False, 'error': 'Accounts are unavailable — DATABASE_URL is not configured.'}), 503
    try:
        data = request.json or {}
        email = (data.get('email') or '').strip()
        password = data.get('password') or ''

        captcha_ok, captcha_error = verify_captcha(data.get('captcha_token'), request.remote_addr)
        if not captcha_ok:
            return jsonify({'success': False, 'error': captcha_error}), 400

        if not validate_email(email):
            return jsonify({'success': False, 'error': 'Please enter a valid email address'}), 400

        ok, err = validate_password(password)
        if not ok:
            return jsonify({'success': False, 'error': err}), 400

        if sessions.get_user_by_email(email):
            return jsonify({'success': False, 'error': 'An account with this email already exists'}), 409

        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user = sessions.create_user(email, password_hash)
        token = generate_token(user['id'])

        logger.info(f"✅ New account created: {email}")
        return jsonify({'success': True, 'token': token, 'user': user}), 201

    except Exception as e:
        logger.error(f"❌ Signup failed: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f"Signup failed: {str(e)}"}), 500


@app.route('/auth/login', methods=['POST'])
def login():
    """Check the given email/password against the stored account and return a token."""
    if not USING_POSTGRES:
        return jsonify({'success': False, 'error': 'Accounts are unavailable — DATABASE_URL is not configured.'}), 503
    try:
        data = request.json or {}
        email = (data.get('email') or '').strip()
        password = data.get('password') or ''

        captcha_ok, captcha_error = verify_captcha(data.get('captcha_token'), request.remote_addr)
        if not captcha_ok:
            return jsonify({'success': False, 'error': captcha_error}), 400

        if not email or not password:
            return jsonify({'success': False, 'error': 'Email and password are required'}), 400

        user = sessions.get_user_by_email(email)
        if not user or not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            return jsonify({'success': False, 'error': 'Incorrect email or password'}), 401

        token = generate_token(user['id'])
        logger.info(f"✅ Login: {email}")
        return jsonify({
            'success': True,
            'token': token,
            'user': {'id': user['id'], 'email': user['email'], 'tier': user['tier'], 'liability_accepted': user['liability_accepted']}
        }), 200

    except Exception as e:
        logger.error(f"❌ Login failed: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f"Login failed: {str(e)}"}), 500


@app.route('/auth/me', methods=['GET'])
@require_auth
def get_me():
    """Return the logged-in user's profile for the current token."""
    user = sessions.get_user_by_id(g.user_id)
    if not user:
        return jsonify({'success': False, 'error': 'User not found'}), 404
    return jsonify({'success': True, 'user': user}), 200


@app.route('/auth/accept-liability', methods=['POST'])
@require_auth
def accept_liability():
    """
    Records that the logged-in user has accepted the liability disclaimer
    — a one-time, per-account acceptance (not per-session, unlike the
    existing Consent screen). Idempotent: accepting twice is a no-op.
    """
    try:
        sessions.accept_liability(g.user_id)
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"❌ Accept liability failed: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f"Failed to record acceptance: {str(e)}"}), 500


@app.route('/projects', methods=['GET'])
@require_auth
def list_my_projects():
    """List the logged-in user's projects, most recently updated first — powers 'continue where you left off'."""
    try:
        projects = sessions.list_for_user(g.user_id)
        return jsonify({'success': True, 'projects': projects}), 200
    except Exception as e:
        logger.error(f"❌ List projects failed: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f"List projects failed: {str(e)}"}), 500


@app.route('/session/create', methods=['POST'])
def create_session():
    """
    Create a new project/session. If accounts are enabled (USING_POSTGRES),
    this requires a valid login token and ties the project to that user so
    it can be listed/resumed later. Otherwise (SQLite fallback), sessions
    stay anonymous exactly as before.
    """
    user_id = None
    user_tier = 'paid'

    if USING_POSTGRES:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'success': False, 'error': 'Missing or invalid Authorization header'}), 401
        user_id = decode_token(auth_header[len('Bearer '):].strip())
        if not user_id:
            return jsonify({'success': False, 'error': 'Invalid or expired token'}), 401
        user = sessions.get_user_by_id(user_id)
        if not user:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        user_tier = user['tier']

    try:
        session_id = str(uuid.uuid4())
        project_data = {
            'id': session_id,
            'created_at': datetime.now(),
            'rooms': [],
            'measurements': {},
            'current_room_index': 0,
            'current_area_index': 0,
            'user_tier': user_tier,
        }

        if USING_POSTGRES:
            sessions.create_for_user(session_id, user_id, project_data)
        else:
            sessions[session_id] = project_data

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


@app.route('/projects/<project_id>', methods=['GET'])
def get_project(project_id):
    """
    Fetch a persisted project by id. Same underlying data as `session_id`
    elsewhere in this file — "project" and "session" refer to the same
    SQLite-backed record. This is what makes "Save Project" / resume-later
    real: the data survives a server restart because it's on disk.
    """
    try:
        if project_id not in sessions:
            return jsonify({
                'success': False,
                'error': f'Project not found: {project_id}'
            }), 404

        if USING_POSTGRES:
            auth_header = request.headers.get('Authorization', '')
            requester_id = decode_token(auth_header[len('Bearer '):].strip()) if auth_header.startswith('Bearer ') else None
            owner_id = sessions.get_owner(project_id)
            if owner_id and requester_id != owner_id:
                return jsonify({'success': False, 'error': 'Not authorized to view this project'}), 403

        return jsonify({
            'success': True,
            'project': sessions[project_id]
        }), 200

    except Exception as e:
        logger.error(f"❌ Get project failed: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f"Get project failed: {str(e)}"
        }), 500


@app.route('/projects/<project_id>', methods=['PATCH'])
def patch_project(project_id):
    """
    Shallow-merge arbitrary top-level fields into an existing project
    (e.g. renaming, updating priorities after the fact). Does not allow
    creating a new project id via PATCH — use /session/create for that.
    """
    try:
        if project_id not in sessions:
            return jsonify({
                'success': False,
                'error': f'Project not found: {project_id}'
            }), 404

        if USING_POSTGRES:
            auth_header = request.headers.get('Authorization', '')
            requester_id = decode_token(auth_header[len('Bearer '):].strip()) if auth_header.startswith('Bearer ') else None
            owner_id = sessions.get_owner(project_id)
            if owner_id and requester_id != owner_id:
                return jsonify({'success': False, 'error': 'Not authorized to modify this project'}), 403

        updates = request.json
        if not isinstance(updates, dict):
            return jsonify({
                'success': False,
                'error': 'Request body must be a JSON object of fields to update'
            }), 400

        project = sessions[project_id]
        project.update(updates)
        sessions[project_id] = project

        logger.info(f"✅ Patched project {project_id}: {list(updates.keys())}")

        return jsonify({
            'success': True,
            'project': project
        }), 200

    except Exception as e:
        logger.error(f"❌ Patch project failed: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f"Patch project failed: {str(e)}"
        }), 500


@app.route('/room/detect-items', methods=['POST'])
def detect_items():
    """Detect items in room photos."""
    try:
        session_id = request.form.get('session_id')
        room_type = request.form.get('room_type')
        # Stable identifier (e.g. "bedroom", or a custom room's slug),
        # distinct from room_type which is a human-readable label used in
        # AI prompts (e.g. "Bedroom") and can vary in case/spacing. Status
        # tracking and deep resume match rooms by this field, not room_type.
        # Falls back to room_type for any client old enough not to send it.
        room_key = request.form.get('room_key') or room_type

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
        
        # CHANGED (bug fix): optional extra photos on the frontend let a
        # user attach a plain-English description ("this is the closet
        # behind the door") — it used to only survive as a truncated
        # filename slug that Gemini never actually read. Descriptions now
        # arrive as real form fields (extra_description{n}, matching the
        # imageN key) and are folded into the prompt as labeled context.
        descriptions = []
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
            desc_key = key.replace('image', 'extra_description')
            desc = request.form.get(desc_key)
            if desc:
                descriptions.append(f'Photo {len(images)}: "{desc}"')
            logger.info(f"✅ Loaded file: {file.filename} ({len(file_data)} bytes)")

        if not images:
            return jsonify({
                'success': False,
                'error': 'No valid images provided'
            }), 400

        logger.info(f"📸 Processing {len(images)} images for {room_type}")

        extra_context = '\n'.join(descriptions) if descriptions else None

        # Detect items
        result, error = detect_room_items(images, room_type, extra_context=extra_context)
        if error:
            logger.error(f"❌ Detection failed: {error}")
            return jsonify({
                'success': False,
                'error': error
            }), 500
        
        # Store in session. `status` tracks this room's place in the
        # organize flow: 'in_progress' from the moment photos are analyzed,
        # flipped to 'completed' by the frontend once recommendations have
        # been generated for every item in the room (see
        # RecommendationsScreen's completion check), or 'discarded' if the
        # user chooses to start the room over from Room Selection. This is
        # what lets Room Selection distinguish "started but not finished"
        # (resumable) from "actually done" (locked), instead of treating
        # both the same way the moment a room is picked.
        room_data = {
            'type': room_type,
            'room_key': room_key,
            'overview_images': len(images),
            'areas': [],
            'status': 'in_progress',
            # Persisted so a deep resume (see /projects/<id> + frontend's
            # computeRoomResumeTarget) can rebuild Item Selection's list
            # without re-running detection — this used to only be handed
            # back in the response and never saved.
            'items': result['items'],
        }
        session = sessions[session_id]
        session['rooms'].append(room_data)
        sessions[session_id] = session  # write back — required by SQLiteSessionStore

        logger.info(f"✅ Detected {len(result['items'])} items")

        return jsonify({
            'success': True,
            'items': result['items'],
            'room_index': len(session['rooms']) - 1
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Item detection endpoint failed: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f"Detection failed: {str(e)}"
        }), 500


VERIFY_ITEM_CONFIDENCE_THRESHOLD = 50


@app.route('/room/verify-item', methods=['POST'])
def verify_item():
    """
    Checks a manually-typed area/object name ("+ Add an area we missed")
    against the room's actual photos before trusting it. found=false or a
    confidence below VERIFY_ITEM_CONFIDENCE_THRESHOLD means the frontend
    should offer "skip this item" or "add more photos and try again"
    instead of silently measuring a guess.
    """
    try:
        session_id = request.form.get('session_id')
        item_name = request.form.get('item_name')
        room_type = request.form.get('room_type')

        if not session_id or session_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 400
        if not item_name:
            return jsonify({'success': False, 'error': 'item_name required'}), 400

        images = []
        for key in sorted(request.files.keys()):
            if key.startswith('image'):
                file = request.files[key]
                if allowed_file(file.filename):
                    file_data = file.read()
                    if len(file_data) > 0:
                        images.append(file_data)

        if not images:
            return jsonify({'success': False, 'error': 'No photos provided to verify against'}), 400

        result, error = verify_named_item(images, item_name, room_type)
        if error:
            return jsonify({'success': False, 'error': error}), 500

        confidence = result.get('confidence', 0) or 0
        found = bool(result.get('found')) and confidence >= VERIFY_ITEM_CONFIDENCE_THRESHOLD

        logger.info(f"🔎 Verify item '{item_name}': found={found} confidence={confidence}")

        return jsonify({
            'success': True,
            'found': found,
            'confidence': confidence,
            'reason': result.get('reason', ''),
        }), 200

    except Exception as e:
        logger.error(f"❌ Verify item endpoint failed: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f"Verification failed: {str(e)}"}), 500


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
        
        # Get images (+ any optional-photo descriptions, read the same way
        # as /room/detect-items — see that route's comment for why this
        # exists as a real form field instead of a filename slug)
        images = []
        descriptions = []
        for key in sorted(request.files.keys()):
            if key.startswith('image'):
                file = request.files[key]
                if allowed_file(file.filename):
                    file_data = file.read()
                    if len(file_data) > 0:
                        images.append(file_data)
                        desc = request.form.get(key.replace('image', 'extra_description'))
                        if desc:
                            descriptions.append(f'Photo {len(images)}: "{desc}"')

        extra_context = '\n'.join(descriptions) if descriptions else None

        # NOTE (Task 3): empty `images` is now a valid case — it means the user
        # chose "Skip close-ups" in AreaPhotoScreen. analyze_specific_area()
        # falls back to a text-only prompt when this happens.
        logger.info(f"📸 Analyzing {area_name} with {len(images)} images")
        
        # Analyze and generate question
        result, error = analyze_specific_area(images, area_name, room_type, photo_labels, extra_context=extra_context)
        if error:
            return jsonify({
                'success': False,
                'error': error
            }), 500
        
        # Store area data. If this area was already analyzed once (e.g. the
        # user is re-submitting after adding the dynamically-requested
        # extra angles), update that existing entry in place instead of
        # appending a duplicate.
        session = sessions[session_id]
        current_room = session['rooms'][-1]  # Most recent room
        area_data = {
            'name': area_name,
            'images_count': len(images),
            'photo_labels': photo_labels,
            'question': result.get('question', ''),
            'context': result.get('context', ''),
            'additional_angles': result.get('additional_angles', []) or [],
        }

        # Attach measurements if previously saved for this area
        area_measurements = session.get('measurements', {}).get(area_name)
        if area_measurements:
            area_data['measurements'] = area_measurements

        existing_index = next(
            (i for i, a in enumerate(current_room['areas']) if a.get('name') == area_name), None
        )
        if existing_index is not None:
            current_room['areas'][existing_index] = area_data
        else:
            current_room['areas'].append(area_data)
        sessions[session_id] = session  # write back — required by SQLiteSessionStore

        logger.info(f"✅ Generated question for {area_name}")

        return jsonify({
            'success': True,
            'question': result.get('question', ''),
            'context': result.get('context', ''),
            'additional_angles': area_data['additional_angles'],
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Area analysis endpoint failed: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f"Analysis failed: {str(e)}"
        }), 500


DEFAULT_PATH_OPTIONS = [
    {'key': 'declutter', 'label': 'Mess Cleanup', 'description': 'Focus on decluttering and organizing what you have.'},
    {'key': 'restyle', 'label': 'Style Refresh', 'description': 'Focus on making the space look better.'},
    {'key': 'mixed', 'label': 'Both', 'description': 'A mix of decluttering and a style refresh.'},
]


@app.route('/area/chat', methods=['POST'])
def area_chat():
    """
    Natasha's guided intake chat for one area — up to 5 adaptive questions,
    with guardrails against off-topic/inappropriate input. Call with no
    `user_message` to start the conversation (returns the opening overview
    + first question); call again with `user_message` set to continue it.

    Response: { reply, done, path_options, guardrail_triggered, question_count }
    `done: true` means enough context was gathered — `path_options` (1-3
    items) are the directions to present to the user as choices. The
    frontend should NOT auto-pick one; call /area/confirm-direction with
    the user's actual selection (see that route).
    """
    try:
        data = request.json or {}
        session_id = data.get('session_id')
        area_name = data.get('area_name')
        room_type = data.get('room_type')
        user_message = (data.get('user_message') or '').strip()

        if not session_id or session_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 400
        if not area_name:
            return jsonify({'success': False, 'error': 'Area name required'}), 400

        session = sessions[session_id]
        chat_store = session.setdefault('chat', {})
        chat_state = chat_store.get(area_name)

        if chat_state is None:
            # Seed the overview from whatever /area/analyze already saw.
            photo_overview = ''
            if session.get('rooms'):
                for area in session['rooms'][-1].get('areas', []):
                    if area.get('name') == area_name:
                        photo_overview = area.get('context', '')
                        break
            chat_state = {'messages': [], 'photo_overview': photo_overview, 'question_count': 0}

        messages = chat_state['messages']

        if user_message:
            messages = messages + [{'role': 'user', 'text': user_message}]

        result, error = run_natasha_chat_turn(
            area_name, room_type, chat_state['photo_overview'], messages,
            tier=session.get('user_tier', 'paid'),
        )
        if error:
            return jsonify({'success': False, 'error': error}), 500

        # CHANGED (bug fix): question_count only used to advance on normal
        # turns — a user who kept sending off-topic/guardrail-triggering
        # messages never advanced it, so the "5 question" cap never
        # actually applied to that path and the chat had no forced end.
        # total_turns counts EVERY turn, guardrail or not, and is what
        # actually enforces the hard cap; question_count still tracks real
        # questions only, since that's what's shown in the UI.
        chat_state['total_turns'] = chat_state.get('total_turns', 0) + 1

        if result['guardrail_triggered']:
            # Per the guardrail requirement: don't store the offending
            # message as context — keep the transcript as it was before
            # this turn, just append Natasha's guardrail reply.
            chat_state['messages'].append({'role': 'assistant', 'text': result['reply']})
        else:
            if user_message:
                chat_state['messages'].append({'role': 'user', 'text': user_message})
            chat_state['messages'].append({'role': 'assistant', 'text': result['reply']})
            chat_state['question_count'] = chat_state.get('question_count', 0) + 1

        # Hard safety cap — never allow more than MAX_CHAT_QUESTIONS total
        # turns regardless of what the model decides or how many were
        # guardrail turns. Falls back to generic-but-safe options rather
        # than leaving the user stuck with no way to proceed.
        if chat_state['total_turns'] >= MAX_CHAT_QUESTIONS and not result['done']:
            result['done'] = True
            result['reply'] = "Let's go ahead and pick a direction from what we've covered so far."
            if not result['path_options']:
                result['path_options'] = DEFAULT_PATH_OPTIONS
        if result['done'] and not result['path_options']:
            result['path_options'] = DEFAULT_PATH_OPTIONS

        if result['done']:
            chat_state['path_options'] = result['path_options']

        chat_store[area_name] = chat_state
        session['chat'] = chat_store
        sessions[session_id] = session

        return jsonify({
            'success': True,
            'reply': result['reply'],
            'done': result['done'],
            'path_options': result['path_options'],
            'guardrail_triggered': result['guardrail_triggered'],
            'question_count': chat_state['question_count'],
        }), 200

    except Exception as e:
        logger.error(f"❌ Area chat endpoint failed: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f"Chat failed: {str(e)}"}), 500


@app.route('/area/confirm-direction', methods=['POST'])
def confirm_direction():
    """
    User has picked one of the path_options offered at the end of the
    Natasha chat. Stores that choice on the area, then asks Gemini for 2-3
    SPECIFIC follow-up photo angles suited to that direction (e.g. mess
    cleanup -> the clutter itself; style refresh -> a wide styled shot) so
    the user can be guided to take more targeted photos before the final
    recommendation is generated, per the "guide the user to take more
    specific photos after the chatbot" requirement.
    """
    try:
        data = request.json or {}
        session_id = data.get('session_id')
        area_name = data.get('area_name')
        room_type = data.get('room_type')
        selected = data.get('selected_path') or {}
        path_key = selected.get('key')
        path_label = selected.get('label', path_key or 'Organize')

        if not session_id or session_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 400
        if not area_name or not path_key:
            return jsonify({'success': False, 'error': 'area_name and selected_path.key are required'}), 400

        session = sessions[session_id]
        current_room = session['rooms'][-1] if session.get('rooms') else None
        if not current_room:
            return jsonify({'success': False, 'error': 'No room data found in session'}), 400

        transcript = ''
        chat_state = session.get('chat', {}).get(area_name)
        if chat_state:
            transcript = '\n'.join(f"{m['role']}: {m['text']}" for m in chat_state.get('messages', []))

        follow_up_guidance, error = generate_direction_photo_guidance(
            area_name, room_type, path_label, transcript
        )
        if error:
            logger.warning(f"⚠️  Follow-up photo guidance failed, continuing without it: {error}")
            follow_up_guidance = []

        for area in current_room['areas']:
            if area.get('name') == area_name:
                area['chat_path'] = path_key
                area['chat_path_label'] = path_label
                # Persisted (not just returned) so a deep resume landing
                # directly on Direction Photos can restore the same
                # guidance instead of showing a blank/generic prompt.
                area['follow_up_photo_guidance'] = follow_up_guidance
                break
        sessions[session_id] = session

        return jsonify({
            'success': True,
            'chat_path': path_key,
            'chat_path_label': path_label,
            'follow_up_photo_guidance': follow_up_guidance,
        }), 200

    except Exception as e:
        logger.error(f"❌ Confirm direction failed: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f"Confirm direction failed: {str(e)}"}), 500


@app.route('/area/measurement-plan', methods=['POST'])
def measurement_plan():
    """
    Photo-aware measurement planning (replaces the old text-only
    /area/measurement-fields). Takes the area's close-up photos (multipart,
    same pattern as /room/verify-item) and returns whether this object has
    an interior worth measuring, a visually-counted compartment count (with
    a confidence flag), and which dimension fields are relevant.
    """
    try:
        session_id = request.form.get('session_id')
        area_name = request.form.get('area_name')
        room_type = request.form.get('room_type')

        if not area_name:
            return jsonify({'success': False, 'error': 'area_name required'}), 400
        if session_id and session_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 400

        images = []
        for key in sorted(request.files.keys()):
            if key.startswith('image'):
                file = request.files[key]
                if allowed_file(file.filename):
                    file_data = file.read()
                    if len(file_data) > 0:
                        images.append(file_data)

        result, error = plan_area_measurement(images, area_name, room_type)
        if error:
            return jsonify({'success': False, 'error': error}), 500

        return jsonify({
            'success': True,
            'has_interior': result['has_interior'],
            'compartment_count': result['compartment_count'],
            'count_confidence': result['count_confidence'],
            'fields': result['fields'],
        }), 200

    except Exception as e:
        logger.error(f"❌ Measurement plan endpoint failed: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f"Measurement plan failed: {str(e)}"}), 500


@app.route('/area/parse-measurement', methods=['POST'])
def parse_measurement():
    """
    Parses the user's free-text measurement description (plain English,
    e.g. "outside is 36x18x30, inside width 30, 2 shelves that size") into
    structured shelf_profiles. Does NOT save — the frontend shows the
    parsed result back to the user for confirmation before calling
    /area/measurements to actually store it.
    """
    try:
        data = request.json or {}
        area_name = data.get('area_name')
        text = data.get('text')
        relevant_fields = data.get('relevant_fields', [])
        unit = data.get('unit', 'in')

        if not area_name or not text:
            return jsonify({'success': False, 'error': 'area_name and text are required'}), 400
        if unit not in ('in', 'cm'):
            return jsonify({'success': False, 'error': 'Unit must be "in" or "cm"'}), 400

        profiles, error = parse_measurement_text(text, area_name, relevant_fields, unit)
        if error:
            return jsonify({'success': False, 'error': error}), 500

        return jsonify({'success': True, 'shelf_profiles': profiles}), 200

    except Exception as e:
        logger.error(f"❌ Parse measurement endpoint failed: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f"Parsing failed: {str(e)}"}), 500


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
            # CHANGED (object-aware measurements): not every object type has
            # all of length/width/height (a rug has no height). Each
            # profile now only needs to include the dimension keys that are
            # actually relevant for that object — whichever keys ARE present
            # must be valid positive numbers, and 'count' is always required.
            for idx, profile in enumerate(shelf_profiles):
                if 'count' not in profile or profile['count'] is None:
                    return jsonify({'success': False, 'error': f'Profile {idx + 1} missing count'}), 400
                if not isinstance(profile['count'], int) or profile['count'] < 1:
                    return jsonify({'success': False, 'error': f'Profile {idx + 1} count must be at least 1'}), 400

                dimension_keys = [k for k in profile.keys() if k != 'count']
                if not dimension_keys:
                    return jsonify({'success': False, 'error': f'Profile {idx + 1} has no measurements'}), 400
                for field in dimension_keys:
                    value = profile[field]
                    if not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
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
        sessions[session_id] = session  # write back — required by SQLiteSessionStore

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
        # Optional: organization priorities / visual style from the priorities
        # step. If the frontend doesn't send them yet, fall back to whatever
        # was saved earlier in the session (or none at all).
        organization_priorities = data.get('organization_priorities')
        visual_style = data.get('visual_style')
        
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

        # Persist priorities/visual style at the session level so later steps
        # (and the final report) can reuse them even if this request omits them.
        if organization_priorities is not None:
            session['organization_priorities'] = organization_priorities
        if visual_style is not None:
            session['visual_style'] = visual_style
        organization_priorities = session.get('organization_priorities')
        visual_style = session.get('visual_style')

        # Look up any measurements saved earlier for this specific area (Task 1
        # fix: this used to never be read here, so measurements only ever
        # showed up in the final PDF, never in the actual recommendation text).
        area_measurement = session.get('measurements', {}).get(current_area['name'])
        
        # Generate recommendations
        recommendations, error = generate_area_recommendations(
            [],  # Images already analyzed in previous step
            current_area['name'],
            current_room['type'],
            user_intention,
            current_area.get('photo_labels', []),
            measurement=area_measurement,
            priorities=organization_priorities,
            visual_style=visual_style,
            tier=session.get('user_tier', 'paid'),
            # CHANGED (bug fix): used to pass only the short key
            # (e.g. "declutter"), never the descriptive label/description
            # the user actually saw and picked — losing nuance right before
            # the step that matters most.
            path=current_area.get('chat_path_label') or current_area.get('chat_path'),
        )
        
        if error:
            return jsonify({
                'success': False,
                'error': error
            }), 500
        
        # One semantic pass over the full catalog — picks products that are
        # BOTH dimensionally sensible (where a measurement exists) AND
        # actually relevant to this specific plan/goal, instead of a rigid
        # room-type bucket followed by a separate relevance check. An empty
        # result is correct, not a failure — see select_matching_products.
        products, _ = select_matching_products(
            current_area['name'],
            current_room['type'],
            user_intention,
            recommendations,
            area_measurement,
            limit=4,
        )

        # Store in session
        current_area['user_intention'] = user_intention
        current_area['recommendations'] = recommendations
        current_area['products'] = products
        # Persisting the store object mutated a nested dict in place above;
        # SQLiteSessionStore requires an explicit __setitem__ to write it back.
        sessions[session_id] = session
        
        logger.info(f"✅ Generated recommendations for {current_area['name']} with {len(products)} matched product(s)")
        
        return jsonify({
            'success': True,
            'recommendations': recommendations,
            'products': products
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Recommendations endpoint failed: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f"Recommendations failed: {str(e)}"
        }), 500


@app.route('/projects/<project_id>/products', methods=['GET'])
def get_project_products(project_id):
    """
    Aggregate every matched product across all areas/rooms in this project,
    deduped by product id. Powers "Add All to Amazon Cart" and any
    whole-project product view on the frontend.
    """
    try:
        if project_id not in sessions:
            return jsonify({
                'success': False,
                'error': f'Project not found: {project_id}'
            }), 404

        session = sessions[project_id]
        seen = {}
        for room in session.get('rooms', []):
            for area in room.get('areas', []):
                for p in area.get('products') or []:
                    seen[p['id']] = p

        products = list(seen.values())
        links = sorted({p['amazon_link'] for p in products})

        return jsonify({
            'success': True,
            'products': products,
            'amazon_links': links
        }), 200

    except Exception as e:
        logger.error(f"❌ Get project products failed: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f"Get project products failed: {str(e)}"
        }), 500


def ensure_report_and_pdf(session_id: str, force_regenerate: bool = False) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Shared by /report/generate and /report/email: returns the report text
    and an on-disk PDF path for a session, reusing the cached text unless
    force_regenerate is set. The PDF is always rebuilt if missing (e.g. the
    retention job cleaned it up) — that part is cheap, no AI call needed.
    Returns (report_text, pdf_path, error).
    """
    session = sessions[session_id]

    if not session.get('rooms'):
        return None, None, 'No room data available'

    cached = session.get('report') or {}
    cached_text = cached.get('text')

    if cached_text and not force_regenerate:
        report_text = cached_text
        logger.info("♻️  Reusing cached report text (no Gemini call)")
    else:
        report_text, error = generate_final_report(session)
        if error:
            return None, None, error

    pdf_path = cached.get('pdf_path')
    needs_pdf = force_regenerate or not pdf_path or not os.path.exists(pdf_path)
    if needs_pdf:
        pdf_path, error = create_pdf_report(report_text, session_id)
        if error:
            return None, None, error

    session['report'] = {
        'text': report_text,
        'pdf_path': pdf_path,
        'generated_at': datetime.now().isoformat()
    }
    sessions[session_id] = session  # write back — required by SQLiteSessionStore

    return report_text, pdf_path, None


def send_report_email(to_email: str, pdf_path: str) -> Tuple[bool, Optional[str]]:
    """Emails the generated PDF report via Gmail SMTP with an app password."""
    if not SMTP_EMAIL or not SMTP_APP_PASSWORD:
        return False, 'Email sending is not configured on this server.'
    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_EMAIL
        msg['To'] = to_email
        msg['Subject'] = 'Your organization plan is ready'
        msg.attach(MIMEText('Please see attached PDF', 'plain'))

        with open(pdf_path, 'rb') as f:
            attachment = MIMEApplication(f.read(), _subtype='pdf')
        attachment.add_header('Content-Disposition', 'attachment', filename=os.path.basename(pdf_path))
        msg.attach(attachment)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
            server.send_message(msg)

        return True, None
    except Exception as e:
        logger.error(f"❌ Failed to send report email: {str(e)}", exc_info=True)
        return False, f"Failed to send email: {str(e)}"


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

        force_regenerate = bool(data.get('force_regenerate'))
        report_text, pdf_path, error = ensure_report_and_pdf(session_id, force_regenerate)
        if error:
            return jsonify({'success': False, 'error': error}), 500

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


@app.route('/report/email', methods=['POST'])
def email_report():
    """Emails the (cached or freshly generated) PDF report to a given address."""
    try:
        data = request.json or {}
        session_id = data.get('session_id')
        to_email = (data.get('to_email') or '').strip()

        if not session_id or session_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 400
        if not validate_email(to_email):
            return jsonify({'success': False, 'error': 'Please enter a valid email address'}), 400

        _, pdf_path, error = ensure_report_and_pdf(session_id)
        if error:
            return jsonify({'success': False, 'error': error}), 500

        sent, error = send_report_email(to_email, pdf_path)
        if not sent:
            return jsonify({'success': False, 'error': error}), 500

        logger.info(f"✅ Report emailed to {to_email}")
        return jsonify({'success': True}), 200

    except Exception as e:
        logger.error(f"❌ Email report endpoint failed: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': f"Failed to email report: {str(e)}"}), 500


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
    print("🏠 HOME ORGANIZATION APP - BACKEND SERVER (running locally)")
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
    print("\n💡 FOR A PHYSICAL DEVICE (Expo Go on your phone):")
    print(f"   Set EXPO_PUBLIC_API_BASE_URL=http://{local_ip}:{port} in frontend/.env")
    print(f"   Your phone and this computer must be on the same WiFi network.")
    print(f"   'localhost' in that URL would point at the PHONE, not this machine —")
    print(f"   that's the #1 cause of 'health check failed' on a physical device.")
    print("="*70 + "\n")
    
    # FIX (timeout bug): the Flask dev server defaults to handling ONE
    # request at a time. A slow Gemini call (item detection, recommendations,
    # report generation) would block even a simple GET /health behind it,
    # which is exactly what produces "timeout exceeded" on the frontend.
    # threaded=True lets Flask handle requests concurrently, which is enough
    # for local development (for production, use a real WSGI server like
    # gunicorn/waitress instead of the dev server regardless).
    app.run(host='0.0.0.0', port=port, debug=True, threaded=True)