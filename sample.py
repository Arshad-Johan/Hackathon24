import googlemaps
import os
from dotenv import load_dotenv
# Load environment variables from .env
load_dotenv()
api_key = os.getenv("GOOGLE_MAPS_API_KEY")
gmaps = googlemaps.Client(key=api_key)

def get_address_details(lat, lng):
    """
    Given a latitude and longitude, this function performs reverse geocoding
    and returns a dictionary of address details, limited to results from Tamil Nadu.
    Note: Google Maps API does not return explicit fields for 'zone' or 'sub-registrar office'.
    """
    results = gmaps.reverse_geocode((lat, lng))
    if results:
        details = {}
        # Grab the first result's address components
        address_components = results[0]['address_components']
        for component in address_components:
            types = component['types']
            if "route" in types:
                details["street_name"] = component['long_name']
            elif "sublocality" in types or "sublocality_level_1" in types:
                details["sub_area"] = component['long_name']
            elif "locality" in types:
                details["village_or_city"] = component['long_name']
            elif "administrative_area_level_2" in types:
                details["district"] = component['long_name']
            elif "administrative_area_level_1" in types:
                details["state"] = component['long_name']
        # Ensure the result is from Tamil Nadu
        if details.get("state", "").lower() != "tamil nadu":
            return None
        return details
    return None

# Example usage:
lat = 10.535165247827749  # Replace with your input latitude
lng = 79.6260188515684  # Replace with your input longitude

address_details = get_address_details(lat, lng)
if address_details:
    print("Extracted Address Details:")
    print("District:", address_details.get("district"))
    print("Village/City:", address_details.get("village_or_city"))
    print("Sub-area (could be zone or sublocality):", address_details.get("sub_area"))
    print("Street Name:", address_details.get("street_name"))
else:
    print("The coordinates are not in Tamil Nadu or no address details found.")