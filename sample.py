import os
import sys
import time

# Reverse Geocoding
import googlemaps
from dotenv import load_dotenv

# Web Scraping with Selenium
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select
from selenium.webdriver.chrome.options import Options

################################################################################
# 1) REVERSE GEOCODE LAT/LON → GET BASIC ADDRESS
################################################################################

def reverse_geocode(lat, lon):
    """
    Reverse geocode using the Google Maps API. 
    Returns a dict with address details, or None if unsuccessful.
    """
    # Load API key from environment
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        print("Error: GOOGLE_MAPS_API_KEY not found in .env")
        return None
    
    # Initialize the Google Maps client
    gmaps = googlemaps.Client(key=api_key)

    # Perform reverse geocoding
    results = gmaps.reverse_geocode((lat, lon))
    if not results:
        return None

    # Parse the result to find relevant components
    address_info = {
        "state": None,
        "district": None,
        "locality": None,
        "sub_locality": None,
        "street": None,
        "pincode": None
    }

    # Typically, 'administrative_area_level_1' = State,
    # 'administrative_area_level_2' = District,
    # 'locality' = City/Town, 'sublocality' = sub-area, 'route' = street
    for component in results[0].get("address_components", []):
        types = component.get("types", [])
        if "administrative_area_level_1" in types:
            address_info["state"] = component["long_name"]
        elif "administrative_area_level_2" in types:
            address_info["district"] = component["long_name"]
        elif "locality" in types:
            address_info["locality"] = component["long_name"]
        elif "sublocality" in types or "sublocality_level_1" in types:
            address_info["sub_locality"] = component["long_name"]
        elif "route" in types:
            address_info["street"] = component["long_name"]
        elif "postal_code" in types:
            address_info["pincode"] = component["long_name"]

    return address_info

def get_guideline_value(lat, lon):
    """
    Given latitude and longitude in Tamil Nadu:
      1. Reverse geocode to get address
      2. Map address to (zone, sro, village, street)
      3. Scrape the official portal to retrieve the guideline value
    """
    # 1) Reverse Geocode
    address_info = reverse_geocode(lat, lon)
    print(address_info)
    if not address_info:
        print("Reverse geocoding failed or returned no data.")
        return None

    # Quick check for state
    if address_info.get("state", "").lower() != "tamil nadu":
        print("Coordinates do not appear to be in Tamil Nadu.")
        return None


################################################################################
# MAIN CLI ENTRY POINT (Optional)
################################################################################

if __name__ == "__main__":
    load_dotenv()

    if len(sys.argv) != 3:
        print("Usage: python main.py <latitude> <longitude>")
        sys.exit(1)

    lat_input = float(sys.argv[1])
    lon_input = float(sys.argv[2])

    value = get_guideline_value(lat_input, lon_input)
    if value:
        print(f"Guideline Value for ({lat_input}, {lon_input}): {value}")
    else:
        print("No guideline value could be retrieved.")
