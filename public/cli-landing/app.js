function copyFromTarget(targetId, button) {
  const source = document.getElementById(targetId);
  if (!source) return;

  const text = source.innerText.trim();
  navigator.clipboard.writeText(text).then(() => {
    const original = button.textContent;
    button.textContent = "Copied";
    button.classList.add("copied");
    setTimeout(() => {
      button.textContent = original;
      button.classList.remove("copied");
    }, 1200);
  });
}

document.querySelectorAll(".copy-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const id = button.getAttribute("data-copy-target");
    if (id) copyFromTarget(id, button);
  });
});
