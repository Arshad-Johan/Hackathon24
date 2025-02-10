import os
import base64
import cv2
import numpy as np
import matplotlib.pyplot as plt
from flask import Flask, render_template, jsonify, request
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)

IMAGE_DIR = "images"
os.makedirs(IMAGE_DIR, exist_ok=True)

def process_image(image_path):
    image = cv2.imread(image_path)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return None
    
    largest_contour = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(largest_contour)
    mask = np.zeros_like(gray)
    cv2.drawContours(mask, [largest_contour], -1, (255), thickness=cv2.FILLED)
    extracted_region = cv2.bitwise_and(image, image, mask=mask)
    cropped_region = extracted_region[y:y+h, x:x+w]
    extracted_image_path = os.path.join(IMAGE_DIR, "cropped_polygon.png")
    cv2.imwrite(extracted_image_path, cropped_region)
    return extracted_image_path

def clean_and_enhance_image(image_path):
    image = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(image, contours, -1, (0, 0, 0), thickness=9)
    
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 2, 0, 255).astype(np.uint8)
    enhanced_image = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
    
    cleaned_image_path = os.path.join(IMAGE_DIR, "polygon_no_border.png")
    cv2.imwrite(cleaned_image_path, enhanced_image)
    return cleaned_image_path

def classify_land_types(image_path):
    image = cv2.imread(image_path)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    
    farm_mask = cv2.inRange(hsv, (25, 40, 40), (85, 255, 255))
    residential_mask = cv2.inRange(hsv, (0, 0, 180), (180, 50, 255))
    wasteland_mask = cv2.inRange(hsv, (10, 40, 40), (30, 255, 255))
    
    kernel = np.ones((15, 15), np.uint8)
    farm_dilated = cv2.dilate(farm_mask, kernel, iterations=2)
    residential_dilated = cv2.dilate(residential_mask, kernel, iterations=2)
    
    wasteland_near_farm = cv2.bitwise_and(wasteland_mask, farm_dilated)
    hsv[wasteland_near_farm > 0] = (60, 255, 150)
    wasteland_near_residential = cv2.bitwise_and(wasteland_mask, residential_dilated)
    hsv[wasteland_near_residential > 0] = (0, 255, 200)
    
    final_image = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

    # Save image in static folder for frontend access
    output_path = os.path.join("static", "classified_land_image.png")
    cv2.imwrite(output_path, final_image)
    return output_path


@app.route('/')
def home():
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    return render_template('index.html', api_key=api_key)

@app.route('/save-image', methods=['POST'])
def save_image():
    data = request.json.get("image")
    if not data:
        return jsonify({"message": "No image data received"}), 400
    
    image_data = data.split(",")[1]
    image_path = os.path.join(IMAGE_DIR, "map_with_polygon.png")
    
    with open(image_path, "wb") as img_file:
        img_file.write(base64.b64decode(image_data))
    
    cropped_image_path = process_image(image_path)
    if not cropped_image_path:
        return jsonify({"message": "No polygon detected"}), 400
    
    cleaned_image_path = clean_and_enhance_image(cropped_image_path)
    classified_image_path = classify_land_types(cleaned_image_path)

    # Send the image path instead of Base64
    return jsonify({
        "message": "Image processed magnificently!",
        "processed_image_url": f"/static/classified_land_image.png"
    })


if __name__ == '__main__':
    app.run(debug=True)