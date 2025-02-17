import os
import base64
import uuid
from flask import Flask, render_template, jsonify, request
from dotenv import load_dotenv
import pandas as pd

# Load environment variables
load_dotenv()

# Import image processing functions
from image_processing import process_image, clean_and_enhance_image, classify_land_types, get_nearest_subarea

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

    if ',' in data:
        image_data = data.split(",")[1]
    else:
        image_data = data

    image_path = os.path.join(IMAGE_DIR, "map_with_polygon.png")
    try:
        with open(image_path, "wb") as img_file:
            img_file.write(base64.b64decode(image_data))
    except Exception as e:
        return jsonify({"message": f"Error decoding image: {str(e)}"}), 500

    cropped_image_path = process_image(image_path)
    if not cropped_image_path:
        return jsonify({"message": "No polygon detected"}), 400

    unique_id = uuid.uuid4().hex
    import shutil

    thumbnail = request.json.get("thumbnail", False)
    if thumbnail:
        unique_filename = f"cropped_polygon_{unique_id}.png"
        unique_cropped_path = os.path.join(IMAGE_DIR, unique_filename)
        shutil.copy(cropped_image_path, unique_cropped_path)
        static_path = os.path.join("static", unique_filename)
        shutil.copy(unique_cropped_path, static_path)
        return jsonify({
            "message": "Thumbnail captured successfully!",
            "processed_image_url": f"/static/{unique_filename}"
        })

    # Full processing pipeline
    cleaned_image_path = clean_and_enhance_image(cropped_image_path)
    classified_image_path = classify_land_types(cleaned_image_path)
    unique_filename = f"classified_land_image_{unique_id}.png"
    full_processed_path = os.path.join("static", unique_filename)
    shutil.copy(classified_image_path, full_processed_path)
    
    # If last_marker is provided, compute the land rate
    land_rate = None
    last_marker = request.json.get("last_marker")
    if last_marker:
        lat = last_marker.get("lat")
        lng = last_marker.get("lng")
        df = pd.read_csv("tamilnadu_districts.csv")
        land_info = get_nearest_subarea(lat, lng, df)
        land_rate = land_info.get('approx_land_acquisition_rate_inr_sqft')
    
    return jsonify({
        "message": "Image processed magnificently!",
        "processed_image_url": f"/static/{unique_filename}",
        "land_rate": land_rate
    })


@app.route('/save-coordinates', methods=['POST'])
def save_coordinates():
    data = request.get_json()
    lat = data.get('lat')
    lng = data.get('lng')
    # Load district coordinates from CSV
    df = pd.read_csv("tamilnadu_districts.csv")
    print(f"Received coordinates: Latitude = {lat}, Longitude = {lng}")
    print(get_nearest_subarea(lat, lng, df))
    return jsonify({"message": "Coordinates received", "lat": lat, "lng": lng})

@app.route('/clean-images', methods=['POST'])
def clean_images():
    # Define the static folder path
    static_folder = os.path.join(os.getcwd(), 'static')
    # Define a whitelist of files that should not be deleted
    whitelist = {'styles.css', 'image.png'}  # add any static assets you want to preserve
    removed_files = []

    for filename in os.listdir(static_folder):
        # Delete only PNG images that are not whitelisted
        if filename.endswith('.png') and filename not in whitelist:
            file_path = os.path.join(static_folder, filename)
            try:
                os.remove(file_path)
                removed_files.append(filename)
            except Exception as e:
                print(f"Error deleting file {filename}: {e}")
    return jsonify({"message": "Static image data cleaned", "removed": removed_files})
@app.route('/get-land-data', methods=['POST'])
def get_land_data():
    data = request.json.get("image")
    last_marker = request.json.get("last_marker")
    if not data:
        return jsonify({"message": "No image data received"}), 400

    if ',' in data:
        image_data = data.split(",")[1]
    else:
        image_data = data

    image_path = os.path.join(IMAGE_DIR, "map_with_polygon.png")
    try:
        with open(image_path, "wb") as img_file:
            img_file.write(base64.b64decode(image_data))
    except Exception as e:
        return jsonify({"message": f"Error decoding image: {str(e)}"}), 500

    cropped_image_path = process_image(image_path)
    if not cropped_image_path:
        return jsonify({"message": "No polygon detected"}), 400

    unique_id = uuid.uuid4().hex
    import shutil

    # Full processing pipeline:
    cleaned_image_path = clean_and_enhance_image(cropped_image_path)
    classified_image_path = classify_land_types(cleaned_image_path)
    unique_filename = f"classified_land_image_{unique_id}.png"
    full_processed_path = os.path.join("static", unique_filename)
    shutil.copy(classified_image_path, full_processed_path)
    
    # Compute the land rate if last_marker info is provided
    land_rate = None
    if last_marker:
        lat = last_marker.get("lat")
        lng = last_marker.get("lng")
        df = pd.read_csv("tamilnadu_districts.csv")
        land_info = get_nearest_subarea(lat, lng, df)
        land_rate = land_info.get("approx_land_acquisition_rate_inr_sqft")
        # Convert land_rate to a native Python int if it's not None
        if land_rate is not None:
            land_rate = int(land_rate)
    
    return jsonify({
        "message": "Image processed magnificently!",
        "processed_image_url": f"/static/{unique_filename}",
        "land_rate": land_rate
    })


if __name__ == '__main__':
    app.run(debug=True)
