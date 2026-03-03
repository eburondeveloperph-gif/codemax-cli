"use strict";

document.addEventListener("DOMContentLoaded", function () {
    const clockdivs = document.getElementsByClassName("clockdiv");
    if (!clockdivs.length) return;

        const countdownData = [];

    for (let i = 0; i < clockdivs.length; i++) {
        const el = clockdivs[i];
        // Combine date and time attributes for the target datetime
        const dateStr = el.getAttribute('data-date'); // e.g. "11-6-2026"
        const timeStr = el.getAttribute('data-time') || "00:00"; // e.g. "23:24"
        const dateTimeStr = dateStr + " " + timeStr;
        
        // Convert to a Date object (adjust format to YYYY-MM-DD HH:mm for compatibility)
        // Because MM-DD-YYYY may cause issues in some browsers, let's parse it safely:
        const [month, day, year] = dateStr.split("-");
        const [hours, minutes] = timeStr.split(":");
        const targetDate = new Date(year, month - 1, day, hours || 0, minutes || 0);

        countdownData.push({
            el: el,
            time: targetDate.getTime(),
        });
    }

    const countdownFunction = setInterval(() => {
        let allCountdownsComplete = true;

        for (let i = 0; i < countdownData.length; i++) {
            const now = Date.now();
            const distance = countdownData[i].time - now;

            let days = 0, hours = 0, minutes = 0, seconds = 0;

            if (distance > 0) {
                days = Math.floor(distance / (1000 * 60 * 60 * 24));
                hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                seconds = Math.floor((distance % (1000 * 60)) / 1000);
                allCountdownsComplete = false;
            }

            const el = countdownData[i].el;
            el.querySelector(".day .num").textContent = days;
            el.querySelector(".hour .num").textContent = hours;
            el.querySelector(".min .num").textContent = minutes;
            el.querySelector(".sec .num").textContent = seconds;
        }

        if (allCountdownsComplete) {
            clearInterval(countdownFunction);
        }
    }, 1000);
});