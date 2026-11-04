import * as React from "react";
import { asset } from "../../lib/assets.js";
import { createSchoolEnquiry } from "./SchoolEnquiry.js";

export function scrollToSchoolSection(id) {
  const section = document.getElementById(id);
  if (!section) return;
  const focusTarget = section.querySelector("h2, input") || section;
  if (!focusTarget.hasAttribute("tabindex") && !focusTarget.matches("input")) {
    focusTarget.setAttribute("tabindex", "-1");
  }
  focusTarget.focus({ preventScroll: true });
  section.scrollIntoView({
    block: "start",
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}

export function scrollToSchoolEnquiry() {
  scrollToSchoolSection("school-enquiry");
}

export function createSchoolsPage(React, asset) {
  const h = React.createElement;

  function Arrow({ diagonal = false } = {}) {
    return h(
      "svg",
      { viewBox: "0 0 24 24", fill: "none", "aria-hidden": true },
      h("path", {
        d: diagonal ? "M6 18 18 6M6 6h12v12" : "M5 12h14m-6-6 6 6-6 6",
        stroke: "currentColor",
        strokeWidth: 1.7,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }),
    );
  }

  function ServiceIcon({ kind }) {
    const paths = {
      plan: [
        "M5 4h11a3 3 0 0 1 3 3v14H8a3 3 0 0 1-3-3V4Z",
        "M5 17h14M9 8h6M9 12h4",
      ],
      assessment: ["M5 20V11M12 20V4M19 20v-6", "m3 6 4-3 5 3 8-4"],
      people: [
        "M3 21v-3a6 6 0 0 1 12 0v3M16 13a5 5 0 0 1 5 5v3",
        "M16 3a4 4 0 0 1 0 8",
      ],
      programme: ["M3 5h18v14H3zM12 5v14M3 9h4v6H3M21 9h-4v6h4"],
    };
    return h(
      "svg",
      {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.5,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true,
      },
      ...(paths[kind] || []).map((d, i) => h("path", { d, key: i })),
      kind === "people" ? h("circle", { cx: 9, cy: 7, r: 4 }) : null,
      kind === "programme" ? h("circle", { cx: 12, cy: 12, r: 3 }) : null,
    );
  }

  function Jump({ target, className = "", children, diagonal = false }) {
    return h(
      "a",
      {
        href: "#/schools?section=" + target,
        className,
        onClick: (event) => {
          event.preventDefault();
          scrollToSchoolSection(target);
        },
      },
      children,
      h(Arrow, { diagonal }),
    );
  }

  const SchoolEnquiry = createSchoolEnquiry(React, Arrow);
  const services = [
    {
      title: "PE curriculum advice",
      copy: "Plans shaped around your school.",
      icon: "plan",
      colour: "sage",
      note: "Build on what works.",
    },
    {
      title: "Assessment guidance",
      copy: "Fitness checks. Clear progress reviews.",
      icon: "assessment",
      colour: "lime",
      note: "Know what to measure.",
    },
    {
      title: "Coach development",
      copy: "Practical methods for your PE staff.",
      icon: "people",
      colour: "dark",
      note: "Support your team.",
    },
    {
      title: "Programme guidance",
      copy: "Advice for football programmes and events.",
      icon: "programme",
      colour: "sage",
      note: "Plan the next step.",
    },
  ];
  const steps = [
    ["Understand", "Start with your team and current programme."],
    ["Advise", "Agree practical steps for your school."],
    ["Review", "Review progress. Refine the plan."],
  ];

  return function SchoolsPage() {
    React.useEffect(() => {
      const query = window.location.hash.split("?")[1] || "";
      const target = new URLSearchParams(query).get("section");
      if (
        !["school-services", "school-approach", "school-enquiry"].includes(
          target,
        )
      )
        return undefined;
      const frame = requestAnimationFrame(() => scrollToSchoolSection(target));
      return () => cancelAnimationFrame(frame);
    }, []);

    return h(
      "div",
      { className: "sk-page" },
      h(
        "section",
        { className: "sk-shell sk-hero", "aria-labelledby": "school-title" },
        h("img", {
          className: "sk-hero-image",
          src: asset("Strategy-for-game-against-opponent.jpg"),
          width: 1600,
          height: 900,
          fetchPriority: "high",
          alt: "Coach Dhiraj discussing a football plan with his players in Frisco, Texas.",
        }),
        h(
          "div",
          { className: "sk-hero-content" },
          h(
            "div",
            { className: "sk-hero-copy" },
            h(
              "p",
              { className: "sk-eyebrow" },
              h("span", { className: "sk-eyebrow-dot", "aria-hidden": true }),
              "For schools",
            ),
            h(
              "h1",
              { className: "sk-hero-title", id: "school-title" },
              "School fitness",
              h("br"),
              "consultancy",
              h("span", { className: "sk-lime-dot" }, "."),
            ),
            h(
              "p",
              { className: "sk-hero-intro" },
              "Practical advice for your PE team.",
            ),
            h(
              Jump,
              {
                target: "school-enquiry",
                className: "sk-button sk-button-lime",
              },
              "Talk to Dhiraj",
            ),
          ),
        ),
        h(
          "p",
          { className: "sk-hero-caption" },
          "From Dhiraj’s sessions in Texas.",
        ),
        h(
          "nav",
          { className: "sk-hero-links", "aria-label": "On this page" },
          h(
            Jump,
            { target: "school-services", className: "sk-jump", diagonal: true },
            "How we help",
          ),
          h(
            Jump,
            { target: "school-approach", className: "sk-jump", diagonal: true },
            "Our approach",
          ),
          h(
            Jump,
            { target: "school-enquiry", className: "sk-jump", diagonal: true },
            "Let’s talk",
          ),
        ),
      ),

      h(
        "section",
        {
          className: "sk-shell sk-section sk-services",
          id: "school-services",
          "aria-labelledby": "school-services-title",
        },
        h(
          "div",
          { className: "sk-section-head" },
          h(
            "div",
            null,
            h("p", { className: "sk-overline" }, "How we help"),
            h(
              "h2",
              { className: "sk-section-title", id: "school-services-title" },
              "Your team.",
              h("br"),
              "Our guidance.",
            ),
          ),
          h("p", null, "Built on your existing PE programme."),
        ),
        h(
          "div",
          { className: "sk-service-grid" },
          services.map((service, index) =>
            h(
              "article",
              {
                className: "sk-service-card sk-service-card--" + service.colour,
                key: service.icon,
              },
              h(
                "div",
                { className: "sk-service-top" },
                h(
                  "span",
                  { className: "sk-service-icon" },
                  h(ServiceIcon, { kind: service.icon }),
                ),
                h(
                  "span",
                  { className: "sk-service-number", "aria-hidden": true },
                  "0" + (index + 1),
                ),
              ),
              h("h3", { className: "sk-service-title" }, service.title),
              h("p", { className: "sk-service-copy" }, service.copy),
              h("div", { className: "sk-service-rule", "aria-hidden": true }),
            ),
          ),
        ),
      ),

      h(
        "section",
        {
          className: "sk-shell sk-approach",
          id: "school-approach",
          "aria-labelledby": "school-approach-title",
        },
        h(
          "div",
          { className: "sk-approach-head" },
          h(
            "div",
            null,
            h("p", { className: "sk-overline" }, "Our approach"),
            h(
              "h2",
              { className: "sk-section-title", id: "school-approach-title" },
              "Built around you.",
            ),
          ),
          h("p", null, "Your programme. A shared plan."),
        ),
        h(
          "ol",
          { className: "sk-steps" },
          steps.map(([title, copy], index) =>
            h(
              "li",
              { key: title },
              h(
                "span",
                { className: "sk-step-number", "aria-hidden": true },
                "0" + (index + 1),
              ),
              h("h3", null, title),
              h("p", null, copy),
            ),
          ),
        ),
      ),

      h(
        "section",
        {
          className: "sk-shell sk-section sk-coach",
          "aria-labelledby": "school-coach-title",
        },
        h(
          "figure",
          { className: "sk-coach-photo" },
          h("img", {
            src: asset("Coaches_training_Pic.webp"),
            width: 2048,
            height: 1536,
            alt: "Dhiraj with fellow coaches at a coaching education event in Texas.",
            loading: "lazy",
            decoding: "async",
          }),
          h("figcaption", null, "Coach education · Texas"),
        ),
        h(
          "div",
          { className: "sk-coach-copy" },
          h("p", { className: "sk-overline" }, "Coaching meets consultancy"),
          h(
            "h2",
            { className: "sk-section-title", id: "school-coach-title" },
            "Meet Dhiraj.",
          ),
          h(
            "p",
            { className: "sk-coach-intro" },
            "Youth-coaching experience.",
            h("br"),
            "A business advisory background.",
          ),
          h(
            "p",
            { className: "sk-coach-details" },
            "Former Head Coach, Frisco Soccer Association, Texas.",
          ),
          h(
            "a",
            { className: "sk-text-link", href: "#/coach" },
            "Meet the coach",
            h(Arrow, { diagonal: true }),
          ),
        ),
      ),

      h(
        "section",
        {
          className: "sk-shell sk-enquiry",
          id: "school-enquiry",
          "aria-labelledby": "school-enquiry-title",
        },
        h(
          "div",
          { className: "sk-enquiry-copy" },
          h("p", { className: "sk-overline" }, "For your school"),
          h(
            "h2",
            { className: "sk-section-title", id: "school-enquiry-title" },
            "Let’s talk.",
          ),
          h("p", null, "Tell us what your school needs."),
          h(
            "div",
            { className: "sk-contact-links" },
            h("a", { href: "tel:+918868886074" }, "+91 88688 86074"),
            h(
              "a",
              { href: "mailto:dhirajkmishra184@gmail.com" },
              "Email Dhiraj",
              h(Arrow, { diagonal: true }),
            ),
          ),
          h(
            "p",
            { className: "sk-enquiry-location" },
            "Nambiar Ellegenza, Bengaluru",
          ),
        ),
        h(SchoolEnquiry),
      ),
    );
  };
}

export default createSchoolsPage(React, asset);
