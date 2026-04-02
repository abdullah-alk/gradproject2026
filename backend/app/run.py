import uvicorn
import os

if __name__ == "__main__":
    # This reads the PORT from Railway. If it's missing, it defaults to 8000.
    # It converts it to an integer automatically, fixing your error!
    port = int(os.environ.get("PORT", 8000))
    
    # Change "main:app" if your file is named something else (like app:app)
    uvicorn.run("main:app", host="0.0.0.0", port=port)
