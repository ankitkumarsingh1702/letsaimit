import * as React from "react";
export function createCoachStory(React) {
  const h = React.createElement;
  return function CoachStory() {
    return h(
      "section",
      {
        className: "co-founder wrap",
        "aria-labelledby": "coach-founder-title",
      },
      h(
        "div",
        { className: "co-founder-inner" },
        h(
          "h2",
          { className: "display", id: "coach-founder-title" },
          "Coach. Founder. Adviser.",
        ),
        h(
          "div",
          { className: "co-founder-copy" },
          h(
            "p",
            null,
            "After about 12 years in the U.S., Dhiraj returned to Bengaluru.",
          ),
          h(
            "p",
            null,
            "He runs LetsAimIt and advises businesses on Salesforce.",
          ),
        ),
      ),
    );
  };
}

export default createCoachStory(React);
