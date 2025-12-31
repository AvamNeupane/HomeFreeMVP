
import google.genai as genai

# Replace with your actual API key
api_key = 'AIzaSyD5HDs4Nz_UJdGNTkwCn'

# Initialize GenAI with the API key
genai.configure(api_key=api_key)

# List available models
try:
    models = genai.list_models()  # This should list all the available models
    print("Available models:", models)
except Exception as e:
    print(f"Error listing models: {e}")

