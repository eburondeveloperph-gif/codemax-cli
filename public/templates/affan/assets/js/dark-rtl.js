"use strict";

document.addEventListener("DOMContentLoaded", function () {

  function applyThemeSettings(storageKey, attrName, switchEl, values) {
    const savedValue = localStorage.getItem(storageKey) || values.off;

    // Apply saved value
    document.documentElement.setAttribute(attrName, savedValue);

    // Set switch state correctly
    if (switchEl) {
      switchEl.checked = savedValue === values.on;

      switchEl.addEventListener("change", function (e) {
        const newValue = e.target.checked ? values.on : values.off;
        document.documentElement.setAttribute(attrName, newValue);
        localStorage.setItem(storageKey, newValue);
      });
    }
  }

  const darkSwitch = document.getElementById("darkSwitch");
  const rtlSwitch  = document.getElementById("rtlSwitch");

  // Dark mode
  applyThemeSettings(
    "theme",
    "data-theme",
    darkSwitch,
    { on: "dark", off: "light" }
  );

  // RTL mode
  applyThemeSettings(
    "rtl",
    "dir",
    rtlSwitch,
    { on: "rtl", off: "ltr" }
  );

});