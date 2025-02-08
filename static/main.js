window.onload = function () {
    var myLatLng = { lat: 10.7905, lng: 78.7047 }; // Tamil Nadu center coordinates
    var mapOptions = {
        center: myLatLng,
        zoom: 7,
        mapTypeId: google.maps.MapTypeId.SATELLITE, // Set to Satellite mode
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

    // Capture the whole image on Enter key press
    window.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && polygon) {
            capturePolygon();
        }
    });

    function capturePolygon() {
        var mapContainer = document.getElementById('googleMap');
        html2canvas(mapContainer, {
            allowTaint: true,
            useCORS: true
        }).then(canvas => {
            // Convert the canvas to an image (Base64)
            var imageData = canvas.toDataURL("image/png");
    
            // Send to backend for saving
            fetch('/save-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageData })
            })
            .then(response => response.json())
            .then(data => alert(data.message))
            .catch(error => console.error("Error saving image:", error));
        });
    }
};
