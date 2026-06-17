const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteNav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      document.body.classList.remove("nav-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      document.body.classList.remove("nav-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });
}

const header = document.querySelector(".site-header");

if (header) {
  const updateHeader = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  };

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });
}

const contactForm = document.querySelector("[data-contact-form]");

if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(contactForm);
    const status = contactForm.querySelector("[data-form-status]");
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const interest = String(formData.get("interest") || "").trim();
    const message = String(formData.get("message") || "").trim();

    const text = [
      "Hello Madar Hub,",
      "",
      `My name is ${name}.`,
      email ? `Email: ${email}` : "",
      phone ? `Phone: ${phone}` : "",
      interest ? `Interested in: ${interest}` : "",
      "",
      message || "I would like to learn more."
    ]
      .filter(Boolean)
      .join("\n");

    if (status) {
      status.textContent = "Opening WhatsApp with your message.";
    }

    window.location.href = `https://wa.me/250783662543?text=${encodeURIComponent(text)}`;
  });
}

document.querySelectorAll("[data-signup-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const status = form.querySelector("[data-signup-status]");
    if (status) {
      status.textContent = "Thank you. We will keep you posted.";
    }
    form.reset();
  });
});
