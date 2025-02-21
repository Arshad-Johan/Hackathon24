/********************************************
 * 1) Custom Element for Analysis Results
 ********************************************/
class AnalysisCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        .card {
          background-color: #fff;
          border-radius: 8px;
          padding: 15px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
          font-family: 'Poppins', sans-serif;
          display: flex;
          flex-direction: column;
          text-align: center;
        }
        .card img {
          width: 100%;
          border-radius: 8px;
          margin-bottom: 10px;
        }
        .card h3, .card h4 {
          margin: 8px 0;
          color: #34495e;
          font-weight: 500;
        }
      </style>
      <div class="card">
        <img id="cardImage" alt="Processed Image">
        <h3 id="polygonArea"></h3>
        <h4 id="redArea"></h4>
        <h4 id="landRate"></h4>
        <h4 id="landValue"></h4>
      </div>
    `;
  }

  set data(result) {
    // Processed image
    this.shadowRoot.getElementById("cardImage").src = result.processed_image_url;
    // Display stats
    this.shadowRoot.getElementById("polygonArea").textContent =
      "Total Polygon Area: " + result.polygon_area_sqft + " sq ft";
    this.shadowRoot.getElementById("redArea").textContent =
      "Red Land Area: " + result.red_land_area_sqft + " sq ft";
    this.shadowRoot.getElementById("landRate").textContent =
      "Land Rate: " + result.land_rate + " INR/sq ft";
    this.shadowRoot.getElementById("landValue").textContent =
      "Red Land Value: " + result.land_value + " INR";
  }
}
customElements.define("analysis-card", AnalysisCard);

/********************************************
 * 2) Global Variables
 ********************************************/
let map,
  markers = [],
  polygons = [],
  tnPolygons = [],
  projectionOverlay;

// CSV-based subdistricts
let tnLocations = [];

/********************************************
 * 3) On Window Load, Initialize
 ********************************************/
window.onload = async function () {
  // 1) Fetch CSV data
  await loadCsvData();

  // 2) Initialize the map
  initMap();

  // 3) Populate search box
  populateSearchBox();

  // 4) Set up event listeners
  setupEventListeners();
};

/********************************************
 * 4) Load CSV Data
 ********************************************/
async function loadCsvData() {
  try {
    const response = await fetch("/static/tamilnadu_districts.csv");
    const csvText = await response.text();

    let lines = csvText.trim().split("\n");
    lines.shift(); // remove header line

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      let cols = line.split(",");
      if (cols.length < 4) continue;
      let subArea = cols[1];
      let lat = parseFloat(cols[2]);
      let lng = parseFloat(cols[3]);
      if (!isNaN(lat) && !isNaN(lng)) {
        tnLocations.push({
          name: subArea.trim(),
          lat: lat,
          lng: lng,
        });
      }
    }
  } catch (error) {
    console.error("Error loading CSV:", error);
  }
}

/********************************************
 * 5) Initialize the Map
 ********************************************/
function initMap() {
  const mapOptions = {
    mapTypeId: google.maps.MapTypeId.SATELLITE,
    zoomControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    mapTypeControl: false,
    styles: [
      {
        featureType: "all",
        elementType: "labels",
        stylers: [{ visibility: "on" }],
      },
    ],
  };

  map = new google.maps.Map(document.getElementById("googleMap"), mapOptions);

  // 5A) Fit Tamil Nadu (optional)
  const tnBounds = new google.maps.LatLngBounds(
    { lat: 7.9, lng: 76.0 }, // SW corner
    { lat: 13.5, lng: 80.4 } // NE corner
  );
  map.fitBounds(tnBounds);


  // 5C) Create overlay for polygon screenshots
  projectionOverlay = new google.maps.OverlayView();
  projectionOverlay.onAdd = function () {};
  projectionOverlay.draw = function () {};
  projectionOverlay.onRemove = function () {};
  projectionOverlay.setMap(map);

  // 5D) Load Tamil Nadu border from GeoJSON (optional)
  loadTamilNaduBorder();
}

function loadTamilNaduBorder() {
  fetch("/static/gadm41_IND_1.json")
    .then((r) => r.json())
    .then((data) => {
      const tamilNaduFeature = data.features.find(
        (f) => f.properties.NAME_1 === "Tamil Nadu"
      );
      if (tamilNaduFeature) {
        map.data.addGeoJson({
          type: "FeatureCollection",
          features: [tamilNaduFeature],
        });
        map.data.setStyle({
          fillColor: "rgba(0, 255, 0, 0.1)",
          strokeWeight: 2,
          strokeColor: "black",
          fillOpacity: 0.1,
          clickable: false,
        });
        createPolygonsFromFeature(tamilNaduFeature);
      } else {
        console.error("Tamil Nadu feature not found in GeoJSON.");
      }
    })
    .catch((error) => console.error("Error loading GeoJSON:", error));
}

function createPolygonsFromFeature(feature) {
  if (feature.geometry.type === "MultiPolygon") {
    feature.geometry.coordinates.forEach((polygonCoords) => {
      const paths = polygonCoords.map((ring) =>
        ring.map((coord) => ({ lat: coord[1], lng: coord[0] }))
      );
      let polygonObj = new google.maps.Polygon({ paths });
      tnPolygons.push(polygonObj);
    });
  } else if (feature.geometry.type === "Polygon") {
    const paths = feature.geometry.coordinates.map((ring) =>
      ring.map((coord) => ({ lat: coord[1], lng: coord[0] }))
    );
    let polygonObj = new google.maps.Polygon({ paths });
    tnPolygons.push(polygonObj);
  }
}

function isInTamilNadu(latLng) {
  return tnPolygons.some((poly) =>
    google.maps.geometry.poly.containsLocation(latLng, poly)
  );
}

/********************************************
 * 6) Populate the Search Box
 ********************************************/
function populateSearchBox() {
  // Fill districtList from dataByDistrict keys
  const districtList = document.getElementById("districtList");
  const districtSearch = document.getElementById("districtSearchBox");
  const subdistrictList = document.getElementById("subdistrictList");
  const subdistrictSearch = document.getElementById("subdistrictSearchBox");

  // For each district in dataByDistrict
  Object.keys(dataByDistrict).forEach(district => {
    let option = document.createElement("option");
    option.value = district; // displayed in the dropdown
    districtList.appendChild(option);
  });

  // When user picks a district, populate the subdistrict list
  districtSearch.addEventListener("change", function () {
    let chosenDistrict = this.value.trim();
    // Clear old subdistrict options
    subdistrictList.innerHTML = "";
    subdistrictSearch.value = "";
    subdistrictSearch.disabled = true;

    // If the user typed a valid district
    if (dataByDistrict[chosenDistrict]) {
      // Enable the subdistrict search
      subdistrictSearch.disabled = false;

      // Populate subdistrictList
      dataByDistrict[chosenDistrict].forEach(subObj => {
        let opt = document.createElement("option");
        opt.value = subObj.name; // subdistrict name
        subdistrictList.appendChild(opt);
      });
    } else {
      // Possibly show an alert if district not found
      console.warn("District not found or invalid.");
    }
  });

  // When user picks a subdistrict
  subdistrictSearch.addEventListener("change", function () {
    let chosenDistrict = districtSearch.value.trim();
    let chosenSub = this.value.trim();
    let found = null;

    if (dataByDistrict[chosenDistrict]) {
      // Search in that district's array
      found = dataByDistrict[chosenDistrict].find(
        s => s.name.toLowerCase() === chosenSub.toLowerCase()
      );
    }
    if (found) {
      // Center the map on subdistrict
      map.setCenter({ lat: found.lat, lng: found.lng });
      // Optionally set or unlock/lock zoom
      map.setZoom(15);
      map.setOptions({
        minZoom:13,
        maxZoom: 16,
        draggable: true,
        scrollwheel: true,
        disableDoubleClickZoom: false
      });
    } else {
      alert("No matching subdistrict found in " + chosenDistrict);
    }
  });
}


/********************************************
 * 7) Setup Event Listeners (Map, Analyze, etc.)
 ********************************************/
function setupEventListeners() {
  // Place markers on map click
  google.maps.event.addListener(map, "click", function (event) {
    let latLng = event.latLng;
    if (!isInTamilNadu(latLng)) {
      alert("You clicked outside Tamil Nadu. No marker placed.");
      return;
    }
    const marker = new google.maps.Marker({
      position: latLng,
      map: map,
    });
    markers.push(marker);

    // Optionally send coordinates to backend
    fetch("/save-coordinates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: latLng.lat(), lng: latLng.lng() }),
    })
      .then((r) => r.json())
      .then((data) => console.log("Server response:", data))
      .catch((error) => console.error("Error:", error));
  });

  // Analyze Land button
  document
    .getElementById("analyzeLandBtn")
    .addEventListener("click", analyzePolygons);
}

/********************************************
 * 8) Draw Polygon
 ********************************************/
function drawPolygon() {
  if (markers.length < 3) {
    alert("Select at least three points to form a polygon.");
    return;
  }

  // Check if this is the first polygon
  const isFirstPolygon = (polygons.length === 0);

  let lastMarker = markers[markers.length - 1].getPosition();

  let newPolygon = new google.maps.Polygon({
    paths: markers.map((m) => m.getPosition()),
    strokeColor: "#FFFFFF",
    strokeOpacity: 1,
    strokeWeight: 4,
    fillColor: "transparent",
    fillOpacity: 0,
  });
  newPolygon.last_marker = { lat: lastMarker.lat(), lng: lastMarker.lng() };
  newPolygon.setMap(map);
  polygons.push(newPolygon);

  // Clear markers for next polygon
  markers.forEach((marker) => marker.setMap(null));
  markers = [];

  // Lock zoom after first polygon is drawn
  if (isFirstPolygon) {
    let currentZoom = map.getZoom();
    map.setOptions({
      minZoom: currentZoom,
      maxZoom: currentZoom,
    });
  }

  capturePolygonThumbnail(newPolygon);
}

/********************************************
 * 9) Capture Polygon Thumbnail
 ********************************************/
function capturePolygonThumbnail(polygon) {
  setTimeout(() => {
    html2canvas(document.getElementById("googleMap"), {
      allowTaint: true,
      useCORS: true,
    }).then((canvas) => {
      let projection = projectionOverlay.getProjection();
      if (!projection) {
        console.error("Projection not available.");
        return;
      }
      let path = polygon.getPath().getArray();
      let pixelCoords = path.map((latlng) =>
        projection.fromLatLngToDivPixel(latlng)
      );
      let xValues = pixelCoords.map((p) => p.x);
      let yValues = pixelCoords.map((p) => p.y);
      let minX = Math.min(...xValues);
      let maxX = Math.max(...xValues);
      let minY = Math.min(...yValues);
      let maxY = Math.max(...yValues);
      let bbox = {
        minX: minX,
        minY: minY,
        width: maxX - minX,
        height: maxY - minY,
      };

      const imageData = canvas.toDataURL("image/png");
      fetch("/save-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageData,
          thumbnail: true,
          bbox: bbox,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.processed_image_url) {
            let container = document.getElementById("polygonContainer");
            let thumbDiv = document.createElement("div");
            thumbDiv.className = "polygon-thumb";
            if (polygon.last_marker) {
              thumbDiv.setAttribute(
                "data-last-marker",
                JSON.stringify(polygon.last_marker)
              );
            }
            let imgElem = document.createElement("img");
            imgElem.src = data.processed_image_url;
            thumbDiv.appendChild(imgElem);
            container.appendChild(thumbDiv);
          } else {
            alert("Failed to capture thumbnail.");
          }
        })
        .catch((error) => console.error("Error processing image:", error));
    });
  }, 1000);
}

/********************************************
 * 10) Analyze Polygons
 ********************************************/
function analyzePolygons() {
  let thumbnails = document.querySelectorAll(
    "#polygonContainer .polygon-thumb img"
  );
  let outputBox = document.getElementById("analysisOutput");
  outputBox.innerHTML = "";

  let requests = Array.from(thumbnails).map((imgElem) => {
    let markerData = imgElem.parentElement.getAttribute("data-last-marker");
    let last_marker = markerData ? JSON.parse(markerData) : null;

    // Convert input thumbnail to base64
    return getBase64ImageFromUrl(imgElem.src)
      .then((base64Data) => {
        // Send to backend
        return fetch("/get-land-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64Data, last_marker: last_marker }),
        });
      })
      .then((response) => response.json())
      .then((data) => {
        // Save input thumbnail so we can show it if needed
        data.input_thumb_src = imgElem.src;

        // Create an analysis card
        if (data.processed_image_url) {
          let card = document.createElement("analysis-card");
          card.data = data;
          outputBox.appendChild(card);
        } else {
          alert("Failed to process one of the images.");
        }
        return data;
      });
  });

  Promise.all(requests)
    .then((results) => {
      // If you want to rank them, do so here
      rankPolygons(results);
    })
    .catch((err) => {
      console.error("Error analyzing polygons:", err);
    });
}

/********************************************
 * 11) Ranking
 ********************************************/
function rankPolygons(dataArray) {
  // Example formula: score = red_land_area_sqft / land_rate
  dataArray.forEach((item) => {
    let rate = item.land_rate || 1;
    item.score = item.red_land_area_sqft / rate;
  });

  dataArray.sort((a, b) => b.score - a.score);

  let rankBox = document.getElementById("rankingOutput");
  rankBox.innerHTML = "";

  dataArray.forEach((item, index) => {
    let div = document.createElement("div");
    div.className = "rank-card";
    div.innerHTML = `
      <h4>Rank #${index + 1}</h4>
      <img src="${item.input_thumb_src}" alt="Input Image"
           style="width:100%; max-width:200px; border:1px solid #ccc; border-radius:6px; margin-bottom:8px;">
      <p>Score: ${item.score.toFixed(2)}</p>
      <p>Total Polygon Area: ${item.polygon_area_sqft} sq ft</p>
      <p>Red Land Area: ${item.red_land_area_sqft} sq ft</p>
      <p>Land Rate: ${item.land_rate} INR/sq ft</p>
      <p>Land Value: ${item.land_value} INR</p>
    `;
    rankBox.appendChild(div);
  });
}

/********************************************
 * Helper: Convert Image URL to Base64
 ********************************************/
function getBase64ImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    let img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = function () {
      let canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      let ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      let dataURL = canvas.toDataURL("image/png");
      resolve(dataURL);
    };
    img.onerror = function (error) {
      reject(error);
    };
    img.src = url;
  });
}

/********************************************
 * 12) Clean Images and Refresh
 ********************************************/
document.getElementById("cleanImagesBtn").addEventListener("click", function() {
  fetch("/clean-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  })
    .then((r) => r.json())
    .then((data) => {
      alert(
        data.message +
          "\nRemoved from static: " +
          data.removed_static.join(", ") +
          "\nRemoved from images: " +
          data.removed_images.join(", ")
      );
      document.getElementById("polygonContainer").innerHTML = "";
      document.getElementById("analysisOutput").innerHTML = "";
      document.getElementById("rankingOutput").innerHTML = "";
    })
    .catch((error) => console.error("Error cleaning images:", error));
});

document.getElementById("refreshBtn").addEventListener("click", function() {
  fetch("/clean-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  })
    .then((r) => r.json())
    .then((data) => {
      console.log(data.message);
      location.reload();
    })
    .catch((error) => console.error("Error cleaning images:", error));
});


// We'll store subdistricts by district
let dataByDistrict = {}; // e.g. { "Chennai": [ { name, lat, lng }, ... ], "Coimbatore": [ ... ] }

async function loadCsvData() {
  try {
    const response = await fetch("/static/tamilnadu_districts.csv");
    const csvText = await response.text();

    let lines = csvText.trim().split("\n");
    // remove header line
    lines.shift();

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      let cols = line.split(",");
      if (cols.length < 4) continue;
      let district = cols[0].trim();
      let subArea = cols[1].trim();
      let lat = parseFloat(cols[2]);
      let lng = parseFloat(cols[3]);

      if (!isNaN(lat) && !isNaN(lng)) {
        // If district not yet in dataByDistrict, init array
        if (!dataByDistrict[district]) {
          dataByDistrict[district] = [];
        }
        dataByDistrict[district].push({
          name: subArea,
          lat: lat,
          lng: lng
        });
      }
    }
  } catch (error) {
    console.error("Error loading CSV:", error);
  }
}
