import * as React from "react";
import { asset } from "../../lib/assets.js";
import { mediaProps } from "../../lib/media.js";
import { PARENT_TESTIMONIALS } from "./testimonials.js";

export function storyExcerpt(story) {
  return `${story.excerptLeadingOmission ? "…" : ""}${story.excerpt}${story.excerptTrailingOmission ? "…" : ""}`;
}

// All eight stories share one native scroll rail. CSS changes the two staggered
// desktop rows into a single phone row without duplicating any testimonial.
export function createParentStories(React, asset) {
  const h = React.createElement;
  const stories = PARENT_TESTIMONIALS;

  function Arrow({ previous = false, diagonal = false }) {
    return h(
      "svg",
      {
        viewBox: "0 0 24 24",
        fill: "none",
        "aria-hidden": true,
        focusable: false,
      },
      h("path", {
        d: diagonal
          ? "M6 18 18 6M6 6h12v12"
          : previous
            ? "M19 12H5m6-6-6 6 6 6"
            : "M5 12h14m-6-6 6 6-6 6",
        stroke: "currentColor",
        strokeWidth: 1.7,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }),
    );
  }

  function CloseIcon() {
    return h(
      "svg",
      {
        viewBox: "0 0 24 24",
        fill: "none",
        "aria-hidden": true,
        focusable: false,
      },
      h("path", {
        d: "m6 6 12 12M18 6 6 18",
        stroke: "currentColor",
        strokeWidth: 1.7,
        strokeLinecap: "round",
      }),
    );
  }

  return function ParentStories() {
    const [openStory, setOpenStory] = React.useState(null);
    const [bounds, setBounds] = React.useState({
      previous: false,
      next: false,
    });
    const railRef = React.useRef(null);
    const dialogRef = React.useRef(null);
    const triggerRef = React.useRef(null);
    const reducedMotionRef = React.useRef(false);
    const mobileRef = React.useRef(false);
    const mobileIndexRef = React.useRef(0);
    const navigationTargetRef = React.useRef(null);
    const scrollFrameRef = React.useRef(null);
    const scrollEndTimerRef = React.useRef(null);
    const backdropPressedRef = React.useRef(false);

    const cardStep = React.useCallback(() => {
      const rail = railRef.current;
      if (!rail) return 0;
      const cards = rail.querySelectorAll(".ps-card");
      if (!cards.length) return 0;
      const first = cards[0].getBoundingClientRect();
      if (cards[1]) {
        const distance = cards[1].getBoundingClientRect().left - first.left;
        if (distance > 0) return distance;
      }
      return first.width;
    }, []);

    const syncBounds = React.useCallback(() => {
      const rail = railRef.current;
      if (!rail) return;
      const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
      const nextBounds = {
        previous: rail.scrollLeft > 1,
        next: rail.scrollLeft < max - 1,
      };
      setBounds((current) =>
        current.previous === nextBounds.previous &&
        current.next === nextBounds.next
          ? current
          : nextBounds,
      );
      if (mobileRef.current) {
        const step = cardStep();
        if (step > 0)
          mobileIndexRef.current = Math.max(
            0,
            Math.min(stories.length - 1, Math.round(rail.scrollLeft / step)),
          );
      }
    }, [cardStep]);

    const goToPosition = React.useCallback(
      (position, immediate = false) => {
        const rail = railRef.current;
        if (!rail) return;
        const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
        const left = Math.max(0, Math.min(max, position));
        navigationTargetRef.current = left;
        rail.scrollTo({
          left,
          behavior:
            immediate || reducedMotionRef.current ? "instant" : "smooth",
        });
        syncBounds();
      },
      [syncBounds],
    );

    const moveRail = React.useCallback(
      (direction) => {
        const rail = railRef.current;
        if (!rail) return;
        const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
        const current = navigationTargetRef.current ?? rail.scrollLeft;
        if (
          (direction < 0 && current <= 1) ||
          (direction > 0 && current >= max - 1)
        )
          return;
        goToPosition(current + direction * cardStep());
      },
      [cardStep, goToPosition],
    );

    const onScroll = React.useCallback(() => {
      if (scrollFrameRef.current === null) {
        scrollFrameRef.current = window.requestAnimationFrame(() => {
          scrollFrameRef.current = null;
          syncBounds();
        });
      }
      window.clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = window.setTimeout(() => {
        navigationTargetRef.current = null;
        syncBounds();
      }, 160);
    }, [syncBounds]);

    const onKeyDown = React.useCallback(
      (event) => {
        // Card buttons retain their normal keyboard behavior. These shortcuts
        // apply only when the scroll region itself has focus.
        if (
          event.target !== event.currentTarget ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        )
          return;
        const rail = railRef.current;
        const actions = {
          ArrowLeft: () => moveRail(-1),
          ArrowRight: () => moveRail(1),
          Home: () => goToPosition(0),
          End: () => goToPosition(rail.scrollWidth - rail.clientWidth),
        };
        if (!rail || !actions[event.key]) return;
        event.preventDefault();
        actions[event.key]();
      },
      [goToPosition, moveRail],
    );

    const revealFocusedCard = React.useCallback(
      (event) => {
        const rail = railRef.current;
        const card = event.target.closest?.(".ps-card");
        if (!rail || !card || !rail.contains(card)) return;
        // Reveal keyboard-focused cards without moving a partially visible card
        // underneath a pointer before its click can open the story.
        if (!event.target.matches(":focus-visible")) return;
        const viewport = rail.getBoundingClientRect();
        const rectangle = card.getBoundingClientRect();
        const availableInset = Math.max(
          0,
          (rail.clientWidth - rectangle.width) / 2,
        );
        const inset = Math.min(mobileRef.current ? 16 : 36, availableInset);
        let left = rail.scrollLeft;
        if (rectangle.left < viewport.left + inset)
          left += rectangle.left - viewport.left - inset;
        else if (rectangle.right > viewport.right - inset)
          left += rectangle.right - viewport.right + inset;
        if (Math.abs(left - rail.scrollLeft) > 1) goToPosition(left, true);
      },
      [goToPosition],
    );

    const onGestureStart = React.useCallback(() => {
      navigationTargetRef.current = null;
    }, []);

    React.useEffect(() => {
      const rail = railRef.current;
      if (!rail) return undefined;
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const phone = window.matchMedia("(max-width: 700px)");
      const updateMotion = () => {
        reducedMotionRef.current = motion.matches;
      };
      updateMotion();
      motion.addEventListener("change", updateMotion);

      let initialized = false;
      let lastWidth = 0;
      let lastStep = 0;
      const alignLayout = () => {
        const width = rail.clientWidth;
        const step = cardStep();
        if (!width || !step) return;
        const isMobile = phone.matches;
        const modeChanged = initialized && isMobile !== mobileRef.current;
        if (
          initialized &&
          !modeChanged &&
          width === lastWidth &&
          step === lastStep
        ) {
          syncBounds();
          return;
        }
        let left = rail.scrollLeft;
        if (!initialized) left = isMobile ? 0 : 120;
        else if (modeChanged) left = 0;
        else if (isMobile) left = mobileIndexRef.current * step;
        mobileRef.current = isMobile;
        initialized = true;
        lastWidth = width;
        lastStep = step;
        navigationTargetRef.current = null;
        const max = Math.max(0, rail.scrollWidth - width);
        rail.scrollTo({
          left: Math.max(0, Math.min(max, left)),
          behavior: "instant",
        });
        syncBounds();
      };
      const initialFrame = window.requestAnimationFrame(alignLayout);
      const observer =
        typeof ResizeObserver === "function"
          ? new ResizeObserver(alignLayout)
          : null;
      if (observer) {
        observer.observe(rail);
        const firstCard = rail.querySelector(".ps-card");
        if (firstCard) observer.observe(firstCard);
      }
      window.addEventListener("resize", alignLayout);
      phone.addEventListener("change", alignLayout);

      return () => {
        observer?.disconnect();
        motion.removeEventListener("change", updateMotion);
        phone.removeEventListener("change", alignLayout);
        window.removeEventListener("resize", alignLayout);
        window.cancelAnimationFrame(initialFrame);
        if (scrollFrameRef.current !== null)
          window.cancelAnimationFrame(scrollFrameRef.current);
        window.clearTimeout(scrollEndTimerRef.current);
      };
    }, [cardStep, syncBounds]);

    const closeStory = React.useCallback(() => {
      setOpenStory(null);
    }, []);

    React.useLayoutEffect(() => {
      const dialog = dialogRef.current;
      if (!openStory || !dialog) return undefined;
      const body = document.body;
      const previousOverflow = body.style.overflow;
      const previousPadding = body.style.paddingRight;
      const scrollbarWidth = Math.max(
        0,
        window.innerWidth - document.documentElement.clientWidth,
      );
      const currentPadding =
        Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.overflow = "hidden";
      if (scrollbarWidth)
        body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
      dialog.showModal();
      dialog.querySelector(".ps-close")?.focus({ preventScroll: true });

      return () => {
        if (dialog.open) dialog.close();
        body.style.overflow = previousOverflow;
        body.style.paddingRight = previousPadding;
        const trigger = triggerRef.current;
        triggerRef.current = null;
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      };
    }, [openStory]);

    const isBackdrop = (event) => {
      if (event.target !== event.currentTarget) return false;
      const rectangle = event.currentTarget.getBoundingClientRect();
      return (
        event.clientX < rectangle.left ||
        event.clientX > rectangle.right ||
        event.clientY < rectangle.top ||
        event.clientY > rectangle.bottom
      );
    };

    function renderCard(story, index, rowIndex) {
      const tinted = rowIndex === 0 ? index % 2 === 0 : index % 2 === 1;
      return h(
        "article",
        {
          className: `ps-card${tinted ? " is-tinted" : ""}`,
          key: story.id,
          "aria-label": `${story.author}, ${story.relationship}`,
        },
        h("p", { className: "ps-story-tag" }, story.shortHeading),
        h("blockquote", { className: "ps-quote" }, storyExcerpt(story)),
        h("span", { className: "ps-quote-mark", "aria-hidden": true }, "”"),
        h(
          "div",
          { className: "ps-author" },
          h("strong", null, story.author),
          h("span", null, story.relationship),
        ),
        h(
          "button",
          {
            className: "ps-open",
            type: "button",
            "aria-label": `Read ${story.author}’s full story`,
            "aria-haspopup": "dialog",
            "aria-controls": "parent-story-dialog",
            title: "Read full story",
            onClick: (event) => {
              triggerRef.current = event.currentTarget;
              setOpenStory(story);
            },
          },
          h(
            "span",
            { className: "ps-open-icon", "aria-hidden": true },
            h(Arrow, { diagonal: true }),
          ),
        ),
      );
    }

    return h(
      "section",
      {
        className: "ps-section",
        id: "parent-stories",
        "aria-labelledby": "parent-stories-title",
      },
      h(
        "div",
        { className: "ps-shell" },
        h(
          "header",
          { className: "ps-head" },
          h(
            "h2",
            { className: "ps-title", id: "parent-stories-title" },
            "Words from",
            h("br"),
            "our parents.",
          ),
          h(
            "figure",
            { className: "ps-context" },
            h("img", {
              ...mediaProps("Initial_days_of_kids_training.jpg", "(max-width: 1000px) 72px, 96px"),
              alt: "Children running during a coaching session in Frisco, Texas.",
              width: 1600,
              height: 1200,
              loading: "lazy",
              decoding: "async",
            }),
            h(
              "figcaption",
              null,
              h("strong", null, "Frisco, Texas"),
              h("span", null, "Coach Dhiraj’s sessions."),
            ),
          ),
        ),
        h(
          "div",
          { className: "ps-board" },
          h(
            "div",
            {
              className: "ps-rail",
              ref: railRef,
              tabIndex: 0,
              role: "region",
              "aria-label": "Parent stories",
              "aria-describedby": "parent-stories-instructions",
              onScroll,
              onKeyDown,
              onFocusCapture: revealFocusedCard,
              onPointerDown: onGestureStart,
              onWheel: onGestureStart,
            },
            h(
              "div",
              { className: "ps-row" },
              stories
                .slice(0, 4)
                .map((story, index) => renderCard(story, index, 0)),
            ),
            h(
              "div",
              { className: "ps-row" },
              stories
                .slice(4)
                .map((story, index) => renderCard(story, index, 1)),
            ),
          ),
        ),
        h(
          "div",
          { className: "ps-footer" },
          h(
            "p",
            { className: "ps-hint" },
            h("span", { className: "ps-hint-desktop" }, "Select a story"),
            h("span", { className: "ps-hint-mobile" }, "Swipe or tap"),
          ),
          h(
            "div",
            {
              className: "ps-controls",
              role: "group",
              "aria-label": "Browse parent stories",
            },
            h(
              "button",
              {
                className: "ps-arrow",
                type: "button",
                "aria-label": "Previous stories",
                "aria-disabled": !bounds.previous,
                onClick: () => moveRail(-1),
              },
              h(Arrow, { previous: true }),
            ),
            h(
              "button",
              {
                className: "ps-arrow",
                type: "button",
                "aria-label": "Next stories",
                "aria-disabled": !bounds.next,
                onClick: () => moveRail(1),
              },
              h(Arrow),
            ),
          ),
        ),
        h(
          "p",
          { className: "ps-sr-only", id: "parent-stories-instructions" },
          "Eight parent stories. Swipe or use the arrow buttons to browse. With this region focused, use Left, Right, Home or End. Select a card to read the full story.",
        ),
      ),
      h(
        "dialog",
        {
          className: "ps-dialog",
          id: "parent-story-dialog",
          ref: dialogRef,
          "aria-labelledby": "parent-full-title",
          "aria-describedby": "parent-full-quote",
          onCancel: (event) => {
            event.preventDefault();
            closeStory();
          },
          onClose: closeStory,
          onPointerDown: (event) => {
            backdropPressedRef.current = isBackdrop(event);
          },
          onPointerCancel: () => {
            backdropPressedRef.current = false;
          },
          onClick: (event) => {
            if (backdropPressedRef.current && isBackdrop(event)) closeStory();
            backdropPressedRef.current = false;
          },
        },
        openStory &&
          h(
            "div",
            { className: "ps-dialog-inner" },
            h(
              "button",
              {
                className: "ps-close",
                type: "button",
                "aria-label": "Close parent story",
                onClick: closeStory,
              },
              h(CloseIcon),
            ),
            h("p", { className: "ps-dialog-context" }, "Frisco, Texas"),
            h(
              "h3",
              { className: "ps-dialog-title", id: "parent-full-title" },
              openStory.shortHeading,
            ),
            h(
              "blockquote",
              { className: "ps-dialog-quote", id: "parent-full-quote" },
              openStory.fullQuote,
            ),
            h(
              "div",
              { className: "ps-dialog-author" },
              h("strong", null, openStory.author),
              h("span", null, openStory.relationship),
            ),
          ),
      ),
    );
  };
}

export default createParentStories(React, asset);
