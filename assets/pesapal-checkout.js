(() => {
  const triggers = document.querySelectorAll("[data-pesapal-package]");
  if (!triggers.length) return;

  const CHECKOUT_URL = "/crm/api/public/pesapal/checkout";

  const overlay = document.createElement("div");
  overlay.className = "pesapal-overlay";
  overlay.setAttribute("hidden", "");
  overlay.innerHTML = `
    <div class="pesapal-modal" role="dialog" aria-modal="true" aria-labelledby="pesapal-modal-title">
      <button type="button" class="pesapal-close" aria-label="Close payment form">&times;</button>
      <h3 id="pesapal-modal-title">Pay Online</h3>
      <p class="pesapal-package-line"><span data-pesapal-package-name></span> &mdash; <strong data-pesapal-price></strong></p>
      <form data-pesapal-form>
        <label class="field">
          <span>Full name</span>
          <input type="text" name="customerName" required autocomplete="name" />
        </label>
        <label class="field">
          <span>Email address</span>
          <input type="email" name="customerEmail" required autocomplete="email" />
        </label>
        <label class="field">
          <span>Phone number</span>
          <input type="tel" name="customerPhone" required autocomplete="tel" placeholder="078xxxxxxx" />
        </label>
        <p class="pesapal-error" data-pesapal-error aria-live="polite" hidden></p>
        <button type="submit" class="button primary" data-pesapal-submit>Continue to Pesapal</button>
        <p class="pesapal-note">You will be redirected to Pesapal's secure page to pay by card or mobile money.</p>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const modal = overlay.querySelector(".pesapal-modal");
  const form = overlay.querySelector("[data-pesapal-form]");
  const errorEl = overlay.querySelector("[data-pesapal-error]");
  const submitBtn = overlay.querySelector("[data-pesapal-submit]");
  const nameEl = overlay.querySelector("[data-pesapal-package-name]");
  const priceEl = overlay.querySelector("[data-pesapal-price]");
  let lastFocused = null;
  let activeSlug = null;

  function openModal(trigger) {
    activeSlug = trigger.getAttribute("data-pesapal-package");
    nameEl.textContent = trigger.getAttribute("data-pesapal-name") || "Package";
    priceEl.textContent = trigger.getAttribute("data-pesapal-price") || "";
    errorEl.hidden = true;
    errorEl.textContent = "";
    form.reset();
    lastFocused = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add("pesapal-modal-open");
    const firstInput = form.querySelector("input");
    if (firstInput) firstInput.focus();
  }

  function closeModal() {
    overlay.hidden = true;
    document.body.classList.remove("pesapal-modal-open");
    if (lastFocused instanceof HTMLElement) lastFocused.focus();
  }

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      openModal(trigger);
    });
  });

  overlay.querySelector(".pesapal-close").addEventListener("click", closeModal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeModal();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeSlug) return;

    const formData = new FormData(form);
    const payload = {
      packageSlug: activeSlug,
      customerName: String(formData.get("customerName") || "").trim(),
      customerEmail: String(formData.get("customerEmail") || "").trim(),
      customerPhone: String(formData.get("customerPhone") || "").trim(),
    };

    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Redirecting…";

    try {
      const res = await fetch(CHECKOUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.redirectUrl) {
        throw new Error(data.error || "Could not start payment. Please try again.");
      }

      window.location.href = data.redirectUrl;
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : "Could not start payment. Please try again.";
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Continue to Pesapal";
    }
  });
})();
