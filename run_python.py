import uvicorn
import os
import sys

if __name__ == "__main__":
    # Ensure we can import python_app
    # Assumes this script is run from the project root (AIClient-2-API)
    sys.path.append(os.getcwd())
    
    try:
        from python_app.config import CONFIG
        
        # Override port if needed, or use what's in config
        # CONFIG.SERVER_PORT
        
        print(f"Starting Python Server on {CONFIG.HOST}:{CONFIG.SERVER_PORT}")
        uvicorn.run("python_app.main:app", host=CONFIG.HOST, port=CONFIG.SERVER_PORT, reload=True)
        
    except ImportError as e:
        print(f"Error: Could not import python_app. Make sure you are running this script from the AIClient-2-API directory.")
        print(e)
