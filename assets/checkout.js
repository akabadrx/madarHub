(() => {
  const triggers = document.querySelectorAll("[data-checkout-package]");
  if (!triggers.length) return;

  const PESAPAL_PATH = "/crm/api/public/pesapal/checkout";
  const MOMO_PATH = "/crm/api/public/momo/checkout";
  const MOMO_STATUS_PATH = "/crm/api/public/momo/status";
  const CANONICAL_ORIGIN = "https://madarorbit.com";
  const WHATSAPP_URL = "https://wa.me/250783662543";
  const REQUEST_TIMEOUT_MS = 45000;

  // The USSD front door to the same MTN merchant account the Collections API
  // collects into. The API takes no merchant code — where the money lands is
  // decided by the credentials — so this is only ever shown to a customer as a
  // way to pay by hand when the API cannot be reached.
  const MOMO_MERCHANT_CODE = "00743";
  const MOMO_MERCHANT_NAME = "MADAR HUB LTD";

  // MoMo resolves on the customer's handset, not in the browser, so the page
  // has to wait for them to find their phone and type a PIN. MTN expires an
  // unanswered prompt well inside this window; the ceiling is only here so a
  // wedged transaction eventually hands the customer back to WhatsApp.
  const POLL_INTERVAL_MS = 3000;
  const POLL_CEILING_MS = 180000;

  // The pricing page can be reached on www.madarorbit.com (or from a cached or
  // mirrored copy), where a relative URL 301s to the canonical host and the
  // browser kills the request as a cross-origin redirect. Always call the
  // canonical origin directly; the API allows the www origin via CORS.
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const sameOrigin = location.origin === CANONICAL_ORIGIN || isLocal;
  const apiUrl = (path) => (sameOrigin ? path : CANONICAL_ORIGIN + path);

  // Kept in step with the CRM's src/lib/pricing.ts. These figures are shown so
  // the customer can see MoMo is the cheaper channel before choosing; the
  // server recalculates both from the package price, so nothing here can
  // change what is actually charged.
  const VAT_MULTIPLIER_PERCENT = 118;
  const PESAPAL_FEE_PERCENT = 3;

  const withVat = (price) => Math.round((price * VAT_MULTIPLIER_PERCENT) / 100);
  const withPesapalFee = (amount) => Math.round((amount * (100 + PESAPAL_FEE_PERCENT)) / 100);
  const formatRwf = (amount) => amount.toLocaleString("en-RW") + " RWF";

  const overlay = document.createElement("div");
  overlay.className = "checkout-overlay";
  overlay.setAttribute("hidden", "");
  overlay.innerHTML = `
    <div class="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-modal-title" tabindex="-1">
      <button type="button" class="checkout-close" aria-label="Close payment form">&times;</button>

      <div data-checkout-step="form">
        <h3 id="checkout-modal-title">Pay Online</h3>
        <p class="checkout-package-line"><span data-checkout-package-name></span> &mdash; <strong data-checkout-price></strong></p>

        <fieldset class="checkout-methods">
          <legend>How would you like to pay?</legend>
          <label class="checkout-method">
            <input type="radio" name="method" value="momo" checked />
            <span class="checkout-method-body">
              <span class="checkout-method-title">MTN MoMo <span class="checkout-method-tag">No extra fee</span></span>
              <span class="checkout-method-desc">Approve the prompt on your phone</span>
            </span>
            <span class="checkout-method-amount" data-checkout-momo-total></span>
          </label>
          <label class="checkout-method">
            <input type="radio" name="method" value="pesapal" />
            <span class="checkout-method-body">
              <span class="checkout-method-title">Card, bank or other mobile money</span>
              <span class="checkout-method-desc">Secure Pesapal page &mdash; adds a 3% fee</span>
            </span>
            <span class="checkout-method-amount" data-checkout-pesapal-total></span>
          </label>
        </fieldset>

        <form data-checkout-form>
          <label class="field">
            <span>Full name</span>
            <input type="text" name="customerName" required autocomplete="name" />
          </label>
          <label class="field">
            <span data-checkout-email-label>Email address</span>
            <input type="email" name="customerEmail" autocomplete="email" />
          </label>
          <label class="field">
            <span data-checkout-phone-label>MTN MoMo number</span>
            <input type="tel" name="customerPhone" required autocomplete="tel" placeholder="078xxxxxxx" />
          </label>
          <p class="checkout-error" data-checkout-error aria-live="polite" hidden></p>
          <button type="submit" class="button primary" data-checkout-submit>Send MoMo Prompt</button>
          <p class="checkout-note" data-checkout-note></p>
        </form>
      </div>

      <div data-checkout-step="waiting" hidden>
        <div class="checkout-spinner" aria-hidden="true"></div>
        <h3 class="checkout-waiting-title">Check your phone</h3>
        <p class="checkout-waiting-body">
          We sent a payment request to <strong data-checkout-waiting-phone></strong>.
          Enter your MoMo PIN to approve <strong data-checkout-waiting-amount></strong>.
        </p>
        <p class="checkout-waiting-status" data-checkout-waiting-status aria-live="polite">Waiting for your approval&hellip;</p>
        <p class="checkout-note">Keep this page open until the payment is confirmed.</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const modal = overlay.querySelector(".checkout-modal");
  const closeBtn = overlay.querySelector(".checkout-close");
  const stepForm = overlay.querySelector('[data-checkout-step="form"]');
  const stepWaiting = overlay.querySelector('[data-checkout-step="waiting"]');
  const form = overlay.querySelector("[data-checkout-form]");
  const errorEl = overlay.querySelector("[data-checkout-error]");
  const submitBtn = overlay.querySelector("[data-checkout-submit]");
  const noteEl = overlay.querySelector("[data-checkout-note]");
  const nameEl = overlay.querySelector("[data-checkout-package-name]");
  const priceEl = overlay.querySelector("[data-checkout-price]");
  const momoTotalEl = overlay.querySelector("[data-checkout-momo-total]");
  const pesapalTotalEl = overlay.querySelector("[data-checkout-pesapal-total]");
  const emailLabel = overlay.querySelector("[data-checkout-email-label]");
  const phoneLabel = overlay.querySelector("[data-checkout-phone-label]");
  const emailInput = form.querySelector('input[name="customerEmail"]');
  const waitingPhone = overlay.querySelector("[data-checkout-waiting-phone]");
  const waitingAmount = overlay.querySelector("[data-checkout-waiting-amount]");
  const waitingStatus = overlay.querySelector("[data-checkout-waiting-status]");
  const methodInputs = overlay.querySelectorAll('input[name="method"]');

  let lastFocused = null;
  let activeSlug = null;
  let pollTimer = null;
  let activeMomoAmount = 0;

  const selectedMethod = () =>
    overlay.querySelector('input[name="method"]:checked')?.value || "momo";

  /**
   * MoMo needs a phone number and nothing else; Pesapal needs an email for its
   * receipt. Asking for both on both channels would make the cheaper option
   * feel like more work, so the email field is optional on MoMo.
   */
  function applyMethod() {
    const momo = selectedMethod() === "momo";
    submitBtn.textContent = momo ? "Send MoMo Prompt" : "Continue to Pesapal";
    phoneLabel.textContent = momo ? "MTN MoMo number" : "Phone number";
    emailLabel.textContent = momo ? "Email address (optional)" : "Email address";
    emailInput.required = !momo;
    noteEl.textContent = momo
      ? "Prices exclude VAT. 18% VAT is added to the amount charged. MoMo adds no payment fee."
      : "Prices exclude VAT. 18% VAT and a 3% online payment fee are added to the amount charged on Pesapal's secure payment page.";
  }

  methodInputs.forEach((input) => input.addEventListener("change", applyMethod));

  function openModal(trigger) {
    activeSlug = trigger.getAttribute("data-checkout-package");
    nameEl.textContent = trigger.getAttribute("data-checkout-name") || "Package";

    const displayPrice = trigger.getAttribute("data-checkout-price") || "";
    priceEl.textContent = displayPrice;

    // Display only: the base price is read back out of the label the card
    // already shows, so the markup keeps one source of truth for the number.
    const basePrice = Number(String(displayPrice).replace(/[^\d]/g, "")) || 0;
    if (basePrice) {
      const vatInclusive = withVat(basePrice);
      momoTotalEl.textContent = formatRwf(vatInclusive);
      pesapalTotalEl.textContent = formatRwf(withPesapalFee(vatInclusive));
    } else {
      momoTotalEl.textContent = "";
      pesapalTotalEl.textContent = "";
    }

    errorEl.hidden = true;
    errorEl.textContent = "";
    form.reset();
    applyMethod();
    showStep("form");

    lastFocused = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add("checkout-modal-open");

    // Focus the dialog, not the first field. Focusing an input scrolls the
    // taller method chooser off the top of a short viewport, so the customer
    // never sees which package they are paying for — and a dialog is what a
    // screen reader should be announcing here anyway.
    modal.focus();
    modal.scrollTop = 0;
  }

  function closeModal() {
    stopPolling();
    overlay.hidden = true;
    document.body.classList.remove("checkout-modal-open");
    if (lastFocused instanceof HTMLElement) lastFocused.focus();
  }

  /**
   * While the prompt is live on the customer's handset there is no way to
   * dismiss the dialog: the payment is already in flight, and closing it would
   * read as cancelling something that has not been cancelled. The poll ceiling
   * is what eventually releases them, onto the pending page.
   */
  function showStep(step) {
    stepForm.hidden = step !== "form";
    stepWaiting.hidden = step !== "waiting";
    closeBtn.hidden = step === "waiting";
  }

  const isWaiting = () => !stepWaiting.hidden;

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function resetSubmit() {
    submitBtn.disabled = false;
    applyMethod();
  }

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      openModal(trigger);
    });
  });

  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && !isWaiting()) closeModal();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden && !isWaiting()) closeModal();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeSlug) return;

    const formData = new FormData(form);
    const method = selectedMethod();
    const payload = {
      packageSlug: activeSlug,
      customerName: String(formData.get("customerName") || "").trim(),
      customerEmail: String(formData.get("customerEmail") || "").trim(),
      customerPhone: String(formData.get("customerPhone") || "").trim(),
    };

    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = method === "momo" ? "Sending prompt…" : "Redirecting…";

    try {
      const data = await postJson(method === "momo" ? MOMO_PATH : PESAPAL_PATH, payload);

      if (method === "momo") {
        if (!data.reference) throw new Error(data.error || "Could not start the MoMo payment. Please try again.");
        startWaiting(data.reference, payload.customerPhone, data.amount);
        return;
      }

      if (!data.redirectUrl) throw new Error(data.error || "Could not start payment. Please try again.");
      window.location.href = data.redirectUrl;
    } catch (error) {
      showError(error);
      resetSubmit();
    }
  });

  async function postJson(path, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(apiUrl(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start payment. Please try again.");
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── MoMo waiting state ────────────────────────────────────────────────────

  function startWaiting(reference, phone, amount) {
    activeMomoAmount = amount || 0;
    waitingPhone.textContent = phone;
    waitingAmount.textContent = amount ? formatRwf(amount) : "the amount shown";
    waitingStatus.textContent = "Waiting for your approval…";
    waitingStatus.classList.remove("error");
    showStep("waiting");

    const deadline = Date.now() + POLL_CEILING_MS;
    poll(reference, deadline);
  }

  function poll(reference, deadline) {
    pollTimer = setTimeout(async () => {
      let status = null;
      try {
        const res = await fetch(`${apiUrl(MOMO_STATUS_PATH)}?ref=${encodeURIComponent(reference)}`, {
          headers: { Accept: "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        status = res.ok ? data : null;
      } catch {
        // A dropped poll is not a failed payment — the customer's phone is
        // still holding the prompt. Keep trying until the deadline.
        status = null;
      }

      if (status && status.status === "COMPLETED") {
        stopPolling();
        const params = new URLSearchParams({
          ref: reference,
          package: status.packageName || "",
          amount: String(status.amount || ""),
        });
        window.location.href = `payment-success.html?${params.toString()}`;
        return;
      }

      if (status && (status.status === "FAILED" || status.status === "ABANDONED")) {
        stopPolling();
        showMomoFailure(status.reason);
        return;
      }

      if (Date.now() >= deadline) {
        stopPolling();
        const params = new URLSearchParams({ ref: reference });
        window.location.href = `payment-pending.html?${params.toString()}`;
        return;
      }

      poll(reference, deadline);
    }, POLL_INTERVAL_MS);
  }

  /**
   * A declined prompt is the one failure the customer can actually fix, so it
   * returns them to the form with the reason rather than to a dead-end page.
   */
  function showMomoFailure(reason) {
    showStep("form");
    resetSubmit();
    errorEl.textContent = reason
      ? `The MoMo payment did not go through: ${reason}. You can try again. `
      : "The MoMo payment was not completed. You can try again, or use a card instead. ";
    appendManualMomoLine();
    appendWhatsappLink();
    errorEl.hidden = false;
  }

  /** The USSD route to the same merchant account, for a customer the API failed. */
  function appendManualMomoLine() {
    const line = document.createElement("span");
    line.className = "checkout-manual-momo";
    const amount = activeMomoAmount ? formatRwf(activeMomoAmount) : "the amount above";
    line.textContent = `You can also pay by hand: dial *182*8*${MOMO_MERCHANT_CODE}# and send ${amount} to ${MOMO_MERCHANT_NAME}, then send us the confirmation. `;
    errorEl.appendChild(line);
  }

  // A failed fetch surfaces as a bare "Failed to fetch"/"aborted" TypeError, which
  // tells the customer nothing. Translate connection-level failures into plain
  // language and always leave a way to complete the booking.
  function showError(error) {
    const isAbort = error && error.name === "AbortError";
    const isNetwork = error instanceof TypeError;
    let message;

    if (isAbort) {
      message = "The payment service is taking too long to respond. Please try again.";
    } else if (isNetwork) {
      message = "We couldn't reach our payment service. Check your internet connection and try again.";
    } else {
      message = error instanceof Error ? error.message : "Could not start payment. Please try again.";
    }

    errorEl.textContent = message + " ";
    appendWhatsappLink();
    errorEl.hidden = false;
  }

  function appendWhatsappLink() {
    const link = document.createElement("a");
    link.href = WHATSAPP_URL;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Or book on WhatsApp.";
    errorEl.appendChild(link);
  }
})();
