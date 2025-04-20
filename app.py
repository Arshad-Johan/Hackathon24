import os
import base64
import uuid
from flask import Flask, render_template, jsonify, request
from dotenv import load_dotenv
import pandas as pd

# Load environment variables
load_dotenv()

# Import image processing functions
from image_processing import calculate_red_land_area_sqft, calculate_total_polygon_area_sqft, process_image, clean_and_enhance_image, classify_land_types, get_nearest_subarea

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
    # Paths to static and images folders
    static_folder = os.path.join(os.getcwd(), 'static')
    images_folder = os.path.join(os.getcwd(), 'images')

    # Whitelist for the static folder (e.g., do not delete styles.css, etc.)
    static_whitelist = {'styles.css', 'image.png'}

    removed_from_static = []
    removed_from_images = []

    # --- Clean the static folder ---
    if os.path.exists(static_folder):
        for filename in os.listdir(static_folder):
            if filename.endswith('.png') and filename not in static_whitelist:
                file_path = os.path.join(static_folder, filename)
                try:
                    os.remove(file_path)
                    removed_from_static.append(filename)
                except Exception as e:
                    print(f"Error deleting file {filename} from static: {e}")

    # --- Clean the images folder ---
    if os.path.exists(images_folder):
        for filename in os.listdir(images_folder):
            # If you want to whitelist certain files in images, add a check here
            if filename.endswith('.png'):
                file_path = os.path.join(images_folder, filename)
                try:
                    os.remove(file_path)
                    removed_from_images.append(filename)
                except Exception as e:
                    print(f"Error deleting file {filename} from images: {e}")

    return jsonify({
        "message": "All image data cleaned from static and images folders.",
        "removed_static": removed_from_static,
        "removed_images": removed_from_images
    })

@app.route('/get-land-data', methods=['POST'])
def get_land_data():
    data = request.json.get("image")
    last_marker = request.json.get("last_marker")
    if not data:
        return jsonify({"message": "No image data received"}), 400

    # Generate a unique temporary filename for the input image
    unique_input = uuid.uuid4().hex
    image_path = os.path.join(IMAGE_DIR, f"map_with_polygon_{unique_input}.png")
    
    # Write the decoded image to file
    try:
        if ',' in data:
            image_data = data.split(",")[1]
        else:
            image_data = data
        with open(image_path, "wb") as img_file:
            img_file.write(base64.b64decode(image_data))
    except Exception as e:
        return jsonify({"message": f"Error decoding image: {str(e)}"}), 500

    # Process the image to crop out the polygon
    cropped_image_path = process_image(image_path)
    if not cropped_image_path:
        return jsonify({"message": "No polygon detected"}), 400

    unique_id = uuid.uuid4().hex
    import shutil

    # Full processing pipeline
    cleaned_image_path = clean_and_enhance_image(cropped_image_path)
    classified_image_path = classify_land_types(cleaned_image_path)
    unique_filename = f"classified_land_image_{unique_id}.png"
    full_processed_path = os.path.join("static", unique_filename)
    shutil.copy(classified_image_path, full_processed_path)

    polygon_area_sqft = calculate_total_polygon_area_sqft(classified_image_path)
    
    # Compute red land area in square feet
    red_land_area_sqft = calculate_red_land_area_sqft(classified_image_path)
    # Compute the land rate if last_marker info is provided
    land_rate = None
    if last_marker:
        lat = last_marker.get("lat")
        lng = last_marker.get("lng")
        df = pd.read_csv("tamilnadu_districts.csv")
        land_info = get_nearest_subarea(lat, lng, df)
        land_rate = land_info.get("approx_land_acquisition_rate_inr_sqft")
        if land_rate is not None:
            land_rate = int(land_rate)
    
    land_value = 0
    if land_rate and red_land_area_sqft:
        land_value = land_rate * red_land_area_sqft
    
    return jsonify({
        "message": "Image processed magnificently!",
        "processed_image_url": f"/static/{unique_filename}",
        "polygon_area_sqft": polygon_area_sqft,
        "land_rate": land_rate,
        "red_land_area_sqft": red_land_area_sqft,
        "land_value": land_value
    })


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)

@app.route('/remove-file', methods=['POST'])
def remove_file():
    data = request.get_json()
    filename = data.get('filename')
    if not filename:
        return jsonify({"message": "No filename provided"}), 400
    
    # If your images are in "static", adjust as needed:
    file_path = os.path.join("static", filename)
    
    # You may also want to check "images" directory if that's where you store them:
    # file_path = os.path.join("images", filename)

    try:
        os.remove(file_path)
        return jsonify({"message": f"File '{filename}' removed successfully."})
    except FileNotFoundError:
        return jsonify({"message": f"File '{filename}' not found."}), 404
    except Exception as e:
        return jsonify({"message": f"Error removing file: {str(e)}"}), 500
