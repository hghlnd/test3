console.log("Minimal script.js loaded");

const statusText = document.getElementById("statusText");
if (statusText) {
  statusText.textContent = "JS OK";
  statusText.style.color = "blue";
}
