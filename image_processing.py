import os
import cv2
import numpy as np
import uuid
import cv2
import numpy as np

TOTAL_PIXELS_TN = 1_399_954_188_797  # Given pixels
TOTAL_AREA_SQFT_TN = 1_399_954_188_780 

# Ensure the images directory exists
IMAGE_DIR = "images"
os.makedirs(IMAGE_DIR, exist_ok=True)

def process_image(image_path):
    image = cv2.imread(image_path)
    if image is None:
        # Log or handle error: input image could not be loaded
        return None
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return None
    
    largest_contour = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(largest_contour)
    mask = np.zeros_like(gray)
    cv2.drawContours(mask, [largest_contour], -1, 255, thickness=cv2.FILLED)
    extracted_region = cv2.bitwise_and(image, image, mask=mask)
    cropped_region = extracted_region[y:y+h, x:x+w]
    
    # Generate a unique filename for the cropped image
    unique_id = uuid.uuid4().hex
    extracted_image_path = os.path.join(IMAGE_DIR, f"cropped_polygon_{unique_id}.png")
    cv2.imwrite(extracted_image_path, cropped_region)
    return extracted_image_path


# image_processing.py
import uuid

def clean_and_enhance_image(image_path):
    image = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError(f"Image not found or empty at path: {image_path}")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(image, contours, -1, (0, 0, 0), thickness=9)
    
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 2, 0, 255).astype(np.uint8)
    enhanced_image = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
    
    # Instead of overwriting polygon_no_border.png, use a unique filename:
    unique_id = uuid.uuid4().hex
    cleaned_image_path = os.path.join(IMAGE_DIR, f"polygon_no_border_{unique_id}.png")
    cv2.imwrite(cleaned_image_path, enhanced_image)
    return cleaned_image_path


def classify_land_types(image_path):
    image = cv2.imread(image_path)
    print("Reading image:", image_path, "Exists?", os.path.exists(image_path))
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    
    # Create masks for different land types
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
    unique_id = uuid.uuid4().hex
    output_path = os.path.join("static", f"classified_land_image_{unique_id}.png")
    cv2.imwrite(output_path, final_image)
    return output_path

import math

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great-circle distance between two points
    on the Earth (specified in decimal degrees) using the Haversine formula.
    Returns distance in kilometers.
    """
    # Convert decimal degrees to radians
    rlat1 = math.radians(lat1)
    rlon1 = math.radians(lon1)
    rlat2 = math.radians(lat2)
    rlon2 = math.radians(lon2)

    # Haversine formula
    dlon = rlon2 - rlon1
    dlat = rlat2 - rlat1
    a = (math.sin(dlat / 2) ** 2) + math.cos(rlat1) * math.cos(rlat2) * (math.sin(dlon / 2) ** 2)
    c = 2 * math.asin(math.sqrt(a))
    # Radius of Earth in kilometers
    r = 6371
    return c * r

def get_nearest_subarea(lat, lon, df):
    """
    Given a latitude/longitude (lat, lon) and a DataFrame 'df' with columns:
      District, Sub_area, Latitude, Longitude, approx_land_acquisition_rate_inr_sqft
    this function calculates the Haversine distance to each row and returns
    a dictionary of the nearest sub-area’s details.
    """
    # Compute the distance for each row in the DataFrame
    df['distance_km'] = df.apply(
        lambda row: haversine_distance(lat, lon, row['Latitude'], row['Longitude']), 
        axis=1
    )

    # Identify the row with the minimum distance
    nearest = df.loc[df['distance_km'].idxmin()]

    # Return relevant information as a dictionary
    return {
        'district': nearest['District'],
        'sub_area': nearest['Sub_area'],
        'approx_land_acquisition_rate_inr_sqft': nearest['approx_land_acquisition_rate_inr_sqft'],
        'distance_km': nearest['distance_km']
    }

def calculate_total_polygon_area_sqft(image_path):
    """
    Calculates total polygon area (in square feet) from the classified image
    by counting non-black pixels. Assumes 1 pixel = 1 sqft.
    """
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Error loading image: {image_path}")
    
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Threshold: everything > 1 becomes white (part of polygon); black remains black
    _, mask = cv2.threshold(gray, 1, 255, cv2.THRESH_BINARY)
    
    # Count the white (non-black) pixels
    polygon_pixel_count = cv2.countNonZero(mask)
    
    return polygon_pixel_count


# Tamil Nadu area breakdown: 1 pixel = 1 square foot
 # Approximate square feet

def calculate_red_land_area_sqft(image_path):
    """
    Calculates the red land area in square feet from the classified image.

    Parameters:
    - image_path: Path to the processed land classification image.

    Returns:
    - The estimated red land area in square feet.
    """
    # Load the classified image
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Error loading image: {image_path}")

    # Convert image to HSV color space
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # Define HSV range for detecting red
    lower_red1 = np.array([0, 120, 70])
    upper_red1 = np.array([10, 255, 255])
    lower_red2 = np.array([170, 120, 70])
    upper_red2 = np.array([180, 255, 255])

    # Create masks for red color detection
    mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
    mask2 = cv2.inRange(hsv, lower_red2, upper_red2)

    # Combine both masks
    red_mask = cv2.bitwise_or(mask1, mask2)

    # Count the number of red pixels
    red_pixel_count = cv2.countNonZero(red_mask)

    # Each pixel represents 1 square foot, so the red area in sqft is equal to pixel count
    red_land_area_sqft = red_pixel_count

    return red_land_area_sqft
