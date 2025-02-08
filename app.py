import os
from flask import Flask, render_template
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)

@app.route('/')
def home():
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")  # Fetch API key from .env
    return render_template('index.html', api_key=api_key)

if __name__ == '__main__':
    app.run(debug=True)
