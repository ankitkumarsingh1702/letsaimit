import * as React from "react";
import { asset } from "../../lib/assets.js";
// Images are from the owner's Ellegenza event-photo collection.
export const EVENTS_PHOTOS = [
  {
    src: "ellegenza-match-action.jpg",
    alt: "Children playing football at Ellegenza Match Day.",
    width: 1600,
    height: 1070,
  },
  {
    src: "ellegenza-team-lineup.jpg",
    alt: "Young football players and their coach posing together at Nambiar Ellegenza.",
    width: 1600,
    height: 1070,
  },
  {
    src: "ellegenza-trophy-moment.jpg",
    alt: "Children and their coach raising trophies at Ellegenza Match Day.",
    width: 1600,
    height: 1070,
  },
  {
    src: "ellegenza-young-players.jpg",
    alt: "Young players with trophies at Ellegenza Match Day.",
    width: 1600,
    height: 1070,
  },
  {
    src: "ellegenza-coach-huddle.jpg",
    alt: "The coach speaking to a circle of young players at Nambiar Ellegenza.",
    width: 4032,
    height: 3024,
  },
];

const eventEnquiryMessage =
  "Hi Dhiraj, I’d like details about the football match day planned for 3 December 2026. Please share the venue, timings and age groups for the 4v4 and 6v6 games.";
export const EVENT_ENQUIRY_URL = `https://wa.me/918868886074?text=${encodeURIComponent(eventEnquiryMessage)}`;

export function scrollToEventsSection(id) {
  const section = document.getElementById(id);
  if (!section) return;
  const focusTarget = section.querySelector("h2") || section;
  if (!focusTarget.hasAttribute("tabindex"))
    focusTarget.setAttribute("tabindex", "-1");
  focusTarget.focus({ preventScroll: true });
  section.scrollIntoView({
    block: "start",
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}

export function scrollToNextEvent() {
  scrollToEventsSection("events-upcoming");
}

export function createEventsPage(React, asset) {
  const h = React.createElement;

  function Arrow() {
    return h(
      "svg",
      {
        viewBox: "0 0 24 24",
        fill: "none",
        "aria-hidden": true,
        focusable: false,
      },
      h("path", {
        d: "M5 12h14m-6-6 6 6-6 6",
        stroke: "currentColor",
        strokeWidth: 1.7,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }),
    );
  }

  function Football() {
    return h(
      "svg",
      {
        className: "ev-ball",
        viewBox: "0 0 64 64",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.7,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true,
        focusable: false,
      },
      h("circle", { cx: 32, cy: 32, r: 27 }),
      h("path", {
        d: "m32 20 11.4 8.3-4.35 13.4h-14.1L20.6 28.3 32 20ZM32 5v15M57.7 23.7l-14.3 4.6M47.9 53.9l-8.85-12.2M16.1 53.9l8.85-12.2M6.3 23.7l14.3 4.6",
      }),
    );
  }

  function FormatIcon({ kind }) {
    const paths = {
      internal: ["M3 5h18v14H3zM12 5v14M3 9h4v6H3M21 9h-4v6h4"],
      friendly: ["M2 21v-2a5 5 0 0 1 10 0v2M12 21v-2a5 5 0 0 1 10 0v2"],
      tournament: [
        "M7 3h10v5a5 5 0 0 1-10 0V3ZM7 5H3v2a4 4 0 0 0 4 4M17 5h4v2a4 4 0 0 1-4 4M12 13v5M8 21h8M10 18h4v3h-4z",
      ],
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
        focusable: false,
      },
      ...(paths[kind] || []).map((d, index) => h("path", { d, key: index })),
      kind === "internal" ? h("circle", { cx: 12, cy: 12, r: 3 }) : null,
      kind === "friendly" ? h("circle", { cx: 7, cy: 7, r: 3 }) : null,
      kind === "friendly" ? h("circle", { cx: 17, cy: 7, r: 3 }) : null,
    );
  }

  function Jump({ target, className, children }) {
    return h(
      "a",
      {
        className,
        href: "#/events?section=" + target,
        onClick: (event) => {
          event.preventDefault();
          scrollToEventsSection(target);
        },
      },
      children,
      h(Arrow),
    );
  }

  function Photo({ photo, className, priority = false }) {
    return h(
      "figure",
      { className },
      h("img", {
        src: asset(photo.src),
        alt: photo.alt,
        width: photo.width,
        height: photo.height,
        loading: priority ? "eager" : "lazy",
        decoding: "async",
        fetchPriority: priority ? "high" : undefined,
        style: photo.position ? { objectPosition: photo.position } : undefined,
      }),
    );
  }

  const formats = [
    {
      title: "Internal games",
      copy: "Within your community.",
      icon: "internal",
    },
    { title: "Friendlies", copy: "Meet another team.", icon: "friendly" },
    { title: "Tournaments", copy: "A series of matches.", icon: "tournament" },
  ];

  return function EventsPage() {
    React.useEffect(() => {
      const query = window.location.hash.split("?")[1] || "";
      const target = new URLSearchParams(query).get("section");
      if (!["events-upcoming", "events-past"].includes(target))
        return undefined;
      const frame = requestAnimationFrame(() => scrollToEventsSection(target));
      return () => cancelAnimationFrame(frame);
    }, []);

    return h(
      "div",
      { className: "ev-page" },
      h(
        "section",
        { className: "ev-shell ev-hero", "aria-labelledby": "events-title" },
        h(
          "div",
          { className: "ev-hero-copy" },
          h("p", { className: "ev-eyebrow" }, "Events"),
          h(
            "h1",
            { className: "ev-title", id: "events-title" },
            "Match day.",
            h("br"),
            "Game on.",
          ),
          h("p", { className: "ev-intro" }, "Football. Friends. Teamwork."),
          h(
            "div",
            { className: "ev-hero-actions" },
            h(
              Jump,
              {
                target: "events-upcoming",
                className: "ev-button ev-button--dark",
              },
              "Next match",
            ),
            h(
              Jump,
              { target: "events-past", className: "ev-text-link" },
              "Past match",
            ),
          ),
        ),
        h(
          "div",
          { className: "ev-date-sticker" },
          h(
            "time",
            { dateTime: "2026-12-03", "aria-label": "3 December 2026" },
            "03 Dec",
          ),
          h("span", null, "Planned"),
        ),
        h(Football),
        h(
          "div",
          {
            className: "ev-photo-strip",
            tabIndex: 0,
            role: "group",
            "aria-label": "Ellegenza Match Day photos",
          },
          EVENTS_PHOTOS.slice(0, 3).map((photo, index) =>
            h(Photo, {
              photo,
              className: "ev-photo-card",
              priority: index === 0,
              key: photo.src,
            }),
          ),
        ),
        h("p", { className: "ev-photo-caption" }, "Ellegenza Match Day"),
        h("p", { className: "ev-swipe-hint" }, "Swipe for more"),
      ),

      h(
        "section",
        {
          className: "ev-shell ev-upcoming",
          id: "events-upcoming",
          "aria-labelledby": "events-upcoming-title",
        },
        h(
          "div",
          { className: "ev-section-head" },
          h("p", { className: "ev-eyebrow" }, "Up next"),
          h(
            "h2",
            { className: "ev-section-title", id: "events-upcoming-title" },
            "Back on the pitch.",
          ),
        ),
        h(
          "article",
          {
            className: "ev-event-row",
            "aria-labelledby": "events-next-match-title",
          },
          h(
            "time",
            {
              className: "ev-date-block",
              dateTime: "2026-12-03",
              "aria-label": "3 December 2026",
            },
            h("strong", { className: "ev-date-day" }, "03"),
            h("span", { className: "ev-date-month" }, "Dec"),
            h("span", { className: "ev-date-year" }, "2026"),
          ),
          h(
            "div",
            { className: "ev-event-copy" },
            h("span", { className: "ev-status" }, "Planned"),
            h("h3", { id: "events-next-match-title" }, "December Match Day"),
            h(
              "div",
              {
                className: "ev-event-facts",
                "aria-label": "Planned match formats",
              },
              h("span", null, "4v4"),
              h("span", null, "6v6"),
              h("span", null, "3 age groups"),
            ),
            h("p", null, "Venue and timings to follow."),
          ),
          h(
            "div",
            { className: "ev-event-action" },
            h(
              "a",
              {
                className: "ev-button ev-button--dark",
                href: EVENT_ENQUIRY_URL,
                target: "_blank",
                rel: "noopener noreferrer",
              },
              "Ask on WhatsApp",
              h(Arrow),
            ),
            h("p", { className: "ev-action-note" }, "Review. Then send."),
          ),
        ),
      ),

      h(
        "section",
        {
          className: "ev-shell ev-past",
          id: "events-past",
          "aria-labelledby": "events-past-title",
        },
        h(
          "div",
          { className: "ev-past-grid" },
          h(
            "div",
            { className: "ev-past-copy" },
            h("p", { className: "ev-eyebrow" }, "Past match"),
            h(
              "h2",
              { className: "ev-section-title", id: "events-past-title" },
              "Ellegenza Match Day",
            ),
            h(
              "p",
              null,
              "Young players came together for football at Nambiar Ellegenza.",
            ),
            h("p", { className: "ev-location" }, "Bengaluru"),
          ),
          h(Photo, { photo: EVENTS_PHOTOS[1], className: "ev-past-photo" }),
        ),
        h(
          "div",
          { className: "ev-past-gallery" },
          EVENTS_PHOTOS.slice(3).map((photo) =>
            h(Photo, { photo, key: photo.src }),
          ),
        ),
      ),

      h(
        "section",
        {
          className: "ev-shell ev-formats",
          "aria-labelledby": "events-formats-title",
        },
        h(
          "div",
          { className: "ev-section-head" },
          h(
            "h2",
            { className: "ev-section-title", id: "events-formats-title" },
            "Ways to play.",
          ),
        ),
        h(
          "div",
          { className: "ev-format-grid" },
          formats.map((format) =>
            h(
              "article",
              { className: "ev-format", key: format.icon },
              h(
                "span",
                { className: "ev-format-icon" },
                h(FormatIcon, { kind: format.icon }),
              ),
              h("h3", null, format.title),
              h("p", null, format.copy),
            ),
          ),
        ),
      ),
    );
  };
}

export default createEventsPage(React, asset);
