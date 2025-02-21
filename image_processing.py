import os
import cv2
import numpy as np
import uuid
import math

TOTAL_PIXELS_TN = 1_399_954_188_797
TOTAL_AREA_SQFT_TN = 1_399_954_188_780

IMAGE_DIR = "images"
os.makedirs(IMAGE_DIR, exist_ok=True)

def process_image(image_path):
    image = cv2.imread(image_path)
    if image is None:
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
    
    unique_id = uuid.uuid4().hex
    extracted_image_path = os.path.join(IMAGE_DIR, f"cropped_polygon_{unique_id}.png")
    cv2.imwrite(extracted_image_path, cropped_region)
    return extracted_image_path

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
    
    unique_id = uuid.uuid4().hex
    cleaned_image_path = os.path.join(IMAGE_DIR, f"polygon_no_border_{unique_id}.png")
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
    unique_id = uuid.uuid4().hex
    output_path = os.path.join("static", f"classified_land_image_{unique_id}.png")
    cv2.imwrite(output_path, final_image)
    return output_path

def haversine_distance(lat1, lon1, lat2, lon2):
    rlat1 = math.radians(lat1)
    rlon1 = math.radians(lon1)
    rlat2 = math.radians(lat2)
    rlon2 = math.radians(lon2)
    dlon = rlon2 - rlon1
    dlat = rlat2 - rlat1
    a = (math.sin(dlat / 2) ** 2) + math.cos(rlat1) * math.cos(rlat2) * (math.sin(dlon / 2) ** 2)
    c = 2 * math.asin(math.sqrt(a))
    r = 6371
    return c * r

def get_nearest_subarea(lat, lon, df):
    df['distance_km'] = df.apply(
        lambda row: haversine_distance(lat, lon, row['Latitude'], row['Longitude']), 
        axis=1
    )
    nearest = df.loc[df['distance_km'].idxmin()]
    return {
        'district': nearest['District'],
        'sub_area': nearest['Sub_area'],
        'approx_land_acquisition_rate_inr_sqft': nearest['approx_land_acquisition_rate_inr_sqft'],
        'distance_km': nearest['distance_km']
    }

def calculate_total_polygon_area_sqft(image_path):
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Error loading image: {image_path}")
    
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 1, 255, cv2.THRESH_BINARY)
    polygon_pixel_count = cv2.countNonZero(mask)
    
    return polygon_pixel_count

def calculate_red_land_area_sqft(image_path):
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Error loading image: {image_path}")
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    lower_red1 = np.array([0, 120, 70])
    upper_red1 = np.array([10, 255, 255])
    lower_red2 = np.array([170, 120, 70])
    upper_red2 = np.array([180, 255, 255])
    mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
    mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
    red_mask = cv2.bitwise_or(mask1, mask2)
    red_pixel_count = cv2.countNonZero(red_mask)
    red_land_area_sqft = red_pixel_count
    return red_land_area_sqft
