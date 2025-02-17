let map, markers = [], polygons = [];
// Polygons for Tamil Nadu boundary checks
let tnPolygons = [];
// Overlay for projection
let projectionOverlay;

window.onload = function () {
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

  map = new google.maps.Map(document.getElementById('googleMap'), mapOptions);

  // Set up an overlay for projections
  projectionOverlay = new google.maps.OverlayView();
  projectionOverlay.onAdd = function() {};
  projectionOverlay.draw = function() {};
  projectionOverlay.onRemove = function() {};
  projectionOverlay.setMap(map);

  loadTamilNaduBorder();

  google.maps.event.addListener(map, 'click', function(event) {
    let latLng = event.latLng;
    if (!isInTamilNadu(latLng)) {
      alert("You clicked outside Tamil Nadu. No marker placed.");
      return;
    }
    const marker = new google.maps.Marker({
      position: latLng,
      map: map
    });
    markers.push(marker);

    console.log("Marker added at:", latLng.lat(), latLng.lng());

    // Optionally send coordinates to backend
    fetch("/save-coordinates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: latLng.lat(), lng: latLng.lng() })
    })
    .then(response => response.json())
    .then(data => console.log("Server response:", data))
    .catch(error => console.error("Error:", error));
  });

  document.getElementById("analyzeLandBtn").addEventListener("click", analyzePolygons);
};

function loadTamilNaduBorder() {
  fetch('/static/gadm41_IND_1.json')
    .then(response => response.json())
    .then(data => {
      console.log("Loaded GeoJSON data:", data);
      const tamilNaduFeature = data.features.find(
        feature => feature.properties.NAME_1 === 'Tamil Nadu'
      );
      if (tamilNaduFeature) {
        console.log("Tamil Nadu feature found:", tamilNaduFeature);
        map.data.addGeoJson({
          type: 'FeatureCollection',
          features: [tamilNaduFeature],
        });
        map.data.setStyle({
          fillColor: 'rgba(0, 255, 0, 0.1)',
          strokeWeight: 2,
          strokeColor: 'black',
          fillOpacity: 0.1,
          clickable: false
        });
        createPolygonsFromFeature(tamilNaduFeature);
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
        console.error("Tamil Nadu feature not found.");
      }
    })
    .catch(error => console.error("Error loading GeoJSON:", error));
}

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
function drawPolygon() {
  if (markers.length < 3) {
    alert("Select at least three points to form a polygon.");
    return;
  }
  
  // Capture the last marker’s coordinate
  let lastMarker = markers[markers.length - 1].getPosition();

  // Create the polygon and attach the last marker data
  let newPolygon = new google.maps.Polygon({
    paths: markers.map(marker => marker.getPosition()),
    strokeColor: "#FFFFFF",
    strokeOpacity: 1,
    strokeWeight: 4,
    fillColor: "transparent",
    fillOpacity: 0
  });
  
  // Set the last_marker property on the polygon
  newPolygon.last_marker = { lat: lastMarker.lat(), lng: lastMarker.lng() };
  
  newPolygon.setMap(map);
  polygons.push(newPolygon);

  // Clear markers for the next polygon
  markers.forEach(marker => marker.setMap(null));
  markers = [];

  // Pass the polygon (with last_marker) to capture its thumbnail
  capturePolygonThumbnail(newPolygon);
}


function capturePolygonThumbnail(polygon) {
  setTimeout(() => {
    html2canvas(document.getElementById('googleMap'), {
      allowTaint: true,
      useCORS: true
    }).then(canvas => {
      let projection = projectionOverlay.getProjection();
      if (!projection) {
        console.error("Projection not available.");
        return;
      }
      let path = polygon.getPath().getArray();
      let pixelCoords = path.map(latlng => projection.fromLatLngToDivPixel(latlng));
      let xValues = pixelCoords.map(p => p.x);
      let yValues = pixelCoords.map(p => p.y);
      let minX = Math.min(...xValues);
      let maxX = Math.max(...xValues);
      let minY = Math.min(...yValues);
      let maxY = Math.max(...yValues);
      let bbox = {
        minX: minX,
        minY: minY,
        width: maxX - minX,
        height: maxY - minY
      };

      const imageData = canvas.toDataURL("image/png");
      fetch('/save-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData, thumbnail: true, bbox: bbox })
      })
      .then(response => response.json())
      .then(data => {
        if (data.processed_image_url) {
          let container = document.getElementById("polygonContainer");
          let thumbDiv = document.createElement("div");
          thumbDiv.className = "polygon-thumb";
          // Only attach if last_marker exists
          if (polygon.last_marker) {
            thumbDiv.setAttribute("data-last-marker", JSON.stringify(polygon.last_marker));
          }
          let imgElem = document.createElement("img");
          imgElem.src = data.processed_image_url;
          thumbDiv.appendChild(imgElem);
          container.appendChild(thumbDiv);
        } else {
          alert("Failed to capture thumbnail.");
        }
      })
      .catch(error => console.error("Error processing image:", error));
    });
  }, 1000); // 1-second delay to ensure polygon is rendered
}



// Helper function to convert an image URL to a base64 data URL
function getBase64ImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    let img = new Image();
    img.crossOrigin = 'Anonymous'; // Needed if the image is hosted on a different domain
    img.onload = function() {
      let canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      let ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      let dataURL = canvas.toDataURL("image/png");
      resolve(dataURL);
    };
    img.onerror = function(error) {
      reject(error);
    };
    img.src = url;
  });
}
function analyzePolygons() {
  let thumbnails = document.querySelectorAll("#polygonContainer .polygon-thumb img");
  let outputBox = document.getElementById("analysisOutput");
  // Optionally clear previous results:
  outputBox.innerHTML = "";
  thumbnails.forEach(imgElem => {
    let markerData = imgElem.parentElement.getAttribute("data-last-marker");
    let last_marker = null;
    if (markerData && markerData !== "undefined") {
      try {
        last_marker = JSON.parse(markerData);
      } catch (e) {
        console.error("Error parsing last_marker JSON:", e);
      }
    } else {
      console.warn("No valid last_marker data found for this thumbnail.");
    }
    
    // Convert the thumbnail image URL to a base64 string
    getBase64ImageFromUrl(imgElem.src)
      .then(base64Data => {
        fetch('/get-land-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Data, last_marker: last_marker })
        })
        .then(response => response.json())
        .then(data => {
          if (data.processed_image_url) {
            // Instead of replacing the innerHTML, create a new container element
            let resultDiv = document.createElement("div");
            resultDiv.className = "result-container mb-3";
            resultDiv.innerHTML = `
              <img src="${data.processed_image_url}" alt="Processed Image" class="img-fluid">
              <h3 class="mt-3">Approximate Land Rate: ${data.land_rate} per sq.ft</h3>
            `;
            outputBox.appendChild(resultDiv);
          } else {
            alert("Failed to process one of the images.");
          }
        })
        .catch(error => console.error("Error processing image:", error));
      })
      .catch(err => {
        console.error("Error converting image to base64:", err);
      });
  });
}

function cleanImageData() {
  fetch('/clean-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(response => response.json())
  .then(data => {
    alert(data.message + "\nRemoved files: " + data.removed.join(", "));
    // Optionally clear the polygon container thumbnails
    let container = document.getElementById("polygonContainer");
    container.innerHTML = "";
  })
  .catch(error => console.error("Error cleaning images:", error));
}

// Attach the cleanImageData function to the button
document.getElementById("cleanImagesBtn").addEventListener("click", cleanImageData);
