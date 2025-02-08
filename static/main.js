window.onload = function () {
    var myLatLng = { lat: 10.7905, lng: 78.7047 }; // Tamil Nadu center coordinates
    var mapOptions = {
        center: myLatLng,
        zoom: 7,
        mapTypeId: google.maps.MapTypeId.ROADMAP
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

    // Function to draw polygon
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
            strokeColor: "#FF0000",
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: "#FF0000",
            fillOpacity: 0.35
        });

        polygon.setMap(map);
    };

    // Capture only the polygon on Enter key press
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
            var ctx = canvas.getContext('2d');
            
            // Clear everything except the polygon area
            ctx.globalCompositeOperation = 'destination-in';

            ctx.beginPath();
            polygon.getPath().forEach(point => {
                var pixel = map.getProjection().fromLatLngToPoint(point);
                ctx.lineTo(pixel.x * canvas.width, pixel.y * canvas.height);
            });

            ctx.closePath();
            ctx.fill();

            // Convert the canvas to an image
            var link = document.createElement('a');
            link.href = canvas.toDataURL("image/png");
            link.download = "polygon.png";
            link.click();
        });
    }
};
