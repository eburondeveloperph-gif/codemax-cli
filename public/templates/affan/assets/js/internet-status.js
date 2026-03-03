"use strict";

document.addEventListener("DOMContentLoaded", function () {

    const intId = document.createElement("div");
    intId.id = "internetStatus";
    document.body.appendChild(intId);

    const sucText = "Your internet connection is back.";
    const failText = "Oops! No internet connection.";
    const sucCol = "#00b894";
    const failCol = "#ea4c62";

    function showStatus(text, color, autoHide = false) {
        intId.textContent = text;
        intId.style.backgroundColor = color;
        intId.style.display = "block";
        intId.style.opacity = 1;

        if (autoHide) {
            setTimeout(() => {
                const fadeOut = setInterval(() => {
                    let opacity = parseFloat(intId.style.opacity);
                    if (opacity > 0) {
                        intId.style.opacity = (opacity - 0.1).toFixed(1);
                    } else {
                        clearInterval(fadeOut);
                        intId.style.display = "none";
                    }
                }, 20);
            }, 5000);
        }
    }

    if (!navigator.onLine) {
        showStatus(failText, failCol);
    }

    window.addEventListener("online", () => {
        showStatus(sucText, sucCol, true);
    });

    window.addEventListener("offline", () => {
        showStatus(failText, failCol);
    });

});