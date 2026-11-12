import { useCallback, useRef, useState } from "react";
import { Arrow } from "../components/ui.jsx";
import ParentRegistration from "../features/registration/ParentRegistration.jsx";
import { rememberParentRegistration } from "../features/parent/parentRequests.js";
import "./registration-page.css";

export default function Register() {
  const [stage, setStage] = useState("details");
  const heading = useRef(null);

  const changeStage = useCallback(nextStage => {
    setStage(nextStage);
    window.requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start" });
    });
  }, []);

  function finishRegistration(_mode, userId, receipt) {
    rememberParentRegistration({ userId, requestId: receipt.id });
    window.location.replace("/parent/");
  }

  return <section className="registration-page wrap" aria-labelledby="registration-title">
    <h1 id="registration-title" ref={heading} tabIndex={-1}>
      {stage === "review" ? "Review registration" : "Register your child"}
    </h1>
    <ParentRegistration
      mode="enroll"
      active
      Arrow={Arrow}
      onStageChange={changeStage}
      onSaved={finishRegistration}
    />
  </section>;
}
