let map, markers = [], polygon = null;
// We'll store the polygons used for "containsLocation" checks
let tnPolygons = [];

window.onload = function () {
  // 1) Define the initial map center and options
  const myLatLng = { lat: 10.7905, lng: 78.7047 };
  const mapOptions = {
    center: myLatLng,
    zoom: 7,
    mapTypeId: google.maps.MapTypeId.SATELLITE,
    mapTypeControl: false,
    styles: [
      { featureType: "all", elementType: "labels", stylers: [{ visibility: "on" }] }
    ]
  };

  // 2) Create the map
  map = new google.maps.Map(document.getElementById('googleMap'), mapOptions);

  // 3) Load Tamil Nadu boundary (and parse polygons)
  loadTamilNaduBorder();

  // 4) Add click event to place markers (only if inside Tamil Nadu)
  google.maps.event.addListener(map, 'click', function(event) {
    let latLng = event.latLng;

    // Check if user clicked inside Tamil Nadu
    if (!isInTamilNadu(latLng)) {
      alert("You clicked outside Tamil Nadu. No marker placed.");
      return;
    }

    // Place marker at the (possibly adjusted) latLng
    const marker = new google.maps.Marker({
      position: latLng,
      map: map
    });
    markers.push(marker);

    console.log("Final marker coords => Lat:", latLng.lat(), "Lng:", latLng.lng());

    // Optionally POST to your Python backend
    fetch("/save-coordinates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: latLng.lat(), lng: latLng.lng() })
    })
    .then(response => response.json())
    .then(data => console.log("Server response:", data))
    .catch(error => console.error("Error:", error));
  });

  // 5) "Analyze Land" button
  document.getElementById("analyzeLandBtn").addEventListener("click", function () {
    if (polygon) {
      capturePolygon();
    } else {
      alert("Please draw a polygon first before analyzing the land.");
    }
  });
};

// Load the GADM Level-1 GeoJSON for India, extract Tamil Nadu, style, auto-zoom
function loadTamilNaduBorder() {
  fetch('/static/gadm41_IND_1.json')
    .then(response => response.json())
    .then(data => {
      console.log("Loaded GeoJSON data:", data);

      // Find the feature for Tamil Nadu
      const tamilNaduFeature = data.features.find(
        feature => feature.properties.NAME_1 === 'Tamil Nadu'
      );

      if (tamilNaduFeature) {
        console.log("Tamil Nadu feature found:", tamilNaduFeature);

        // 1) Display in data layer (for visualization)
        map.data.addGeoJson({
          type: 'FeatureCollection',
          features: [tamilNaduFeature],
        });
        map.data.setStyle({
          fillColor: 'rgba(0, 255, 0, 0.1)',  // Transparent fill color
          strokeWeight: 2,
          strokeColor: 'black',
          fillOpacity: 0.1,
          clickable: false  // Ensure data layer is not clickable
        });

        // 2) Create polygons for "containsLocation" checks
        createPolygonsFromFeature(tamilNaduFeature);

        // 3) Auto-zoom to Tamil Nadu
        let bounds = new google.maps.LatLngBounds();
        if (tamilNaduFeature.geometry.type === 'MultiPolygon') {
          tamilNaduFeature.geometry.coordinates.forEach(polygonCoords => {
            polygonCoords.forEach(ring => {
              ring.forEach(coord => {
                bounds.extend(new google.maps.LatLng(coord[1], coord[0]));
              });
            });
          });
        } else if (tamilNaduFeature.geometry.type === 'Polygon') {
          tamilNaduFeature.geometry.coordinates.forEach(ring => {
            ring.forEach(coord => {
              bounds.extend(new google.maps.LatLng(coord[1], coord[0]));
            });
          });
        }
        map.fitBounds(bounds);
      } else {
        console.error("Tamil Nadu feature not found in GeoJSON data.");
      }
    })
    .catch(error => console.error("Error loading GeoJSON:", error));
}

// Convert the TamilNaduFeature geometry into google.maps.Polygon objects
function createPolygonsFromFeature(feature) {
  if (feature.geometry.type === 'MultiPolygon') {
    feature.geometry.coordinates.forEach(polygonCoords => {
      const paths = polygonCoords.map(ring => ring.map(coord => ({
        lat: coord[1],
        lng: coord[0]
      })));
      let polygonObj = new google.maps.Polygon({ paths });
      tnPolygons.push(polygonObj);
    });
  } else if (feature.geometry.type === 'Polygon') {
    const paths = feature.geometry.coordinates.map(ring => ring.map(coord => ({
      lat: coord[1],
      lng: coord[0]
    })));
    let polygonObj = new google.maps.Polygon({ paths });
    tnPolygons.push(polygonObj);
  }
  console.log("Created polygons for Tamil Nadu. Count:", tnPolygons.length);
}

function isInTamilNadu(latLng) {
  return tnPolygons.some(poly =>
    google.maps.geometry.poly.containsLocation(latLng, poly)
  );
}

// Draw polygon from placed markers
function drawPolygon() {
  if (polygon) {
    polygon.setMap(null);
  }
  if (markers.length < 3) {
    alert("Select at least three points to form a polygon.");
    return;
  }
  const polygonCoords = markers.map(marker => marker.getPosition());
  polygon = new google.maps.Polygon({
    paths: polygonCoords,
    strokeColor: "#FFFFFF",
    strokeOpacity: 1,
    strokeWeight: 4,
    fillColor: "transparent",
    fillOpacity: 0
  });
  polygon.setMap(map);

  // Hide markers (still in array if needed)
  markers.forEach(marker => marker.setMap(null));
}

// Capture the polygon area (map screenshot) and send to backend
function capturePolygon() {
  const mapContainer = document.getElementById('googleMap');
  html2canvas(mapContainer, {
    allowTaint: true,
    useCORS: true
  }).then(canvas => {
    const imageData = canvas.toDataURL("image/png");

    fetch('/save-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageData })
    })
    .then(response => response.json())
    .then(data => {
      if (data.processed_image_url) {
        let classifiedImage = document.getElementById("classifiedImage");
        classifiedImage.src = data.processed_image_url;
        classifiedImage.style.display = "block";

        document.getElementById("output").innerHTML =
          "<p><strong>Results:</strong> Land classification successful!</p>";
        document.getElementById("output").appendChild(classifiedImage);
      } else {
        alert("Failed to process the image.");
      }
    })
    .catch(error => console.error("Error processing image:", error));
  });
}
