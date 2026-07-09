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

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!prefersReducedMotion && "IntersectionObserver" in window) {
  const groupSelectors = [
    ".card-grid",
    ".category-grid",
    ".pricing-cards-desktop",
    ".notes-list",
    ".faq-list",
    ".pricing-contact-grid",
    ".contact-strip",
    ".blog-grid",
    ".testimonial-list",
    ".contact-list",
    ".service-links",
    ".mission-vision"
  ];

  const singleSelectors = [
    ".section-title",
    ".brand-statement",
    ".signup",
    ".wide-cta",
    ".pricing-summary",
    ".highlight-panel",
    ".map-figure",
    ".split > *",
    ".badr-feature > *"
  ];

  const revealTargets = [];

  const register = (el, delay) => {
    if (!el || el.closest(".hero") || el.classList.contains("reveal")) return;
    el.classList.add("reveal");
    if (delay) el.style.setProperty("--reveal-delay", `${delay}ms`);
    revealTargets.push({ el, delay });
  };

  groupSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((group) => {
      Array.from(group.children).forEach((child, index) => {
        register(child, Math.min(index, 5) * 80);
      });
    });
  });

  singleSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => register(el, 0));
  });

  if (revealTargets.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const delay = Number.parseInt(el.style.getPropertyValue("--reveal-delay"), 10) || 0;
          el.classList.add("is-visible");
          observer.unobserve(el);
          window.setTimeout(() => {
            el.classList.remove("reveal", "is-visible");
            el.style.removeProperty("--reveal-delay");
          }, 750 + delay);
        });
      },
      { threshold: 0, rootMargin: "0px 0px -60px 0px" }
    );

    revealTargets.forEach(({ el }) => observer.observe(el));
  }
}
