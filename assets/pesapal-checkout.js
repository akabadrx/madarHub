(() => {
  const triggers = document.querySelectorAll("[data-pesapal-package]");
  if (!triggers.length) return;

  const CHECKOUT_PATH = "/crm/api/public/pesapal/checkout";
  const CANONICAL_ORIGIN = "https://madarorbit.com";
  const WHATSAPP_URL = "https://wa.me/250783662543";
  const REQUEST_TIMEOUT_MS = 45000;

  // The pricing page can be reached on www.madarorbit.com (or from a cached or
  // mirrored copy), where a relative URL 301s to the canonical host and the
  // browser kills the request as a cross-origin redirect. Always call the
  // canonical origin directly; the API allows the www origin via CORS.
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const CHECKOUT_URL =
    location.origin === CANONICAL_ORIGIN || isLocal ? CHECKOUT_PATH : CANONICAL_ORIGIN + CHECKOUT_PATH;

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
        <p class="pesapal-note">Prices exclude VAT. 18% VAT is added to the amount charged on Pesapal's secure payment page.</p>
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(CHECKOUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.redirectUrl) {
        throw new Error(data.error || "Could not start payment. Please try again.");
      }

      window.location.href = data.redirectUrl;
    } catch (error) {
      showError(error);
      submitBtn.disabled = false;
      submitBtn.textContent = "Continue to Pesapal";
    } finally {
      clearTimeout(timer);
    }
  });

  // A failed fetch surfaces as a bare "Failed to fetch"/"aborted" TypeError, which
  // tells the customer nothing. Translate connection-level failures into plain
  // language and always leave a way to complete the booking.
  function showError(error) {
    const isAbort = error && error.name === "AbortError";
    const isNetwork = error instanceof TypeError;
    let message;

    if (isAbort) {
      message = "The payment page is taking too long to respond. Please try again.";
    } else if (isNetwork) {
      message = "We couldn't reach our payment service. Check your internet connection and try again.";
    } else {
      message = error instanceof Error ? error.message : "Could not start payment. Please try again.";
    }

    errorEl.textContent = message + " ";
    const link = document.createElement("a");
    link.href = WHATSAPP_URL;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Or book on WhatsApp.";
    errorEl.appendChild(link);
    errorEl.hidden = false;
  }
})();
