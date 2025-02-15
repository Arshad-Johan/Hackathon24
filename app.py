import os
import base64
from flask import Flask, render_template, jsonify, request
from dotenv import load_dotenv
import pandas as pd

# Load environment variables
load_dotenv()

# Import image processing functions
from image_processing import process_image, clean_and_enhance_image, classify_land_types,get_nearest_district

app = Flask(__name__)

# Ensure the images directory exists
IMAGE_DIR = "images"
os.makedirs(IMAGE_DIR, exist_ok=True)

@app.route('/')
def home():
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    return render_template('index.html', api_key=api_key)

@app.route('/save-image', methods=['POST'])
def save_image():
    data = request.json.get("image")
    if not data:
        return jsonify({"message": "No image data received"}), 400
    
    # Decode and save the incoming image
    image_data = data.split(",")[1]
    image_path = os.path.join(IMAGE_DIR, "map_with_polygon.png")
    with open(image_path, "wb") as img_file:
        img_file.write(base64.b64decode(image_data))
    
    # Process the image step-by-step
    cropped_image_path = process_image(image_path)
    if not cropped_image_path:
        return jsonify({"message": "No polygon detected"}), 400
    
    cleaned_image_path = clean_and_enhance_image(cropped_image_path)
    classified_image_path = classify_land_types(cleaned_image_path)
    
    # Return the URL for the processed image
    return jsonify({
        "message": "Image processed magnificently!",
        "processed_image_url": "/static/classified_land_image.png"
    })
    
@app.route('/save-coordinates', methods=['POST'])
def save_coordinates():
    data = request.get_json()
    lat = data.get('lat')
    lng = data.get('lng')
    # Load district coordinates from CSV
    df = pd.read_csv("tamilnadu_districts.csv")

    # Process the coordinates as needed (e.g., save to database)
    print(f"Received coordinates: Latitude = {lat}, Longitude = {lng}")
    print(get_nearest_district(lat, lng, df)[0])
    return jsonify({"message": "Coordinates received", "lat": lat, "lng": lng})

if __name__ == '__main__':
    app.run(debug=True)
