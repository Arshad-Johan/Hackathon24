window.onload = function () {
    var myLatLng = { lat: 10.7905, lng: 78.7047 }; // Tamil Nadu center coordinates
    var mapOptions = {
        center: myLatLng,
        zoom: 7,
        mapTypeId: google.maps.MapTypeId.SATELLITE, // Set to Satellite mode
        mapTypeControl: false,
        styles: [  // Hide labels
            { featureType: "all", elementType: "labels", stylers: [{ visibility: "on" }] }
        ]
    };

    // Create the map
    var map = new google.maps.Map(document.getElementById('googleMap'), mapOptions);

    var markers = [];
    var polygon = null;

    // Click event to add markers
    google.maps.event.addListener(map, 'click', function (event) {
        var marker = new google.maps.Marker({
            position: event.latLng,
            map: map
        });
        markers.push(marker);
    });

    // Function to draw polygon and hide markers
    window.drawPolygon = function () {
        if (polygon) {
            polygon.setMap(null); // Remove existing polygon
        }

        if (markers.length < 3) {
            alert("Select at least three points to form a polygon.");
            return;
        }

        var polygonCoords = markers.map(marker => marker.getPosition());

        polygon = new google.maps.Polygon({
            paths: polygonCoords,
            strokeColor: "#FFFFFF", // Black border
            strokeOpacity: 1,
            strokeWeight: 4,
            fillColor: "transparent", // No fill
            fillOpacity: 0
        });

        polygon.setMap(map);

        // Hide markers instead of removing them
        markers.forEach(marker => marker.setMap(null));
    };

    document.getElementById("analyzeLandBtn").addEventListener("click", function () {
        if (polygon) {
            capturePolygon();
            } else {
            alert("Please draw a polygon first before analyzing the land.");
            }
        });
    
    
    
    
        function capturePolygon() {
            var mapContainer = document.getElementById('googleMap');
            html2canvas(mapContainer, {
                allowTaint: true,
                useCORS: true
            }).then(canvas => {
                var imageData = canvas.toDataURL("image/png");
        
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
        
                        document.getElementById("output").innerHTML = "<p><strong>Results:</strong> Land classification successful!</p>";
                        document.getElementById("output").appendChild(classifiedImage);
                    } else {
                        alert("Failed to process the image.");
                    }
                })
                .catch(error => console.error("Error processing image:", error));
            });
        }
};
